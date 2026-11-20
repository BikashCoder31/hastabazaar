import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {recordCompanyCashReceipt} from '../lib/payments/cash-receipts';

async function payment(){const path='../lib/payments/manual-receipts',loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.submitPaymentClaim,'function','Claims, independently verified bank receipts and allocations must be separate authoritative records.');return loadedFixtureModule!;}

void test('authorized cash handover needs actual custody, independent eligible authority and a unique retained receipt',async()=>{
 const f=await manualOrderFixture();try{const now=Date.now(),context={actorId:'reviewer',requestId:'actual-cash-handover',expectedRevision:null,now},input={handoverIdentity:'FICTIONAL-CASH-HANDOVER-001',collectorName:'Fictional external carrier collector',collectorUserId:null,custodyReference:'FICTIONAL-AUTHORIZED-COMPANY-CASH-CUSTODY',amountPaisa:52000,occurredAt:now,evidenceReference:'FICTIONAL-INDEPENDENT-SIGNED-HANDOVER',actualHandoverConfirmed:true,reason:'Independently count and verify this actual fictional authorized company cash handover.'};
 await assert.rejects(recordCompanyCashReceipt(f.db,{...context,actorId:'delegate'},input));await assert.rejects(recordCompanyCashReceipt(f.db,context,{...input,collectorUserId:'reviewer'}));await assert.rejects(recordCompanyCashReceipt(f.db,context,{...input,actualHandoverConfirmed:false}));const saved=await recordCompanyCashReceipt(f.db,context,input);assert.deepEqual(await recordCompanyCashReceipt(f.db,context,input),saved);assert.deepEqual(await recordCompanyCashReceipt(f.db,{...context,requestId:'repeat-same-physical-handover'},input),saved);await assert.rejects(recordCompanyCashReceipt(f.db,{...context,requestId:'changed-physical-handover'},{...input,amountPaisa:52001}));assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM company_money_receipts WHERE kind='cash_handover'").get()!.n,1);assert.equal(f.sqlite.prepare("SELECT amount_minor,account_version_id FROM company_money_receipts WHERE id=?").get(saved.id)!.account_version_id,null);
 }finally{f.dispose();}
});

void test('known third-party money requires an explicit eligible Super Admin authority decision before allocation',async()=>{
 const m=await payment(),f=await manualOrderFixture();try{const context=(requestId:string,expectedRevision:string|null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()}),receipt=await m.recordBankReceipt(f.db,context('third-party-actual-credit',null),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-THIRD-PARTY-CREDIT',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Independently identified fictional third-party payer',payerUserId:'foreign',evidenceReference:'FICTIONAL-ACTUAL-THIRD-PARTY-BANK-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify actual completed company credit without assuming the payer owns this order.'}),input={receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Original customer and actual payer independently corroborated.',exceptionApproval:null};
 await assert.rejects(m.allocateBankReceipt(f.db,context('third-party-without-authority','0'),input),/authority/);await m.allocateBankReceipt(f.db,context('third-party-with-authority','0'),{...input,exceptionApproval:{reason:'Independently verify the authenticated customer and identified payer agreement for this exact order.',evidenceReference:'FICTIONAL-AUTHENTICATED-CUSTOMER-AND-PAYER-AUTHORITY',customerAuthorityConfirmed:true}});assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)!.payment_status,'paid');
 }finally{f.dispose();}
});

void test('customer claim never marks paid, ordinary Finance must match a real credit, and one eligible Super Admin can allocate it',async()=>{
 const m=await payment(),f=await manualOrderFixture();try{
  const context={actorId:'customer',requestId:'manual-payment-claim',expectedRevision:null,now:Date.now()};
  const input={orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,paymentDate:new Date(f.now).toISOString().slice(0,10),bankReference:'FICTIONAL-CUSTOMER-REFERENCE',note:'Fictional claimed transfer; this is not independent bank receipt evidence.',evidenceIds:[]};
  await m.submitPaymentClaim(f.db,context,input);await m.submitPaymentClaim(f.db,context,input);
  assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)!.payment_status,'unpaid');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM manual_payment_claims').get()!.n,1);
  await assert.rejects(m.submitPaymentClaim(f.db,{...context,actorId:'foreign',requestId:'foreign-payment-claim'},input));
  const credit={accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CREDIT-UNIQUE-001',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional buyer with exact order reference',payerUserId:'customer',evidenceReference:'FICTIONAL-INDEPENDENT-COMPLETED-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently match the actual completed fictional company bank credit.'};
  await assert.rejects(m.recordBankReceipt(f.db,{actorId:'delegate',requestId:'unauthorized-bank-credit',expectedRevision:null,now:Date.now()},credit));
  const receipt=await m.recordBankReceipt(f.db,{actorId:'reviewer',requestId:'record-bank-credit',expectedRevision:null,now:Date.now()},credit);
  await m.allocateBankReceipt(f.db,{actorId:'reviewer',requestId:'allocate-bank-credit',expectedRevision:'0',now:Date.now()},{receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:1,matchingBasis:'Exact fictional unique order reference and independent credit.',exceptionApproval:null});
  assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)!.payment_status,'paid');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM manual_receipt_uses').get()!.n,1);
  assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(f.orderId)!.status,'confirmed');
  assert.ok(f.sqlite.prepare('SELECT released_at FROM manual_payment_windows').get()!.released_at);
 }finally{f.dispose();}
});
