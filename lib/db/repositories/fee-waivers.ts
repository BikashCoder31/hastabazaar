import {
  historicalFeeBreakdown,
  FeeWaiverError,
  type FeeBreakdown,
  type FeeWaiverCampaign,
} from '../../marketplace/fee-waivers';

/** Original immutable fee snapshots only; ledger reversals remain separate. */
export async function readOrderMarketplaceFees(
  db: D1Database,
  orderItemIds: string[],
): Promise<Map<string, FeeBreakdown>> {
  const fees = new Map<string, FeeBreakdown>();
  const ids = [...new Set(orderItemIds)];
  // Stay below D1's binding limit for large order/report reads.
  for (let start = 0; start < ids.length; start += 90) {
    const batch = ids.slice(start, start + 90);
    const rows = await db
      .prepare(`SELECT i.id,i.commission_bps AS commissionBps,i.commission_paisa AS commissionPaisa,
      COALESCE(i.commission_base_paisa,i.line_total_paisa-i.seller_discount_paisa) AS historicalBasePaisa,
      f.standard_bps AS standardBps,f.base_paisa AS basePaisa,f.standard_paisa AS standardPaisa,
      f.waived_paisa AS waivedPaisa,f.net_paisa AS netPaisa,f.campaign_id AS campaignId,f.campaign_revision AS campaignRevision
      FROM order_items i LEFT JOIN order_item_marketplace_fees f ON f.order_item_id=i.id
      WHERE i.id IN (${batch.map(() => '?').join(',')})
        AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=i.id)
        AND COALESCE(i.commission_rule_version,'') NOT LIKE 'managed-%'`)
      .bind(...batch)
      .all<
        FeeBreakdown & {
          id: string;
          commissionBps: number;
          commissionPaisa: number;
          historicalBasePaisa: number;
        }
      >();
    for (const row of rows.results)
      fees.set(
        row.id,
        row.standardBps == null
          ? historicalFeeBreakdown(
              row.commissionBps,
              row.commissionPaisa,
              row.historicalBasePaisa,
            )
          : {
              standardBps: row.standardBps,
              basePaisa: row.basePaisa,
              standardPaisa: row.standardPaisa,
              waivedPaisa: row.waivedPaisa,
              netPaisa: row.netPaisa,
              campaignId: row.campaignId,
              campaignRevision: row.campaignRevision,
            },
      );
  }
  return fees;
}

/** Resolve names by the immutable revision saved on the order, never the current campaign. */
export async function readOrderMarketplaceFeeViews(
  db: D1Database,
  orderItemIds: string[],
) {
  const fees = await readOrderMarketplaceFees(db, orderItemIds);
  const views: {
    itemId: string;
    productName: string;
    fee: FeeBreakdown;
    campaignName: string | null;
  }[] = [];
  const ids = [...fees.keys()];
  for (let start = 0; start < ids.length; start += 90) {
    const batch = ids.slice(start, start + 90);
    const rows = await db
      .prepare(`SELECT i.id,i.product_name_snapshot AS productName,r.name AS campaignName FROM order_items i
      LEFT JOIN order_item_marketplace_fees f ON f.order_item_id=i.id
      LEFT JOIN marketplace_fee_waiver_revisions r ON r.campaign_id=f.campaign_id AND r.revision=f.campaign_revision
      WHERE i.id IN (${batch.map(() => '?').join(',')}) ORDER BY i.id`)
      .bind(...batch)
      .all<{ id: string; productName: string; campaignName: string | null }>();
    for (const row of rows.results)
      views.push({
        itemId: row.id,
        productName: row.productName,
        fee: fees.get(row.id)!,
        campaignName: row.campaignName,
      });
  }
  return views;
}

/** Authorized historical campaigns only. No quotes, commands or checkout writes. */
export async function getAuthorizedFeeWaiverState(
  db: D1Database,
  actor: { actorId: string; authSubject: string },
): Promise<{ revision: number; campaigns: FeeWaiverCampaign[] }> {
  const authorized = await db
    .prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin'")
    .bind(actor.actorId, actor.authSubject)
    .first();
  if (!authorized) throw new FeeWaiverError('unauthorized');
  const rows = await db
    .prepare(`SELECT ctl.revision AS controlRevision,c.id,r.revision,r.state,r.name,r.description,r.starts_at AS startsAt,r.ends_at AS endsAt
    FROM marketplace_fee_waiver_control ctl LEFT JOIN marketplace_fee_waiver_campaigns c ON 1=1
    LEFT JOIN marketplace_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE ctl.id='default' ORDER BY r.starts_at,c.id`)
    .all<FeeWaiverCampaign & { controlRevision: number }>();
  if (!rows.results.length) throw new FeeWaiverError('conflict');
  return {
    revision: rows.results[0].controlRevision,
    campaigns: rows.results
      .filter(r => r.id !== null)
      .map(({ id, revision, state, name, description, startsAt, endsAt }) => ({
        id, revision, state, name, description, startsAt, endsAt,
      })),
  };
}
