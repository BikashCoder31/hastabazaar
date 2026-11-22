import {executeFixtureRefund} from './helpers/execute-fixture-refund';
import assert from 'node:assert/strict';
import test from 'node:test';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {recordBankReceipt,allocateBankReceipt,getCustomerManualPayment} from '../lib/payments/manual-receipts';
import {cancellationPreview,cancelSelectedParcels} from '../lib/cancellation/repository';
import {openRefundObligation,authorizeLawfulFeeRefund} from '../lib/payments/refund-obligations';

async function fixture(amount?:number){const f=await commerceOrderFixture(true,0,true);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(r=>r.file===''));
 const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'owner',requestId,expectedRevision,now:Date.now()});
 const cash=amount??f.placed.grandTotalPaisa;
 const receipt=await recordBankReceipt(f.database,ctx('actual-original-cash'),{accountVersionId:f.accountVersionId!,transactionIdentity:'FICTIONAL-ORIGINAL-PREPAID',bankAt:Date.now()-1000,amountMinor:cash,currency:'NPR',payerReference:'Fictional original buyer',payerUserId:'checkout-buyer',evidenceReference:'FICTIONAL-COMPLETED-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently verify the actual fictional original customer credit.'});
 await allocateBankReceipt(f.database,ctx('original-allocation','0'),{receiptId:receipt.id,orderId:f.orderId,amountPaisa:cash,expectedWindowRevision:0,matchingBasis:'Original customer and exact fictional order reference.',exceptionApproval:null});
 async function cancel(sellerIds:string[],key:string){const p=await cancellationPreview(f.database,f.access,sellerIds);
 await cancelSelectedParcels(f.database,f.access,{sellerIds,fingerprint:p.fingerprint,requestId:key,note:'Cancel the exact seller portion before any physical handoff.',now:Date.now()});
 const staff={orderNumber:f.placed.orderNumber,actorId:'owner'},fresh=await cancellationPreview(f.database,staff,sellerIds);
 return cancelSelectedParcels(f.database,staff,{sellerIds,fingerprint:fresh.fingerprint,requestId:key+'-approved',reviewId:key,note:'Approve the original eligible cancellation and exact tender disposition.',now:Date.now()});}
 return {...f,ctx,cash,cancel};
 }catch(error){await f.dispose();throw error;}}

void test('partial prepaid cancellation preserves the original window and paid allocation, with one cash refund source',async()=>{
 const f=await fixture();try{
 const before=f.sqlite.prepare('SELECT issued_at,deadline_at,amount_paisa,paid_at FROM manual_payment_windows').get();
 await f.cancel(['seller-a'],'partial-paid');
 assert.deepEqual(f.sqlite.prepare('SELECT issued_at,deadline_at,amount_paisa,paid_at FROM manual_payment_windows').get(),before);
 const balance=f.sqlite.prepare('SELECT payable_paisa,received_paisa FROM manual_payment_balances').get()!;
 const source=f.sqlite.prepare('SELECT id,cash_paisa,wallet_restored_paisa FROM cancellation_refund_sources').get()!;
 assert.equal(source.cash_paisa,f.cash-Number(balance.payable_paisa));assert.equal(balance.received_paisa,f.cash);
 const opened=await openRefundObligation(f.database,f.ctx('open-cancelled-cash'),{kind:'cancellation',sourceId:String(source.id),reason:'Open only the original actual paid cancellation cash entitlement.'});
 assert.equal(f.sqlite.prepare('SELECT wallet_paisa FROM refund_obligations WHERE id=?').get(opened.id)!.wallet_paisa,0);
 assert.deepEqual(await openRefundObligation(f.database,f.ctx('open-cancelled-cash'),{kind:'cancellation',sourceId:String(source.id),reason:'Open only the original actual paid cancellation cash entitlement.'}),opened);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refunds').get()!.n,0);
 const view=await getCustomerManualPayment(f.database,'checkout-buyer',f.orderId);assert.equal(view!.remainingPaisa,0);
 }finally{await f.dispose();}
});

