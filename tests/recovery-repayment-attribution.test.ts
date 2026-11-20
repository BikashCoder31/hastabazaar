import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {getSellerRecoveryReview,allocateSellerRecoveryReceipt} from '../lib/payments/seller-recovery';
import {openRefundObligation} from '../lib/payments/refund-obligations';

async function setup(payerUserId:string|null='customer'){
 const f=await approvedSellerRecoveryFixture();
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const credit=await recordBankReceipt(f.db,f.ctx('attribution-actual-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-ATTRIBUTION-ACTUAL-CREDIT',bankAt:Date.now()-1,amountMinor:f.originalPaidPaisa+1000,currency:'NPR',payerReference:'Fictional actual third-party payer',payerUserId,evidenceReference:'FICTIONAL-INDEPENDENT-PAYER-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:[],reason:'Retain the actual payer without presenting their credit as the seller bank account.'});
 return {...f,credit};
}
async function approval(f:Awaited<ReturnType<typeof setup>>){const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);return {caseId:f.recoveryId,receiptId:f.credit.id,receiptRevision:0,amountPaisa:f.originalPaidPaisa,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-CASE-SPECIFIC-PAYER-ATTRIBUTION',reason:'Verify this actual credit was paid toward this exact original seller recovery.',publicMessage:'Finance confirmed money paid toward this recovery. Only approved allocations change your balance.'};}

void test('one eligible Super Admin attributes actual third-party money without changing payer; allocation and original-payer excess return stay separate',async()=>{
 const f=await setup();try{
 const path='../lib/payments/recovery-repayment-attribution',m=await import(path),input=await approval(f),ctx=f.ctx('attribute-third-party','1');
 const approved=await m.approveRecoveryRepaymentAttribution(f.db,ctx,input);
 assert.deepEqual(await m.approveRecoveryRepaymentAttribution(f.db,ctx,input),approved);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT payer_user_id FROM company_money_receipts WHERE id=?').get(f.credit.id)!.payer_user_id,'customer');
 await allocateSellerRecoveryReceipt(f.db,f.ctx('allocate-attributed-credit','2'),{caseId:f.recoveryId,receiptId:f.credit.id,receiptRevision:1,amountPaisa:f.originalPaidPaisa,method:'cash',evidenceReference:'FICTIONAL-EXACT-APPROVED-ALLOCATION',reason:'Allocate this approved actual credit once against its original native debt.'});
 const returned=await openRefundObligation(f.db,f.ctx('return-attributed-excess'),{kind:'receipt_return',sourceId:f.credit.id,reason:'Return unused excess only to the independently verified original actual payer.'});
 assert.deepEqual({...f.sqlite.prepare('SELECT customer_id,cash_paisa,state FROM refund_obligations WHERE id=?').get(returned.id)},{customer_id:'customer',cash_paisa:1000,state:'open'});
 const owner=await m.readOwnedRecoveryRepaymentAttributions(f.db,'registered-owner',f.recoveryId);
 assert.equal(owner.length,1);assert.equal(JSON.stringify(owner).includes('customer'),false);assert.equal(JSON.stringify(owner).includes(input.evidenceReference),false);
 }finally{f.dispose();}
});

void test('unidentified money remains an owned exception and cannot become attributed repayment',async()=>{
 const f=await setup(null);try{
 const path='../lib/payments/recovery-repayment-attribution',m=await import(path);
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('unknown-attribution','1'),await approval(f)),/identified|payer/i);
 assert.equal(f.sqlite.prepare('SELECT owner_id FROM manual_payment_exceptions WHERE receipt_id=?').get(f.credit.id)!.owner_id,'reviewer');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').get()!.n,0);
 }finally{f.dispose();}
});

void test('attribution rejects changed receipt or personal payer authority and keeps retained evidence immutable',async()=>{
 const f=await setup();try{
 const path='../lib/payments/recovery-repayment-attribution',m=await import(path),input=await approval(f);
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','super_admin',1)").run();
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,{...f.ctx('payer-cannot-attribute','1'),actorId:'customer'},input));
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('stale-receipt-attribution','1'),{...input,receiptRevision:4}));
 await m.approveRecoveryRepaymentAttribution(f.db,f.ctx('retained-attribution','1'),input);
 assert.throws(()=>f.sqlite.prepare('UPDATE seller_recovery_repayment_attributions SET amount_paisa=1').run(),/retained/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM seller_recovery_repayment_attributions').run(),/retained/);
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('duplicate-attribution','2'),{...input,receiptRevision:1,reviewDigest:(await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId)).reviewDigest}),/already|retained/);
 }finally{f.dispose();}
});

