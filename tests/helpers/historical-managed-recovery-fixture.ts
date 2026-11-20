import assert from 'node:assert/strict';
import {managedRecoveryFixture,completeManagedRecoveryRefund} from './managed-recovery-fixture';
import {appendHistoricalManagedSale} from './company-store-financial-fixture';
import {prepareManagedPayout} from '../../lib/db/repositories/managed-settlements';
import * as transfers from '../../lib/payments/payout-transfers';
import {recoveryPayoutReadySql} from '../../lib/payments/recovery-payout-policy';
import {getReturnHandling,recordReturnHandling} from '../../lib/returns/handling';
import {advanceReturnAsAdmin} from '../../lib/db/repositories/returns';

/** Fictional pre-recovery writer, confined to inspected :memory: setup. Only the new
 * application-level recovery gate is absent from this historical writer. Current
 * staff/identity/beneficiary/funding, native triggers and actual-bank records remain.
 * The returned db is always the real current adapter; no tested operation uses this writer.
 */
export async function historicalManagedRecoveryFixture(options:{twoRefunds?:boolean;quantity?:1|2;pendingBank?:boolean;responsibility?:'seller'|'platform';legacyMissingResponsibility?:boolean}={}){
 const f=await managedRecoveryFixture(options.responsibility??'seller',options.twoRefunds?2:options.quantity??1,options.legacyMissingResponsibility??false);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 async function closePhysicalCare(refundId:string,prefix:string){
 const caseId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(refundId)!.return_request_id),handling=(await getReturnHandling(f.db,caseId))!;
 await recordReturnHandling(f.db,f.ctx(prefix+'-no-return',String(handling.revision)),{caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The original physical return is waived after the documented product review.',privateNote:'The eligible reviewer confirmed the fictional no-return basis before closing physical care.',evidenceReference:'FICTIONAL-HISTORICAL-NO-RETURN-BASIS'});
 await advanceReturnAsAdmin(f.db,{returnRequestId:caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The original actual refund and physical disposition are both complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund case complete.',requestId:prefix+'-physical-complete',now:Date.now()});
 }
 await closePhysicalCare(f.refundId,'historical-first');
 let secondRefundId:string|null=null;
 if(options.twoRefunds){const second=await completeManagedRecoveryRefund(f,'seller','historical-second-refund',50000);secondRefundId=second.refundId;await closePhysicalCare(second.refundId,'historical-second');}
 await appendHistoricalManagedSale(f,'legacy-netting-a',Date.now()-15*86400000,Date.now());
 await appendHistoricalManagedSale(f,'legacy-netting-b',Date.now()-15*86400000,Date.now());
 const context={...f.context,now:Date.now(),scheduledFor:Date.now(),requestId:'current-writer-must-hold-unreviewed-source'};
 await assert.rejects(prepareManagedPayout(f.db,context));
 const gate=recoveryPayoutReadySql('source_seller.id','managed'),parameterGate=recoveryPayoutReadySql('?','managed');let historicalGateCalls=0;
 const guardPrefix='INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ',guardSuffix=' THEN 1 ELSE 0 END';
 const legacy={prepare(sql:string){
  // The current D1-depth-safe writer isolates this same recovery predicate.
  // Model only its pre-recovery absence; keep every other native guard and bind.
  if(sql===guardPrefix+parameterGate+guardSuffix){
   historicalGateCalls++;const count=(parameterGate.match(/\?/g)??[]).length;
   const statement=f.db.prepare(guardPrefix+Array.from({length:count},()=>'? IS NOT NULL').join(' AND ')+guardSuffix);
   return{bind(...values:unknown[]){assert.equal(values.length,count+1);assert.ok(typeof values[0]==='string'&&values[0].length>0);for(const value of values.slice(1))assert.equal(value,f.sellerId,'Only this exact fictional historical seller may use the old writer.');return statement.bind(...values);}};
  }
  if(sql.includes(gate)){historicalGateCalls++;sql=sql.replaceAll(gate,'1=1');}return f.db.prepare(sql);
 },batch:f.db.batch.bind(f.db)} as D1Database;
 const historicalPayoutId=await prepareManagedPayout(legacy,{...context,requestId:'historical-original-netted-payout'});
 const packet=await transfers.preparePayoutTransfer(legacy,f.ctx('historical-netted-packet'),{model:'managed',payoutId:historicalPayoutId,accountVersionId:f.payoutSources.accountVersionId,environment:f.context.environment,reason:'Retain the fictional original historical payout that included the actual native refund deduction.'});
 await transfers.approvePayoutTransfer(legacy,f.ctx('historical-netted-packet-approved','0'),{packetId:packet.id,environment:f.context.environment,reason:'Independently review the original fictional native amounts, beneficiary and company funding.'});
 await transfers.startPayoutTransfer(legacy,f.ctx('historical-netted-packet-started','1'),{packetId:packet.id,environment:f.context.environment,reason:'Retain the one original historical manual transfer instruction.'});
 const amount=Number(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(historicalPayoutId)!.amount_paisa);
 if(!options.pendingBank)await transfers.recordPayoutTransferOutcome(legacy,f.ctx('historical-netted-packet-paid','2'),{packetId:packet.id,environment:f.context.environment,outcome:'paid',amountPaisa:amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-HISTORICAL-NETTED-PAYOUT',evidenceReference:'FICTIONAL-HISTORICAL-NETTED-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Retain actual fictional historical bank execution; no new recovery authority is inferred from this payment.'});
 assert.ok(historicalGateCalls>0);assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 return {...f,secondRefundId,historicalPayoutId,historicalPacketId:packet.id};
 }catch(error){f.dispose();throw error;}
}
