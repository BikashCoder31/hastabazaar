import assert from 'node:assert/strict';
import test from 'node:test';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {auditManualEmailProcessing} from '../lib/operations/manual-email-audit';
void test('manual recovery requires current active Super Admin authority and records intent before processing',async()=>{
 const {db,sqlite}=serviceHealthFixture();try{
  sqlite.exec('CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,request_id TEXT,created_at INTEGER)');
  let calls=0;const process=async()=>{calls++;assert.ok(sqlite.prepare("SELECT 1 FROM audit_logs WHERE actor_id='sa' AND action='business.email.processing.attempted'").get());return {failed:0,sent:0};};
  for(const id of ['admin','customer','missing'])await assert.rejects(()=>auditManualEmailProcessing(db,id,process,'denied-'+id,()=>100,'business'),/Super Admin/);
  assert.equal(calls,0);assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM audit_logs').get()?.count,0);
  await auditManualEmailProcessing(db,'sa',process,'allowed',()=>100,'business');assert.equal(calls,1);
  sqlite.exec("UPDATE users SET status='disabled' WHERE id='sa'");
  await assert.rejects(()=>auditManualEmailProcessing(db,'sa',process,'suspended',()=>101,'business'),/Super Admin/);assert.equal(calls,1);
 }finally{sqlite.close();}
});