void test('case attribution requires exact live capacity and matching actual bank credit, never claim-only evidence',async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),input=await approval(f);
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('attribution-over-case-cap','1'),{...input,amountPaisa:f.originalPaidPaisa+1}));
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('attribution-missing-actual-credit','1'),{...input,receiptId:'FICTIONAL-NOT-A-BANK-CREDIT'}));
 const guard=await m.recoveryRepaymentCashGuard(f.db,{caseId:f.recoveryId,receiptId:f.credit.id,ownerId:'registered-owner',amountPaisa:1});assert.equal(guard.allowed,false);
 await m.approveRecoveryRepaymentAttribution(f.db,f.ctx('bounded-case-attribution','1'),{...input,amountPaisa:1000});
 assert.equal((await m.recoveryRepaymentCashGuard(f.db,{caseId:f.recoveryId,receiptId:f.credit.id,ownerId:'registered-owner',amountPaisa:1001})).allowed,false);
 assert.equal((await m.recoveryRepaymentCashGuard(f.db,{caseId:'other-case',receiptId:f.credit.id,ownerId:'registered-owner',amountPaisa:1})).allowed,false);
 assert.equal((await m.recoveryRepaymentCashGuard(f.db,{caseId:f.recoveryId,receiptId:f.credit.id,ownerId:'customer',amountPaisa:1})).allowed,false);
 assert.equal((await m.recoveryRepaymentCashGuard(f.db,{caseId:f.recoveryId,receiptId:f.credit.id,ownerId:'registered-owner',amountPaisa:1000})).allowed,true);
 }finally{f.dispose();}
});

for(const change of ['receipt_revision','reviewer_revocation','source_owner','case_revision'])void test(`case attribution rechecks ${change} at its atomic write boundary`,async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),input=await approval(f);let batches=0;
 const raced=Object.create(f.db) as D1Database;raced.batch=async statements=>{if(++batches===2){if(change==='receipt_revision')f.sqlite.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=?').run(f.credit.id);else if(change==='reviewer_revocation')f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();else if(change==='source_owner')f.sqlite.prepare("UPDATE seller_profiles SET user_id='customer' WHERE id='registered'").run();else f.sqlite.prepare('UPDATE seller_recovery_cases SET revision=revision+1 WHERE id=?').run(f.recoveryId);}return f.db.batch(statements);};
 await assert.rejects(m.approveRecoveryRepaymentAttribution(raced,f.ctx('attribution-race-'+change,'1'),input));assert.equal(batches,2);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

for(const report of ['gross_credit','case_amount'] as const)void test(`retained attribution permits matching the third-party ${report} report without allocating money`,async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),claims=await import('../lib/payments/recovery-repayments'),input=await approval(f);
 const claim=await claims.submitRecoveryRepaymentClaim(f.db,{...f.ctx('third-party-excess-report','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:report==='gross_credit'?f.originalPaidPaisa+1000:f.originalPaidPaisa,paymentReference:'FICTIONAL-THIRD-PARTY-EXCESS-REPORT',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'A third party paid this recovery plus an excess amount; please retain the real payer.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),match={caseId:f.recoveryId,claimId:claim.claimId,decision:'receipt_verified' as const,receiptId:f.credit.id,receiptRevision:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ATTRIBUTED-CLAIM-MATCH',reason:'Match this exact actual bank credit only after the case attribution is retained.',publicMessage:'The actual reported credit is matched; this action does not allocate money.',nextReviewAt:null};
 await assert.rejects(claims.reviewRecoveryRepaymentClaim(f.db,f.ctx('cannot-match-before-attribution','0'),match));
 await m.approveRecoveryRepaymentAttribution(f.db,f.ctx('attribute-before-claim-match','1'),input);
 await claims.reviewRecoveryRepaymentClaim(f.db,f.ctx('match-attributed-excess-report','0'),{...match,receiptRevision:1,reviewDigest:(await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId)).reviewDigest});
 assert.equal((await claims.getRecoveryRepaymentView(f.db,'registered-owner',f.recoveryId)).claims[0].status,'receipt_verified');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT payer_user_id FROM company_money_receipts WHERE id=?').get(f.credit.id)!.payer_user_id,'customer');
 }finally{f.dispose();}
});

void test('new attribution uses actual completed reversal collection rather than the retained gross allocation cap',async()=>{
 const {recoveryReceiptReversalFixture}=await import('./helpers/recovery-receipt-reversal-fixture'),f=await recoveryReceiptReversalFixture('registered');try{
 const disposition=await import('../lib/payments/recovery-receipt-disposition'),m=await import('../lib/payments/recovery-repayment-attribution');
 const reversal=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId);
 await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('attribution-after-completed-reversal',String(reversal.receiptRevision)),{reversalId:f.reversalId,reviewDigest:reversal.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000}],evidenceReference:'FICTIONAL-BEFORE-REPLACEMENT-ATTRIBUTION',reason:'Reconcile the actual reversed portion before attributing separate replacement money.',publicMessage:'The bank reversal is reconciled before any new repayment is considered.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId),amount=review.position.collectiblePaisa;
 assert.ok(amount>f.originalConfirmedPaisa-20000,'Replacement capacity includes the completed reversed portion.');
 const credit=await recordBankReceipt(f.db,f.ctx('attribution-replacement-actual-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-ATTRIBUTED-REPLACEMENT-CREDIT',bankAt:Date.now()-1,amountMinor:amount+1000,currency:'NPR',payerReference:'Fictional replacement third-party payer',payerUserId:'customer',evidenceReference:'FICTIONAL-REPLACEMENT-ACTUAL-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify independent replacement money after the prior allocation was partly reversed.'});
 await m.approveRecoveryRepaymentAttribution(f.db,f.ctx('attribute-replacement-case-cap',String(review.case.revision)),{caseId:f.caseId,receiptId:credit.id,receiptRevision:0,amountPaisa:amount,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-REPLACEMENT-CASE-ATTRIBUTION',reason:'Link only the still-valid original collectible amount to this separate actual credit.',publicMessage:'Replacement money is reviewed against the actual remaining balance.'});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM seller_recovery_repayment_attributions WHERE receipt_id=?').get(credit.id)!.amount_paisa,amount);
 }finally{f.dispose();}
});

