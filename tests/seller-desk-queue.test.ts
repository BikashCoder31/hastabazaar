import assert from 'node:assert/strict';
import test from 'node:test';
import { readSellerDesk, readSellerDeskContext, sellerDeskTaskKey } from '../lib/admin/seller-desk';
import { readTodaySources } from '../components/admin/overview-today-data';
import { listReviewTasks } from '../lib/workflows/review-tasks';
import { getProductPublicationReview, reviewProductPublication } from '../lib/products/publication';
import { saveProductWorkspace, submitProductIntake } from '../lib/products/intake-workspace';
import { productPublicationFixture } from './helpers/product-publication-fixture';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';

void test('queue uses the submitted candidate, orders scheduled payouts by their run, and tracks two separate decisions on a corrected item', async () => {
  const f = await productPublicationFixture();
  try {
    const now = f.now + 100;
    const payout = f.sqlite.prepare(`INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,
      prepared_by,scheduled_for,created_at,updated_at) VALUES(?,'registered',?,'prepared',1000,'FIXTURE','delegate',?,?,?)`);
    payout.run('later','LATER',now+1,f.now-30,f.now-30);
    payout.run('earlier','EARLIER',f.now-1,f.now-10,f.now-10);
    const first = await readSellerDesk(f.db,'reviewer',now);
    const id = 'product_intake_review:' + f.sent.caseId;
    const relevant = first.items.filter(row => row.id === id || ['earlier','later'].includes(row.sourceId));
    assert.deepEqual(relevant.map(row => row.id),['payout_candidate:earlier',id,'payout_candidate:later']);
    assert.equal(relevant[1].title,'Fictional new cup');
    const task = (await listReviewTasks(f.db,'reviewer',undefined,{sourceTypes:['product_intake_review']}))[0];
    assert.equal(sellerDeskTaskKey(task),id);
    const today = await readTodaySources({ db:f.db,actor:{id:'reviewer',role:'super_admin'},now,
      returnTo:'/admin?todayView=mine',tasks:[task],financeDecisions:[] });
    const link = new URL(today.rows.find(row => row.id === task.id)!.href,'https://example.test');
    assert.equal(link.pathname,'/admin/sellers/desk');
    assert.equal(link.searchParams.get('item'),id);
    assert.equal(link.searchParams.get('returnTo'),'/admin?todayView=mine');
    const work = await getProductPublicationReview(f.db,'reviewer',f.sent.caseId);
    const decision = {caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),
      action:'request_changes' as const, reason:'Please describe the actual item in the cover photo.',checks:null};
    const outcome = await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'desk-fix',now:now+1,expectedRevision:String(work.revision)},decision);
    const waiting = await readSellerDesk(f.db,'reviewer',now+1);
    assert.ok(!waiting.items.some(row => row.id === id));
    assert.equal(waiting.doneToday,first.doneToday+1);
    const changed = await saveProductWorkspace(f.db,{...f.ctx,requestId:'desk-correction',now:now+2,expectedRevision:String(f.attached.revision)},
      {...f.input,answers:{...f.input.answers,descriptionEn:'A corrected photo and description of this ceramic cup.'}});
    const replacement = await submitProductIntake(f.db,{...f.ctx,requestId:'desk-resend',now:now+3,expectedRevision:String(changed.revision)},
      {draftId:changed.id,versionId:changed.versionId,intent:'review',note:'',replaceVersionId:f.sent.versionId,expectedCaseRevision:String(outcome.caseRevision)});
    const corrected = await readSellerDesk(f.db,'reviewer',now+3);
    assert.equal(corrected.items.find(row => row.id === id)?.kind,'Sent back after fix');
    const review = await getProductPublicationReview(f.db,'reviewer',f.sent.caseId);
    await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'desk-publish',now:now+4,expectedRevision:String(review.revision)},
      {...decision,versionId:review.candidate.versionId,expectedCaseRevision:String(replacement.revision),action:'approve_and_publish',
        checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}});
    const done = await readSellerDesk(f.db,'reviewer',now+4);
    assert.equal(done.doneToday,first.doneToday+2);
    assert.ok(!done.items.some(row => row.id === id));
  } finally { f.dispose(); }
});

