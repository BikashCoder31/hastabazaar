import { compileFunction } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {requireDatabase} from '../lib/db/d1';
import {runSystemHealthMonitor,inspectCurrentDatabaseReadiness,inspectLocalApplicationLiveness} from '../lib/operations/system-health-monitor';
import {readServiceHealth} from '../lib/operations/service-health-repository';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {incidentHealthTransitionStatements} from '../lib/operations/incident-review';
function fixture(){const f=serviceHealthFixture();f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,answers_json TEXT,created_at INTEGER);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,action TEXT,next_json TEXT,created_at INTEGER);CREATE TABLE form_config_versions(form_id TEXT,version INTEGER,config_json TEXT,published_at INTEGER,status TEXT)');f.sqlite.exec(readFileSync('drizzle/0149_team_governance.sql','utf8'));f.sqlite.exec(readFileSync('drizzle/0151_form_health_records.sql','utf8'));requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-monitor-v1'});return f;}
void test('monitor checks actual local liveness and rejects an incomplete schema instead of old-manifest green',async()=>{const f=fixture();try{assert.equal(await inspectLocalApplicationLiveness(f.db,{}),true);assert.equal(await inspectCurrentDatabaseReadiness(f.db,{}),false);}finally{f.sqlite.close();}});
void test('two failed actual checker outcomes produce a Critical episode; bounded monitor does not claim whole journeys',async()=>{
 const f=fixture();f.sqlite.exec('CREATE TABLE operational_incidents(id TEXT PRIMARY KEY,issue_type TEXT,related_type TEXT,related_id TEXT,context_json TEXT)');try{
  const checks={application:async()=>false,database:async()=>true,ownership:async()=>({scanned:0,changed:0,busy:false})};
  for(const now of [1800000,1860000])await runSystemHealthMonitor(f.db,{}, {now,expectedSince:null},async()=>[],checks);
  const rows=f.sqlite.prepare('SELECT service_key,severity FROM service_health_incidents').all();assert.deepEqual(rows.map(row=>({...row})),[{service_key:'application.availability',severity:'critical'}]);
  const observations=f.sqlite.prepare('SELECT evidence_scope,functional_success FROM service_health_observations WHERE service_key=?').all('database.readiness');assert.equal(observations.length,2);assert.ok(observations.every(row=>row.evidence_scope==='fictional-monitor-v1'&&row.functional_success===1));
  let calls=0;const result=await runSystemHealthMonitor(f.db,{}, {now:1920000,expectedSince:null,budgetMs:1},async()=>[],{clock:()=>calls++===0?0:2,application:async()=>{throw new Error('must not run');}});assert.equal(result.services.length,0);assert.equal(result.budgetExhausted,true);assert.match(result.proof,/no whole-journey/);
 }finally{f.sqlite.close();}
});
void test('a returning success preserves prior heartbeat outage and new release cannot borrow old proof',async()=>{
 const f=fixture();try{
  const checks={application:async()=>true,database:async()=>true,ownership:async()=>({scanned:0,changed:0,busy:false})};
  await runSystemHealthMonitor(f.db,{}, {now:1800000,expectedSince:1799999},async()=>[],checks);
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-monitor-v2'});
  const first=await readServiceHealth(f.db,{environment:'test',serviceKey:'application.availability',now:1860000,expectedSince:1799999,evidenceScope:'fictional-monitor-v2'});assert.equal(first.state,'unknown');assert.equal(first.incident,null,'Changing release does not reset or invent a missing heartbeat.');
  const returned=await runSystemHealthMonitor(f.db,{}, {now:2220000,expectedSince:1799999},async()=>[],checks);assert.ok(returned.services.every(row=>row.state==='degraded'));const incident=f.sqlite.prepare("SELECT id,first_seen_at FROM service_health_incidents WHERE service_key='application.availability'").get()!;assert.equal(incident.first_seen_at,2220000);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM service_health_incidents WHERE service_key='application.availability'").get()!.n,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM service_health_observations WHERE service_key='application.availability' AND evidence_scope='fictional-monitor-v2'").get()!.n,1,'Only one current-release proof exists after the returning run.');
 }finally{f.sqlite.close();}
});
void test('actual protected monitor API authenticates before touching DB and ignores caller success claims',async()=>{
 const f=fixture(),store=globalThis as typeof globalThis&{monitorDb?:D1Database;monitorTouches?:number};store.monitorDb=f.db;store.monitorTouches=0;
 try{
  const output=await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:"export{POST}from'./app/api/jobs/system-health/route';"},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'monitor-bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'monitor'}));b.onLoad({filter:/.*/,namespace:'monitor'},()=>({loader:'ts',contents:"export const env={get DB(){globalThis.monitorTouches++;return globalThis.monitorDb},SYSTEM_HEALTH_JOB_SECRET:'fictional-strong-monitor-secret-123456789',HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-monitor-v1'};"}));}}]});
  const loadedFixtureModule={exports:{} as {POST:(r:Request)=>Promise<Response>}};compileFunction(output.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url),loadedFixtureModule,loadedFixtureModule.exports);
  const request=(secret:string)=>new Request('https://fictional.test/api/jobs/system-health',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:'{"successful":true,"environment":"production"}'});
  assert.equal((await loadedFixtureModule.exports.POST(request('wrong'))).status,401);assert.equal(store.monitorTouches,0);
  const response=await loadedFixtureModule.exports.POST(request('fictional-strong-monitor-secret-123456789'));assert.equal(response.status,200);const result=await response.json() as {environment:string;services:{serviceKey:string;state:string}[]};assert.equal(result.environment,'test');assert.equal(result.services.find(s=>s.serviceKey==='database.readiness')?.state,'degraded');assert.equal(response.headers.get('cache-control'),'no-store');
 }finally{delete store.monitorDb;delete store.monitorTouches;f.sqlite.close();}
});
void test('monitor Critical detection reaches actual governed incident and mandatory common staff notice',async()=>{
 const f=await completeVersionFixture();try{
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-monitor-real-hook'});
  for(const now of [f.now,f.now+60000])await runSystemHealthMonitor(f.db,{}, {now,expectedSince:f.now},incidentHealthTransitionStatements,{database:async()=>false});
  const incident=f.sqlite.prepare("SELECT h.id,h.severity,g.acknowledge_due_at FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.service_key='database.readiness'").get()!;assert.ok(incident);assert.equal(incident.severity,'critical');assert.equal(incident.acknowledge_due_at,f.now+60000+900000);
  assert.ok(f.sqlite.prepare('SELECT 1 FROM service_incident_events WHERE incident_id=?').get(incident.id));assert.ok(f.sqlite.prepare("SELECT 1 FROM notification_messages WHERE recipient_user_id='reviewer' AND related_type='service_incident_event'").get(),'The actual common source produces its mandatory current-SA copy.');
 }finally{f.sqlite.close();}
});

