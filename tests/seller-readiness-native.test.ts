import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {getSellerReadiness} from '../lib/sellers/readiness';
import {listReviewTasks,listSellerReviewTasks,assignReviewTask} from '../lib/workflows/review-tasks';
void test('native disposable D1 shares initial tasks, immutable deadline policy and serialized assignment with read-only readiness',async()=>{
 const f=await createIncentiveDb();try{
  await f.db.batch([
   f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('owner','owner@local.hastabazaar.test','Fictional Owner','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional Reviewer','active',1,1)"),
   f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','customer',1),('reviewer','super_admin',1)"),
   f.db.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES('seller','owner','Fictional Name','Fictional Studio','Fixture','FIX-READINESS','NONE','','Fictional Owner','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','submitted',1,1)")
  ]);
  const before=await f.db.prepare("SELECT * FROM seller_profiles WHERE id='seller'").first();
  const readiness=await getSellerReadiness(f.db,'seller',10);assert.equal(readiness.dashboard,true);assert.equal(readiness.submitProducts,false);assert.equal(readiness.newOrders,false);assert.equal(readiness.bankStatus,'missing');
  assert.deepEqual(await f.db.prepare("SELECT * FROM seller_profiles WHERE id='seller'").first(),before);
  const task=(await listReviewTasks(f.db,'reviewer','seller')).find(row=>row.sourceType==='seller_application')!;
  assert.ok(task);assert.equal(task.dueAt,null);assert.equal((await listSellerReviewTasks(f.db,'owner'))[0].id,task.id);
  await assert.rejects(f.db.prepare('UPDATE review_tasks SET has_deadline=1 WHERE id=?').bind(task.id).run(),/immutable/);
  const input={taskId:task.id,ownerId:'reviewer',reason:'Take ownership of this fictional application review'};
  const results=await Promise.allSettled(['native-assign-a','native-assign-b'].map(requestId=>assignReviewTask(f.db,{actorId:'reviewer',requestId,expectedRevision:'0',now:11},input)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const winner=results[0].status==='fulfilled'?'native-assign-a':'native-assign-b';await assignReviewTask(f.db,{actorId:'reviewer',requestId:winner,expectedRevision:'0',now:11},input);
  const after=(await listReviewTasks(f.db,'reviewer','seller'))[0];assert.equal(after.revision,1);assert.equal(after.ownerId,'reviewer');assert.equal(after.startedAt,1);assert.equal(after.dueAt,null);
 }finally{await f.dispose();}
});
