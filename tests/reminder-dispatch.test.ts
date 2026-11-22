import test from 'node:test';
import assert from 'node:assert/strict';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {recordBankReceipt,allocateBankReceipt} from '../lib/payments/manual-receipts';

async function dispatcher(){const path='../lib/operations/reminder-dispatch',loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.processReminderDispatch,'function','Scheduled due generation needs the bounded durable dispatcher.');return loadedFixtureModule!.processReminderDispatch;}

void test('scheduled dispatcher at12h creates current escalation once without catching up stale6h reminder or executing money',async()=>{
 const dispatch=await dispatcher(),f=await manualOrderFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const receipt=await recordBankReceipt(f.db,{actorId:'reviewer',requestId:'t29-original-response-credit',expectedRevision:null,now:Date.now()},{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-T29-ACTUAL-CREDIT',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional original customer',payerUserId:'customer',evidenceReference:'FICTIONAL-T29-INDEPENDENT-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify the original fictional bank credit before releasing preparation.'});
 await allocateBankReceipt(f.db,{actorId:'reviewer',requestId:'t29-response-allocation',expectedRevision:'0',now:Date.now()},{receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Independently matched original customer bank credit and exact original order.',exceptionApproval:null});
 const row=f.sqlite.prepare('SELECT released_at FROM order_response_items WHERE order_item_id IN(SELECT id FROM order_items WHERE order_id=?)').get(f.orderId)!;
 const now=Number(row.released_at)+12*3600000;f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
 const before=f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n;
 const results=await Promise.all([dispatch(f.db,{now,limit:50}),dispatch(f.db,{now,limit:50})]);assert.ok(results.some(result=>!result.busy));
 for(const result of results)assert.deepEqual(result.failures,[]);
 await dispatch(f.db,{now,limit:50});
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_events WHERE order_id=? AND kind='reminder'").get(f.orderId)!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_events WHERE order_id=? AND kind='escalation'").get(f.orderId)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,before);
 assert.ok(f.sqlite.prepare('SELECT COUNT(*) n FROM operational_reminder_cursors WHERE revision>0').get()!.n);
 }finally{f.dispose();}
});

void test('expired dispatch budget cannot claim a successful scan or erase durable cursors',async()=>{
 const dispatch=await dispatcher(),f=await manualOrderFixture();try{
 const result=await dispatch(f.db,{now:Date.now(),limit:1,deadlineMs:Date.now()-1});assert.equal(result.scanned,0);assert.equal(result.budgetExhausted,true);
 await assert.rejects(()=>dispatch(f.db,{limit:10000}));
 }finally{f.dispose();}
});
