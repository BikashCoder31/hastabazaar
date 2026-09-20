import { can, type Permission } from '@/lib/marketplace/permissions';
import type { StaffRole } from '@/lib/auth/staff';

export interface AdminWorkSummary {
  sellers: number;
  products: number;
  readyOrders: number;
  returns: number;
  complaints: number;
  payoutRequests: number;
  approvals: null | {
    payouts: number;
    highValueRefunds: number;
    promotions: number;
  };
}

/** Complete queue counts, independent of capped lists. Call after staff authorization. */
export async function getAdminWorkSummary(
  database: D1Database,
  role: StaffRole,
  permissions?: readonly Permission[],
): Promise<AdminWorkSummary> {
  if (role !== 'admin' && role !== 'super_admin')
    throw new Error('Staff access required.');
  const allowed = (permission: Permission) => can({role, permissions}, permission);
  const work = await database
    .prepare(`SELECT
    ${allowed('seller.application.review') ? "(SELECT COUNT(*) FROM seller_profiles WHERE status IN ('submitted', 'under_review'))" : '0'} AS sellers,
    ${allowed('product.review') ? "(SELECT COUNT(*) FROM products WHERE status IN ('submitted', 'under_review'))" : '0'} AS products,
    ${allowed('order.manage') ? "(SELECT COUNT(DISTINCT order_id) FROM order_items WHERE fulfillment_status = 'ready_for_pickup')" : '0'} AS readyOrders,
    ${allowed('support.manage') ? "(SELECT COUNT(*) FROM return_requests WHERE status IN ('requested', 'under_investigation', 'needs_customer_changes', 'pending_high_value_approval', 'approved', 'in_transit', 'received'))" : '0'} AS returns,
    ${allowed('support.manage') ? "(SELECT COUNT(*) FROM complaints WHERE status IN ('open', 'assigned', 'investigating', 'waiting_customer', 'escalated'))" : '0'} AS complaints,
    ${allowed('payout.prepare') ? "(SELECT COUNT(*) FROM payout_requests WHERE status = 'submitted')" : '0'} AS payoutRequests
  `)
    .first<Omit<AdminWorkSummary, 'approvals'>>();
  const approvals =
    role === 'super_admin'
      ? await database
          .prepare(`SELECT
    (SELECT COUNT(*) FROM payouts WHERE status IN ('prepared', 'scheduled')) AS payouts,
    (SELECT COUNT(*) FROM return_requests WHERE status = 'pending_high_value_approval') AS highValueRefunds,
    (SELECT COUNT(*) FROM promotions WHERE status = 'pending_approval') AS promotions
  `)
          .first<NonNullable<AdminWorkSummary['approvals']>>()
      : null;
  return {
    sellers: 0,
    products: 0,
    readyOrders: 0,
    returns: 0,
    complaints: 0,
    payoutRequests: 0,
    ...work,
    approvals,
  };
}
