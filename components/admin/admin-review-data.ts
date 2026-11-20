import { cache } from 'react';
import { reviewTaskOpen } from '@/lib/admin/review-queue-view';
import { getAdminWorkSummary } from '@/lib/db/repositories/admin-workspace';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { can } from '@/lib/marketplace/permissions';
import { listReviewTasks, ReviewTaskConflict } from '@/lib/workflows/review-tasks';
import type { AdminNavigationCounts } from './admin-navigation';
import type { AdminStaffAccess } from './admin-sections';

// The sidebar and queue can share the same authorized read on one request.
export const readAdminReviewTasks = cache((database: D1Database, actorId: string) =>
  listReviewTasks(database, actorId).catch(() => null),
);

export async function readAdminSidebarCounts(database: D1Database, staff: AdminStaffAccess & { id: string }): Promise<AdminNavigationCounts> {
  const reader = await staffMutationGuard(database, staff.id, 'account.self.manage', ReviewTaskConflict, staff.role);
  const [work, reviews] = await Promise.all([
    getAdminWorkSummary(database, reader.role, reader.permissions).catch(() => null),
    readAdminReviewTasks(database, staff.id),
  ]);
  await database.batch(reader.statements);

  const counts: AdminNavigationCounts = {};
  if (reviews) counts.today = { value: reviews.filter(reviewTaskOpen).length, label: 'open review tasks' };
  if (work && can(reader, 'order.manage')) counts.orders = { value: work.readyOrders, label: 'orders ready for dispatch' };
  if (work && can(reader, 'support.manage')) counts.care = { value: work.returns + work.complaints, label: 'open returns and complaints' };
  if (work && can(reader, 'seller.application.review')) counts.sellers = { value: work.sellers, label: 'seller applications awaiting review' };
  if (work && can(reader, 'product.review')) counts.catalog = { value: work.products, label: 'products awaiting review' };
  if (work && can(reader, 'payout.prepare')) counts.money = { value: work.payoutRequests, label: 'payout requests awaiting preparation' };
  if (work?.approvals) counts.growth = { value: work.approvals.promotions, label: 'promotion approvals pending' };
  return counts;
}
