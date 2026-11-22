import assert from 'node:assert/strict';
import {earnedMaker} from './company-store-financial-fixture';
import {prepareManagedPayout} from '../../lib/db/repositories/managed-settlements';
import * as transfers from '../../lib/payments/payout-transfers';
import {appendHistoricalManagedCodCustody,completeManagedRecoveryRefund} from './managed-recovery-fixture';
import {getReturnHandling,recordReturnHandling} from '../../lib/returns/handling';
import {advanceReturnAsAdmin} from '../../lib/db/repositories/returns';

export async function reservedManagedRefundFixture(outcome:'prepared'|'no_debit'|'debit_returned'|'uncertain'='prepared'){
 const f=await earnedMaker(true,undefined,2);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const ctx=f.payoutSources.ctx,environment=f.context.environment;
 appendHistoricalManagedCodCustody(f,'reserved-original-custody');
 const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'reserved-original-native-payout'});
 const packet=await transfers.preparePayoutTransfer(f.db,ctx('reserved-original-packet'),{model:'managed',payoutId,accountVersionId:f.payoutSources.accountVersionId,environment,reason:'Prepare the exact original earnings and company beneficiary before the later partial customer refund.'});
 const originalAmountPaisa=Number(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(payoutId)!.amount_paisa);
 if(outcome!=='prepared'){
  await transfers.approvePayoutTransfer(f.db,ctx('reserved-original-approved','0'),{packetId:packet.id,environment,reason:'Approve the original fictional amount and funds before recording its actual outcome.'});
  await transfers.startPayoutTransfer(f.db,ctx('reserved-original-start','1'),{packetId:packet.id,environment,reason:'Record the original fictional instruction once before its independently verified outcome.'});
  await transfers.recordPayoutTransferOutcome(f.db,ctx('reserved-original-outcome','2'),{packetId:packet.id,environment,outcome:outcome==='uncertain'?'uncertain':'failed',...(outcome==='no_debit'?{failureBasis:'no_debit' as const,noDebitConfirmed:true}:outcome==='debit_returned'?{failureBasis:'debit_returned' as const,returnedDebitConfirmed:true,returnedAmountPaisa:originalAmountPaisa}:{}),evidenceReference:'FICTIONAL-RESERVED-ORIGINAL-OUTCOME',reason:'Retain the independently verified original fictional outcome without releasing native source reservations automatically.'});
 }
 const refund=await completeManagedRecoveryRefund(f,'seller','reserved-original-refund',50000);
 const caseId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(refund.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,caseId))!;
 await recordReturnHandling(f.db,ctx('reserved-original-physical-review',String(handling.revision)),{caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The original return is waived after the documented defect review.',privateNote:'The eligible reviewer checked the fictional no-return evidence.',evidenceReference:'FICTIONAL-RESERVED-ORIGINAL-PHYSICAL-PROOF'});
 await advanceReturnAsAdmin(f.db,{returnRequestId:caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The actual original refund and physical disposition are complete.',publicMessageEn:'The original refund and physical disposition are complete.',publicMessageNe:'Original refund complete.',requestId:'reserved-original-physical-complete',now:Date.now()});
 return {...f,ctx,payoutId,packetId:packet.id,originalAmountPaisa,...refund};
 }catch(error){f.dispose();throw error;}
}
