import assert from 'node:assert/strict';
import test from 'node:test';
import {fundingBankReversalFixture,reverseFundingCredit,reverifyFunding} from './helpers/funding-bank-reversal-fixture';
import {fundingAvailableSql,getRefundFundingAvailability} from '../lib/payments/refund-funding';
void test('an actual later credit-bank reversal makes a previously verified 20,000 paisa balance unverified until a new independent statement',async()=>{
 const f=await fundingBankReversalFixture();try{
 assert.equal((await getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,20000);
 await reverseFundingCredit(f);
 assert.equal((await f.db.prepare(`SELECT ${fundingAvailableSql()} available FROM company_funding_statements s WHERE s.id=?`).bind(f.currentFundingId).first<{available:number|null}>())!.available,null);
 await assert.rejects(getRefundFundingAvailability(f.db,f.accountVersionId),/reverify.*bank.*reversal/i);
 const fresh=await reverifyFunding(f,'funding-after-actual-reversal',f.accountVersionId,20000);assert.notEqual(fresh.id,f.currentFundingId);
 assert.equal((await getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,20000);
 const packet=await f.m.prepareRefundPacket(f.db,f.ctx('fresh-statement-refund-prepared','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:fresh.id,reason:'Prepare the unchanged original refund only after independently reverifying current company bank funds.'});
 assert.ok(packet.id);
 }finally{f.dispose();}
});

import * as payouts from '../lib/payments/payout-transfers';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../lib/payments/company-accounts';
import {companyDetails} from '../lib/content/company-details';
type FundingFixture=Awaited<ReturnType<typeof fundingBankReversalFixture>>;
async function verifiedAccount(f:FundingFixture,tag:string,prior?:{accountId:string;versionId:string;details:Parameters<typeof saveCompanyAccountDraft>[2]['details']}){
 const accountRevision=prior?String((await f.db.prepare('SELECT revision FROM company_payment_accounts WHERE id=?').bind(prior.accountId).first<{revision:number}>())!.revision):null;
 const account=await saveCompanyAccountDraft(f.db,f.ctx(tag+'-draft',accountRevision),{accountId:prior?.accountId??null,basedOnVersionId:prior?.versionId??null,details:prior?{...prior.details,branch:'Fictional refreshed branch'}:{holder:companyDetails.legalName,bank:'Fictional isolated bank',branch:'Fictional isolated branch',accountNumber:'TEST-'+tag,currency:'NPR',purpose:'both'},evidenceReference:'FICTIONAL-INDEPENDENT-ACCOUNT-VERSION',conflictUserIds:[],reason:'Verify this exact fictional company account version without sharing unrelated account balances.'});
 await submitCompanyAccountForReview(f.db,f.ctx(tag+'-submitted','0'),{versionId:account.versionId,reason:'Submit the exact independently evidenced company account version.'});
 await verifyCompanyAccount(f.db,f.ctx(tag+'-verified','1'),{versionId:account.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-COMPANY-ACCOUNT-OWNERSHIP',reason:'Verify the actual company owner and currency with one eligible nonconflicted Super Admin.'});return account;
}
async function prepared(f:FundingFixture,model:'refund'|'payout'){
 if(model==='refund')return f.m.prepareRefundPacket(f.db,f.ctx('funding-original-packet','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:f.currentFundingId,reason:'Prepare this unchanged original refund against independently verified current company funds.'});
 if(!('payoutId'in f))throw new Error('Use the fictional payout fixture.');return payouts.preparePayoutTransfer(f.db,f.ctx('funding-original-packet'),{model:'registered',payoutId:String(f.payoutId),accountVersionId:f.accountVersionId,reason:'Prepare this unchanged original seller payout against independently verified current company funds.'});
}
async function approve(f:FundingFixture,model:'refund'|'payout',id:string,db=f.db){const input={packetId:id,reason:'Approve only this exact original obligation with current independently verified company bank funds.'};return model==='refund'?f.m.approveRefundPacket(db,f.ctx('funding-original-approval','0'),input):payouts.approvePayoutTransfer(db,f.ctx('funding-original-approval','0'),input);}
async function start(f:FundingFixture,model:'refund'|'payout',id:string,db=f.db){const input={packetId:id,reason:'Start this one reviewed manual instruction only while current verified bank funds remain available.'};return model==='refund'?f.m.startRefundPacket(db,f.ctx('funding-original-start','1'),input):payouts.startPayoutTransfer(db,f.ctx('funding-original-start','1'),input);}

void test('bank freshness follows the logical company account across versions and does not contaminate another account',async()=>{
 const f=await fundingBankReversalFixture();try{
 const isolated=await verifiedAccount(f,'FUNDING-ISOLATED'),other=await reverifyFunding(f,'funding-isolated-statement',isolated.versionId);
 const old=(await f.db.prepare('SELECT account_id accountId,details_json details FROM company_payment_account_versions WHERE id=?').bind(f.accountVersionId).first<{accountId:string;details:string}>())!;
 const newer=await verifiedAccount(f,'FUNDING-NEWER-VERSION',{accountId:old.accountId,versionId:f.accountVersionId,details:JSON.parse(old.details)});
 await reverseFundingCredit(f);
 await assert.rejects(getRefundFundingAvailability(f.db,newer.versionId),/reverify.*bank.*reversal/i);
 assert.equal((await getRefundFundingAvailability(f.db,isolated.versionId)).id,other.id);assert.equal((await getRefundFundingAvailability(f.db,isolated.versionId)).availablePaisa,20000);
 const fresh=await reverifyFunding(f,'funding-newer-version-current-balance',newer.versionId);assert.equal((await getRefundFundingAvailability(f.db,newer.versionId)).id,fresh.id);
 }finally{f.dispose();}
});
void test('a statement whose as-of already includes the actual reversal stays verified',async()=>{
 const f=await fundingBankReversalFixture();try{
 await reverseFundingCredit(f,'funding-historical-bank-reversal',f.fundingAsOf);
 assert.equal((await getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,20000);
 }finally{f.dispose();}
});
for(const model of ['refund','payout'] as const)for(const phase of ['approve','start'] as const)for(const race of [false,true])void test(`${model} ${phase} requires fresh bank funds ${race?'inside the actual write batch':'before review'} and stale unsent packets remain safely retireable`,async()=>{
 const f=await fundingBankReversalFixture(model,200000);try{
 const packet=await prepared(f,model),table=model==='refund'?'outgoing_payment_packets':'payout_transfer_packets';if(phase==='start')await approve(f,model,packet.id);
 let injected=false,moneyPrepared=false;const raced=Object.create(f.db) as D1Database;
 raced.prepare=(sql:string)=>{if(sql.includes('UPDATE '+table+" SET state='"+(phase==='approve'?'approved':'processing')+"'"))moneyPrepared=true;return f.db.prepare(sql);};
 raced.batch=async statements=>{if(moneyPrepared&&!injected){injected=true;await reverseFundingCredit(f,'funding-raced-bank-reversal');}return f.db.batch(statements);};
 if(!race)await reverseFundingCredit(f);
 await assert.rejects(phase==='approve'?approve(f,model,packet.id,race?raced:f.db):start(f,model,packet.id,race?raced:f.db),/reverify.*bank.*reversal/i);
 if(race)assert.equal(injected,true);
 assert.equal((await f.db.prepare('SELECT state FROM '+table+' WHERE id=?').bind(packet.id).first<{state:string}>())!.state,phase==='approve'?'prepared':'approved');
 assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM company_receipt_reversals WHERE receipt_id=?').bind(f.creditId).first<{n:number}>())!.n,1);
 const input={packetId:packet.id,notSentConfirmed:true,evidenceReference:'FICTIONAL-PROVEN-UNSENT-STALE-PACKET',reason:'Retire this independently confirmed unsent instruction without claiming a new balance or sending another transfer.'},ctx=f.ctx('funding-safe-stale-retirement',phase==='approve'?'0':'1');
 if(model==='refund')await f.m.voidUnsentRefundPacket(f.db,ctx,input);else await payouts.voidUnsentPayoutTransfer(f.db,ctx,input);
 assert.equal((await f.db.prepare('SELECT state FROM '+table+' WHERE id=?').bind(packet.id).first<{state:string}>())!.state,'void');
 await assert.rejects(getRefundFundingAvailability(f.db,f.accountVersionId),/reverify.*bank.*reversal/i);
 }finally{f.dispose();}
});
for(const model of ['refund','payout'] as const)for(const outcome of ['paid','failed'] as const)void test(`${model} already-sent uncertain instruction can truthfully reconcile ${outcome} after a later receipt-bank reversal`,async()=>{
 const f=await fundingBankReversalFixture(model,200000);try{
 const packet=await prepared(f,model);await approve(f,model,packet.id);await start(f,model,packet.id);await reverseFundingCredit(f);
 const uncertain={packetId:packet.id,outcome:'uncertain' as const,evidenceReference:'FICTIONAL-ORIGINAL-UNKNOWN-BANK-OUTCOME',reason:'Retain the actual original uncertain instruction without authorizing any replacement payment.'};
 if(model==='refund')await f.m.recordRefundPacketOutcome(f.db,f.ctx('funding-known-uncertain-outcome','2'),uncertain);else await payouts.recordPayoutTransferOutcome(f.db,f.ctx('funding-known-uncertain-outcome','2'),uncertain);
 const table=model==='refund'?'outgoing_payment_packets':'payout_transfer_packets',amount=(await f.db.prepare('SELECT amount_paisa amount FROM '+table+' WHERE id=?').bind(packet.id).first<{amount:number}>())!.amount;
 const reconciled={packetId:packet.id,outcome,evidenceReference:'FICTIONAL-ORIGINAL-TRUTHFUL-BANK-OUTCOME',reason:'Reconcile the original actual sent instruction while retaining the later incoming-bank reversal and its required balance review.',...(outcome==='paid'?{amountPaisa:amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-TRUTHFUL-'+model+'-ORIGINAL-PAID',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true}:{failureBasis:'no_debit' as const,noDebitConfirmed:true})};
 if(model==='refund')await f.m.recordRefundPacketOutcome(f.db,f.ctx('funding-original-reconciled','3'),reconciled);else await payouts.recordPayoutTransferOutcome(f.db,f.ctx('funding-original-reconciled','3'),reconciled);
 assert.equal((await f.db.prepare('SELECT state FROM '+table+' WHERE id=?').bind(packet.id).first<{state:string}>())!.state,outcome);
 await assert.rejects(getRefundFundingAvailability(f.db,f.accountVersionId),/reverify.*bank.*reversal/i);
 }finally{f.dispose();}
});

void test('a new independently verified statement restores approval and start only through an explicitly refreshed unsent packet',async()=>{
 const f=await fundingBankReversalFixture('refund',200000);try{
 const old=await prepared(f,'refund');await reverseFundingCredit(f);await assert.rejects(approve(f,'refund',old.id),/reverify.*bank.*reversal/i);
 const fresh=await reverifyFunding(f,'funding-explicit-new-bank-evidence',f.accountVersionId,200000);
 await assert.rejects(approve(f,'refund',old.id),/funding.*changed/i);
 await f.m.voidUnsentRefundPacket(f.db,f.ctx('funding-retire-old-pinned-packet','0'),{packetId:old.id,notSentConfirmed:true,evidenceReference:'FICTIONAL-NOT-SENT-OLD-FUNDING-PACKET',reason:'Retire the independently confirmed unsent old packet without silently changing its retained funding approval.'});
 const revision=String((await f.db.prepare('SELECT revision FROM refund_obligations WHERE id=?').bind(f.obligationId).first<{revision:number}>())!.revision);
 const current=await f.m.prepareRefundPacket(f.db,f.ctx('funding-refreshed-reviewed-packet',revision),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:fresh.id,reason:'Prepare the unchanged original refund against the newly and independently verified current bank statement.'});
 await f.m.approveRefundPacket(f.db,f.ctx('funding-refreshed-approved','0'),{packetId:current.id,reason:'Approve this exact refreshed packet and current independently verified company money.'});
 await f.m.startRefundPacket(f.db,f.ctx('funding-refreshed-started','1'),{packetId:current.id,reason:'Start only the explicitly reviewed new instruction backed by current verified bank funds.'});
 assert.equal((await f.db.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').bind(old.id).first<{state:string}>())!.state,'void');assert.equal((await f.db.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').bind(current.id).first<{state:string}>())!.state,'processing');
 }finally{f.dispose();}
});

import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
void test('explicit company bank-loss disposition does not certify or replace a stale bank funding balance',async()=>{
 const f=await completedReceiptReturnFixture();try{
 const reversal=(await f.db.prepare('SELECT bank_at bankAt FROM company_receipt_reversals WHERE id=?').bind(f.reversalId).first<{bankAt:number}>())!,head=(await f.db.prepare('SELECT head.revision,s.as_of asOf FROM company_funding_accounts head JOIN company_funding_statements s ON s.id=head.statement_id JOIN company_payment_account_versions v ON v.account_id=head.account_id WHERE v.id=?').bind(f.accountVersionId).first<{revision:number;asOf:number}>())!;
 assert.ok(reversal.bankAt-1>head.asOf);
 const statement=await f.m.recordRefundFundingStatement(f.db,f.ctx('historical-balance-before-known-bank-loss',String(head.revision)),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-VERIFIED-BALANCE-THROUGH-BEFORE-REVERSAL',asOf:reversal.bankAt-1,cashPaisa:20000,restrictedPaisa:0,evidenceReference:'FICTIONAL-INDEPENDENT-PREVIOUS-BANK-BALANCE',restrictionsReference:'FICTIONAL-PREVIOUS-BANK-RESTRICTIONS',availableFundsConfirmed:true,reason:'Retain this genuine earlier bank statement without pretending it includes the subsequently recorded actual bank reversal.'});
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId);
 await reconcileRecoveryReceiptReversal(f.db,f.ctx('bank-loss-is-not-funding-verification',String(review.receiptRevision)),{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa:4000}],companyLossApproved:true,evidenceReference:'FICTIONAL-ACTUAL-COMPANY-BANK-LOSS',reason:'Record only the actual company bank loss while requiring separately verified current funds before any new payment.',publicMessage:'The completed original return remains paid. The company covers the later actual bank reversal.'});
 assert.equal((await f.db.prepare(`SELECT ${fundingAvailableSql()} amount FROM company_funding_statements s WHERE id=?`).bind(statement.id).first<{amount:number|null}>())!.amount,null);
 await assert.rejects(getRefundFundingAvailability(f.db,f.accountVersionId),/reverify.*bank.*reversal/i);
 assert.equal((await f.db.prepare('SELECT statement_id id FROM company_funding_accounts WHERE account_id=(SELECT account_id FROM company_payment_account_versions WHERE id=?)').bind(f.accountVersionId).first<{id:string}>())!.id,statement.id);
 }finally{f.dispose();}
});