void test('only independent Super Admin can open the desk and inspect seller checklist facts', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const desk = await readSellerDesk(f.db,'reviewer',f.now);
    const application = desk.items.find(row => row.id === 'seller_application:maker');
    assert.ok(application);
    assert.equal(application.group,'applications');
    assert.equal(application.dueAt,null);
    const context = await readSellerDeskContext(f.db,'reviewer',application,f.now);
    assert.equal(context.district,'Kathmandu');
    assert.equal(context.canSell,false);
    await assert.rejects(readSellerDesk(f.db,'maker-user',f.now),/staff permission/);
    f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('maker-user','super_admin',1)").run();
    assert.ok(!(await readSellerDesk(f.db,'maker-user',f.now)).items.some(row => row.sellerId === 'maker'));
    await assert.rejects(readSellerDeskContext(f.db,'maker-user',application,f.now),/independent/);
  } finally { f.sqlite.close(); }
});

void test('registered seller re-uploads, product assistance and original payout requests appear once and disappear after staff decisions', async () => {
  const { completeVersionFixture } = await import('./helpers/complete-version-fixture');
  const { submitUnverifiedDocumentCorrection, reviewSellerDocument } = await import('../lib/sellers/document-review');
  const f = await completeVersionFixture();
  try {
    f.sqlite.prepare("DELETE FROM seller_restrictions WHERE seller_id='registered'").run();
    f.sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES('former','registered','business_registration','private/seller-documents/registered/former','old.pdf','application/pdf',60,'rejected',?)`).run(f.now);
    await submitUnverifiedDocumentCorrection(f.db,{actorId:'registered-owner',sellerId:'registered',documentId:'former',now:f.now+1,
      document:{id:'replacement',kind:'business_registration',objectKey:'private/seller-documents/registered/replacement',
        originalName:'corrected.pdf',mimeType:'application/pdf',sizeBytes:70}});
    const ctx = {actorId:'registered-owner',requestId:'start-help',expectedRevision:null,now:f.now+2};
    const draft = await saveProductWorkspace(f.db,ctx,{sellerId:'registered',draftId:null,mediaIds:[],categoryId:null,
      answers:{nameEn:'Help with this cup'},privateReview:{},offers:{axes:[],offers:[]},formContext:null});
    const help = await submitProductIntake(f.db,{...ctx,requestId:'submit-help',expectedRevision:String(draft.revision),now:f.now+3},
      {draftId:draft.id,versionId:draft.versionId,intent:'help',note:'I need help adding photos.'});
    // The original request's matching author is required for a protected Finance read.
    f.sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at)
      VALUES('retained-request','registered-owner','payout.seller.requested','payout_request','legacy-payout','legacy-payout',1)`).run();
    const desk = await readSellerDesk(f.db,'reviewer',f.now+4);
    assert.equal(desk.items.filter(row => row.sourceId==='replacement').length,1);
    assert.equal(desk.items.find(row => row.sourceId==='replacement')?.kind,'Re-uploaded document');
    assert.equal(desk.items.find(row => row.sourceId===help.caseId)?.group,'questions');
    assert.ok(desk.items.some(row => row.id==='payout_request:legacy-payout'));
    await reviewSellerDocument(f.db,{actorId:'reviewer',sellerId:'registered',documentId:'replacement',decision:'request_correction',
      reason:'The official registration number must be legible.',now:f.now+5});
    const after = await readSellerDesk(f.db,'reviewer',f.now+6);
    assert.ok(!after.items.some(row => row.sourceId==='replacement'));
    assert.equal(after.doneToday,desk.doneToday+1);
  } finally { f.dispose(); }
});
