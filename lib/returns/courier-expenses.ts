import {
  OriginalBuyerPricingReconciliationError,
  originalBuyerPricingMarkerSql,
  readOriginalBuyerPricingTerms,
} from '../db/repositories/order-item-pricing-snapshots';
import { VARIANT_PRICING_RULE_VERSION } from '../products/variant-pricing';

type CourierExpense = {id:string;direction:'outbound'|'return';amountPaisa:number;evidenceReference:string;claimReference:string|null};

/** These are operational expenses, separate from what the buyer paid and any seller liability. */
export async function recordedReturnCourierExpenses(db: D1Database, caseId: string) {
  const order = await db.prepare(`SELECT accepted.terms_snapshot_json AS terms,
    ${originalBuyerPricingMarkerSql(db, 'accepted.terms_snapshot_json')} AS nativeVersion
    FROM return_requests care
    JOIN order_items item ON item.id=care.order_item_id JOIN order_policy_acceptances accepted ON accepted.order_id=item.order_id
    WHERE care.id=?`).bind(caseId).first<{ terms: string; nativeVersion: unknown }>();
  let needsPricingReconciliation = false;
  try {
    const { version } = readOriginalBuyerPricingTerms(order?.terms, order?.nativeVersion);
    if (version !== VARIANT_PRICING_RULE_VERSION) return { expenses: [], needsPricingReconciliation };
  } catch (error) {
    if (!(error instanceof OriginalBuyerPricingReconciliationError)) throw error;
    needsPricingReconciliation = true;
  }
  const { results: expenses } = await db.prepare(`SELECT expense.id,job.direction,expense.amount_paisa AS amountPaisa,
    expense.evidence_reference AS evidenceReference,job.claim_reference AS claimReference
    FROM return_requests care JOIN order_items item ON item.id=care.order_item_id
    JOIN shipping_jobs job ON job.order_id=item.order_id AND job.seller_id=item.seller_id
    JOIN parcel_courier_costs expense ON expense.shipping_job_id=job.id
    WHERE care.id=? AND (job.direction='outbound' OR (job.direction='return' AND
      (care.return_shipment_reference=job.id OR care.return_shipment_reference=job.tracking_code)))
    ORDER BY expense.created_at,expense.id LIMIT 50`).bind(caseId).all<CourierExpense>();
  return { expenses, needsPricingReconciliation };
}
