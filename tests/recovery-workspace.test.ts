import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';

void test('changing the current profile owner cannot make the original seller an independent Finance reviewer',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const payments=await import('../lib/payments/manual-receipts'),recovery=await import('../lib/payments/seller-recovery');
 const receipt=await payments.recordBankReceipt(f.db,f.ctx('original-party-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-ORIGINAL-PARTY-CREDIT',bankAt:Date.now()-1000,amountMinor:1000,currency:'NPR',payerReference:'Fictional original seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-ORIGINAL-PARTY-CREDIT-PROOF',reason:'Independently verify the original seller credit before its later ownership change.'});
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('original-party-allocation','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:1000,method:'cash',evidenceReference:'FICTIONAL-ORIGINAL-PARTY-ALLOCATION',reason:'Apply the actual original seller credit against its approved original liability.'});
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='customer' WHERE id='registered'").run();
 const workspace=await import('../lib/payments/recovery-workspace');
 await assert.rejects(recovery.getSellerRecoveryReview(f.db,'registered-owner',f.recoveryId),/personal interest|independent/i);
 assert.deepEqual((await workspace.getRecoveryFinanceWorkspace(f.db,'registered-owner')).summaries,[]);
 await assert.rejects((await import('../lib/payments/recovery-receipt-reversal')).recoveryReceiptReversalStatements(f.db,{...f.ctx('original-party-cannot-reverse'),actorId:'registered-owner'},receipt.id,'fictional-reversal-source','An original personally interested party cannot decide this reversal.'),/interest|independent/i);
 }finally{f.dispose();}
});

void test('seller statement explicitly projects only original-owner financial facts and denies another customer or Finance actor in owner mode',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-workspace';const m=await import(path);
 const statement=await m.getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId);
 assert.equal(statement.id,f.recoveryId);assert.equal(statement.position.remainingPaisa,f.originalPaidPaisa);
 assert.equal(statement.originalAdjustmentPaisa,f.originalPaidPaisa);
 const serialized=JSON.stringify(statement);
 for(const privateField of ['reviewDigest','customerId','ownerId','backupId','evidenceReference','transactionIdentity','bankAccountNumber','sourceJson','contactDetails','actorId'])assert.equal(serialized.includes('"'+privateField+'"'),false,privateField);
 for(const actor of ['customer','reviewer'])await assert.rejects(m.getSellerRecoveryStatement(f.db,actor,f.recoveryId),/own|unavailable/i);
 assert.equal((await m.listSellerRecoveries(f.db,'registered-owner')).length,1);
 assert.deepEqual(await m.listSellerRecoveries(f.db,'customer'),[]);
 const staff=await m.getRecoveryFinanceWorkspace(f.db,'reviewer',f.recoveryId);assert.equal(staff.cases.length,1);assert.ok(staff.cases[0].review.reviewDigest);assert.equal(staff.superAdmin,true);
 const index=await m.getRecoveryFinanceWorkspace(f.db,'reviewer');assert.equal(index.summaries.length,1);assert.equal(index.cases.length,0);
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','super_admin',1)").run();
 await assert.rejects(m.getRecoveryFinanceWorkspace(f.db,'customer',f.recoveryId),/personal|eligible|unavailable/i);
 f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='registered-owner'").run();
 await assert.rejects(m.getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId),/own|unavailable/i);
 }finally{f.dispose();}
});
