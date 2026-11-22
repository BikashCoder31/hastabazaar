import type { ReviewedCheckoutQuote } from '../../checkout/reviewed-quote';
import type { VariantOrderPricingSnapshot } from '../../checkout/variant-order-pricing';

interface OrderItemPricingSnapshotRow {
  orderItemId: string;
  orderId: string;
  snapshot: VariantOrderPricingSnapshot;
  createdAt: number;
}

interface AcceptedPricingTerms {
  variantPricingRuleVersion?: unknown;
  reviewedQuote?: Pick<ReviewedCheckoutQuote, 'lines'>;
}

export class OriginalBuyerPricingReconciliationError extends Error {
  constructor() {
    super('Reconcile the original saved buyer prices.');
    this.name = 'OriginalBuyerPricingReconciliationError';
  }
}

/** Project the same native marker used by snapshot enforcement from a trusted column expression. */
export function originalBuyerPricingMarkerSql(db: D1Database, termsColumn: string): string {
  const scalar = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
  return `CASE WHEN json_valid(${termsColumn}) THEN ${scalar}(${termsColumn},'$.variantPricingRuleVersion') END`;
}

export function readOriginalBuyerPricingTerms(termsJson: string | null | undefined, nativeVersion: unknown) {
  let accepted: AcceptedPricingTerms | null = null;
  try {
    accepted = JSON.parse(termsJson ?? 'null') as AcceptedPricingTerms | null;
  } catch {
    // Historical terms may be plain text. A retained native marker still requires reconciliation.
  }
  const version = accepted?.variantPricingRuleVersion ?? null;
  // SQL paths and JSON.parse can disagree when stored terms contain duplicate keys.
  if (version !== (nativeVersion ?? null) || (version !== null && typeof version !== 'string')) {
    throw new OriginalBuyerPricingReconciliationError();
  }
  return { accepted, version };
}

/** Checkout appends this after inserting the item and any managed commission terms. */
export function prepareOrderItemPricingSnapshot(
  db: D1Database,
  { orderItemId, orderId, snapshot, createdAt }: OrderItemPricingSnapshotRow,
): D1PreparedStatement {
  return db.prepare(`INSERT INTO order_item_pricing_snapshots
    (order_item_id, order_id, snapshot_json, created_at) VALUES (?, ?, ?, ?)`)
    .bind(orderItemId, orderId, JSON.stringify(snapshot), createdAt);
}

/** Call after order access and a retained pricing marker have been established. */
export async function readOrderItemPricingSnapshots(
  db: D1Database,
  orderId: string,
): Promise<Array<{ orderItemId: string; snapshot: VariantOrderPricingSnapshot }>> {
  const { results } = await db.prepare(`SELECT order_item_id AS orderItemId, snapshot_json AS snapshotJson
    FROM order_item_pricing_snapshots WHERE order_id=? ORDER BY order_item_id`)
    .bind(orderId).all<{ orderItemId: string; snapshotJson: string }>();
  return results.map(({ orderItemId, snapshotJson }) => ({
    orderItemId,
    snapshot: JSON.parse(snapshotJson) as VariantOrderPricingSnapshot,
  }));
}

/** Read original customer prices only when the accepted checkout recorded the new rule. */
export async function readOriginalBuyerLinePricing(db: D1Database, orderId: string) {
  const terms = await db.prepare(`SELECT terms_snapshot_json AS json,
    ${originalBuyerPricingMarkerSql(db, 'terms_snapshot_json')} AS nativeVersion
    FROM order_policy_acceptances WHERE order_id=?`)
    .bind(orderId).first<{ json: string | null; nativeVersion: unknown }>();
  const { accepted, version } = readOriginalBuyerPricingTerms(terms?.json, terms?.nativeVersion);
  if (version === null) return null;
  const lines = await readOrderItemPricingSnapshots(db, orderId);
  const reviewed = accepted?.reviewedQuote?.lines;
  const expected = Array.isArray(reviewed) ? reviewed.filter(line => line?.pricingRuleVersion === version).length : 0;
  if (!expected || lines.length !== expected || lines.some(line => line.snapshot.ruleVersion !== version)) {
    throw new OriginalBuyerPricingReconciliationError();
  }
  return new Map(lines.map(line => [line.orderItemId, line.snapshot]));
}
