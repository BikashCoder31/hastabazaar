import test from 'node:test';
import assert from 'node:assert/strict';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductPublicationReview,reviewProductPublication} from '../lib/products/publication';
import {ensureReviewTask,listReviewTasks} from '../lib/workflows/review-tasks';
import {readReviewContinuation} from '../lib/admin/review-continuation';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {requestSellerPayout,processPayoutRequest} from '../lib/db/repositories/payouts';
import {readFinanceWorkItems} from '../lib/admin/finance-work-items';
import {financeQueueItem} from '../lib/admin/review-queue-view';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';

void test('continuation rechecks the actual saved source, preserves filters and cannot skip an unresolved approval',async()=>{
 const f=await productPublicationFixture();try{
  f.sqlite.exec("UPDATE seller_participation_profiles SET application_stage='submitted' WHERE seller_id='maker'");
  await ensureReviewTask(f.db,{sourceType:'seller_application',sourceId:'maker',now:f.now});
  const current=(await listReviewTasks(f.db,'reviewer')).find(row=>row.sourceType==='product_intake_review'&&row.sourceId===f.sent.caseId)!;assert.ok(current);
  const context='/admin?period=month&reviewView=all#review-task-'+encodeURIComponent(current.id);
  assert.deepEqual(await readReviewContinuation(f.db,'reviewer',context),{state:'pending'});
  const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),approved=await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'continuation-approve',expectedRevision:String(view.revision),now:f.now+4},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'approve_only',reason:'Approve this exact candidate while retaining the independent publishing step.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}});
  assert.deepEqual(await readReviewContinuation(f.db,'reviewer',context),{state:'pending'},'Approval alone may not skip the remaining publishing step.');
  await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'continuation-publish',expectedRevision:String(approved.revision),now:f.now+5},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(approved.caseRevision),action:'publish_approved',reason:'Publish the original exact recorded approval after its current source checks.',checks:null});
  const next=await readReviewContinuation(f.db,'reviewer',context);assert.equal(next.state,'next');if(next.state!=='next')throw Error('Expected the original pending application.');
  const destination=new URL(next.href,'http://localhost');assert.equal(destination.pathname,'/admin/sellers/maker');const back=new URL(destination.searchParams.get('returnTo')!,'http://localhost');assert.equal(back.searchParams.get('period'),'month');assert.equal(back.searchParams.get('reviewView'),'all');assert.notEqual(back.hash,'#review-task-'+current.id);
  assert.deepEqual(await readReviewContinuation(f.db,'reviewer',context.replace('reviewView=all','reviewView=completed')),{state:'complete'},'No silent widening of the original view.');
  assert.deepEqual(await readReviewContinuation(f.db,'reviewer','https://outside.invalid/'),{state:'unavailable'});
  f.setBeforeBatch(()=>{f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='reviewer' AND role='super_admin'; INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('reviewer','[]',1,'reviewer',1)");});
  await assert.rejects(readReviewContinuation(f.db,'reviewer',context));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_permission_guards').get()!.n,0);
 }finally{f.dispose();}
});

void test('a completed native payout request directs the operator to its continuing payout, never past an unpaid instruction',async()=>{
 const f=await payoutTransferFixture();try{
  const environment=resolveRuntimeEnvironment({runtimeEnvironment:'test',nodeEnvironment:'test'});
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('continuation-earned',?,'sale',5000,1,'Explicit fictional independent original earnings',1)").run(f.sellerId);
  const requestId=await requestSellerPayout(f.db,{sellerId:f.sellerId,actorId:'payout-owner',note:'Native request navigation fixture.',requestId:'continuation-finance-request',now:Date.now()});
  const item=(await readFinanceWorkItems(f.db,'reviewer',environment,{limit:100})).items.find(row=>row.family==='payout_request'&&row.id===requestId)!;assert.ok(item);
  const context='/admin?period=month&reviewView=all&reviewDepartment=finance#review-task-'+encodeURIComponent(financeQueueItem(item).id);
  assert.deepEqual(await readReviewContinuation(f.db,'reviewer',context,{environment}),{state:'pending'});
  await processPayoutRequest(f.db,{id:requestId,actorId:'reviewer',actorRole:'super_admin',action:'prepare',note:'Prepare this exact eligible request without claiming its transfer completed.',requestId:'continuation-finance-prepare',now:Date.now()});
  const result=await readReviewContinuation(f.db,'reviewer',context,{environment});assert.equal(result.state,'pending');if(result.state!=='pending'||!result.followUpHref)throw Error('The original unpaid payout must remain an explicit continuing step.');
  const href=new URL(result.followUpHref,'http://localhost'),payoutId=String(f.sqlite.prepare('SELECT payout_id FROM payout_requests WHERE id=?').get(requestId)!.payout_id);assert.equal(href.searchParams.get('payout'),payoutId);
  const back=new URL(href.searchParams.get('returnTo')!,'http://localhost');assert.equal(back.searchParams.get('period'),'month');assert.match(decodeURIComponent(back.hash),/finance:payout_candidate:registered:/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,0);
 }finally{f.dispose();}
});
