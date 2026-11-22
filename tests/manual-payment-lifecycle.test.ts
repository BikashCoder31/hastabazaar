import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {submitPaymentClaim,recordBankReceipt,allocateBankReceipt,getCustomerManualPayment} from '../lib/payments/manual-receipts';
import {expireManualPaymentOrder} from '../lib/payments/manual-payment-lifecycle';
import {processManualPaymentWindows} from '../lib/payments/payment-maintenance';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';

type Fixture=Awaited<ReturnType<typeof manualOrderFixture>>;
function clock(f:Fixture,initial:number){let current=initial;f.sqlite.function('strftime',{varargs:true},(...args)=>{const format=String(args[0]);if(format==='%s')return String(Math.floor(current/1000));if(format==='%f')return (current%60000/1000).toFixed(3).padStart(6,'0');throw new Error('Unexpected fixture time format '+format);});return (value:number)=>{current=value;};}
const claim=(f:Fixture)=>({orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,paymentDate:new Date(f.now).toISOString().slice(0,10),bankReference:null,note:'',evidenceIds:[]});
const credit=(f:Fixture,amount=f.order.grandTotalPaisa)=>({accountVersionId:f.accountVersionId,transactionIdentity:crypto.randomUUID(),bankAt:f.now,amountMinor:amount,currency:'NPR',payerReference:'Fictional independently checked buyer context',payerUserId:'customer',evidenceReference:'FICTIONAL-COMPLETED-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently verify actual completed credit in this isolated fixture.'});
const ctx=(requestId:string,expectedRevision:string|null,now=Date.now())=>({actorId:'reviewer',requestId,expectedRevision,now});

void test('native claim at cutoff minus one qualifies once; expiry restores exact stock and consumed wallet once',async()=>{
 const f=await manualOrderFixture({walletPaisa:10000});try{
  const window=f.sqlite.prepare('SELECT deadline_at,buffer_end_at FROM manual_payment_windows').get()!,deadline=Number(window.deadline_at),buffer=Number(window.buffer_end_at),set=clock(f,deadline-1);
  await submitPaymentClaim(f.db,{actorId:'customer',requestId:'pre-cutoff',expectedRevision:null,now:deadline-1},claim(f));
  assert.equal(f.sqlite.prepare('SELECT cutoff_at FROM manual_payment_cutoffs').get()!.cutoff_at,buffer);
  set(deadline);assert.equal((await expireManualPaymentOrder(f.db,f.orderId)).state,'open');
  assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,1);
  set(buffer);assert.equal((await expireManualPaymentOrder(f.db,f.orderId)).state,'expired');await expireManualPaymentOrder(f.db,f.orderId);
  const stock=f.sqlite.prepare("SELECT available,reserved FROM offer_stock WHERE offer_id='medium'").get()!;assert.deepEqual({...stock},{available:5,reserved:0});
  assert.equal(f.sqlite.prepare("SELECT balance_paisa FROM wallet_accounts WHERE user_id='customer'").get()!.balance_paisa,10000);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE order_id=? AND kind='cancellation'").get(f.orderId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events WHERE order_id=?').get(f.orderId)!.n,1);
 }finally{f.dispose();}
});

void test('a backdated caller cannot qualify a claim first saved at cutoff; late money does not reopen the order',async()=>{
 const f=await manualOrderFixture();try{
  const deadline=Number(f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get()!.deadline_at);clock(f,deadline);
  await submitPaymentClaim(f.db,{actorId:'customer',requestId:'late-claim',expectedRevision:null,now:deadline-1},claim(f));
  assert.equal(f.sqlite.prepare('SELECT cutoff_at FROM manual_payment_cutoffs').get()!.cutoff_at,deadline);
  const receipt=await recordBankReceipt(f.db,ctx('late-credit',null,deadline),credit(f));
  await assert.rejects(allocateBankReceipt(f.db,ctx('late-allocation','0',deadline-1),{receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:1,matchingBasis:'Independent original order attribution, but confirmed too late.',exceptionApproval:null}));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_receipt_uses').get()!.n,0);
  await expireManualPaymentOrder(f.db,f.orderId);assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(f.orderId)!.status,'cancelled');
  assert.equal(f.sqlite.prepare('SELECT status FROM company_money_receipts WHERE id=?').get(receipt.id)!.status,'verified');
 }finally{f.dispose();}
});

void test('partial verified money cannot dispatch, gets one buffer, and stays owed on expiry',async()=>{
 const f=await manualOrderFixture();try{
  const deadline=Number(f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get()!.deadline_at),set=clock(f,deadline-100);
  const receipt=await recordBankReceipt(f.db,ctx('partial-credit',null,deadline-100),credit(f,10000));
  const input={receiptId:receipt.id,orderId:f.orderId,amountPaisa:10000,expectedWindowRevision:0,matchingBasis:'Independent completed credit matched to the original order.',exceptionApproval:null};
  await allocateBankReceipt(f.db,ctx('partial-allocation','0',deadline-100),input);await allocateBankReceipt(f.db,ctx('partial-allocation','0',deadline-100),input);
  assert.throws(()=>f.sqlite.prepare("UPDATE order_items SET fulfillment_status='packing' WHERE order_id=?").run(f.orderId),/manual_payment/);
  set(deadline);assert.equal((await expireManualPaymentOrder(f.db,f.orderId)).state,'open');
  set(deadline+4*3600000);await expireManualPaymentOrder(f.db,f.orderId);
  assert.equal(f.sqlite.prepare('SELECT received_paisa FROM manual_payment_balances WHERE order_id=?').get(f.orderId)!.received_paisa,10000);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE order_id=? AND kind='expired_money' AND state='open'").get(f.orderId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_receipt_uses').get()!.n,1);
 }finally{f.dispose();}
});

