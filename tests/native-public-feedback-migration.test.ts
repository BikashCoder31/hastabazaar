import test from 'node:test';
import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {incentiveReportDatabase} from './helpers/incentive-report-database';

void test('public native-version transition preserves every original delivery state and keeps foreign keys enforced',async()=>{
 let original='';let seeded=false;
 const image=(sqlite:DatabaseSync)=>JSON.stringify(sqlite.prepare('SELECT * FROM feedback_delivery_jobs ORDER BY id').all());
 const f=await incentiveReportDatabase(async(name,sqlite)=>{
  if(!name.startsWith('0153_'))return;
  assert.equal(sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys,1);
  const incoming=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().flatMap(row=>{
   const table=String(row.name);return sqlite.prepare(`PRAGMA foreign_key_list("${table.replaceAll('"','""')}")`).all().filter(key=>key.table==='feedback_delivery_jobs').map(()=>table);
  });
  assert.deepEqual(incoming,[],'A replacement must not silently redirect an incoming foreign key.');
  sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('public-migration-owner','owner@local.hastabazaar.test','Fictional owner','active',1,1)");
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('public-migration-version','public.contact',1,1,'published',?,'Original historical configuration','public-migration-owner',1,'public-migration-owner',1,'public-migration-owner',1,'public-migration-original')`).run(JSON.stringify({formId:'public.contact',fields:[]}));
  for(const [index,status] of ['pending','leased','sending','failed','sent'].entries()){
   const leased=status==='leased'||status==='sending';
   sqlite.prepare(`INSERT INTO feedback_delivery_jobs(id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at)
    VALUES(?,?,'public.contact','public-migration-version',?,?,?,?,?,?,1,2,?)`)
    .run(`public-history-${status}`,`public-history-request-${status}`,'b'.repeat(64),'{ "legacy": "UTF-8 नेपाल and 00012", "untouched": true }',status,leased?`original-token-${status}`:null,leased?9999999999999:null,index,status==='sent'?2:null);
  }
  original=image(sqlite);seeded=true;
 });
 try{
  assert.equal(seeded,true);assert.equal(image(f.sqlite),original,'No delivery row, JSON byte, lease, age, attempt or terminal fact may change.');
  assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys,1);
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  const version=f.sqlite.prepare('PRAGMA table_info(feedback_delivery_jobs)').all().find(row=>row.name==='config_version_id');
  assert.equal(version?.notnull,0,'The actual new migration must permit a proved native origin without a fabricated published version.');
  assert.ok(f.sqlite.prepare('PRAGMA foreign_key_list(feedback_delivery_jobs)').all().some(row=>row.table==='form_config_versions'&&row.from==='config_version_id'));
  assert.throws(()=>f.sqlite.prepare("INSERT INTO feedback_delivery_jobs SELECT 'forged-native','forged-native-request',form_id,NULL,payload_hash,feedback_json,'pending',NULL,NULL,0,3,3,NULL FROM feedback_delivery_jobs LIMIT 1").run(),'NULL metadata without exact native receipts must stay forbidden.');
  assert.throws(()=>f.sqlite.prepare("UPDATE feedback_delivery_jobs SET config_version_id=NULL WHERE id='public-history-pending'").run(),'An old published job cannot be silently converted into a native job.');
  assert.equal(image(f.sqlite),original);
 }finally{f.dispose();}
});
