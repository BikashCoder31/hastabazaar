import test from 'node:test';
import assert from 'node:assert/strict';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductPublicationReview,reviewProductPublication} from '../lib/products/publication';
import {listReviewTasks} from '../lib/workflows/review-tasks';
import {readRecentReviewDecisions} from '../lib/admin/recent-review-decisions';

void test('recent decisions use the saved native publication, never private drafts, and recheck current source authority',async()=>{
 const f=await productPublicationFixture();try{
  const before=await listReviewTasks(f.db,'delegate');
  assert.ok(before.some(task=>task.sourceId===f.sent.caseId),'A product reviewer must see the exact unapproved candidate.');
  assert.deepEqual(await readRecentReviewDecisions(f.db,'delegate',before),[]);
  const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId);
  await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'overview-approved',expectedRevision:String(view.revision),now:f.now+4},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'approve_only',reason:'PRIVATE-REVIEW-REASON must stay within original authorized detail.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}});
  f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"product.review\",\"product.publish\"]',version=version+1 WHERE user_id='delegate'");
  const tasks=await listReviewTasks(f.db,'delegate'),rows=await readRecentReviewDecisions(f.db,'delegate',tasks,'/admin?reviewDepartment=products');
  assert.equal(rows.length,1);assert.equal(rows[0].sourceId,f.sent.caseId);assert.equal(rows[0].actorId,'reviewer');assert.equal(rows[0].createdAt,f.now+4);assert.match(rows[0].outcome,/approval recorded; publication remains separate/);
  assert.equal(new URL(rows[0].href,'http://localhost').searchParams.get('returnTo'),'/admin?reviewDepartment=products');
  assert.doesNotMatch(JSON.stringify(rows),/PRIVATE-REVIEW|Private review note|licenceReference|private\/fictional/);
  f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='delegate'");
  await assert.rejects(readRecentReviewDecisions(f.db,'delegate',tasks),/permission|review/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_permission_guards').get()!.n,0);
 }finally{f.dispose();}
});
