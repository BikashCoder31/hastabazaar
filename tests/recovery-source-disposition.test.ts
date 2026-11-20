import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import * as recovery from '../lib/payments/seller-recovery';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';

async function repayment(f:Awaited<ReturnType<typeof approvedSellerRecoveryFixture>>){
 const receipt=await recordBankReceipt(f.db,f.ctx('disposition-repayment-receipt'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-DISPOSITION-REPAYMENT',bankAt:Date.now()-1,amountMinor:f.originalPaidPaisa,currency:'NPR',payerReference:'Fictional original seller',payerUserId:'registered-owner',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-DISPOSITION-ACTUAL-CREDIT',reason:'Independently verify the complete actual fictional repayment before testing original source disposition.'});
 return {caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:f.originalPaidPaisa,method:'cash' as const,evidenceReference:'FICTIONAL-SOURCE-DISPOSITION-EVIDENCE',reason:'Settle only the original approved debt against actually received and unspent seller money.'};
}

void test('a native adjustment reserved after repayment review aborts its complete settlement atomically',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const input=await repayment(f);let intercepted=false;
 const db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){
  if(!intercepted){intercepted=true;
   // Exact isolated historical writer outcome at the read/commit boundary; no canonical state.
   f.sqlite.prepare("INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,scheduled_for,created_at,updated_at) VALUES('competing-packet','registered','FICTIONAL-COMPETING-PACKET','prepared',1,'FICTIONAL-RESERVED-DESTINATION','reviewer',1,1,1)").run();
   f.sqlite.prepare("INSERT INTO payout_entries(payout_id,ledger_entry_id) SELECT 'competing-packet',id FROM seller_ledger_entries WHERE refund_id=? AND type='refund'").run(f.refundId);
  }
  return f.db.batch(statements);
 }} as D1Database;
 await assert.rejects(recovery.allocateSellerRecoveryReceipt(db,f.ctx('competing-repayment','1'),input));
 assert.equal(intercepted,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='recovery_settlement'").get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision,1);
 }finally{f.dispose();}
});

void test('a later actual payout does not count already settled native refund debt as a second historical recovery',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('complete-source-repayment','1'),await repayment(f));
 const funding=await getRefundFundingAvailability(f.db,f.accountVersionId),fundingCtx=f.ctx('current-repaid-funding',String(funding.revision));
 const native=await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} AS asOf`).first<{asOf:number}>();
 assert.ok(native&&native.asOf>funding.asOf);
 await recordRefundFundingStatement(f.db,fundingCtx,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-CURRENT-RECEIVED-REPAYMENT-FUNDS',asOf:native.asOf,cashPaisa:f.originalPaidPaisa,restrictedPaisa:0,evidenceReference:'FICTIONAL-CURRENT-CLEARED-REPAYMENT-STATEMENT',restrictionsReference:'FICTIONAL-CURRENT-REPAYMENT-FUNDS-EXCLUSIONS',availableFundsConfirmed:true,reason:'Independently verify the actual cleared repayment funds and current exclusions before any later payout.'});
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('later-actual-earning','registered','sale',500,1,'Fictional later eligible earnings',1)").run();
 const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Pay only the later actual earnings after the original recovery was fully settled.',requestId:'disposition-later-payout',now:Date.now()});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('disposition-later-packet'),{model:'registered',payoutId:payout.id,accountVersionId:f.accountVersionId,reason:'Bind the exact later native payout and its independently verified source.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('disposition-later-approve','0'),{packetId:packet.id,reason:'One eligible Super Admin verifies the later original earnings and company funding.'});
 await transfers.startPayoutTransfer(f.db,f.ctx('disposition-later-start','1'),{packetId:packet.id,reason:'Record the one actual fictional later instruction after complete debt settlement.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('disposition-later-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:500,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-DISPOSITION-LATER-PAID',evidenceReference:'FICTIONAL-DISPOSITION-LATER-BANK-EVIDENCE',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual later completed transfer without charging the original recovered debt again.'});
 const source=await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.equal(source.historicalNettingPaisa,0);assert.equal(source.blocker,null);
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(current.position.recoveredPaisa,f.originalPaidPaisa);assert.equal(current.position.overRecoveredPaisa,0);
 }finally{f.dispose();}
});
