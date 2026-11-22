import { countOrdersForOperations } from '@/lib/db/repositories/orders';
import { listNotifications } from '@/lib/db/repositories/operations';
import { canViewStaffNotification } from '@/lib/operations/notification-links';
import { readReminderMilestone } from '@/lib/operations/reminder-notice-sources';
import { resolveReminderDestination } from '@/lib/operations/reminder-destination';
import { readExceptionWorkQueue, listUnrecordedParcelExceptions } from '@/lib/operations/exception-work';
import { readCourierCashDue } from '@/lib/payments/manual-payment-workspace';
import { can } from '@/lib/marketplace/permissions';
import { marketplaceSummaryRange } from '@/lib/admin/marketplace-period';
import { reviewTaskOpen, type NativeReviewTask, type ReviewQueueTask } from '@/lib/admin/review-queue-view';
import { readRecentReviewDecisions, type RecentReviewDecision } from '@/lib/admin/recent-review-decisions';
import type { FinanceRecentDecision } from '@/lib/admin/finance-work-items';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { payableOrderTotalSql } from '@/lib/db/repositories/platform-service-fee';
import { customerCodSchemaAvailable } from '@/lib/orders/first-cod-review';
import { listSellerPayoutFixes } from '@/lib/sellers/payout-fixes';
import { readFailedAddresses } from '@/lib/operations/admin-message-history';
import type { AdminStaffAccess } from './admin-sections';
import { todayReviewTask, todayShortDate, type TodayTask } from './overview-today-model';
import { readSellerPickupHandoffs, readSellerReviewHandoffs } from './overview-seller-handoff-data';

const orderStages = [
  { label: 'New', status: 'confirmed' },
  { label: 'Packing', status: 'packing' },
  { label: 'Waiting for pickup', status: 'ready_for_pickup' },
  { label: 'With courier', status: 'dispatched' },
  { label: 'Delivered today', status: 'delivered' },
] as const;
export type TodayOrders = { count: number; stages: { label: string; count: number }[] };

async function readTodayOrders(db: D1Database, from: number, through: number): Promise<TodayOrders> {
  const [count, stages] = await Promise.all([
    countOrdersForOperations(db, {}, { by: 'placedAt', from, through }),
    Promise.all(orderStages.map(async ({ label, status }) => ({
      label,
      count: status === 'delivered'
        ? await countOrdersForOperations(db, {}, { by: 'deliveredAt', from, through })
        : await countOrdersForOperations(db, { status }),
    }))),
  ]);
  return { count, stages };
}

