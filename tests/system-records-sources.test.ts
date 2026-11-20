import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {searchSystemRecords} from '../lib/operations/system-records';
import {requestDocumentChange} from '../lib/sellers/document-review';
import {ensureReviewTask} from '../lib/workflows/review-tasks';
void test('central record adapters retain canonical review eligibility and reserve delivery and action histories',async()=>{
 const f=await completeVersionFixture();try{
  f.sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?').run('["system.health.view"]','delegate');
  await assert.rejects(searchSystemRecords(f.db,'delegate',{environment:'test',type:'delivery'}));await assert.rejects(searchSystemRecords(f.db,'delegate',{environment:'test',type:'action'}));
  const docId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker'").get()!.id);f.sqlite.prepare('UPDATE seller_documents SET status=? WHERE id=?').run('verified',docId);
  const requestId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:docId,actorId:'maker-user',reason:'Fictional exact retained document review source',now:f.now});const taskId=await ensureReviewTask(f.db,{sourceType:'document_change',sourceId:requestId,now:f.now});
  const restricted=await searchSystemRecords(f.db,'delegate',{environment:'test',type:'review'});assert.equal(restricted.records.some(r=>r.reference===taskId),false);assert.doesNotMatch(JSON.stringify(restricted),new RegExp(requestId));
  const allowed=await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'review',reference:taskId});assert.equal(allowed.records.length,1);assert.equal(allowed.records[0].record,'document_change');assert.doesNotMatch(JSON.stringify(allowed),/objectKey|bankAccount|answers_json/);
  f.sqlite.prepare('INSERT INTO order_email_jobs(id,order_id,order_status,status,created_at) VALUES(?,?,?,?,?)').run('record-order-email','legacy-order','placed','queued',f.now);
  assert.ok((await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'delivery',reference:'record-order-email'})).records.some(r=>r.reference==='record-order-email'));
  f.sqlite.prepare('INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,previous_json,next_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run('record-audit','reviewer','fictional.source.changed','product','sensitive-subject','{"bankAccount":"SENSITIVE-BANK"}','{"answers":"SENSITIVE-ANSWERS"}',f.now);
  const audit=await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'action',reference:'record-audit',actor:'reviewer',action:'fictional.source.changed'});assert.equal(audit.records.length,1);assert.doesNotMatch(JSON.stringify(audit),/SENSITIVE|previous_json|next_json/);
  f.setBeforeBatch(()=>{f.sqlite.prepare('UPDATE seller_profiles SET user_id=? WHERE id=?').run('reviewer','maker');});
  await assert.rejects(searchSystemRecords(f.db,'reviewer',{environment:'test',type:'review',reference:taskId}),/guard|CHECK|constraint/i,'A source becoming personally conflicted at final projection commit must reject its record preview.');
 }finally{f.dispose();}
});
