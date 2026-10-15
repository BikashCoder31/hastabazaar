function alias(value: string) {
  if (!/^[a-z_]+$/.test(value)) throw new Error('Invalid settlement alias.');
  return value;
}
function cases(entitlement: string) {
  const target = `SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id WHERE s.id=${entitlement}.snapshot_id`;
  return {
    returns: `${target} AND EXISTS(SELECT 1 FROM return_requests r WHERE r.order_item_id=i.id AND r.status NOT IN ('rejected','resolved'))`,
    complaints: `${target} AND EXISTS(SELECT 1 FROM complaints c WHERE c.status NOT IN ('resolved','closed') AND
      (c.order_item_id=i.id OR (c.order_item_id IS NULL AND c.order_id=i.order_id AND (c.seller_id IS NULL OR c.seller_id=i.seller_id))
        OR (c.order_item_id IS NULL AND c.seller_id=i.seller_id AND (c.order_id IS NULL OR NOT EXISTS(SELECT 1 FROM order_items attributed WHERE attributed.order_id=c.order_id AND attributed.seller_id=i.seller_id)))))`,
    refunds: `${target} AND EXISTS(SELECT 1 FROM refunds r LEFT JOIN return_requests rr ON rr.id=r.return_request_id
      WHERE r.order_id=i.order_id AND (rr.order_item_id=i.id OR r.return_request_id IS NULL OR rr.id IS NULL)
        AND (r.status NOT IN ('paid','rejected','cancelled') OR (r.status='paid' AND r.commission_base_refunded_paisa>0 AND
          (rr.id IS NULL OR NOT EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=${entitlement}.id
            AND x.refund_id=r.id AND x.type='refund_adjustment')))))`,
  };
}

export function managedSettlementReadySql(entitlement = 'e', now = Date.now()) {
  alias(entitlement);
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid settlement time.');
  const related = cases(entitlement);
  return `${entitlement}.earned_at IS NOT NULL AND ${entitlement}.earned_at<=${now} AND ${entitlement}.hold_until<=${now}
    AND ${entitlement}.dispute_hold_reason IS NULL
    AND EXISTS(SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id JOIN orders o ON o.id=i.order_id
      WHERE s.id=${entitlement}.snapshot_id AND o.delivered_at IS NOT NULL AND o.delivered_at<=${now}
        AND ${entitlement}.hold_until>=${entitlement}.earned_at+s.delivery_hold_days*86400000
        AND o.status IN ('delivered','return_requested','return_in_transit','returned','refunded')
        AND i.fulfillment_status IN ('delivered','returned','refunded') AND o.payment_status IN ('paid','part_refunded','refunded'))
    AND NOT EXISTS(${related.returns}) AND NOT EXISTS(${related.complaints}) AND NOT EXISTS(${related.refunds})`;
}

export interface ManagedSettlementBlocker { kind: string; message: string; href: string }
export async function getManagedSettlementBlockers(db: D1Database, input: { sellerId: string; entitlementId: string; now: number }): Promise<ManagedSettlementBlocker[]> {
  const related = cases('e');
  const row = await db.prepare(`SELECT e.earned_at AS earnedAt,e.hold_until AS holdUntil,e.dispute_hold_reason AS dispute,
    CASE WHEN ${managedSettlementReadySql('e', input.now)} THEN 1 ELSE 0 END AS ready,
    EXISTS(${related.returns}) AS hasReturn,EXISTS(${related.complaints}) AS hasComplaint,EXISTS(${related.refunds}) AS hasRefund
    FROM managed_entitlements e WHERE e.id=? AND e.seller_id=?`).bind(input.entitlementId, input.sellerId)
    .first<{ earnedAt: number | null; holdUntil: number | null; dispute: string | null; ready: number; hasReturn: number; hasComplaint: number; hasRefund: number }>();
  if (!row) return [{ kind: 'missing_evidence', message: 'The original managed earning evidence needs review.', href: '/admin/programs' }];
  if (row.ready) return [];
  const blockers: ManagedSettlementBlocker[] = [];
  if (!row.earnedAt) blockers.push({ kind: 'not_earned', message: 'Delivery and completed customer payment must be recorded first.', href: '/admin/orders' });
  if (row.holdUntil === null || row.holdUntil > input.now) blockers.push({ kind: 'holding_period', message: 'The delivery holding period has not ended.', href: '/admin/programs' });
  if (row.dispute) blockers.push({ kind: 'recorded_hold', message: 'A recorded dispute hold needs review.', href: '/admin/programs' });
  if (row.hasReturn) blockers.push({ kind: 'return', message: 'A related return is still open.', href: '/admin/returns' });
  if (row.hasComplaint) blockers.push({ kind: 'complaint', message: 'A related complaint or its order attribution needs review.', href: '/admin/complaints' });
  if (row.hasRefund) blockers.push({ kind: 'refund', message: 'A refund is unfinished or its maker adjustment needs reconciliation.', href: '/admin/returns' });
  if (!blockers.length) blockers.push({ kind: 'payment_evidence', message: 'The original delivery and payment facts need review.', href: '/admin/orders' });
  return blockers;
}