async function displayNames(db: D1Database, ids: readonly string[]) {
  const names = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 60) {
    const chunk = ids.slice(index, index + 60);
    const rows = await db.prepare(`SELECT id,display_name AS name FROM users WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk).all<{ id: string; name: string }>();
    for (const row of rows.results) names.set(row.id, row.name);
  }
  return names;
}

const reminderType = {
  refund_obligation: ['Money', 'Refunds', 'Open refund'],
  system_incident: ['Settings', 'System checks', 'Open issue'],
  return_request: ['Care', 'Returns', 'Open case'],
  complaint: ['Care', 'Complaints', 'Open case'],
  review_task: ['Today', 'Reminder', 'Open review'],
  recovery: ['Money', 'Recoveries', 'Open recovery'],
} as const;

async function readTodayReminders(
  db: D1Database, actor: AdminStaffAccess & { id: string }, now: number,
  tasks: readonly ReviewQueueTask[], returnTo: string,
) {
  const notifications = await listNotifications(db, actor.id, 101, 'staff');
  const open = tasks.filter(reviewTaskOpen);
  const ids = new Map(open.map(task => [task.id, task]));
  const sources = new Map(open.map(task => [task.sourceType + ':' + task.sourceId, task]));
  const reminders = new Map<string, TodayTask>();
  for (const notice of notifications) {
    if (notice.relatedType !== 'operational_reminder' || !notice.relatedId ||
      !canViewStaffNotification(actor, notice.relatedType, notice.requiredPermission)) continue;
    const milestone = await readReminderMilestone(db, notice.relatedId);
    if (!milestone) continue;
    const source = milestone.family + ':' + milestone.sourceId;
    const task = milestone.family === 'review_task' ? ids.get(milestone.sourceId)
      : sources.get(source) ?? (milestone.family === 'recovery' ? sources.get('recovery_review:' + milestone.sourceId) : undefined);
    const key = task?.id ?? source;
    if (reminders.has(key) && reminders.get(key)!.dueAt! <= milestone.dueAt) continue;
    const destination = await resolveReminderDestination(db, actor.id, notice.relatedId, 'staff', now);
    if (!destination) continue;
    const [section, type, action] = reminderType[milestone.family];
    reminders.set(key, {
      id: key, section, type, title: notice.subjectEn, context: 'Follow-up due',
      startedAt: notice.createdAt, dueAt: milestone.dueAt, state: 'action',
      ownerId: null, ownerName: null, ownerKnown: false, assignment: null, href: withAdminReturnTo(destination, returnTo), action,
    });
  }
  return { rows: [...reminders.values()], partial: notifications.length > 100 };
}

function isCompletedFinanceDecision(decision: FinanceRecentDecision) {
  return decision.completed === true || decision.family === 'payout_request' ||
    decision.family === 'payout_packet' && decision.action === 'payout.transfer.paid';
}

export async function readTodayCodConfirmations(db: D1Database, returnTo: string): Promise<TodayTask[]> {
  if (!await customerCodSchemaAvailable(db)) return [];
  const orders = await db.prepare(`SELECT o.id, o.order_number AS orderNumber, buyer.display_name AS buyerName,
      o.customer_phone AS phone, ${payableOrderTotalSql('o')} AS totalPaisa, r.created_at AS createdAt
    FROM first_cod_reviews r JOIN orders o ON o.id=r.order_id JOIN users buyer ON buyer.id=r.customer_id
    WHERE r.status='pending' AND r.hold_source='customer_flag' AND o.status='confirmed' AND o.payment_mode='cod'
    ORDER BY r.created_at, o.id`).all<{ id: string; orderNumber: string; buyerName: string; phone: string; totalPaisa: number; createdAt: number }>();
  const money = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' });
  return orders.results.map(order => ({
    id: 'cod-confirmation:' + order.id, section: 'Orders', type: 'Cash-on-delivery confirmation',
    title: 'Call to confirm COD order ' + order.orderNumber,
    context: [order.buyerName, order.phone, money.format(order.totalPaisa / 100)].filter(Boolean).join(' · '),
    startedAt: order.createdAt, dueAt: null, state: 'action',
    ownerId: null, ownerName: null, assignment: null,
    href: withAdminReturnTo('/admin/orders/' + encodeURIComponent(order.id) + '?tab=parcel-cash#confirm-cod', returnTo),
    action: 'Open order', codConfirmationOrderId: order.id,
  }));
}

export async function readTodaySources({
  db, actor, now, returnTo, tasks, financeDecisions,
}: {
  db: D1Database;
  actor: AdminStaffAccess & { id: string };
  now: number;
  returnTo: string;
  tasks: readonly ReviewQueueTask[];
  financeDecisions: readonly FinanceRecentDecision[];
}) {
  const from = marketplaceSummaryRange('today', now).start!;
  const orders = can(actor, 'order.manage') ? await readTodayOrders(db, from, now).catch(() => null) : undefined;
  const exceptions = orders !== undefined ? await readExceptionWorkQueue(db, actor.id).catch(() => null) : undefined;
  const recorded = exceptions?.items;
  const unrecorded = orders !== undefined ? await listUnrecordedParcelExceptions(db, actor.id).catch(() => null) : undefined;
  const cash = actor.role === 'super_admin' && can(actor, 'payment.receipt.verify')
    ? await readCourierCashDue(db, actor.id).catch(() => null) : undefined;
  const reminders = await readTodayReminders(db, actor, now, tasks, returnTo).catch(() => null);
  const native = tasks.filter((task): task is NativeReviewTask => !('finance' in task));
  const completed = await readRecentReviewDecisions(db, actor.id, native, returnTo, 8, { from, through: now }).catch(() => null);
  const ownerIds = [...new Set(tasks.flatMap(task => task.ownerId ? [task.ownerId] : []))];
  const open = tasks.filter(reviewTaskOpen);
  const [names, handoffs, pickups, codConfirmations, payoutFixes] = await Promise.all([
    displayNames(db, ownerIds).catch(() => new Map<string, string>()),
    readSellerReviewHandoffs(db, actor, open),
    readSellerPickupHandoffs(db, actor, returnTo).catch(() => null),
    can(actor, 'order.manage') ? readTodayCodConfirmations(db, returnTo).catch(() => null) : [],
    actor.role === 'super_admin' ? listSellerPayoutFixes(db, actor.id).catch(() => null) : [],
  ]);
  const completedTasks = new Map(native.filter(task => task.status === 'completed').map(task => [task.id, task]));
  const rows = open.map(task => todayReviewTask(task, returnTo, names.get(task.ownerId ?? '') ?? null, handoffs.copy.get(task.id)));
  const workRows = new Map(open.map((task, index) => [task.sourceType + ':' + task.sourceId, index]));
  for (const fix of payoutFixes ?? []) {
    const waiting = fix.waitingFor === 'seller';
    const index = workRows.get('seller_document:' + fix.documentId)
      ?? (fix.protectedCaseId ? workRows.get('protected_change:' + fix.protectedCaseId) : undefined);
    const existing = index === undefined ? undefined : rows[index];
    const row: TodayTask = {
      id: existing?.id ?? 'payout-fix:' + fix.id, section: 'Sellers', type: 'Documents',
      title: waiting ? 'Waiting for seller fix (before payout)' : 'Recheck document',
      context: [fix.sellerName, fix.label].join(' · '),
      startedAt: existing?.startedAt ?? fix.decidedAt, dueAt: waiting ? null : existing?.dueAt ?? null,
      state: waiting ? 'waiting' : 'action',
      ownerId: existing?.ownerId ?? null, ownerName: existing?.ownerName ?? null,
      assignment: waiting ? null : existing?.assignment ?? null,
      href: withAdminReturnTo(fix.staffHref, returnTo),
      action: waiting ? 'Open document' : 'Recheck document',
    };
    if (index === undefined) rows.push(row);
    else rows[index] = row;
  }
  rows.push(...(pickups ?? []), ...(codConfirmations ?? []));
  const emailAddresses = actor.role === 'super_admin' && can(actor, 'email.delivery.manage')
    ? await readFailedAddresses(db, actor.id, now).catch(() => null) : undefined;
  for (const person of emailAddresses?.people ?? []) {
    rows.push({
      id: 'email-address:' + person.key, section: 'Settings', type: 'Email delivery',
      title: 'Couldn’t email ' + person.name + ' · check their email address',
      context: 'Check the address with them by phone.', startedAt: person.failedAt,
      dueAt: null, state: 'action', ownerId: null, ownerName: null, assignment: null,
      href: withAdminReturnTo(person.href ?? '/admin/business-emails?view=needs-you', returnTo), action: person.href ? 'Open record' : 'Open Emails',
    });
  }
  const partial = [
    ...(handoffs.partial ? ['Some seller action details unavailable'] : []),
    ...(pickups === null ? ['Pickup tasks unavailable'] : []),
    ...(codConfirmations === null ? ['COD confirmation tasks unavailable'] : []),
    ...(payoutFixes === null ? ['Seller payout fixes unavailable'] : []),
    ...(emailAddresses === null ? ['Email address follow-up unavailable'] : emailAddresses?.partial ? ['Email follow-up shows the latest records'] : []),
    ...(exceptions === null || unrecorded === null ? ['Parcel follow-up unavailable'] : []),
    ...(exceptions?.partial || unrecorded?.length === 100 ? ['Parcel follow-up shows the latest records'] : []),
    ...(cash === null ? ['Courier cash unavailable'] : []),
    ...(reminders === null ? ['Reminders unavailable'] : reminders.partial ? ['Reminders show the latest notifications'] : []),
    ...(completed === null ? ['Saved review outcomes unavailable'] : []),
  ];
  const money = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' });
  const parcelActions = new Set((recorded ?? []).filter(row => row.status === 'open').map(row => row.jobId));
  for (const row of recorded ?? []) {
    if (row.status !== 'open' && (row.resolvedAt === null || row.resolvedAt < from || row.resolvedAt > now)) continue;
    rows.push({
      id: 'exception:' + row.id, section: 'Orders', type: 'Parcel problems',
      title: row.kind.replaceAll('_', ' '), context: row.nextAction,
      startedAt: row.createdAt, dueAt: null, state: row.status === 'open' ? 'action' : 'done',
      ownerId: row.ownerId, ownerName: row.ownerName, assignment: null,
      href: withAdminReturnTo('/admin/orders/' + encodeURIComponent(row.orderId) + '#exceptions', returnTo), action: 'Open order',
    });
  }
  for (const row of unrecorded ?? []) {
    if (parcelActions.has(row.id)) continue;
    rows.push({
      id: 'parcel:' + row.id, section: 'Orders', type: 'Parcel problems',
      title: row.orderNumber + ' · ' + row.status.replaceAll('_', ' '), context: 'Open the parcel to record the next step.',
      startedAt: row.reportedAt, dueAt: null, state: 'action', ownerId: null, ownerName: null, assignment: null,
      href: withAdminReturnTo('/admin/orders/' + encodeURIComponent(row.orderId) + '#exceptions', returnTo), action: 'Open order',
    });
  }
  for (const row of cash ?? []) {
    const query = new URLSearchParams({ order: row.orderId, parcel: row.jobId });
    rows.push({
      id: 'courier-cash:' + row.jobId, section: 'Money', type: 'Courier cash',
      title: row.courierName ? 'Check cash from ' + row.courierName : 'Check courier cash',
      context: row.orderNumber + ' · ' + money.format(row.amountPaisa / 100) + ' due',
      startedAt: row.updatedAt, dueAt: null, state: 'action', ownerId: null, ownerName: null, ownerKnown: false, assignment: null,
      href: withAdminReturnTo('/admin/payments?' + query + '#cod-parcel-' + encodeURIComponent(row.jobId), returnTo), action: 'Check cash',
    });
  }
  const positions = new Map(rows.map((row, index) => [row.id, index]));
  for (const reminder of reminders?.rows ?? []) {
    const index = positions.get(reminder.id);
    if (index === undefined) {
      rows.push(reminder);
      continue;
    }
    const task = rows[index];
    rows[index] = {
      ...task, state: 'action',
      dueAt: Math.min(task.dueAt ?? Infinity, reminder.dueAt!),
      context: task.state === 'waiting' ? 'Follow-up due · ' + task.context : task.context,
    };
  }
  for (const decision of completed ?? []) {
    const task = completedTasks.get(decision.taskId ?? '');
    if (!task) continue;
    rows.push({
      ...todayReviewTask(task, returnTo, names.get(task.ownerId ?? '') ?? null),
      context: decision.outcome, state: 'done', assignment: null,
    });
  }
  const seen = new Set<string>();
  for (const decision of financeDecisions) {
    const id = decision.family + ':' + decision.sourceId;
    if (seen.has(id) || decision.createdAt < from || decision.createdAt > now || !isCompletedFinanceDecision(decision)) continue;
    seen.add(id);
    const refund = decision.family === 'refund_obligation';
    rows.push({
      id, section: 'Money', type: refund ? 'Refunds' : 'Payouts',
      title: refund ? 'Refund payment recorded' : decision.label ?? 'Payout request ' + decision.action.split('.').at(-1),
      context: 'Outcome recorded ' + todayShortDate.format(decision.createdAt),
      startedAt: decision.createdAt, dueAt: null, state: 'done', ownerId: null, ownerName: null, assignment: null,
      href: decision.href, action: refund ? 'Open refund' : 'Open payout',
    });
  }
  return {
    rows, partial, orders,
    courierCash: cash ? {
      paisa: cash.reduce((sum, row) => sum + row.amountPaisa, 0),
      parcels: cash.length,
    } : cash,
  };
}

export function todayDecisionHistory(review: readonly RecentReviewDecision[] | null, finance: readonly FinanceRecentDecision[]) {
  if (review === null && !finance.length) return null;
  return [
    ...(review ?? []),
    ...finance.map(row => ({
      id: 'finance:' + row.family + ':' + row.id,
      actorId: row.actorId, actorName: null, createdAt: row.createdAt,
      outcome: row.label ?? (row.family === 'refund_obligation' ? 'Refund' : 'Payout request') + ' ' + row.action.replaceAll('_', ' ') + ' recorded',
      sourceType: row.family, sourceId: row.sourceId, href: row.href,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, 8);
}
