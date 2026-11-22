import assert from 'node:assert/strict';
import {refundPacketFixture} from './refund-funding-fixture';
import {payoutTransferFixture} from './payout-transfer-fixture';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import {recordReceiptReversal} from '../../lib/payments/receipt-corrections';
import {recordRefundFundingStatement} from '../../lib/payments/refund-funding';
export async function fundingDbNow(db:D1Database){return (await db.prepare("SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) now").first<{now:number}>())!.now;}
export async function fundingBankReversalFixture(model:'refund'|'payout'='refund',cashPaisa=20000){
 const f=model==='refund'?await refundPacketFixture():await payoutTransferFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const credit=await recordBankReceipt(f.db,f.ctx('funding-reversal-independent-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-INDEPENDENT-FUNDING-ACCOUNT-CREDIT',bankAt:Date.now()-10000,amountMinor:20000,currency:'NPR',payerReference:'Fictional independent original payer',payerUserId:'customer',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-INDEPENDENT-FUNDING-CREDIT',reason:'Verify this independent actual bank credit without altering any original customer refund or seller payout source.'});
 const funding=await reverifyFunding(f,'funding-reversal-initial-statement',f.accountVersionId,cashPaisa);
 return {...f,creditId:credit.id,currentFundingId:funding.id,fundingAsOf:funding.asOf};
 }catch(error){f.dispose();throw error;}
}
export async function reverifyFunding(f:{db:D1Database;ctx:(id:string,revision?:string|null)=>{actorId:string;requestId:string;expectedRevision:string|null;now:number}},tag:string,accountVersionId:string,cashPaisa=20000){
 const head=await f.db.prepare('SELECT head.revision,s.as_of asOf FROM company_funding_accounts head JOIN company_payment_account_versions v ON v.account_id=head.account_id LEFT JOIN company_funding_statements s ON s.id=head.statement_id WHERE v.id=?').bind(accountVersionId).first<{revision:number;asOf:number|null}>();
 if(head?.asOf!==null&&head?.asOf!==undefined&&head.asOf>=await fundingDbNow(f.db))await new Promise(resolve=>setTimeout(resolve,5));
 const asOf=await fundingDbNow(f.db),saved=await recordRefundFundingStatement(f.db,f.ctx(tag,head?String(head.revision):null),{accountVersionId,statementIdentity:'FICTIONAL-'+tag,asOf,cashPaisa,restrictedPaisa:0,evidenceReference:'FICTIONAL-INDEPENDENT-CURRENT-BANK-BALANCE',restrictionsReference:'FICTIONAL-INDEPENDENT-CURRENT-RESTRICTIONS',availableFundsConfirmed:true,reason:'Independently verify the current actual bank balance and restrictions after reviewing all bank events through this statement time.'});
 return {...saved,asOf};
}
export async function reverseFundingCredit(f:Awaited<ReturnType<typeof fundingBankReversalFixture>>,tag='funding-actual-later-reversal',bankAt?:number){
 if(bankAt===undefined)await new Promise(resolve=>setTimeout(resolve,5));
 const at=bankAt??await fundingDbNow(f.db)-1,control=(await f.db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(f.creditId).first<{revision:number}>())!;
 return recordReceiptReversal(f.db,{...f.ctx(tag,String(control.revision)),now:Math.max(Date.now(),at)},{receiptId:f.creditId,amountMinor:5000,transactionIdentity:'FICTIONAL-'+tag,bankAt:at,evidenceReference:'FICTIONAL-ACTUAL-FUNDING-ACCOUNT-BANK-REVERSAL',reason:'Record the actual later incoming-credit bank reversal without inferring available cash or rewriting the independently verified statement.'});
}
