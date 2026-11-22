import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {openRefundObligation} from '../lib/payments/refund-obligations';
import {getRefundFinanceWorkspace} from '../lib/payments/refund-workspace';

void test('both Finance queues expose the 101st original source through bounded stable pages and exact search',async()=>{
 const f=await manualOrderFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const admitted:string[]=[],pending:string[]=[];
  for(let i=0;i<203;i++){
   const identity='FICTIONAL-REFUND-PAGE-'+String(i).padStart(4,'0'),receipt=await recordBankReceipt(f.db,{actorId:'reviewer',requestId:'refund-page-credit-'+i,expectedRevision:null,now:Date.now()},{accountVersionId:f.accountVersionId,transactionIdentity:identity,bankAt:f.now,amountMinor:100,currency:'NPR',payerReference:'Independent original fictional payer for this exact receipt.',payerUserId:'customer',evidenceReference:'FICTIONAL-PAGE-BANK-'+i,completedCreditConfirmed:true,conflictUserIds:[],reason:'Record one actual fictional credit without allocating another source.'});
   if(i<101){const obligation=await openRefundObligation(f.db,{actorId:'reviewer',requestId:'refund-page-open-'+i,expectedRevision:null,now:Date.now()},{kind:'receipt_return',sourceId:receipt.id,reason:'Return this exact original unallocated fictional payer credit.'});admitted.push(obligation.id);}else pending.push(receipt.id);
  }
  const first=await getRefundFinanceWorkspace(f.db,'reviewer',undefined,undefined,{limit:100});
  assert.equal(first.obligations.length,100);assert.equal(first.sources.length,100);
  assert.ok(first.pages.obligations.nextCursor);assert.ok(first.pages.sources.nextCursor);
  const second=await getRefundFinanceWorkspace(f.db,'reviewer',undefined,undefined,{limit:100,cursor:first.pages.obligations.nextCursor!,sourceCursor:first.pages.sources.nextCursor!});
  assert.equal(second.obligations.length,1);assert.equal(second.sources.length,2);assert.equal(second.pages.obligations.nextCursor,null);assert.equal(second.pages.sources.nextCursor,null);
  assert.deepEqual(new Set([...first.obligations,...second.obligations].map(row=>row.id)),new Set(admitted));
  assert.deepEqual(new Set([...first.sources,...second.sources].map(row=>row.sourceId)),new Set(pending));
  const exact=await getRefundFinanceWorkspace(f.db,'reviewer',undefined,admitted[100]);assert.deepEqual(exact.obligations.map(row=>row.id),[admitted[100]]);assert.deepEqual(exact.sources,[]);
  const search=await getRefundFinanceWorkspace(f.db,'reviewer',undefined,undefined,{search:'FICTIONAL-REFUND-PAGE-0202'});assert.equal(search.obligations.length,0);assert.deepEqual(search.sources.map(row=>row.sourceId),[pending.at(-1)]);
  const obligationSearch=await getRefundFinanceWorkspace(f.db,'reviewer',undefined,undefined,{search:admitted.at(-1)});assert.deepEqual(obligationSearch.obligations.map(row=>row.id),[admitted.at(-1)]);assert.equal(obligationSearch.sources.length,0);
  for(const options of [{limit:0},{limit:101},{cursor:'invalid'},{sourceCursor:'invalid'},{search:'x'.repeat(161)}])await assert.rejects(getRefundFinanceWorkspace(f.db,'reviewer',undefined,undefined,options),error=>error instanceof Error&&'status'in error&&error.status===400);
 }finally{f.dispose();}
});
