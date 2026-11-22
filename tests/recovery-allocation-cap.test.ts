import assert from 'node:assert/strict';
import test from 'node:test';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
void test('recovery capacity shares one confirmed cap across cash earnings reimbursements disputes and company absorption',async()=>{
 const path='../lib/payments/seller-recovery';const {recoveryPosition}=await import(path);
 const original={exposurePaisa:88000,confirmedPaisa:88000,approvedCapPaisa:88000,disputedPaisa:0,absorbedPaisa:0,recovered:{cash:0,earnings:0,returnedPayout:0,carrier:0}};
 assert.deepEqual(recoveryPosition(original),{provisionalPaisa:0,recoveredPaisa:0,remainingPaisa:88000,collectiblePaisa:88000,overRecoveredPaisa:0});
 assert.equal(recoveryPosition({...original,recovered:{cash:20000,earnings:50000,returnedPayout:5000,carrier:3000},disputedPaisa:4000,absorbedPaisa:1000}).collectiblePaisa,5000);
 const uncertain=recoveryPosition({...original,confirmedPaisa:0});assert.equal(uncertain.collectiblePaisa,0);assert.equal(uncertain.provisionalPaisa,88000);
 const corrected=recoveryPosition({...original,confirmedPaisa:50000,recovered:{...original.recovered,cash:60000}});assert.equal(corrected.collectiblePaisa,0);assert.equal(corrected.overRecoveredPaisa,10000);
 assert.equal(recoveryPosition({...original,approvedCapPaisa:30000,recovered:{...original.recovered,cash:20000}}).collectiblePaisa,10000);
 for(const amount of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>recoveryPosition({...original,confirmedPaisa:amount}));
});

void test('actual seller repayment consumes one receipt and one recovery cap and settles the existing native debt once',async()=>{
 const {sellerRecoveryFixture}=await import('./helpers/seller-recovery-fixture');const f=await sellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery';const m=await import(path);
 const opened=await m.openSellerRecovery(f.db,f.ctx('cash-case-open'),{kind:'refund',id:f.refundId,reason:'Reconcile original paid money before accepting any actual seller repayment.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.approveSellerRecovery(f.db,f.ctx('cash-case-approve','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-RECOVERY-RECONCILIATION',reason:'Approve the actual original net debt without inventing a second adjustment.'});
 const receipt=await recordBankReceipt(f.db,f.ctx('seller-repayment-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-SELLER-REPAYMENT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Fictional registered seller repayment',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-ACTUAL-INCOMING-REPAYMENT',reason:'Independently verify the actual incoming company credit and its original seller payer.'});
 const input={caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-INCOMING-REPAYMENT-ALLOCATION',reason:'Allocate only this actual original seller repayment to the approved remaining balance.'};
 const before=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n);
 const saved=await m.allocateSellerRecoveryReceipt(f.db,f.ctx('seller-repayment-allocate','1'),input);
 assert.deepEqual(await m.allocateSellerRecoveryReceipt(f.db,f.ctx('seller-repayment-allocate','1'),input),saved);
 assert.equal(Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),before+20000);
 const current=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(current.position.recoveredPaisa,20000);assert.equal(current.position.remainingPaisa,f.originalPaidPaisa-20000);
 await assert.rejects(m.allocateSellerRecoveryReceipt(f.db,f.ctx('reuse-spent-repayment','2'),{...input,receiptRevision:1,amountPaisa:1}));
 assert.throws(()=>f.sqlite.prepare("INSERT INTO manual_receipt_uses(id,receipt_id,kind,target_id,amount_minor,state,created_by,created_at) VALUES('double-spend',?,'return','another-use',1,'reserved','reviewer',1)").run(receipt.id),/balance/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,1);
 const {recordReceiptReversal}=await import('../lib/payments/receipt-corrections');
 await recordReceiptReversal(f.db,f.ctx('actual-repayment-credit-reversed','1'),{receiptId:receipt.id,amountMinor:10000,transactionIdentity:'FICTIONAL-ACTUAL-REPAYMENT-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-ACTUAL-REPAYMENT-REVERSAL-PROOF',reason:'The bank actually reversed part of the original received repayment; reconcile attribution.'});
 const reversed=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(reversed.case.state,'reconciliation');assert.equal(reversed.unreconciledReceiptPaisa,20000);assert.equal(reversed.position.recoveredPaisa,0);assert.equal(reversed.position.collectiblePaisa,0,'Do not make a fresh collection demand from unresolved reversal attribution.');
 f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)");
 await assert.rejects(m.allocateSellerRecoveryReceipt(f.db,f.ctx('seller-repayment-allocate','1'),input),'Even exact saved allocation recovery requires current Super Admin authority.');
 }finally{f.dispose();}
});
void test('an approved but unpaid customer refund exposes its original seller cost without creating collectible debt or another ledger charge',async()=>{
 const f=await refundPacketFixture({responsibility:'seller'});try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const before=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n;
 const path='../lib/payments/seller-recovery';const {readSellerRecoverySource}=await import(path);
 const source=await readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.equal(source.sellerId,'registered');assert.equal(source.model,'registered');assert.equal(source.currency,'NPR');assert.equal(source.exposurePaisa,80000);assert.equal(source.confirmedPaisa,0);assert.equal(source.blocker,'The original customer refund is not confirmed completed.');
 assert.equal(source.refundId,f.refundId);assert.equal(source.orderId,f.orderId);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,before);
 await assert.rejects(readSellerRecoverySource(f.db,{kind:'refund',id:'foreign-missing-refund'}));
 }finally{f.dispose();}
});

