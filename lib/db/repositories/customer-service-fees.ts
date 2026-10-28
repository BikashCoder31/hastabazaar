import { customerServiceFeeSnapshot } from '../../checkout/customer-service-fee';
import {
  parseServiceFeeSnapshot,
  type CustomerServiceFeeSnapshot,
} from '../../checkout/platform-service-fee';
import {
  selectFeeWaiver,
  validateFeeWaiverInstant,
  type FeeWaiverCampaign,
} from '../../marketplace/fee-waivers';
import { getEffectiveBusinessSetting } from './business-settings';
import { getCustomerFeeWaiverState } from './customer-fee-waivers';
import { customerServiceFeeCampaignCommands } from './fee-campaign-commands';
export interface CustomerServiceFeeQuote {
  feeTarget: 'customer_service_fee';
  controlRevision: number;
  campaign: FeeWaiverCampaign | null;
  snapshot: CustomerServiceFeeSnapshot;
}
export async function quoteCustomerServiceFee(
  db: D1Database,
  at: number,
): Promise<CustomerServiceFeeQuote> {
  validateFeeWaiverInstant(at);
  const [policy, state] = await Promise.all([
    getEffectiveBusinessSetting(db, 'platform_service_fee_policy', at),
    getCustomerFeeWaiverState(db),
  ]);
  const campaign = selectFeeWaiver(state.campaigns, at);
  return {
    feeTarget: 'customer_service_fee',
    controlRevision: state.revision,
    campaign,
    snapshot: customerServiceFeeSnapshot(
      policy.value,
      policy.versionId,
      campaign,
    ),
  };
}
/** Runs even for disabled policies and quotes with no eligible campaign. */
export function customerFeeCheckoutGuards(
  db: D1Database,
  quote: CustomerServiceFeeQuote,
  placedAt: number,
): D1PreparedStatement[] {
  if (quote.feeTarget !== 'customer_service_fee')
    throw new TypeError('Invalid customer fee target.');
  return customerServiceFeeCampaignCommands.checkoutGuards(db, quote, placedAt);
}
export function customerFeeEvidenceInsert(
  db: D1Database,
  orderId: string,
  snapshot: CustomerServiceFeeSnapshot,
  placedAt: number,
): D1PreparedStatement {
  validateFeeWaiverInstant(placedAt);
  const saved = parseServiceFeeSnapshot(snapshot);
  if (!('schemaVersion' in saved))
    throw new TypeError('A customer fee snapshot is required.');
  return db
    .prepare(
      `INSERT INTO order_customer_service_fees(order_id,policy_enabled,policy_amount_paisa,policy_version_id,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      orderId,
      saved.enabled ? 1 : 0,
      saved.amountPaisa,
      saved.versionId,
      saved.standardPaisa,
      saved.waivedPaisa,
      saved.chargedPaisa,
      saved.campaign?.id ?? null,
      saved.campaign?.revision ?? null,
      placedAt,
    );
}

export interface OrderCustomerFeeView {
  orderId: string;
  source: 'legacy_recorded' | 'customer_v2';
  standardPaisa: number;
  waivedPaisa: number;
  netPaisa: number;
  campaign: { id: string; revision: number; name: string } | null;
  policyVersionId: string | null;
}

/** Original order evidence only. Current policies and campaign pointers cannot reprice history. */
export async function readOrderCustomerServiceFees(
  db: D1Database,
  orderIds: string[],
): Promise<Map<string, OrderCustomerFeeView>> {
  const views = new Map<string, OrderCustomerFeeView>();
  const ids = [...new Set(orderIds)];
  for (let start = 0; start < ids.length; start += 90) {
    const batch = ids.slice(start, start + 90);
    const rows = await db.prepare(`SELECT o.id AS orderId,o.buyer_platform_fee_paisa AS recordedPaisa,
      f.order_id AS evidenceOrderId,f.standard_paisa AS standardPaisa,f.waived_paisa AS waivedPaisa,
      f.net_paisa AS netPaisa,f.policy_version_id AS policyVersionId,
      f.campaign_id AS campaignId,f.campaign_revision AS campaignRevision,r.name AS campaignName
      FROM orders o LEFT JOIN order_customer_service_fees f ON f.order_id=o.id
      LEFT JOIN customer_fee_waiver_revisions r ON r.campaign_id=f.campaign_id AND r.revision=f.campaign_revision
      WHERE o.id IN (${batch.map(() => '?').join(',')})`).bind(...batch).all<{
        orderId: string; recordedPaisa: number; evidenceOrderId: string | null;
        standardPaisa: number; waivedPaisa: number; netPaisa: number; policyVersionId: string | null;
        campaignId: string | null; campaignRevision: number | null; campaignName: string | null;
      }>();
    for (const row of rows.results) {
      if (row.campaignId && (!row.campaignRevision || !row.campaignName))
        throw new Error('Recorded customer fee campaign revision is unavailable.');
      views.set(row.orderId, row.evidenceOrderId === null ? {
        orderId: row.orderId, source: 'legacy_recorded', standardPaisa: row.recordedPaisa,
        waivedPaisa: 0, netPaisa: row.recordedPaisa, campaign: null, policyVersionId: null,
      } : {
        orderId: row.orderId, source: 'customer_v2', standardPaisa: row.standardPaisa,
        waivedPaisa: row.waivedPaisa, netPaisa: row.netPaisa, policyVersionId: row.policyVersionId,
        campaign: row.campaignId ? { id: row.campaignId, revision: row.campaignRevision!, name: row.campaignName! } : null,
      });
    }
  }
  return views;
}
