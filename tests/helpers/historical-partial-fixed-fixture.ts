import assert from 'node:assert/strict';
import {fixedRecoveryFixture} from './fixed-recovery-fixture';

/** Explicit fictional imported history, built only in :memory:. Its original
 * obligation is 80000, actual bank payment 40000, and later defect 60000.
 * Modern arbitrary partial payout remains forbidden. Historical payment, packet,
 * snapshot, bank identity and audit are reconstructed together before returning
 * a target with every original native trigger restored. No tested command runs
 * during fixture construction. */
export async function historicalPartialFixedFixture(){
 const f=await fixedRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const triggers=f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all() as {name:string;sql:string}[];
  const snapshot=JSON.parse(String(f.sqlite.prepare('SELECT source_snapshot_json FROM payout_transfer_packets WHERE id=?').get(f.packetId)!.source_snapshot_json));
  assert.equal(snapshot.originalAmount,80000);assert.equal(snapshot.amountPaisa,80000);
  snapshot.amountPaisa=40000;snapshot.legacyUnpaidPaisa=40000;
  f.sqlite.exec('BEGIN');
  try{
   for(const trigger of triggers)f.sqlite.exec('DROP TRIGGER "'+trigger.name.replaceAll('"','""')+'"');
   f.sqlite.prepare('UPDATE managed_supplier_payments SET amount_paisa=40000 WHERE id=?').run(f.payoutId);
   f.sqlite.prepare('UPDATE payout_transfer_packets SET amount_paisa=40000,source_snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot),f.packetId);
   f.sqlite.prepare("UPDATE company_outgoing_bank_identities SET amount_paisa=40000 WHERE packet_kind='payout' AND packet_id=?").run(f.packetId);
   f.sqlite.prepare('UPDATE managed_supplier_adjustments SET amount_paisa=60000 WHERE id=?').run(f.adjustmentId);
   // These are imported historical facts, not replay receipts from the modern
   // full-balance writer. Keep one truthful fixture provenance record instead.
   f.sqlite.prepare('DELETE FROM audit_logs WHERE subject_id IN(?,?,?) OR request_id=?').run(f.payoutId,f.packetId,'fixed:'+f.payoutId,'recovery-approved-supply-defect');
   f.sqlite.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,'reviewer','fixture.legacy_partial_import','managed_supplier_payment',?,'Explicit fictional imported original partial payment and subsequent defect',?,'fictional-legacy-partial-import',?)").run(crypto.randomUUID(),f.payoutId,JSON.stringify({originalObligationPaisa:80000,actualPaidPaisa:40000,originalUnpaidPaisa:40000,adjustmentId:f.adjustmentId,approvedAdjustmentPaisa:60000,packetId:f.packetId}),Date.now());
   for(const trigger of triggers)f.sqlite.exec(trigger.sql);
   assert.deepEqual(f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all(),triggers);
   assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
   f.sqlite.exec('COMMIT');
  }catch(error){f.sqlite.exec('ROLLBACK');throw error;}
  const proof=f.sqlite.prepare(`SELECT p.amount_paisa payment,t.amount_paisa packet,json_extract(t.source_snapshot_json,'$.amountPaisa') snapshot,b.amount_paisa bank,o.original_amount_paisa original
   FROM managed_supplier_payments p JOIN managed_supplier_obligations o ON o.id=p.obligation_id JOIN payout_transfer_packets t ON t.supplier_payment_id=p.id JOIN company_outgoing_bank_identities b ON b.packet_kind='payout' AND b.packet_id=t.id WHERE p.id=?`).get(f.payoutId)!;
  assert.deepEqual({...proof},{payment:40000,packet:40000,snapshot:40000,bank:40000,original:80000});
  return f;
 }catch(error){f.dispose();throw error;}
}