void test('historical managed adjustment remains visible but cannot manufacture confirmed refund evidence or seller responsibility',async()=>{
 const {earnedMaker,refund}=await import('./helpers/company-store-financial-fixture');const f=await earnedMaker();try{
 await refund(f);const path='../lib/payments/seller-recovery';const {readSellerRecoverySource}=await import(path);
 const source=await readSellerRecoverySource(f.db,{kind:'refund',id:'refund-one'});
 assert.equal(source.model,'managed');assert.ok(source.nativeDebitPaisa>0);assert.equal(source.confirmedPaisa,0);assert.equal(source.compensationPaisa,0);assert.match(source.blocker,/responsibility/i);
 }finally{f.dispose();}
});

void test('one provisional recovery case links the original obligation without another economic charge and rechecks exact current authority',async()=>{
 const f=await refundPacketFixture({responsibility:'seller'});try{
 const path='../lib/payments/seller-recovery';const m=await import(path),input={kind:'refund',id:f.refundId,reason:'Reconcile the original recorded seller cost and actual refund before any collection.'};
 const count=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n;
 const saved=await m.openSellerRecovery(f.db,f.ctx('original-recovery'),input);
 assert.deepEqual(await m.openSellerRecovery(f.db,f.ctx('original-recovery'),input),saved);
 assert.equal((await m.openSellerRecovery(f.db,f.ctx('same-recovery-source'),input)).id,saved.id);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_cases').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,count);
 assert.equal(f.sqlite.prepare('SELECT confirmed_paisa FROM seller_recovery_cases').get()!.confirmed_paisa,0);
 await assert.rejects(m.openSellerRecovery(f.db,f.ctx('original-recovery'),{...input,reason:'Different content must not reuse a saved recovery command.'}));
 await assert.rejects(m.openSellerRecovery(f.db,{...f.ctx('foreign-recovery'),actorId:'registered-owner'},input));
 }finally{f.dispose();}
});

void test('confirmed post-payout recovery uses the original native net adjustment and preserves the actual paid payout',async()=>{
 const {sellerRecoveryFixture}=await import('./helpers/seller-recovery-fixture');const f=await sellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery';const m=await import(path),source=await m.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.equal(source.blocker,null);assert.equal(source.confirmedPaisa,f.originalPaidPaisa);assert.ok(source.confirmedPaisa<80000,'Original recorded commission is reversed instead of being charged again.');
 assert.equal(source.historicalNettingPaisa,0);assert.deepEqual(source.originalPayoutIds,[f.payoutId]);
 const opened=await m.openSellerRecovery(f.db,f.ctx('completed-recovery'),{kind:'refund',id:f.refundId,reason:'Review the completed original customer refund against its actual original payout.'});
 assert.equal(f.sqlite.prepare('SELECT state FROM seller_recovery_cases WHERE id=?').get(opened.id)!.state,'awaiting_approval');
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 }finally{f.dispose();}
});

void test('one eligible Super Admin approves the exact confirmed recovery without another charge and stale review or lost authority cannot approve',async()=>{
 const {sellerRecoveryFixture}=await import('./helpers/seller-recovery-fixture');const f=await sellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery';const m=await import(path),opened=await m.openSellerRecovery(f.db,f.ctx('approve-recovery-open'),{kind:'refund',id:f.refundId,reason:'Prepare the exact original post-payout recovery for one financial review.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id),before=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n;
 const input={caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-RESPONSIBILITY-RECONCILIATION',reason:'Approve only the confirmed original net liability and actual source reconciliation.'};
 await assert.rejects(m.approveSellerRecovery(f.db,f.ctx('stale-recovery-approval','0'),{...input,reviewDigest:'stale-unreviewed-source'}));
 const saved=await m.approveSellerRecovery(f.db,f.ctx('exact-recovery-approval','0'),input);
 assert.deepEqual(await m.approveSellerRecovery(f.db,f.ctx('exact-recovery-approval','0'),input),saved);
 assert.equal(f.sqlite.prepare('SELECT approved_cap_paisa FROM seller_recovery_cases WHERE id=?').get(opened.id)!.approved_cap_paisa,f.originalPaidPaisa);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,before);
 f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)");
 await assert.rejects(m.approveSellerRecovery(f.db,f.ctx('exact-recovery-approval','0'),input));
 }finally{f.dispose();}
});

