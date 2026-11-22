import {actualRecoveryAllocationSql,verifiedRecoveryReceiptSql} from './recovery-receipt-accounting';
import {carrierUnpaidDispositionPendingSql} from './recovery-carrier-unpaid';
import {returnedPayoutDispositionPendingSql} from './recovery-returned-payout';
import {carrierDispositionPendingSql} from './recovery-carrier';
import type {PayoutModel} from './payout-transfer-types';

/** Native aggregate balances must not silently collect an unresolved recovery.
 * This gates only the affected seller/model payout, never orders or seller access.
 */
export function recoveryPayoutReadySql(seller:string,model:PayoutModel,recordKind?:'live'){
 if(!/^(?:\?|[a-z_]+\.[a-z_]+)$/.test(seller)||!['registered','managed','fixed'].includes(model))throw new Error('Invalid recovery payout source.');
 if(recordKind!==undefined&&(recordKind!=='live'||model!=='managed'))throw new Error('Invalid original live recovery scope.');
 const liveCase=recordKind==='live'?`AND EXISTS(SELECT 1 FROM managed_commercial_snapshots live_case WHERE live_case.order_item_id=json_extract(recovery.original_source_json,'$.orderItemId') AND live_case.seller_id=recovery.seller_id AND live_case.record_kind='live' AND live_case.live_activation_decision_id IS NOT NULL AND live_case.live_clearance_id IS NOT NULL AND live_case.live_financial_scope_id IS NOT NULL)`:'';
 const liveDebt=recordKind==='live'?`AND EXISTS(SELECT 1 FROM managed_commercial_snapshots live_debt WHERE live_debt.id=e.snapshot_id AND live_debt.record_kind='live' AND live_debt.live_activation_decision_id IS NOT NULL AND live_debt.live_clearance_id IS NOT NULL AND live_debt.live_financial_scope_id IS NOT NULL)`:'';
 const unresolved=`NOT EXISTS(SELECT 1 FROM seller_recovery_cases recovery WHERE recovery.seller_id=${seller} AND recovery.payout_model='${model}' ${liveCase}
  AND (${carrierUnpaidDispositionPendingSql('recovery.id')} OR ${returnedPayoutDispositionPendingSql('recovery.id')} OR ${carrierDispositionPendingSql('recovery.id')} OR recovery.blocker IS NOT NULL OR recovery.historical_recovered_paisa<>COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.case_id=recovery.id),0)
   OR recovery.state NOT IN('recovered','absorbed','closed_no_balance') AND NOT (
    recovery.confirmed_paisa>0 AND recovery.exposure_paisa=recovery.confirmed_paisa
    AND recovery.confirmed_paisa-recovery.absorbed_paisa-recovery.historical_recovered_paisa+recovery.restored_paisa
      -COALESCE((SELECT SUM(${actualRecoveryAllocationSql('collected')}) FROM seller_recovery_allocations collected WHERE collected.case_id=recovery.id),0)=0)
   OR EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=recovery.id
    AND (NOT ${verifiedRecoveryReceiptSql('r')}))))`;
 const unmapped=model==='registered'?`NOT EXISTS(SELECT 1 FROM seller_ledger_entries debt JOIN refunds r ON r.id=debt.refund_id
  WHERE debt.seller_id=${seller} AND debt.type='refund' AND debt.amount_paisa<0
  AND EXISTS(SELECT 1 FROM seller_ledger_entries sale JOIN payout_entries pe ON pe.ledger_entry_id=sale.id JOIN payouts p ON p.id=pe.payout_id
    WHERE sale.seller_id=debt.seller_id AND sale.order_item_id=debt.order_item_id AND sale.type='sale' AND pe.released_at IS NULL AND p.status IN('paid','processing','failed'))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases mapped WHERE mapped.source_kind='refund' AND mapped.source_id=r.id))`
  :model==='managed'?`NOT EXISTS(SELECT 1 FROM managed_settlement_entries debt JOIN managed_entitlements e ON e.id=debt.entitlement_id
   WHERE e.seller_id=${seller} AND debt.type='refund_adjustment' AND debt.amount_paisa<0 ${liveDebt}
   AND EXISTS(SELECT 1 FROM managed_payouts p WHERE p.seller_id=e.seller_id AND p.status IN('paid','processing','failed') AND
    (EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=e.id AND a.amount_paisa>0 AND a.disposition<>'released')
     OR EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=p.id AND x.entitlement_id=e.id AND x.amount_paisa>0)))
   AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases mapped WHERE mapped.source_kind='refund' AND mapped.source_id=debt.refund_id))`
  :`NOT EXISTS(SELECT 1 FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id
   WHERE o.seller_id=${seller} AND EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid')
   AND (SELECT COALESCE(SUM(p.amount_paisa),0) FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid')
    +(SELECT COALESCE(SUM(x.amount_paisa),0) FROM managed_supplier_adjustments x WHERE x.obligation_id=o.id)>o.original_amount_paisa
   AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases mapped WHERE mapped.source_kind='supplier_adjustment' AND mapped.source_id=a.id))`;
 return `(${unresolved} AND ${unmapped})`;
}