void test('a reduced partial-payment obligation releases only after actual money covers the revised due inside the original cutoff',async()=>{
 const f=await fixture(30000);try{
 assert.equal(f.sqlite.prepare('SELECT paid_at FROM manual_payment_windows').get()!.paid_at,null);
 await f.cancel(['seller-a'],'partial-underpaid');
 assert.ok(f.sqlite.prepare('SELECT paid_at FROM manual_payment_windows').get()!.paid_at);
 assert.equal(f.sqlite.prepare('SELECT status,payment_status FROM orders').get()!.payment_status,'paid');
 const balance=f.sqlite.prepare('SELECT payable_paisa FROM manual_payment_balances').get()!;
 assert.equal(f.sqlite.prepare('SELECT cash_paisa FROM cancellation_refund_sources').get()!.cash_paisa,30000-Number(balance.payable_paisa));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_allocations').get()!.n,1);
 }finally{await f.dispose();}
});

void test('successive paid cancellations refund only original net cash, retain collected service fee, and never duplicate native wallet restoration',async()=>{
 const f=await fixture();try{
 await f.cancel(['seller-a'],'paid-first');
 await executeFixtureRefund(f.database,{actorId:'owner',kind:'cancellation',sourceId:'paid-first-approved',customerId:'checkout-buyer'});
 await f.cancel(['seller-b'],'paid-last');
 await executeFixtureRefund(f.database,{actorId:'owner',kind:'cancellation',sourceId:'paid-last-approved',customerId:'checkout-buyer'});
 const fee=Number(f.sqlite.prepare('SELECT buyer_platform_fee_paisa FROM orders').get()!.buyer_platform_fee_paisa);
 assert.equal(f.sqlite.prepare("SELECT SUM(cash_paisa) n FROM cancellation_refund_sources WHERE state='paid'").get()!.n,f.cash-fee);
 assert.equal(f.sqlite.prepare('SELECT payable_paisa FROM manual_payment_balances').get()!.payable_paisa,fee);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE kind='cancelled_money' AND state<>'resolved'").get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE kind='refund'").get()!.n,0);
 }finally{await f.dispose();}
});
void test('a partial cancellation below the remaining balance keeps its original cutoff and never invents paid cash',async()=>{
 const f=await fixture(5000);try{
 const before=f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get();await f.cancel(['seller-a'],'still-underpaid');
 assert.equal(f.sqlite.prepare('SELECT paid_at FROM manual_payment_windows').get()!.paid_at,null);
 assert.deepEqual(f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get(),before);
 assert.equal(f.sqlite.prepare('SELECT cash_paisa FROM cancellation_refund_sources').get()!.cash_paisa,0);
 const view=await getCustomerManualPayment(f.database,'checkout-buyer',f.orderId);assert.equal(view!.remainingPaisa,view!.duePaisa-5000);assert.equal(view!.state,'partially_paid');
 }finally{await f.dispose();}
});

void test('a separately paid lawful fee does not label a cancellation refunded while its original cash is outstanding',async()=>{
 const f=await fixture();try{
 await f.cancel(['seller-a','seller-b'],'full-before-cash');
 const fee=Number(f.sqlite.prepare('SELECT buyer_platform_fee_paisa FROM orders').get()!.buyer_platform_fee_paisa);
 const authorized=await authorizeLawfulFeeRefund(f.database,f.ctx('original-lawful-fee'),{orderId:f.orderId,amountPaisa:fee,legalBasis:'Explicit fictional mandatory consumer remedy after documented independent review.',caseReference:'FICTIONAL-CANCEL-FEE',evidenceReference:'FICTIONAL-LEGAL-REMEDY-EVIDENCE'});
 await executeFixtureRefund(f.database,{actorId:'owner',kind:'service_fee',sourceId:authorized.id,customerId:'checkout-buyer'});
 assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status,'part_refunded');
 await executeFixtureRefund(f.database,{actorId:'owner',kind:'cancellation',sourceId:'full-before-cash-approved',customerId:'checkout-buyer'});
 assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status,'refunded');
 }finally{await f.dispose();}
});