void test('a post-payout native debt cannot silently net future earnings before a recovery decision or without an authorized earnings allocation',async()=>{
 const {sellerRecoveryFixture}=await import('./helpers/seller-recovery-fixture');const f=await sellerRecoveryFixture();try{
 const {prepareSellerPayout}=await import('../lib/db/repositories/payouts');
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('fictional-later-earnings','registered','sale',100000,1,'Fictional later eligible independent earnings',1)").run();
 const prepare=(key:string)=>prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Prepare only lawful eligible future earnings without silent debt netting.',requestId:key,now:Date.now()});
 await assert.rejects(prepare('no-recovery-authority'));
 const path='../lib/payments/seller-recovery';const m=await import(path),opened=await m.openSellerRecovery(f.db,f.ctx('unapproved-netting-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the original negative adjustment before using unrelated future earnings.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.approveSellerRecovery(f.db,f.ctx('cash-only-approval','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-CASH-ONLY-RECOVERY',reason:'Approve a cash recovery plan without assuming the old agreement authorizes netting.'});
 await assert.rejects(prepare('cash-plan-does-not-authorize-netting'));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payouts').get()!.n,1,'The actual original payout is retained; neither new instruction was prepared.');
 assert.equal(f.sqlite.prepare("SELECT status FROM seller_profiles WHERE id='registered'").get()!.status,'approved','Recovery is not an automatic seller suspension.');
 }finally{f.dispose();}
});

void test('seller dispute pauses only its amount and one eligible Super Admin absorption settles that amount without calling it recovered',async()=>{
 const {approvedSellerRecoveryFixture}=await import('./helpers/seller-recovery-fixture');const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery';const m=await import(path),input={caseId:f.recoveryId,amountPaisa:20000,reason:'Please review the original condition evidence for this disputed component.',evidenceReference:null};
 await assert.rejects(m.disputeSellerRecovery(f.db,{...f.ctx('foreign-dispute','1'),actorId:'customer'},input));
 const ctx={...f.ctx('owner-dispute','1'),actorId:'registered-owner'};
 const result=await m.disputeSellerRecovery(f.db,ctx,input);assert.deepEqual(await m.disputeSellerRecovery(f.db,ctx,input),result);
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(review.position.collectiblePaisa,f.originalPaidPaisa-20000);assert.equal(review.case.disputedPaisa,20000);
 assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(f.obligationId)!.state,'completed');
 const before=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n);
 const reduction={caseId:f.recoveryId,amountPaisa:20000,resolveDisputedPaisa:20000,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-REVIEWED-COMPANY-COST',reason:'The reviewed original evidence supports company absorption of this disputed amount.',collectionAttempts:'Reviewed the seller response and original physical inspection evidence.'};
 await m.absorbSellerRecovery(f.db,f.ctx('one-super-admin-absorption','2'),reduction);
 await m.absorbSellerRecovery(f.db,f.ctx('one-super-admin-absorption','2'),reduction);
 const current=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(current.position.recoveredPaisa,0);assert.equal(current.position.remainingPaisa,f.originalPaidPaisa-20000);assert.equal(current.case.absorbedPaisa,20000);assert.equal(current.case.disputedPaisa,0);
 assert.equal(Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),before+20000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_reductions').get()!.n,1);
 }finally{f.dispose();}
});

void test('recovery uses the shared seller/staff notice identity, includes the acting Super Admin and suppresses an old demand after a dispute',async()=>{
 const {approvedSellerRecoveryFixture}=await import('./helpers/seller-recovery-fixture');const f=await approvedSellerRecoveryFixture();try{
 const rows=f.sqlite.prepare("SELECT template_key AS template,related_id AS relatedId,recipient_user_id AS userId,audience_role AS audience,channel,request_id AS requestId FROM notification_messages WHERE related_type='seller_recovery' AND related_id=?").all(f.recoveryId);
 assert.equal(rows.length,8,'Opening and approval each have two channels for seller and the acting Super Admin.');
 const {isCurrentOperationalNotice}=await import('../lib/operations/event-catalog');
 const current=[];for(const row of rows)if(await isCurrentOperationalNotice(f.db,row as never))current.push(row);
 assert.equal(current.length,4);assert.equal(current.filter(row=>row.userId==='reviewer').length,2);
 const path='../lib/payments/seller-recovery';const m=await import(path);
 await m.disputeSellerRecovery(f.db,{...f.ctx('notice-dispute','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:10000,reason:'Review this amount against the original item condition evidence.',evidenceReference:null});
 for(const row of current)assert.equal(await isCurrentOperationalNotice(f.db,row as never),false);
 }finally{f.dispose();}
});

