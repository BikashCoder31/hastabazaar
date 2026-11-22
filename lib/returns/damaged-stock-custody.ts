import type { CommerceForm } from '../db/repositories/commerce-form-replay';
import { readOriginalBuyerLinePricing } from '../db/repositories/order-item-pricing-snapshots';
import { decodePublishedForm } from '../forms/runtime';
import { paymentGuard } from '../payments/manual-receipts';
import { positiveOriginalPaidSql } from '../payments/recovery-partial-paid-source';

function payoutMayHaveBeenSent(link: 'registered_payout_id' | 'managed_payout_id') {
  return `(p.status='paid' OR EXISTS (SELECT 1 FROM payout_transfer_packets packet
    WHERE packet.${link}=p.id AND packet.seller_id=i.seller_id
      AND packet.state IN ('processing','uncertain','paid')))`;
}

/** Settlement evidence establishes custody risk. A separate review must establish title and disposition authority. */
export async function prepareDamagedReturnDispositionGuard(db: D1Database, orderId: string, orderItemId: string) {
  const originalPricing = await readOriginalBuyerLinePricing(db, orderId);
  if (!originalPricing?.has(orderItemId)) return { blocker: null, guards: [] };

  const dialect = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'mariadb' : 'sqlite';
  const paid = `(${positiveOriginalPaidSql('registered', 'i.id', 'i.seller_id', dialect)}>0 OR EXISTS (
    SELECT 1 FROM managed_commercial_snapshots snapshot
    JOIN managed_entitlements entitlement ON entitlement.snapshot_id=snapshot.id AND entitlement.seller_id=i.seller_id
    WHERE snapshot.order_item_id=i.id AND ${positiveOriginalPaidSql('managed', 'entitlement.id', 'i.seller_id', dialect)}>0
  ))`;
  // Retained paid status with missing bank proof, or an in-flight transfer, needs reconciliation too.
  const pending = `(EXISTS (
    SELECT 1 FROM seller_ledger_entries entry JOIN payout_entries included ON included.ledger_entry_id=entry.id
    JOIN payouts p ON p.id=included.payout_id AND p.seller_id=i.seller_id
    WHERE entry.order_item_id=i.id AND entry.seller_id=i.seller_id AND entry.amount_paisa>0
      AND included.released_at IS NULL AND ${payoutMayHaveBeenSent('registered_payout_id')}
  ) OR EXISTS (
    SELECT 1 FROM managed_commercial_snapshots snapshot
    JOIN managed_entitlements entitlement ON entitlement.snapshot_id=snapshot.id AND entitlement.seller_id=i.seller_id
    JOIN managed_payouts p ON p.seller_id=i.seller_id
    WHERE snapshot.order_item_id=i.id AND ${payoutMayHaveBeenSent('managed_payout_id')}
      AND (EXISTS (SELECT 1 FROM managed_payout_allocations allocation
        WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entitlement.id
          AND allocation.amount_paisa>0 AND allocation.disposition IN ('reserved','paid'))
      OR EXISTS (SELECT 1 FROM managed_payout_entries included
        JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
        WHERE included.payout_id=p.id AND entry.entitlement_id=entitlement.id AND entry.amount_paisa>0))
  ))`;
  const item = 'FROM order_items i WHERE i.id=? AND i.order_id=?';
  const source = await db.prepare(`SELECT CASE WHEN ${paid} THEN 'paid' WHEN ${pending} THEN 'uncertain' ELSE 'unpaid' END AS state ${item}`)
    .bind(orderItemId, orderId).first<{ state: 'paid' | 'uncertain' | 'unpaid' }>();

  if (source?.state !== 'unpaid') {
    const evidence = source?.state === 'paid' ? 'The original seller payout is verified.' : 'The original seller payout needs reconciliation.';
    return { blocker: `${evidence} Keep the units quarantined until documented title and disposition authority are verified.`, guards: [] };
  }
  return { blocker: null, guards: paymentGuard(db, `EXISTS (SELECT 1 ${item} AND NOT ${pending})`, [orderItemId, orderId]) };
}

/** Optional observations are private handling facts captured by the exact submitted form version. */
export async function readQuarantinedReturnObservation(db: D1Database, form: CommerceForm | undefined) {
  if (!form?.answers.answers.length) return null;
  const stored = await db.prepare(`SELECT version,config_json,published_at FROM form_config_versions
    WHERE id=? AND form_id='staff.return-case-action'`).bind(form.versionId)
    .first<{ version: number; config_json: string; published_at: number }>();
  if (!stored || stored.version !== form.answers.version) return null;
  const definition = decodePublishedForm('staff.return-case-action', stored);
  const answers = new Map(form.answers.answers.map(answer => [answer.fieldId, answer.value]));
  const read = (key: string) => {
    const field = definition.fields.find(candidate => candidate.key === key && candidate.status === 'active');
    const value = field && answers.get(field.id);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const observation = {
    condition: read('custody_condition'),
    custodian: read('custody_custodian'),
    location: read('custody_location'),
  };
  return Object.values(observation).some(value => value !== null) ? observation : null;
}
