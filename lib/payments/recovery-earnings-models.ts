import { actualRecoveryAllocationSql } from './recovery-receipt-accounting';
import type {SellerRecoverySource} from './seller-recovery';
import type {CommandContext} from '../workflows/contracts';
import {paymentGuard} from './manual-receipts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {managedEntitlementNetSql} from '../managed-commerce/payout-operations';
import {managedSettlementReadySql} from '../managed-commerce/settlement-readiness';
import {managedRefundFactsColumns,managedRefundReconciled,type ManagedRefundFacts} from '../managed-commerce/refund-readiness';
import {fixedRecoveryCreditsSql} from '../managed-commerce/recovery-balance';

const remaining=`c.approved_cap_paisa-c.absorbed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)`;
export function managedRecoveryCaseCohortSql(alias:string,kind:'simulation'|'live'){
 if(!/^[a-z_]+$/.test(alias)||!['simulation','live'].includes(kind))throw new Error('Invalid original managed recovery cohort.');
 return `EXISTS(SELECT 1 FROM managed_commercial_snapshots case_origin WHERE case_origin.order_item_id=json_extract(${alias}.original_source_json,'$.orderItemId') AND case_origin.seller_id=${alias}.seller_id AND case_origin.record_kind='${kind}'${kind==='live'?' AND case_origin.live_activation_decision_id IS NOT NULL AND case_origin.live_clearance_id IS NOT NULL AND case_origin.live_financial_scope_id IS NOT NULL':''})`;
}
function originalDebt(where:string){return `COALESCE((SELECT SUM(${remaining}) FROM seller_recovery_cases c WHERE c.blocker IS NULL AND c.confirmed_paisa>0 AND ${remaining}>0 AND ${where}),0)`;}

