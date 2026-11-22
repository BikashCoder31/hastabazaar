import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewSellerApplication, type SellerReviewAction } from '../lib/db/repositories/seller-applications';
import { sellerBankState, submitSellerBankDetails, reviewSellerBankDetails } from '../lib/sellers/bank-details';
import { applicationDocumentProblemsGuard, readApplicationDocumentProblems, readSellerPayoutFixes } from '../lib/sellers/payout-fixes';
import { reviewSellerDocument, submitUnverifiedDocumentCorrection } from '../lib/sellers/document-review';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { completeVersionFixture } from './helpers/complete-version-fixture';

const approveWithFixes: SellerReviewAction = 'approve_fix_before_payout';
const note = 'Upload the registration certificate with the full business name visible.';
const replacementNote = 'The replacement is still blurry. Upload the original certificate.';
const id = 'payout-fix-registration';

async function fixture() {
  const f = await completeVersionFixture();
  const { sqlite, now } = f;
  assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  sqlite.exec("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','customer',1)");
  sqlite.prepare("UPDATE seller_profiles SET status='under_review' WHERE id='registered'").run();
  sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='under_review' WHERE seller_id='registered'").run();
  sqlite.prepare(`INSERT INTO seller_registration_intakes(seller_id,user_id,version,answers_json,documents_json,review_ready,updated_at)
    VALUES('registered','registered-owner',1,'{}','{}',1,?)`).run(now);
  sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
    VALUES(?,'registered','business_registration',?,'certificate.pdf','application/pdf',60,'pending',?)`)
    .run(id, 'private/seller-documents/registered/' + id, now - 1);
  return f;
}

void test('approval retains an open fix, sends exactly one note via each seller channel, and waits for verification', async () => {
  const f = await fixture();
  try {
    const { db, sqlite, now } = f;
    const problem = { sellerId:'registered', documentId:id, actorId:'reviewer',
      decision:'request_correction' as const, reason:note, now, neededBefore:'first_payout' as const };
    await reviewSellerDocument(db, problem);
    const requestId = 'approve-this-payout-fix';
    const form = await validateSellerFormSubmission(db,'staff.seller-review-action',1,[],requestId);
    const approval = { sellerId:'registered', actorId:'reviewer', action:approveWithFixes,
      reason:'Allow this applicant to start selling while replacing the document.', now:now+1, requestId, form,
      expectedProblemReviews:(await readApplicationDocumentProblems(db,'registered')).map(item=>item.reviewId) };
    const approved = await reviewSellerApplication(db, approval);
    assert.equal(approved.to, 'approved');
    assert.deepEqual(await reviewSellerApplication(db, approval),approved);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE request_id=?').get(requestId)?.n,1);
    assert.equal(sqlite.prepare("SELECT status FROM seller_documents WHERE id=?").get(id)?.status, 'pending');
    const open = async () => readSellerPayoutFixes(db, 'registered');
    assert.deepEqual((await open()).map((row: { note: string; waitingFor: string }) => [row.note,row.waitingFor]), [[note,'seller']]);
    const notices = sqlite.prepare(`SELECT channel,subject_en,body_en FROM notification_messages WHERE related_id='registered'
      AND recipient_user_id='registered-owner' ORDER BY channel`).all();
    assert.deepEqual(notices.map(row=>row.channel), ['email','in_app']);
    assert.ok(notices.every(row=>row.subject_en==='Your shop is approved · 1 thing to fix before your first payout' && String(row.body_en).includes(note)));

    const verify = (documentId: string, at: number) => reviewSellerDocument(db,{
      sellerId:'registered',documentId,actorId:'reviewer',decision:'verify',
      reason:'Compare the whole file with the recorded business.',now:at,
    });
    await assert.rejects(verify(id,now+2),/needs to upload/i);
    const replacementId = 'payout-fix-replacement';
    const replace = (sourceId: string, newId: string, at: number) => submitUnverifiedDocumentCorrection(db,{
      sellerId:'registered',actorId:'registered-owner',documentId:sourceId,now:at,
      document:{id:newId,originalName:'replacement.pdf',kind:'business_registration',
        objectKey:'private/seller-documents/registered/'+newId,mimeType:'application/pdf',sizeBytes:60},
    });
    await replace(id,replacementId,now+2);
    assert.equal((await open())[0].waitingFor, 'staff');
    const uploadNotices = sqlite.prepare(`SELECT channel,recipient_user_id,subject_en FROM notification_messages
      WHERE template_key='business.seller.document.review' AND related_id=? ORDER BY recipient_user_id,channel`).all(replacementId);
    assert.deepEqual(uploadNotices.map(row => [row.recipient_user_id, row.channel, row.subject_en]), [
      ['registered-owner', 'email', 'We received your replacement document'],
      ['registered-owner', 'in_app', 'We received your replacement document'],
      ['reviewer', 'email', 'A seller re-uploaded a document'],
      ['reviewer', 'in_app', 'A seller re-uploaded a document'],
    ]);
    await reviewSellerDocument(db,{ ...problem,documentId:replacementId,reason:replacementNote,neededBefore:undefined,now:now+3 });
    assert.deepEqual((await open()).map((row: { note: string; waitingFor: string }) => [row.note,row.waitingFor]), [[replacementNote,'seller']]);
    const correctionNotices = sqlite.prepare(`SELECT subject_en,body_en FROM notification_messages WHERE related_id=?
      AND recipient_user_id='registered-owner' AND template_key='business.seller.document.review' AND created_at=?`).all(replacementId,now+3);
    assert.equal(correctionNotices.length,2);
    assert.ok(correctionNotices.every(row=>String(row.subject_en).includes('business registration') && String(row.body_en).includes(replacementNote)));
    await assert.rejects(verify(replacementId,now+4),/needs to upload/i);
    const correctedId = 'payout-fix-corrected-certificate';
    await replace(replacementId,correctedId,now+5);
    await verify(correctedId,now+6);
    assert.deepEqual(await open(),[]);
  } finally { f.dispose(); }
});

void test('holding the application publishes the saved fix note to the applicant through both channels', async () => {
  const f = await fixture();
  try {
    await reviewSellerDocument(f.db, { sellerId:'registered', documentId:id, actorId:'reviewer',
      decision:'request_correction', reason:note, now:f.now, neededBefore:'approval' });
    await reviewSellerApplication(f.db, { sellerId:'registered', actorId:'reviewer', action:'request_changes',
      reason:'The applicant must fix the recorded document problem.', now:f.now+1, requestId:'hold-for-saved-fix' });
    const notices = f.sqlite.prepare(`SELECT channel,recipient_user_id,body_en FROM notification_messages
      WHERE template_key='business.seller_application.result' AND related_id='registered' AND audience_role<>'staff' ORDER BY channel`).all();
    assert.deepEqual(notices.map(row => [row.recipient_user_id, row.channel]), [['registered-owner','email'],['registered-owner','in_app']]);
    assert.ok(notices.every(row => String(row.body_en).includes(note)));
  } finally { f.dispose(); }
});

void test('approval-level issues block every approval action until they are resolved', async () => {
  const f = await fixture();
  try {
    await reviewSellerDocument(f.db, { sellerId:'registered', documentId:id, actorId:'reviewer',
      decision:'request_correction', reason:'This certificate belongs to a different business.', now:f.now, neededBefore:'approval' });
    await assert.rejects(reviewSellerDocument(f.db,{sellerId:'registered', documentId:id, actorId:'reviewer',
      decision:'verify', reason:'Recheck the originally flagged file.',now:f.now+1}),/needs to upload/i);
    for (const action of ['approve',approveWithFixes] as const) {
      await assert.rejects(reviewSellerApplication(f.db, { sellerId:'registered', actorId:'reviewer', action,
        reason:'Approval is still blocked.', now:f.now+1 }), /approval|before accepting/i);
    }
    assert.equal(f.sqlite.prepare("SELECT status FROM seller_profiles WHERE id='registered'").get()?.status,'under_review');
    await submitUnverifiedDocumentCorrection(f.db,{ sellerId:'registered', actorId:'registered-owner',
      documentId:id, now:f.now+2,document:{ id:'approval-level-replacement', originalName:'replacement.pdf',
        kind:'business_registration',objectKey:'private/seller-documents/registered/approval-level-replacement',
        mimeType:'application/pdf', sizeBytes:60 } });
    await assert.rejects(reviewSellerApplication(f.db, { sellerId:'registered', actorId:'reviewer', action:'approve',
      reason:'The new file still needs independent review.', now:f.now+3 }), /before approval/i);
    await reviewSellerDocument(f.db,{ sellerId:'registered', actorId:'reviewer', documentId:'approval-level-replacement',
      decision:'verify',reason:'Visible identity of the business matches the original application.',now:f.now+4 });
    await reviewSellerApplication(f.db,{ sellerId:'registered',actorId:'reviewer',action:'approve',
      reason:'The independently verified document resolved the problem.',now:f.now+5 });
    const plainApproval=f.sqlite.prepare(`SELECT channel,body_en FROM notification_messages
      WHERE related_id='registered' AND recipient_user_id='registered-owner'
      AND template_key='business.seller_application.result' ORDER BY channel`).all();
    assert.deepEqual(plainApproval.map(row=>[row.channel,row.body_en]), ['email','in_app'].map(
      channel=>[channel,'Your shop is approved. Add your first product to go live.']));
  } finally { f.dispose(); }
});

void test('the MariaDB JSON scalar path and D1 extraction identify the same saved deadline',async()=>{
  const f=await fixture();
  try {
    await reviewSellerDocument(f.db,{sellerId:'registered',documentId:id,actorId:'reviewer',decision:'request_correction',
      reason:note,neededBefore:'first_payout',now:f.now});
    f.sqlite.function('JSON_VALUE',(value,path)=>path==='$.neededBefore'&&typeof value==='string'
      ? (JSON.parse(value) as { neededBefore?: string }).neededBefore??null : null);
    const mariaDialect=Object.assign(Object.create(f.db),{dialect:'mariadb'}) as D1Database;
    const d1Problems=await readApplicationDocumentProblems(f.db,'registered');
    assert.equal(d1Problems[0].neededBefore,'first_payout');
    assert.deepEqual(await readApplicationDocumentProblems(mariaDialect,'registered'),d1Problems);
    await f.db.batch(applicationDocumentProblemsGuard(mariaDialect,'registered',d1Problems));
  } finally { f.dispose(); }
});

void test('an open bank fix keeps a rejected version out of verification until its replacement matches', async () => {
  const f = await fixture();
  try {
    const { db, sqlite, now } = f;
    const sellerId = 'registered';
    sqlite.exec("UPDATE seller_profiles SET payout_account_reference=NULL,applicant_type='individual' WHERE id='registered'");
    const identityId = 'payout-fix-verified-pan';
    sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES(?,'registered','pan_certificate',?,'pan.pdf','application/pdf',60,'pending',?)`)
      .run(identityId,'private/seller-documents/registered/'+identityId,now-1);
    await reviewSellerDocument(db,{ sellerId,documentId:identityId,actorId:'reviewer',decision:'verify',
      reason:'The fictional legal identity and account owner match.',now });
    const upload = async (bankDocumentId: string,time: number) => submitSellerBankDetails(db,{
      sellerId, actorId:'registered-owner', revision:(await sellerBankState(db,sellerId)).revision,
      details:{payoutBeneficiary:'Fictional Registered',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'TEST-BANK-ONLY'},
      document:{id:bankDocumentId,kind:'bank_verification',objectKey:'private/seller-documents/registered/'+bankDocumentId,
        originalName:'bank.pdf',mimeType:'application/pdf',sizeBytes:60},now:time,
    });
    const firstBankId = 'payout-fix-bank-first';
    await upload(firstBankId,now+1);
    await reviewSellerDocument(db,{ sellerId,documentId:firstBankId,actorId:'reviewer',decision:'request_correction',
      neededBefore:'first_payout',reason:'The bank document must show the entire account holder name.',now:now+2 });
    const expectedProblemReviews = (await readApplicationDocumentProblems(db,sellerId)).map(problem=>problem.reviewId);
    assert.equal(expectedProblemReviews.length,1);
    await assert.rejects(reviewSellerApplication(db,{ sellerId,actorId:'reviewer',action:approveWithFixes,
      expectedProblemReviews:['stale-document-review'],reason:'Approve with the recorded payout fix.',now:now+3 }), /document problems changed/i);
    await reviewSellerApplication(db,{ sellerId,actorId:'reviewer',action:approveWithFixes,
      expectedProblemReviews,reason:'Approve with the recorded payout fix.',now:now+3 });
    const open = () => readSellerPayoutFixes(db,sellerId);
    assert.equal((await open())[0].sellerHref,'/seller/finance#seller-bank-evidence');
    assert.equal((await open())[0].waitingFor,'seller');
    const verify = async (time: number) => reviewSellerBankDetails(db,{
      sellerId,actorId:'reviewer',revision:(await sellerBankState(db,sellerId)).revision,
      reference:'FICTIONAL-BANK-AUDIT',reason:'Inspect the original legal ownership and the corrected bank file.',
      ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,now:time,
    });
    await assert.rejects(verify(now+4),/still needs to upload/i);
    const secondBankId='payout-fix-bank-second';
    await upload(secondBankId,now+5);
    assert.equal((await open())[0].waitingFor,'staff');
    const repeatNote='The account number is cut off. Upload the complete bank statement.';
    await reviewSellerDocument(db,{sellerId,documentId:secondBankId,actorId:'reviewer',decision:'request_correction',
      reason:repeatNote,now:now+6 });
    assert.deepEqual((await open()).map(fix=>[fix.note,fix.waitingFor]),[[repeatNote,'seller']]);
    const bankNotices=sqlite.prepare(`SELECT channel,subject_en,body_en FROM notification_messages
      WHERE related_type='seller_bank_document' AND related_id=? AND recipient_user_id='registered-owner' ORDER BY channel`).all(secondBankId);
    assert.deepEqual(bankNotices.map(row=>row.channel),['email','in_app']);
    assert.ok(bankNotices.every(row=>row.subject_en==='Please fix your bank document' && String(row.body_en).includes(repeatNote)));
    await assert.rejects(verify(now+7),/still needs to upload/i);
    await upload('payout-fix-bank-third',now+8);
    assert.equal((await open())[0].waitingFor,'staff');
    await verify(now+9);
    assert.deepEqual(await open(),[]);
    assert.equal((await sellerBankState(db,sellerId)).status,'verified');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capability_holds WHERE seller_id=? AND released_at IS NULL").get(sellerId)?.n,0);
  } finally { f.dispose(); }
});
