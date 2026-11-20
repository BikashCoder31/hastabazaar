import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {recordBankReceipt} from '../lib/payments/manual-receipts';

void test('secure verified receiving instructions and a seller claim create owned review, never money or agreement revision changes',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-repayments';const m=await import(path);
 const view=await m.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId);
 assert.equal(view.instructions.account.accountNumber,'TEST-MANUAL-0001');assert.equal(view.instructions.accountVersionId,f.accountVersionId);
 assert.ok(view.instructions.reference.includes(f.recoveryId));assert.equal(JSON.stringify(view).includes('verificationReference'),false);
 await assert.rejects(m.getRecoveryRepaymentView(f.db,'customer',f.recoveryId));
 const before=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const input={caseId:f.recoveryId,amountPaisa:f.originalPaidPaisa+1000,paymentReference:'FICTIONAL-SELLER-CLAIM',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'I report this transfer for independent Finance matching.'};
 const ctx={...f.ctx('seller-repayment-claim','1'),actorId:'registered-owner'};
 const claim=await m.submitRecoveryRepaymentClaim(f.db,ctx,input);
 await m.ensureRecoveryRepaymentWork(f.db,claim.claimId);
 assert.equal(f.sqlite.prepare("SELECT owner_id FROM review_tasks WHERE source_type='recovery_claim' AND source_id=?").get(claim.claimId)!.owner_id,'reviewer');
 assert.deepEqual(await m.submitRecoveryRepaymentClaim(f.db,ctx,input),claim);
 const after=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.deepEqual(after.position,before.position);assert.equal(after.case.revision,before.case.revision);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_claims').get()!.n,1);
 assert.equal((await m.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId)).claims[0].status,'submitted');
 await assert.rejects(m.submitRecoveryRepaymentClaim(f.db,{...ctx,requestId:'duplicate-bank-claim'},input),/already|existing/i);
 }finally{f.dispose();}
});