/** Restore only the still-unallocated approved native debit to gross earnings, then consume it through one linked withholding. */
export async function readModelRecoveryEarnings(db:D1Database,source:SellerRecoverySource,now:number){
 const managed=source.model==='managed';
 if(!managed&&source.model!=='fixed')throw new Error('Choose the original managed or fixed model.');
 const original=managed?await db.prepare('SELECT id,record_kind AS kind,live_activation_decision_id AS activation,live_clearance_id AS clearance,live_financial_scope_id AS financial FROM managed_commercial_snapshots WHERE order_item_id=? AND seller_id=?').bind(source.orderItemId,source.sellerId).first<{id:string;kind:string;activation:string|null;clearance:string|null;financial:string|null}>():null;
 if(managed&&(!original||!['simulation','live'].includes(original.kind)||original.kind==='live'&&(!original.activation||!original.clearance||!original.financial)))throw new Error('The exact original managed financial cohort needs reconciliation before earnings allocation.');
 const cohort=managed?` AND EXISTS(SELECT 1 FROM managed_commercial_snapshots earning_cohort WHERE earning_cohort.id=e.snapshot_id AND earning_cohort.record_kind='${original!.kind}'${original!.kind==='live'?' AND earning_cohort.live_activation_decision_id IS NOT NULL AND earning_cohort.live_clearance_id IS NOT NULL AND earning_cohort.live_financial_scope_id IS NOT NULL':''})`:'';
 const originalAmount=managed?`(${managedEntitlementNetSql('e')})+${originalDebt("c.payout_model='managed' AND c.seller_id=e.seller_id AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id)")}`:
  `o.original_amount_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM managed_supplier_adjustments a WHERE a.obligation_id=o.id),0)-COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid'),0)+${fixedRecoveryCreditsSql('o.id')}+${originalDebt("c.payout_model='fixed' AND c.seller_id=o.seller_id AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a WHERE a.id=c.supplier_adjustment_id AND a.obligation_id=o.id)")}`;
 // Restitution belongs to the seller. It cannot silently become earnings for another recovery.
 // Keep this source protected without inventing a negative balance after its restitution is paid.
 const restored=managed?`COALESCE((SELECT SUM(review.restored_paisa) FROM seller_recovery_carrier_reviews review JOIN seller_recovery_allocations allocation ON allocation.id=review.allocation_id JOIN managed_settlement_entries credit ON credit.id=allocation.managed_credit_id WHERE credit.entitlement_id=e.id),0)+COALESCE((SELECT SUM(review.restored_paisa) FROM seller_recovery_payout_return_reviews review JOIN seller_recovery_allocations allocation ON allocation.id=review.allocation_id JOIN managed_settlement_entries credit ON credit.id=allocation.managed_credit_id WHERE credit.entitlement_id=e.id),0)+COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews review JOIN seller_recovery_allocations allocation ON allocation.id=review.allocation_id JOIN managed_settlement_entries credit ON credit.id=allocation.managed_credit_id WHERE credit.entitlement_id=e.id),0)+COALESCE((SELECT SUM(unpaid.amount_paisa) FROM seller_recovery_unpaid_corrections unpaid JOIN managed_settlement_entries credit ON credit.id=unpaid.managed_credit_id WHERE credit.entitlement_id=e.id),0)+COALESCE((SELECT SUM(correction.restored_paisa) FROM seller_recovery_liability_corrections correction JOIN managed_settlement_entries credit ON credit.id=correction.managed_credit_id WHERE credit.entitlement_id=e.id),0)+COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_source_reviews review JOIN managed_settlement_entries credit ON credit.id=review.managed_credit_id WHERE credit.entitlement_id=e.id),0)`:
  `COALESCE((SELECT SUM(review.restored_paisa) FROM seller_recovery_carrier_reviews review JOIN seller_recovery_allocations allocation ON allocation.id=review.allocation_id JOIN managed_supplier_recovery_credits credit ON credit.id=allocation.fixed_credit_id WHERE credit.obligation_id=o.id),0)+COALESCE((SELECT SUM(review.restored_paisa) FROM seller_recovery_payout_return_reviews review JOIN seller_recovery_allocations allocation ON allocation.id=review.allocation_id JOIN managed_supplier_recovery_credits credit ON credit.id=allocation.fixed_credit_id WHERE credit.obligation_id=o.id),0)+COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews review JOIN seller_recovery_allocations allocation ON allocation.id=review.allocation_id JOIN managed_supplier_recovery_credits credit ON credit.id=allocation.fixed_credit_id WHERE credit.obligation_id=o.id),0)+COALESCE((SELECT SUM(unpaid.amount_paisa) FROM seller_recovery_unpaid_corrections unpaid WHERE unpaid.fixed_obligation_id=o.id),0)+COALESCE((SELECT SUM(correction.restored_paisa) FROM seller_recovery_liability_corrections correction WHERE correction.fixed_obligation_id=o.id),0)`;
 const amount=`CASE WHEN (${originalAmount})>(${restored}) THEN (${originalAmount})-(${restored}) WHEN (${originalAmount})>0 THEN 0 ELSE (${originalAmount}) END`;
 const ready=managed?`${managedSettlementReadySql('e',now)} AND e.status IN('eligible','part_paid','paid') AND e.eligible_at<=${now}
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND a.disposition='reserved')
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id WHERE x.entitlement_id=e.id AND p.status IN('prepared','approved','processing','failed'))`:
  `supply.status='accepted' AND supply.possession_status='received' AND supply.quality_status='accepted' AND o.eligible_at<=${now}
  AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND (p.status IN('prepared','approved') OR p.status='failed' AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet WHERE packet.supplier_payment_id=p.id AND packet.state='failed')))`;
 const from=managed?'managed_entitlements e':'managed_supplier_obligations o JOIN managed_supply_records supply ON supply.id=o.id',alias=managed?'e':'o';
 const query=`SELECT ${alias}.id,${amount} AS amount,CASE WHEN ${ready} THEN 1 ELSE 0 END AS ready,${managed?'e.eligible_at':'o.eligible_at'} AS eligibleAt${managed?','+managedRefundFactsColumns('e'):''} FROM ${from} WHERE ${alias}.seller_id=?${cohort}`;
 type Row={id:string;amount:number;ready:number;eligibleAt:number}&Partial<ManagedRefundFacts>;
 const rows=(await db.prepare(query+` ORDER BY eligibleAt,${alias}.id`).bind(source.sellerId).all<Row>()).results;
 const guards=paymentGuard(db,`(SELECT COUNT(*) FROM ${from} WHERE ${alias}.seller_id=?${cohort})=?`,[source.sellerId,rows.length]);
 if(original)guards.push(...paymentGuard(db,'EXISTS(SELECT 1 FROM managed_commercial_snapshots WHERE id=? AND order_item_id=? AND seller_id=? AND record_kind=?)',[original.id,source.orderItemId,source.sellerId,original.kind]));
 let pool=BigInt(0);const candidates:Row[]=[];
 for(const row of rows){
  if(!Number.isSafeInteger(row.amount))throw new Error('Reconcile the exact original native earning amounts.');
  const usable=row.ready===1&&(!managed||managedRefundReconciled(row as ManagedRefundFacts));
  if(row.amount<0||usable)pool+=BigInt(row.amount);
  if(row.amount>0&&usable)candidates.push(row);
  const fields=Object.entries(row).filter(([name])=>name!=='id');
  guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM (${query} AND ${alias}.id=?) AS current_earning WHERE ${fields.map(([name,value])=>value===null?`current_earning.${name} IS NULL`:`current_earning.${name}=?`).join(' AND ')})`,[source.sellerId,row.id,...fields.flatMap(([,value])=>value===null?[]:[value as number])]));
 }
 if(pool>BigInt(Number.MAX_SAFE_INTEGER)||pool<BigInt(-Number.MAX_SAFE_INTEGER))throw new Error('Reconcile the combined native earnings before allocation.');
 return {amount:Number(pool),futureId:candidates[0]?.id??null,maxAllocationPaisa:candidates[0]?.amount??0,guards,recordKind:managed?original!.kind as 'simulation'|'live':null};
}

export function modelRecoveryNettingStatements(db:D1Database,source:SellerRecoverySource,ctx:CommandContext,input:{caseId:string;allocationId:string;futureId:string;amount:number;creditId:string;debitId:string;proposalId:string}){
 const clock=checkoutCommitClock(db),managed=source.model==='managed',statements:D1PreparedStatement[]=[];
 if(managed){
  statements.push(db.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,refund_id,reason_code,created_by,request_id,created_at)
   SELECT ?,e.id,'dispute_adjustment',?,?,'recovery_netting_relief',?,?,${clock} FROM managed_entitlements e JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE snapshot.order_item_id=? AND e.seller_id=?`)
   .bind(input.creditId,input.amount,source.refundId,ctx.actorId,input.creditId,source.orderItemId,source.sellerId),...paymentGuard(db,'changes()=1'),
   db.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,reason_code,created_by,request_id,created_at) VALUES(?,?,'dispute_adjustment',?,'recovery_netting_withholding',?,?,${clock})`).bind(input.debitId,input.futureId,-input.amount,ctx.actorId,input.debitId));
 }else{
  statements.push(db.prepare(`INSERT INTO managed_supplier_recovery_credits(id,case_id,obligation_id,kind,amount_paisa,actor_id,request_id,created_at)
   SELECT ?,?,a.obligation_id,'netting_relief',?,?,?,${clock} FROM managed_supplier_adjustments a WHERE a.id=?`)
   .bind(input.creditId,input.caseId,input.amount,ctx.actorId,input.creditId,source.id),...paymentGuard(db,'changes()=1'),
   db.prepare(`INSERT INTO managed_supplier_recovery_credits(id,case_id,obligation_id,kind,amount_paisa,actor_id,request_id,created_at) VALUES(?,?,?,'netting_withholding',?,?,?,${clock})`)
   .bind(input.debitId,input.caseId,input.futureId,-input.amount,ctx.actorId,input.debitId));
 }
 statements.push(db.prepare(`INSERT INTO seller_recovery_allocations(id,case_id,method,amount_paisa,${managed?'managed':'fixed'}_credit_id,${managed?'managed':'fixed'}_debit_id,evidence_reference,reason,actor_id,request_id,created_at)
  VALUES(?,?,'earnings',?,?,?,?,?,?,?,${clock})`).bind(input.allocationId,input.caseId,input.amount,input.creditId,input.debitId,input.proposalId,'Apply eligible native earnings under the original explicit accepted agreement.',ctx.actorId,ctx.requestId));
 return statements;
}
