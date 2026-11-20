import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {requireDatabase} from '../lib/db/d1';
import {observedFileBucket,evaluateFileHealth,readFileHealth} from '../lib/operations/file-access-health';
import {readPaymentClaimFile} from '../lib/payments/payment-claim-files';
import {readIncident} from '../lib/operations/incident-review';
void test('storage failures and later body reads require matching real evidence before incident recovery',async(t)=>{
 const f=serviceHealthFixture();f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS operational_incidents(id TEXT PRIMARY KEY,issue_type TEXT,related_type TEXT,related_id TEXT,context_json TEXT)');f.sqlite.exec(readFileSync('drizzle/0151_form_health_records.sql','utf8'));const scope={environment:'test' as const,releaseId:'fictional-files',now:1800000};
 try{
  let clock=1800000;t.mock.method(Date,'now',()=>clock);requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:scope.releaseId});
  for(const now of [1800000,1860000]){clock=now;const bucket={get:async()=>{throw new Error('PRIVATE_STORAGE_ENDPOINT');}} as unknown as R2Bucket;await assert.rejects(observedFileBucket(f.db,bucket,'private').get('SECRET_KEY'));}
  await evaluateFileHealth(f.db,{...scope,now:1860000},async()=>[]);const incident=f.sqlite.prepare('SELECT id FROM service_health_incidents').get() as {id:string};assert.ok(incident);
  for(const now of [1920000,1980000]){clock=now;const bucket={get:async()=>({body:new ReadableStream()})} as unknown as R2Bucket;await observedFileBucket(f.db,bucket,'private').get('SECRET_KEY');await evaluateFileHealth(f.db,{...scope,now},async()=>[]);}
  const recovered=await readIncident(f.db,'sa',incident.id,'test',1980000);assert.equal(recovered.state,'monitoring');assert.equal(recovered.recoveryReady,true);assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM file_health_observations').all()),/PRIVATE_STORAGE_ENDPOINT|SECRET_KEY/);
 }finally{f.sqlite.close();}
});
void test('validated storage reads retain sanitized event evidence; missing objects and expected denials are not outages',async(t)=>{
 const f=serviceHealthFixture();f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY)');f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));
 try{
  let clock=Date.now();t.mock.method(Date,'now',()=>clock++);
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-files'});
  let mode='missing';const bucket={async get(){if(mode==='missing')return null;if(mode==='denied')throw Object.assign(new Error('private object secret key'),{status:403});if(mode==='broken')throw new Error('SENSITIVE-object-key-and-password');return {body:new ReadableStream(),httpEtag:'fictional'};}} as unknown as R2Bucket;
  const wrapped=observedFileBucket(f.db,bucket,'private');assert.equal(wrapped,observedFileBucket(f.db,bucket,'private'));
  await wrapped.get('private/SENSITIVE-object-key');mode='denied';await assert.rejects(wrapped.get('private/SENSITIVE-object-key'));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM file_health_observations').get()!.n,0);
  mode='broken';await assert.rejects(wrapped.get('private/SENSITIVE-object-key'));mode='okay';await wrapped.get('private/SENSITIVE-object-key');
  const rows=await readFileHealth(f.db,'sa',{environment:'test',releaseId:'fictional-files',now:Date.now()});assert.equal(rows.find(row=>row.accessKind==='private')?.lastObservation?.accessKind,'private');assert.doesNotMatch(JSON.stringify(rows),/SENSITIVE|password|object_key|private\//);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM file_health_observations').get()!.n,2);
  await assert.rejects(readFileHealth(f.db,'customer',{environment:'test',releaseId:'fictional-files',now:Date.now()}));
  await evaluateFileHealth(f.db,{environment:'test',releaseId:'fictional-files',now:Date.now()+3600000},async()=>[]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0,'Idle successful storage must not become a missed scheduled heartbeat.');
 }finally{f.sqlite.close();}
});
void test('actual protected payment evidence read records storage only after native current authority and source ownership',async()=>{
 const f=serviceHealthFixture();f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY);CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT);CREATE TABLE manual_payment_windows(order_id TEXT);CREATE TABLE manual_payment_claim_files(id TEXT PRIMARY KEY,order_id TEXT,object_key TEXT,original_name TEXT,mime_type TEXT);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,created_at INTEGER)');f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));
 try{
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-files'});
  f.sqlite.prepare('INSERT INTO orders VALUES(?,?)').run('PRIVATE-ORDER','customer');f.sqlite.prepare('INSERT INTO manual_payment_windows VALUES(?)').run('PRIVATE-ORDER');f.sqlite.prepare('INSERT INTO manual_payment_claim_files VALUES(?,?,?,?,?)').run('PRIVATE-FILE','PRIVATE-ORDER','private/payment-claims/PRIVATE-KEY','evidence.pdf','application/pdf');let reads=0;
  const bucket={async get(){reads++;return{body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));controller.close();}}),httpEtag:'fictional'};}} as unknown as R2Bucket;
  await assert.rejects(readPaymentClaimFile(f.db,bucket,'admin','PRIVATE-FILE','finance'));await assert.rejects(readPaymentClaimFile(f.db,bucket,'sa','PRIVATE-FILE','customer'));assert.equal(reads,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM file_health_observations').get()!.n,0);
  assert.equal((await readPaymentClaimFile(f.db,bucket,'customer','PRIVATE-FILE','customer')).status,200);assert.equal(reads,1);
  assert.doesNotMatch(JSON.stringify(await readFileHealth(f.db,'sa',{environment:'test',releaseId:'fictional-files',now:Date.now()})),/PRIVATE-ORDER|PRIVATE-FILE|PRIVATE-KEY|evidence.pdf/);
 }finally{f.sqlite.close();}
});