void test('unknown or third-party credit stays owned; requested information and lost acknowledgements preserve one immutable claim',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-repayments';const m=await import(path),commands=await import('../lib/payments/recovery-commands');
 const body={sourceFormId:'system.recovery-seller',action:'claim',requestId:'claim-route-original',expectedRevision:'1',input:{caseId:f.recoveryId,amountPaisa:1000,paymentReference:'FICTIONAL-UNKNOWN-CREDIT',claimedAt:Date.now()-1000,accountVersionId:null,evidenceReference:null,note:'Please inspect this reported transfer with unknown account details.'}};
 const result=await commands.runRecoveryCommand(f.db,'registered-owner',body,'seller') as {claimId:string};
 assert.deepEqual(await commands.recoverRecoveryCommand(f.db,'registered-owner','claim-route-original','seller'),result);
 assert.equal(await commands.recoverRecoveryCommand(f.db,'customer','claim-route-original','seller'),null);
 const thirdParty=await recordBankReceipt(f.db,f.ctx('claim-other-actual-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-THIRD-PARTY-CREDIT',bankAt:Date.now()-1000,amountMinor:1000,currency:'NPR',payerReference:'Different fictional customer',payerUserId:'customer',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-OTHER-CREDIT-PROOF',reason:'Verify this separate actual fictional credit without changing its attribution.'});
 const current=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),input={caseId:f.recoveryId,claimId:result.claimId,decision:'receipt_verified',receiptId:thirdParty.id,receiptRevision:0,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-CLAIM-REVIEW',reason:'Review the actual credit against the reported payer and exact amount.',publicMessage:'The payer must be independently identified before the credit can be matched.',nextReviewAt:null};
 await assert.rejects(m.reviewRecoveryRepaymentClaim(f.db,f.ctx('reject-wrong-payer','0'),input),/attribution|third-party/);
 const nextReviewAt=Date.now()+86400000;
 await m.reviewRecoveryRepaymentClaim(f.db,f.ctx('request-claim-information','0'),{...input,decision:'needs_evidence',receiptId:null,receiptRevision:null,nextReviewAt});
 const additional={caseId:f.recoveryId,claimId:result.claimId,evidenceReference:null,note:'The transfer was made from my own account; please inspect the corrected reference supplied here.'};
 const added=await m.supplyRecoveryRepaymentEvidence(f.db,{...f.ctx('claim-more-information','1'),actorId:'registered-owner'},additional);
 assert.deepEqual(await m.supplyRecoveryRepaymentEvidence(f.db,{...f.ctx('claim-more-information','1'),actorId:'registered-owner'},additional),added);
 const view=await m.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId);
 assert.equal(view.claims[0].status,'submitted');assert.ok(view.claims[0].nextReviewAt<=nextReviewAt);
 assert.ok(view.claims[0].history.some((e:{message:string})=>e.message===additional.note));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_claim_events').get()!.n,3);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('retired receiving details disappear, an earlier claim remains reportable, and changed ownership cannot inherit private repayment instructions',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-repayments';const m=await import(path),accounts=await import('../lib/payments/company-accounts');
 const version=f.sqlite.prepare('SELECT revision FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!;
 await accounts.retireCompanyAccount(f.db,f.ctx('retire-receiving-for-claims',String(version.revision)),{versionId:f.accountVersionId,reason:'Retire these fictional receiving instructions while retaining earlier actual bank history.'});
 assert.equal((await m.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId)).instructions,null);
 await m.submitRecoveryRepaymentClaim(f.db,{...f.ctx('late-original-account-claim','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,paymentReference:'FICTIONAL-EARLIER-TRANSFER',claimedAt:Date.now()-10000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'This earlier payment used the original verified company account.'});
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='customer' WHERE id='registered'").run();
 for(const actor of ['customer','registered-owner'])await assert.rejects(m.getRecoveryRepaymentView(f.db,actor,f.recoveryId),/own original/);
 }finally{f.dispose();}
});

for(const change of ['receipt_revision','reviewer_revocation'])void test(`claim matching rechecks ${change} inside its commit`,async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-repayments';const m=await import(path);
 const claim=await m.submitRecoveryRepaymentClaim(f.db,{...f.ctx('claim-before-commit-change','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,paymentReference:'FICTIONAL-COMMIT-CLAIM',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'Independently inspect the reported bank payment and current authority.'});
 const actual=await recordBankReceipt(f.db,f.ctx('claim-source-before-race'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CLAIM-SOURCE-RACE',bankAt:Date.now()-1000,amountMinor:1000,currency:'NPR',payerReference:'Original fictional registered owner',payerUserId:'registered-owner',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-COMMIT-CREDIT-PROOF',reason:'Retain independent actual credit evidence before this isolated source race.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 let batches=0;const raced=Object.create(f.db) as D1Database;raced.batch=async statements=>{if(++batches===2){if(change==='receipt_revision')f.sqlite.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=?').run(actual.id);else f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();}return f.db.batch(statements);};
 // Batch one is the read-side authority guard. Change the source only at the actual write batch.
 await assert.rejects(m.reviewRecoveryRepaymentClaim(raced,f.ctx('claim-source-raced','0'),{caseId:f.recoveryId,claimId:claim.claimId,decision:'receipt_verified',receiptId:actual.id,receiptRevision:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-CURRENT-CLAIM-REVIEW',reason:'Recheck actual incoming money and the current independent authority at commit.',publicMessage:'The actual credit must remain current before this report can be matched.',nextReviewAt:null}));
 assert.equal(batches,2);
 assert.equal(f.sqlite.prepare('SELECT status FROM seller_recovery_repayment_claims WHERE id=?').get(claim.claimId)!.status,'submitted');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_claim_events').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});
void test('Finance matching requires current independent actual receipt evidence; excess stays unallocated and the original debt stays unchanged',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-repayments';const m=await import(path);
 const amount=f.originalPaidPaisa+1000,claim=await m.submitRecoveryRepaymentClaim(f.db,{...f.ctx('claim-before-bank','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:amount,paymentReference:'FICTIONAL-CLAIM-BANK-002',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'Please independently match the credit and retain its excess.'});
 const receipt=await recordBankReceipt(f.db,f.ctx('claim-actual-bank'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CLAIM-ACTUAL-CREDIT',bankAt:Date.now()-1000,amountMinor:amount,currency:'NPR',payerReference:'Fictional original registered owner',payerUserId:'registered-owner',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-INDEPENDENT-CREDIT',reason:'Independently verify the actual fictional incoming seller credit.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),input={caseId:f.recoveryId,claimId:claim.claimId,decision:'receipt_verified',receiptId:receipt.id,receiptRevision:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-CLAIM-ATTRIBUTION',reason:'Independently inspect the payer, amount, currency and previous allocations.',publicMessage:'Your reported credit is verified. Only approved allocations settle this statement; excess remains separately owned.',nextReviewAt:null};
 await assert.rejects(m.reviewRecoveryRepaymentClaim(f.db,{...f.ctx('owner-cannot-confirm','0'),actorId:'registered-owner'},input));
 await m.reviewRecoveryRepaymentClaim(f.db,f.ctx('finance-match-claim','0'),input);
 const after=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);assert.equal(after.position.recoveredPaisa,0);assert.equal(after.case.revision,1);
 const view=await m.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId);assert.equal(view.claims[0].status,'receipt_verified');
 assert.equal(JSON.stringify(view.claims).includes('FICTIONAL-CLAIM-ATTRIBUTION'),false);
 assert.equal(f.sqlite.prepare('SELECT revision FROM company_money_receipts WHERE id=?').get(receipt.id)!.revision,0);
 const duplicate=await m.submitRecoveryRepaymentClaim(f.db,{...f.ctx('another-report-same-bank-credit','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:amount,paymentReference:'FICTIONAL-SECOND-REPORT-SAME-CREDIT',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'This is another report which must not silently duplicate the existing bank credit.'});
 await assert.rejects(m.reviewRecoveryRepaymentClaim(f.db,f.ctx('cannot-match-credit-twice','0'),{...input,claimId:duplicate.claimId}),/already|duplicate/i);
 assert.equal((await m.recoveryRepaymentReviewSource(f.db,duplicate.claimId)).needsAction,true);
 const notifications=await import('../lib/operations/event-catalog'),corrections=await import('../lib/payments/receipt-corrections');
 const notice={template:'business.seller.recovery.claim',relatedId:claim.claimId,userId:'registered-owner',audience:'seller',channel:'email',requestId:await notifications.operationalNotificationRequestId('business.seller.recovery.claim','finance-match-claim','owner','email')};
 assert.equal(await notifications.isCurrentOperationalNotice(f.db,notice),true);
 await assert.rejects(m.reviewRecoveryRepaymentClaim(f.db,f.ctx('cannot-deny-actual-credit','1'),{...input,decision:'not_received',receiptId:null,receiptRevision:null}),/actual verified credit/);
 await corrections.recordReceiptReversal(f.db,f.ctx('claim-credit-actual-reversal','0'),{receiptId:receipt.id,amountMinor:100,transactionIdentity:'FICTIONAL-CLAIM-REVERSED-CREDIT',bankAt:Date.now()-1000,evidenceReference:'FICTIONAL-ACTUAL-REVERSAL',reason:'Independently record the actual fictional reversal without deleting the original bank credit.'});
 assert.equal(await notifications.isCurrentOperationalNotice(f.db,notice),false,'Do not deliver an obsolete successful matching message after its source reverses.');
 assert.equal((await m.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId)).claims[0].status,'receipt_reconciliation');
 const work=await m.recoveryRepaymentReviewSource(f.db,claim.claimId);assert.equal(work.needsAction,true);assert.equal(work.initialReviewerId,'reviewer');assert.ok(work.dueAt<=Date.now());
 }finally{f.dispose();}
});
