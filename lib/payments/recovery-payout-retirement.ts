import type {PayoutModel} from './payout-transfer-types';

export const recoveryPayoutModels={
 registered:{table:'payouts',column:'registered_payout_id',seller:'p.seller_id',join:'',terminal:'rejected'},
 managed:{table:'managed_payouts',column:'managed_payout_id',seller:'p.seller_id',join:'',terminal:'rejected'},
 fixed:{table:'managed_supplier_payments',column:'supplier_payment_id',seller:'obligation.seller_id',join:'JOIN managed_supplier_obligations obligation ON obligation.id=p.obligation_id',terminal:'cancelled'}
} as const;

/** A failed instruction is not proven absent merely because its native label says failed. */
function safeInstructionSql(model:PayoutModel,payout:string){
 const column=recoveryPayoutModels[model].column;
 return `NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.${column}=${payout} AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))`;
}
export function recoveryPayoutRetirementSql(model:PayoutModel,caseId:string){
 const m=recoveryPayoutModels[model];
 const scope=model==='registered'?`EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
  JOIN return_requests request ON request.order_item_id=e.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE pe.payout_id=p.id AND e.seller_id=c.seller_id AND refund.id=c.refund_id)`:
 model==='managed'?`EXISTS(SELECT 1 FROM managed_entitlements e JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id
  JOIN return_requests request ON request.order_item_id=snapshot.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE e.seller_id=c.seller_id AND refund.id=c.refund_id AND (EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=e.id)
   OR EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=p.id AND x.entitlement_id=e.id)))`:
 `EXISTS(SELECT 1 FROM managed_supplier_adjustments a WHERE a.id=c.supplier_adjustment_id AND a.obligation_id=p.obligation_id)`;
 return `SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM ${m.table} p ${m.join} JOIN seller_recovery_cases c ON c.seller_id=${m.seller} AND c.payout_model='${model}'
  WHERE c.id=${caseId} AND ${scope} AND p.status IN('prepared','scheduled','approved','failed','${m.terminal}')
  AND p.paid_at IS NULL ${model!=='fixed'?'AND p.provider_reference IS NULL':''}
  ${model==='registered'?"AND (p.processed_at IS NULL OR p.status='failed')":''}
  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.${m.column}=p.id AND t.state='failed'))
  AND ${safeInstructionSql(model,'p.id')}
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='${model}' AND retired.payout_id=p.id)`;
}
/** Retained audited release is neither an actual bank receipt nor a paid payout. */
export function retiredRecoveryPayoutSql(model:PayoutModel,payout:string,seller:string){
 const m=recoveryPayoutModels[model];
 const join=model==='fixed'?'JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id':'',nativeSeller=model==='fixed'?'retired_obligation.seller_id':'retired_native.seller_id';
 return `EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN ${m.table} retired_native ON retired_native.id=retired.payout_id ${join}
  WHERE retired.payout_model='${model}' AND retired.payout_id=${payout} AND retired.seller_id=${seller} AND ${nativeSeller}=retired.seller_id
  AND retired_native.status='${m.terminal}' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.${m.column}=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  ${model==='registered'?"AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL)":model==='managed'?"AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')":''})`;
}
export interface RecoveryPayoutRetirement {id:string;status:string;amountPaisa:number;destination:string;updatedAt:number;}
export async function readRecoveryPayoutRetirements(db:D1Database,source:{kind:string;id:string;model:PayoutModel}){
 const caseId=`(SELECT id FROM seller_recovery_cases WHERE source_kind=(SELECT kind FROM requested) AND source_id=(SELECT id FROM requested))`;
 return (await db.prepare(`WITH requested AS(SELECT ? AS kind,? AS id) ${recoveryPayoutRetirementSql(source.model,caseId)} ORDER BY p.id`).bind(source.kind,source.id).all<RecoveryPayoutRetirement>()).results;
}
