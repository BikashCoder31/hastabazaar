import type { StaffRole } from '@/lib/auth/staff';
import { getEffectiveBusinessSetting } from './business-settings';
import {
  marketplaceSummaryRange,
  type MarketplaceSummaryPeriod,
} from '@/lib/admin/marketplace-period';

export interface SuperAdminMarketplaceSummary {
  users: { total: number };
  sellers: { total: number; approved: number; pendingReview: number };
  topSellers: readonly {
    sellerId: string;
    sellerName: string;
    salesPaisa: number;
    orderCount: number;
    unitsDelivered: number;
  }[];
}

/** Read-only business totals. Pass the role of the authenticated staff member. */
export async function getSuperAdminMarketplaceSummary(
  database: D1Database,
  role: StaffRole,
  now = Date.now(),
  period: MarketplaceSummaryPeriod = 'all',
): Promise<SuperAdminMarketplaceSummary | null> {
  if (role !== 'super_admin') return null;
  const range = marketplaceSummaryRange(period, now);

  const { value: policy } = await getEffectiveBusinessSetting(
    database,
    'first_party_analytics_policy',
    now,
  );
  // Keep account/report exclusions consistent with the existing customer report.
  const domainClause = (column: 'u.email' | 'd.customer_email') =>
    policy.excludedEmailDomains
      .map(() => `AND lower(${column}) NOT LIKE ?`)
      .join(' ');
  const domainBindings = policy.excludedEmailDomains.map(
    (domain) => `%@${domain}`,
  );
  const accountPredicate = `u.status<>'deleted' ${domainClause('u.email')}`;
  const dateClause = (
    column: 'u.created_at' | 's.created_at' | 'd.deliveredAt',
  ) => (range.start === null ? '' : `AND ${column}>=? AND ${column}<=?`);
  const dateBindings = range.start === null ? [] : [range.start, range.end];
  // Parcel delivery is seller-specific; whole-order completion may happen later.
  // Scalar lookups keep repeated status events from multiplying money or units.
  const deliveredAt =
    range.start === null
      ? 'NULL'
      : `COALESCE(
    (SELECT p.delivered_at FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id
     WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id AND j.direction='outbound'),
    (SELECT MAX(e.created_at) FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status='delivered'),
    o.delivered_at)`;
  const [users, sellers, ranking] = await Promise.all([
    database
      .prepare(
        `SELECT COUNT(*) AS total FROM users u WHERE ${accountPredicate} ${dateClause('u.created_at')}`,
      )
      .bind(...domainBindings, ...dateBindings)
      .first<SuperAdminMarketplaceSummary['users']>(),
    database
      .prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN s.status='approved' THEN 1 ELSE 0 END),0) AS approved,
      COALESCE(SUM(CASE WHEN s.status IN ('submitted','under_review') THEN 1 ELSE 0 END),0) AS pendingReview
      FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE ${accountPredicate} ${dateClause('s.created_at')}`)
      .bind(...domainBindings, ...dateBindings)
      .first<SuperAdminMarketplaceSummary['sellers']>(),
    database
      .prepare(`WITH delivered_sales AS (
        SELECT i.seller_id,i.order_id,i.line_total_paisa,i.quantity,o.customer_email,${deliveredAt} AS deliveredAt
        FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.fulfillment_status='delivered'
      )
      SELECT s.id AS sellerId,s.trading_name AS sellerName,
      SUM(d.line_total_paisa) AS salesPaisa,COUNT(DISTINCT d.order_id) AS orderCount,
      SUM(d.quantity) AS unitsDelivered
      FROM delivered_sales d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=s.user_id
      WHERE ${accountPredicate} ${domainClause('d.customer_email')} ${dateClause('d.deliveredAt')}
      GROUP BY s.id,s.trading_name HAVING SUM(d.line_total_paisa)>0
      ORDER BY salesPaisa DESC,s.id ASC LIMIT 5`)
      .bind(...domainBindings, ...domainBindings, ...dateBindings)
      .all<SuperAdminMarketplaceSummary['topSellers'][number]>(),
  ]);
  return {
    users: users ?? { total: 0 },
    sellers: sellers ?? { total: 0, approved: 0, pendingReview: 0 },
    topSellers: ranking.results,
  };
}
