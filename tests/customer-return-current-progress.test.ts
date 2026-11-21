import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordCustomerRefundReversal} from '../lib/payments/customer-refund-reversal';
import {listReturnsForCustomerReceipt,advanceReturnAsAdmin} from '../lib/db/repositories/returns';
import {getCustomerRefundWorkspace} from '../lib/payments/refund-workspace';
import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';

registerHooks({resolve(specifier,context,next){
 if(specifier==='next/link')return{url:'data:text/javascript,'+encodeURIComponent(`import React from ${JSON.stringify(pathToFileURL(resolve('node_modules/react/index.js')).href)};export default function Link(props){return React.createElement('a',props)}`),shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function useRouter(){return{refresh(){}}}',shortCircuit:true};
 if(specifier==='next/image')return{url:'data:text/javascript,export default function Image(){return null}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual returned customer credit invalidates the paired return card current paid advice without rewriting original facts',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  const original=f.sqlite.prepare("SELECT id,revision,state FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
  const creditContext=f.ctx('paired-actual-returned-credit');
  const receipt=await recordBankReceipt(f.db,creditContext,{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-PAIRED-CUSTOMER-RETURN',bankAt:creditContext.now,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original fictional customer refund returned by the bank',payerUserId:'customer',evidenceReference:'FICTIONAL-PAIRED-ACTUAL-BANK-RETURN',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify the actual returned original customer credit before changing any customer advice.'});
  await recordCustomerRefundReversal(f.db,f.ctx('paired-bank-return',String(original.revision)),{packetId:String(original.id),receiptId:receipt.id,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-PAIRED-RETURN-CORRELATION',reason:'The actual original refund came back; its original paid transfer remains historical evidence.'});
  assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(original.id)!.state,'paid');assert.equal(f.sqlite.prepare('SELECT status FROM refunds WHERE id=?').get(f.refundId)!.status,'paid');
  const rows=await listReturnsForCustomerReceipt(f.db,f.order.orderNumber,null,'customer'),account=await getCustomerRefundWorkspace(f.db,'customer');assert.equal(rows.length,1);assert.equal(account.find(row=>row.id===f.obligationId)!.state,'completed');
  const {CustomerAftercare}=await import('../components/commerce/customer-aftercare'),html=renderToStaticMarkup(createElement(CustomerAftercare,{orderNumber:f.order.orderNumber,orderStatus:'delivered',items:[],returns:rows,complaints:[]}));
  assert.match(html,/bank returned|returned by the bank/i,'the actual paired case still presents historical paid as current advice after verified bank return');
 }finally{f.dispose();}
});
void test('actual returned refund awaiting disposition cannot be closed as paid even after lawful physical waiver',async()=>{
 for(const mode of ['already_returned','returned_at_commit']as const){const f=await approvedSellerRecoveryFixture();try{
  const handling=(await getReturnHandling(f.db,f.caseId))!;
  await recordReturnHandling(f.db,f.ctx('current-refund-physical-waiver',String(handling.revision)),{caseId:f.caseId,action:'waive_return',quantity:handling.quantity,occurredAt:Date.now(),publicMessage:'Physical collection is waived for the independently reviewed damaged goods; the original refund obligation remains separate.',privateNote:'Independent fictional evidence confirms that collecting these damaged goods is unsafe; the eligible Super Admin authorizes the exact physical waiver.',evidenceReference:'FICTIONAL-CURRENT-PHYSICAL-WAIVER'});
  const original=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
  const creditContext=f.ctx('closure-returned-credit');
  const receipt=await recordBankReceipt(f.db,creditContext,{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CLOSURE-BANK-RETURN',bankAt:creditContext.now,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original fictional customer transfer returned',payerUserId:'customer',evidenceReference:'FICTIONAL-CLOSURE-RETURN-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify the actual returned original refund before reviewing its current closure.'});
  const originalBatch=f.db.batch.bind(f.db),direct={prepare:f.db.prepare.bind(f.db),batch:originalBatch}as D1Database;let raced=false;
  const recordReturn=()=>recordCustomerRefundReversal(direct,f.ctx('closure-current-return',String(original.revision)),{packetId:String(original.id),receiptId:receipt.id,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-CLOSURE-RETURN-CORRELATION',reason:'The original refund is now returned and its continuing disposition is genuinely unresolved.'});
  if(mode==='already_returned')await recordReturn();else f.db.batch=async statements=>{if(!raced){raced=true;await recordReturn();}return originalBatch(statements);};
  await assert.rejects(advanceReturnAsAdmin(f.db,{returnRequestId:f.caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'Try to close using only the old historical paid flag after the actual bank return.',publicMessageEn:'Attempted closure must wait for the actual continuing refund disposition.',publicMessageNe:'बैंकबाट रकम फर्किएपछि हालको फिर्ता रकमको निर्णय हुन बाँकी छ।',requestId:'must-not-close-returned-refund',now:Date.now()}),/returned-credit|continuing refund|settlement/);
  assert.equal(raced,mode==='returned_at_commit');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='must-not-close-returned-refund'").get()!.n,0);
  assert.notEqual(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(f.caseId)!.status,'resolved');
 }finally{f.dispose();}}
});