for(const hold of ['case_blocker','actual_receipt_reversal'] as const)void test(`attribution cannot bypass a ${hold}`,async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),input=await approval(f);
 if(hold==='case_blocker')f.sqlite.prepare("UPDATE seller_recovery_cases SET blocker='A retained original responsibility review is pending.',revision=revision+1 WHERE id=?").run(f.recoveryId);
 else {const {recordReceiptReversal}=await import('../lib/payments/receipt-corrections');await recordReceiptReversal(f.db,f.ctx('attribution-pending-bank-reversal','0'),{receiptId:f.credit.id,amountMinor:1000,transactionIdentity:'FICTIONAL-ATTRIBUTION-PENDING-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-ATTRIBUTION-REVERSAL-PROOF',reason:'Retain the actual bank reversal before assigning any case-specific money attribution.'});}
 const current=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('cannot-attribute-held-source',String(current.case.revision)),{...input,reviewDigest:current.reviewDigest,receiptRevision:hold==='actual_receipt_reversal'?1:0}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').get()!.n,0);
 }finally{f.dispose();}
});

void test('returned original customer refund credit is excluded from seller payer attribution and candidate views',async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),customer=await import('../lib/payments/customer-refund-reversal'),input=await approval(f);
 const packet=f.sqlite.prepare("SELECT id,revision,account_version_id FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
 const returnedCredit=await recordBankReceipt(f.db,f.ctx('actual-returned-customer-credit'),{accountVersionId:String(packet.account_version_id),transactionIdentity:'FICTIONAL-CUSTOMER-RETURN-EXCLUDED-FROM-ATTRIBUTION',bankAt:Date.now()-1,amountMinor:1000,currency:'NPR',payerReference:'Fictional original customer',payerUserId:'customer',evidenceReference:'FICTIONAL-ACTUAL-CUSTOMER-RETURN-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify this actual small returned original customer refund credit and preserve its original purpose.'});
 await customer.recordCustomerRefundReversal(f.db,f.ctx('exclude-returned-customer-credit',String(packet.revision)),{packetId:String(packet.id),receiptId:returnedCredit.id,receiptRevision:0,amountPaisa:1000,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-ORIGINAL-CUSTOMER-CREDIT-RETURN',reason:'Retain this actual returned customer refund exclusively for its original customer disposition.'});
 const view=await m.getRecoveryRepaymentAttributionView(f.db,'reviewer',f.recoveryId);assert.equal(view.receipts.some(row=>row.id===returnedCredit.id),false);
 assert.equal((await m.recoveryRepaymentCashGuard(f.db,{caseId:f.recoveryId,receiptId:returnedCredit.id,ownerId:'registered-owner',amountPaisa:1})).allowed,false);
 await assert.rejects(m.approveRecoveryRepaymentAttribution(f.db,f.ctx('cannot-attribute-returned-customer-credit','1'),{...input,receiptId:returnedCredit.id,amountPaisa:1000}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').get()!.n,0);
 }finally{f.dispose();}
});

void test('a retained seller-attributed actual credit cannot later be relabelled as a returned customer refund',async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),customer=await import('../lib/payments/customer-refund-reversal'),input=await approval(f),packet=f.sqlite.prepare("SELECT id,revision,account_version_id FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
 const credit=await recordBankReceipt(f.db,f.ctx('actual-case-bound-small-credit'),{accountVersionId:String(packet.account_version_id),transactionIdentity:'FICTIONAL-CASE-BOUND-CREDIT-NOT-CUSTOMER-RETURN',bankAt:Date.now()-1,amountMinor:1000,currency:'NPR',payerReference:'Fictional factual third-party payer',payerUserId:'customer',evidenceReference:'FICTIONAL-SMALL-CASE-BOUND-ACTUAL-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify this separate actual credit before retaining its case-specific seller repayment purpose.'});
 await m.approveRecoveryRepaymentAttribution(f.db,f.ctx('retain-small-seller-case-attribution','1'),{...input,receiptId:credit.id,amountPaisa:1000});
 await assert.rejects(customer.recordCustomerRefundReversal(f.db,f.ctx('cannot-relabel-case-bound-credit',String(packet.revision)),{packetId:String(packet.id),receiptId:credit.id,receiptRevision:1,amountPaisa:1000,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-CANNOT-REUSE-ATTRIBUTED-CREDIT',reason:'This credit is already retained for a seller recovery and must not be silently reused.'}),/original_case|required/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversals').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(credit.id)!.revision,1);
 }finally{f.dispose();}
});

void test('case attribution publishes one current common recovery event and public notice without allocating money',async()=>{
 const f=await setup();try{
 const m=await import('../lib/payments/recovery-repayment-attribution'),workspace=await import('../lib/payments/recovery-workspace'),notices=await import('../lib/operations/event-catalog'),input=await approval(f),ctx=f.ctx('attribution-common-notice','1');
 const saved=await m.approveRecoveryRepaymentAttribution(f.db,ctx,input);assert.equal(saved.revision,2);
 const event=f.sqlite.prepare("SELECT revision,details_json FROM seller_recovery_events WHERE case_id=? AND request_id=? AND action='repayment_attributed'").get(f.recoveryId,ctx.requestId)!;assert.equal(event.revision,2);assert.equal(JSON.parse(String(event.details_json)).publicMessage,input.publicMessage);
 const noticeRows=()=>f.sqlite.prepare("SELECT id,recipient_user_id,audience_role,channel,body_en FROM notification_messages WHERE related_id=? AND template_key='business.seller.recovery' AND body_en LIKE ? ORDER BY id").all(f.recoveryId,'%'+input.publicMessage+'%');
 const before=noticeRows();assert.ok(before.some(row=>row.recipient_user_id==='registered-owner'&&row.channel==='email'));assert.ok(before.some(row=>row.recipient_user_id==='registered-owner'&&row.channel==='in_app'));
 assert.equal(await notices.isCurrentOperationalNotice(f.db,{template:'business.seller.recovery',relatedId:f.recoveryId,userId:'registered-owner',audience:'seller',channel:'email',requestId:await notices.operationalNotificationRequestId('business.seller.recovery',ctx.requestId,'owner','email')}),true);
 const statement=await workspace.getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId),publicHistory=JSON.stringify(statement.events);
 assert.ok(publicHistory.includes(input.publicMessage));assert.equal(publicHistory.includes(input.evidenceReference),false);assert.equal(publicHistory.includes(input.reason),false);assert.equal(JSON.stringify(before).includes(input.evidenceReference),false);assert.equal(JSON.stringify(before).includes('Fictional actual third-party payer'),false);
 assert.deepEqual(await m.approveRecoveryRepaymentAttribution(f.db,ctx,input),saved);assert.deepEqual(noticeRows(),before);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE request_id=?").get(ctx.requestId)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);assert.equal((await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId)).position.recoveredPaisa,0);
 }finally{f.dispose();}
});