export async function payHistoricalPartialFixedBalance(f:Pick<Awaited<ReturnType<typeof historicalPartialFixedFixture>>,'sources'|'environment'|'db'|'sqlite'|'ctx'|'recordId'>,prefix:string,amount:number){
 const {prepareFixedSupplierPayment}=await import('../../lib/managed-commerce/fixed-supply');
 const transfers=await import('../../lib/payments/payout-transfers');
 const {recordRefundFundingStatement}=await import('../../lib/payments/refund-funding');
 const accountVersionId=f.sources.accountVersionId,environment=f.environment,funding=(await f.db.prepare('SELECT h.revision FROM company_funding_accounts h JOIN company_payment_account_versions v ON v.account_id=h.account_id WHERE v.id=?').bind(accountVersionId).first<{revision:number}>())!,ctx=f.ctx(prefix+'-funds',String(funding.revision));
 await recordRefundFundingStatement(f.db,ctx,{accountVersionId,statementIdentity:prefix+'-FICTIONAL-CAPITAL',asOf:ctx.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:prefix+'-FICTIONAL-FUNDS',restrictionsReference:prefix+'-FICTIONAL-RESERVES',availableFundsConfirmed:true,reason:'Verify current fictional company funding before paying the corrected historical entitlement.'});
 const payoutId=await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:prefix+'-native',now:Date.now(),environment});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_supplier_payments WHERE id=?').get(payoutId)!.amount_paisa,amount);
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx(prefix+'-packet'),{model:'fixed',payoutId,accountVersionId,environment,reason:'Bind the whole current payable supplier balance to the verified original legal beneficiary.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx(prefix+'-approved','0'),{packetId:packet.id,environment,reason:'Approve the exact native original obligation and every retained correction with current company funds.'});
 await transfers.startPayoutTransfer(f.db,f.ctx(prefix+'-started','1'),{packetId:packet.id,environment,reason:'Record one fictional bank instruction for the current whole payable supplier balance.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx(prefix+'-paid','2'),{packetId:packet.id,environment,outcome:'paid',amountPaisa:amount,bankAt:Date.now()-1,transactionIdentity:prefix+'-FICTIONAL-PAID',evidenceReference:prefix+'-FICTIONAL-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual fictional restored payout without rewriting the original historical partial payment.'});
 return payoutId;
}

export async function mixedFixedAfterRestoredFixture(){
 const recovery=await import('../../lib/payments/seller-recovery');
 const {recordBankReceipt}=await import('../../lib/payments/manual-receipts');
 const f=await historicalPartialFixedFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-mixed-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Review both the original unpaid deduction and additional deficit from the actual historical payment.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  await recovery.approveSellerRecovery(f.db,f.ctx('fixed-mixed-approved','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-FIXED-MIXED-ORIGINAL',reason:'Approve only the actual additional deficit after the separate original unpaid component is used.'});
  const receipt=await recordBankReceipt(f.db,f.ctx('fixed-mixed-bank'),{accountVersionId:f.sources.accountVersionId,transactionIdentity:'FICTIONAL-FIXED-MIXED-CASH',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Fictional original supplier',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-FIXED-MIXED-ACTUAL-CREDIT',reason:'Verify the actual fictional seller repayment for only the additional original deficit.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('fixed-mixed-cash','1'),{caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',environment:f.environment,evidenceReference:'FICTIONAL-FIXED-MIXED-ALLOCATION',reason:'Settle the existing additional deficit once, leaving the original unpaid charge separately explained.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  await recovery.correctSellerRecoveryLiability(f.db,f.ctx('fixed-mixed-collected-correction','2'),{caseId:opened.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,environment:f.environment,evidenceReference:'FICTIONAL-FIXED-MIXED-CORRECTION',reason:'New evidence overturns the collected deficit; restore the actual earlier seller repayment.',publicMessage:'Your repayment is restored. The original unpaid charge remains separately recorded.'});
  await payHistoricalPartialFixedBalance(f,'fixed-mixed-repayment-restored',20000);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(review.source.confirmedPaisa,0);assert.equal(review.source.exposurePaisa,0);assert.equal(review.source.originalUnpaidOffsetPaisa,40000);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.source.blocker,null);
  return {...f,caseId:opened.id,review};
 }catch(error){f.dispose();throw error;}
}
