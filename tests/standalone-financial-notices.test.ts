import test from 'node:test';
import assert from 'node:assert/strict';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {recordBankReceipt,allocateBankReceipt} from '../lib/payments/manual-receipts';
import {authorizeLawfulFeeRefund,openRefundObligation} from '../lib/payments/refund-obligations';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './helpers/live-financial-lifecycle-fixture';
import {recordManagedLiveFinancialScope,readOwnedLiveManagedInvoices,issueLiveManagedInvoiceAdjustment} from '../lib/managed-commerce/live-billing';
import {releaseLiveManagedEligibility} from '../lib/managed-commerce/live-payout-operations';
import {revokeManagedClearance} from '../lib/managed-commerce/live-clearance';
import {recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {isCurrentFinancialNotice} from '../lib/operations/financial-notice-sources';

function notice(f:{sqlite:import('node:sqlite').DatabaseSync},template:string,id:string){return f.sqlite.prepare('SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE template_key=? AND related_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(template,id)!;}

void test('lawful fee authorization is distinct from refund payment and superseded by its opened obligation',async()=>{
 const f=await manualOrderFixture({serviceFee:true});try{
 const context=(requestId:string,expectedRevision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()}),credit=await recordBankReceipt(f.db,context('t29-fee-original-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-T29-FEE-CREDIT',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional customer',payerUserId:'customer',evidenceReference:'FICTIONAL-ORIGINAL-FEE-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify the original exact customer bank credit including the original saved fee.'});
 await allocateBankReceipt(f.db,context('t29-fee-original-allocation','0'),{receiptId:credit.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'The actual original bank credit and exact original customer order are independently matched.',exceptionApproval:null});
 const amount=Number(f.sqlite.prepare('SELECT buyer_platform_fee_paisa fee FROM orders WHERE id=?').get(f.orderId)!.fee);assert.ok(amount>0);
 const ctx=context('t29-fee-lawful-authorization'),input={orderId:f.orderId,amountPaisa:amount,legalBasis:'A documented fictional lawful exception overrides only this original fee.',caseReference:'FICTIONAL-LAWFUL-CASE',evidenceReference:'FICTIONAL-PRIVATE-LEGAL-EVIDENCE'},authorized=await authorizeLawfulFeeRefund(f.db,ctx,input);assert.deepEqual(await authorizeLawfulFeeRefund(f.db,ctx,input),authorized);
 const row=notice(f,'business.finance.fee_refund_authorized',authorized.id);assert.ok(row);assert.equal(await isCurrentFinancialNotice(f.db,row as never,Date.now()),true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,0);
 await openRefundObligation(f.db,context('t29-fee-opened-obligation'),{kind:'service_fee',sourceId:authorized.id,reason:'Open the same original lawful fee obligation without claiming a bank payment.'});assert.equal(await isCurrentFinancialNotice(f.db,row as never,Date.now()),false);
 }finally{f.dispose();}
});

void test('current company statement supersedes old funding notice and original invoice credit is a separate safe artifact event',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 const old=notice(f,'business.finance.funding_verified',f.sources.fundingId);assert.ok(old);
 const head=f.sqlite.prepare('SELECT revision FROM company_funding_accounts WHERE statement_id=?').get(f.sources.fundingId)!;
 const funding=await recordRefundFundingStatement(f.db,f.ctx('t29-new-funding-proof',String(head.revision)),{accountVersionId:f.sources.accountVersionId,statementIdentity:'FICTIONAL-NEW-CURRENT-STATEMENT',asOf:Date.now(),cashPaisa:250000,restrictedPaisa:0,evidenceReference:'FICTIONAL-PRIVATE-NEW-FUNDS',restrictionsReference:'FICTIONAL-PRIVATE-RESTRICTIONS',availableFundsConfirmed:true,reason:'Independently verify a genuinely newer fictional statement and its exclusions.'});assert.ok(notice(f,'business.finance.funding_verified',funding.id));assert.equal(await isCurrentFinancialNotice(f.db,old as never,Date.now()),false);
 const refunded=await refundActualLiveOrder({...f,sources:{...f.sources,fundingId:funding.id}},'t29-credit-artifact');
 const [invoice]=await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:f.buyerId}),ctx=f.ctx('t29-actual-original-credit'),input={invoiceGroupId:invoice.id,sourceKind:'refund' as const,sourceId:refunded.refundId,reason:'Record only the original commercial invoice credit from its completed customer remedy.'};
 const credit=await issueLiveManagedInvoiceAdjustment(f.db,ctx,input);assert.deepEqual(await issueLiveManagedInvoiceAdjustment(f.db,ctx,input),credit);
 const rows=f.sqlite.prepare("SELECT body_en FROM notification_messages WHERE template_key='business.finance.invoice_adjustment' AND related_id=?").all(credit.id);assert.equal(rows.length,4);assert.doesNotMatch(JSON.stringify(rows),/FICTIONAL-PRIVATE|accountNumber|TEST-ACTUAL/);
 }finally{f.dispose();}
});

void test('actual held-earnings release has its own native source without a fabricated payout; clearance revocation notifies once',async()=>{
 const f=await deliveredLiveFinancialFixture(7);try{
 const held=Number(f.sqlite.prepare('SELECT hold_until FROM managed_entitlements WHERE id=?').get(f.entitlementId)!.hold_until),now=held+1;f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
 const ctx={...f.ctx('t29-original-release'),now},input={sellerId:f.sellerId,reason:'Release the original elapsed holding period without enabling a new order or fabricating a payout.'};assert.equal((await releaseLiveManagedEligibility(f.db,ctx,input)).released,1);assert.equal((await releaseLiveManagedEligibility(f.db,ctx,input)).released,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payouts').get()!.n,0);const released=notice(f,'business.finance.payout',f.sellerId);assert.equal(released.relatedType,'managed_live_eligibility');assert.equal(await isCurrentFinancialNotice(f.db,released as never,now),true);
 await revokeManagedClearance(f.db,{...f.ctx('t29-clearance-revoked','0'),now},{clearanceId:f.clearance.clearanceId,reason:'Retain the actual independently reviewed revocation while preserving all original money obligations.'});const revoked=notice(f,'business.seller.live_clearance',f.clearance.clearanceId);assert.ok(revoked);assert.equal(await isCurrentFinancialNotice(f.db,revoked as never,now),true);
 }finally{f.dispose();}
});

void test('new reviewed financial scope suppresses obsolete original scope activation advice',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 const original=notice(f,'business.company.live_financial_scope',f.clearance.financial.id);assert.ok(original);
 const scope=f.clearance.scope,company=scope.currentOffer.snapshot.company;
 const created=await recordManagedLiveFinancialScope(f.db,f.ctx('t29-replacement-financial-scope'),{companyEntityReference:scope.companyEntityReference,companyScopeDigest:scope.companyScopeDigest,issuerModel:'company_commercial_invoice_v1',issuer:{legalName:company.legalName,taxMode:'PAN',taxRegistrationNumber:company.pan,address:company.registeredOffice,phone:'9800000000'},seriesPrefix:'FIC-T29-NEXT',seriesVersion:'fictional-next',openingNumber:200,evidenceReference:'FICTIONAL-PRIVATE-REVIEWED-NEXT-SERIES',reason:'Independently review this genuinely new actual financial scope without rewriting original invoices.'});
 assert.ok(notice(f,'business.company.live_financial_scope',created.id));assert.equal(await isCurrentFinancialNotice(f.db,original as never,Date.now()),false);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,1);
 }finally{f.dispose();}
});