void test('overpayment is retained outside the payable order; changed retries and unauthorized proof cannot spend it',async()=>{
 const f=await manualOrderFixture();try{
  const receipt=await recordBankReceipt(f.db,ctx('excess-credit',null),credit(f,f.order.grandTotalPaisa+5000));
  const input={receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Exact original order and independently verified bank context.',exceptionApproval:null};
  await assert.rejects(allocateBankReceipt(f.db,ctx('too-much','0'),{...input,amountPaisa:input.amountPaisa+1}),/remaining/);
  await allocateBankReceipt(f.db,ctx('exact-allocation','0'),input);await allocateBankReceipt(f.db,ctx('exact-allocation','0'),input);
  await assert.rejects(allocateBankReceipt(f.db,ctx('exact-allocation','0'),{...input,amountPaisa:input.amountPaisa-1}),/different command/);
  assert.equal(f.sqlite.prepare('SELECT amount_minor-(SELECT SUM(amount_minor) FROM manual_receipt_uses WHERE receipt_id=r.id) remaining FROM company_money_receipts r WHERE id=?').get(receipt.id)!.remaining,5000);
  await assert.rejects(recordBankReceipt(f.db,ctx('proof-only',null),{...credit(f),completedCreditConfirmed:false}),/completed/);
  await assert.rejects(recordBankReceipt(f.db,ctx('personal-interest',null),{...credit(f),conflictUserIds:['reviewer']}),/personal/);
 }finally{f.dispose();}
});

void test('one six-hour reminder uses the shared channels and becomes stale when a claim arrives',async()=>{
 const f=await manualOrderFixture();try{
  const deadline=Number(f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get()!.deadline_at),at=deadline-6*3600000,set=clock(f,at-1);
  assert.equal((await processManualPaymentWindows(f.db)).reminded,0);set(at);assert.equal((await processManualPaymentWindows(f.db)).reminded,1);assert.equal((await processManualPaymentWindows(f.db)).reminded,0);
  const messages=f.sqlite.prepare("SELECT template_key AS template,related_id AS relatedId,recipient_user_id AS userId,audience_role AS audience,channel,request_id AS requestId FROM notification_messages WHERE template_key='business.payment.reminder'").all();// D22 requires one customer and one eligible Super Admin copy per shared channel.
  assert.deepEqual(messages.map(message=>JSON.stringify([message.userId,message.audience,message.channel])).sort(),[
   ['customer','customer','email'],['customer','customer','in_app'],['reviewer','staff','email'],['reviewer','staff','in_app'],
  ].map(recipient=>JSON.stringify(recipient)).sort());
  assert.equal(new Set(messages.map(message=>message.requestId)).size,messages.length);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_reminders WHERE order_id=?').get(f.orderId)!.n,1);
  for(const message of messages)assert.equal(await isCurrentOperationalNotice(f.db,message as never,at),true);
  await submitPaymentClaim(f.db,{actorId:'customer',requestId:'reminder-following-claim',expectedRevision:null,now:at},claim(f));
  for(const message of messages)assert.equal(await isCurrentOperationalNotice(f.db,message as never,at),false);
  assert.equal((await processManualPaymentWindows(f.db)).reminded,0);
 }finally{f.dispose();}
});

void test('explicitly delegated Finance can verify ordinary money; revocation at commit rolls the operation back',async()=>{
 const f=await manualOrderFixture();try{
  f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"payment.receipt.verify\"]',version=version+1 WHERE user_id='delegate'").run();
  const receipt=await recordBankReceipt(f.db,{...ctx('delegate-credit',null),actorId:'delegate'},credit(f));
  let intercepted=false;const wrapped:D1Database={prepare:f.db.prepare.bind(f.db),batch:async(statements:D1PreparedStatement[])=>{intercepted=true;f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"order.manage\"]',version=version+1 WHERE user_id='delegate'").run();return f.db.batch(statements);}} as D1Database;
  const input={receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Independent real bank context and exact original order.',exceptionApproval:null};
  await assert.rejects(allocateBankReceipt(wrapped,{...ctx('revoked-allocation','0'),actorId:'delegate'},input));assert.ok(intercepted);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_receipt_uses').get()!.n,0);
  f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"payment.receipt.verify\"]',version=version+1 WHERE user_id='delegate'").run();
  await allocateBankReceipt(f.db,{...ctx('restored-allocation','0'),actorId:'delegate'},input);assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)!.payment_status,'paid');
 }finally{f.dispose();}
});

void test('authenticated payment read enforces elapsed expiry even when scheduled processing did not run',async()=>{
 const f=await manualOrderFixture();try{const deadline=Number(f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get()!.deadline_at);clock(f,deadline);const status=await getCustomerManualPayment(f.db,'customer',f.orderId);assert.equal(status!.state,'expired');assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,0);await getCustomerManualPayment(f.db,'customer',f.orderId);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events WHERE order_id=?').get(f.orderId)!.n,1);}finally{f.dispose();}
});
