import {
  marketplaceSummaryRange,
  parseMarketplaceSummaryPeriod,
} from '../../admin/marketplace-period';
import { IncentiveError } from '../../incentives/types';
import type {
  IncentiveActor,
  ReportMoneyPaisa,
} from '../../incentives/reporting';
import { getReferralCampaign } from './wallet';

export const referralStatuses = [
  { value: 'all', label: 'All statuses' },
  { value: 'waiting_delivery', label: 'Waiting for delivery' },
  { value: 'waiting_payment', label: 'Waiting for payment' },
  { value: 'waiting_period', label: 'Waiting period' },
  { value: 'ready', label: 'Ready for customer collection' },
  { value: 'issued', label: 'Reward issued' },
  { value: 'blocked', label: 'Blocked / on hold' },
  { value: 'not_eligible', label: 'Not eligible' },
] as const;
type Status = Exclude<(typeof referralStatuses)[number]['value'], 'all'>;
export const referralProgress = {
  issued: {
    status: 'issued',
    label: 'Reward issued',
    detail:
      'Recorded in the shopping-credit ledger. Later order changes do not rewrite this issued reward.',
  },
  order_cancelled: {
    status: 'not_eligible',
    label: 'Not eligible',
    detail: 'The order was cancelled.',
  },
  order_refunded: {
    status: 'not_eligible',
    label: 'Not eligible',
    detail: 'The order has a full or partial refund.',
  },
  return_completed: {
    status: 'not_eligible',
    label: 'Not eligible',
    detail: 'A return ended in a refund, replacement or return to origin.',
  },
  account_inactive: {
    status: 'blocked',
    label: 'Blocked',
    detail: 'The referrer account is not active.',
  },
  return_open: {
    status: 'blocked',
    label: 'On hold',
    detail:
      'A return needs review. Rejected or cancelled returns do not block earning.',
  },
  complaint_open: {
    status: 'blocked',
    label: 'On hold',
    detail: 'An order complaint is unresolved.',
  },
  delivery_pending: {
    status: 'waiting_delivery',
    label: 'Waiting for delivery',
    detail: 'Delivery and its recorded date must be confirmed.',
  },
  payment_pending: {
    status: 'waiting_payment',
    label: 'Waiting for payment',
    detail: 'The order must be paid and have a captured payment record.',
  },
  cod_unsettled: {
    status: 'waiting_payment',
    label: 'Waiting for payment',
    detail: 'Shipping must be complete and parcel COD money fully remitted.',
  },
  waiting_period: {
    status: 'waiting_period',
    label: 'Waiting period',
    detail: 'The waiting period saved with this order has not fully passed.',
  },
  ready: {
    status: 'ready',
    label: 'Ready for customer collection',
    detail:
      'Currently eligible. Credit is checked and issued when the referrer next opens referrals, their wallet or checkout. This report does not issue it.',
  },
} as const satisfies Record<
  string,
  { status: Status; label: string; detail: string }
>;
export type ReferralReason = keyof typeof referralProgress;
export interface ReferralActivity {
  orderId: string;
  orderNumber: string;
  createdAt: number;
  customerName: string;
  customerEmail: string;
  referrerName: string;
  referrerEmail: string;
  referralCode: string;
  discountPaisa: number;
  rewardPaisa: number;
  waitDays: number;
  eligibleAt: number | null;
  reason: ReferralReason;
}
export interface ReferralReportFilters {
  period?: unknown;
  query?: unknown;
  status?: unknown;
  page?: unknown;
}
const PAGE_SIZE = 25;
const exactSum = (values: number[]): ReportMoneyPaisa => {
  const total = values.reduce((sum, value) => sum + BigInt(value), BigInt(0));
  return total <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(total)
    : total.toString();
};

async function requireSuperAdmin(db: D1Database, actor: IncentiveActor) {
  if (
    !actor ||
    typeof actor.id !== 'string' ||
    typeof actor.authSubject !== 'string' ||
    !actor.id.trim() ||
    !actor.authSubject.trim() ||
    actor.id.length > 191 ||
    actor.authSubject.length > 191 ||
    !(await db
      .prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.auth_subject=? AND u.status='active'
      AND EXISTS(SELECT 1 FROM user_roles roles WHERE roles.user_id=u.id AND roles.role='super_admin')`)
      .bind(actor.id, actor.authSubject)
      .first())
  )
    throw new IncentiveError('unauthorized');
}

/** Only SELECTs: never provision wallets, post rewards or alter accepted offers. */
export async function getReferralAdminReport(
  db: D1Database,
  actor: IncentiveActor,
  filters: ReferralReportFilters = {},
  now = Date.now(),
) {
  await requireSuperAdmin(db, actor);
  const range = marketplaceSummaryRange(
    parseMarketplaceSummaryPeriod(filters.period),
    now,
  );
  const query =
    typeof filters.query === 'string' ? filters.query.trim().slice(0, 100) : '';
  const status =
    referralStatuses.find((option) => option.value === filters.status)?.value ??
    'all';
  const requestedPage =
    typeof filters.page === 'number' || typeof filters.page === 'string'
      ? Number(filters.page)
      : 1;
  const validPage =
    Number.isSafeInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 100000
      ? requestedPage
      : 1;
  // Keep these read-only explanations aligned with releaseReferralRewards, including its strict wait boundary.
  const activity = `WITH activity AS (
    SELECT o.id AS orderId,o.order_number AS orderNumber,r.created_at AS createdAt,
      COALESCE(c.display_name,'Customer') AS customerName,c.email AS customerEmail,
      COALESCE(u.display_name,'Referrer') AS referrerName,u.email AS referrerEmail,w.referral_code AS referralCode,
      o.referral_discount_paisa AS discountPaisa,r.reward_paisa AS rewardPaisa,r.wait_days AS waitDays,
      o.delivered_at+r.wait_days*86400000 AS eligibleAt,
      CASE WHEN EXISTS(SELECT 1 FROM wallet_entries e WHERE e.order_id=r.order_id AND e.user_id=r.referrer_id AND e.kind='referral_reward') THEN 'issued'
      WHEN o.status='cancelled' THEN 'order_cancelled'
      WHEN o.payment_status IN ('refunded','part_refunded') THEN 'order_refunded'
      WHEN EXISTS(SELECT 1 FROM return_requests t JOIN order_items ti ON ti.id=t.order_item_id WHERE ti.order_id=o.id
        AND t.status='resolved' AND t.resolution_outcome IN ('refund','replacement','return_to_origin')) THEN 'return_completed'
      WHEN u.status<>'active' THEN 'account_inactive'
      WHEN EXISTS(SELECT 1 FROM return_requests t JOIN order_items ti ON ti.id=t.order_item_id WHERE ti.order_id=o.id AND t.status NOT IN ('rejected','cancelled')) THEN 'return_open'
      WHEN EXISTS(SELECT 1 FROM complaints c WHERE c.order_id=o.id AND c.status NOT IN ('resolved','closed')) THEN 'complaint_open'
      WHEN o.status<>'delivered' OR o.delivered_at IS NULL THEN 'delivery_pending'
      WHEN o.payment_status<>'paid' OR NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='captured') THEN 'payment_pending'
      WHEN EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=o.id
        AND (j.status NOT IN ('delivered','cancelled') OR p.remitted_paisa<>p.cod_due_paisa)) THEN 'cod_unsettled'
      WHEN o.delivered_at+r.wait_days*86400000>=? THEN 'waiting_period'
      ELSE 'ready' END AS reason,o.status AS orderStatus
    FROM referral_redemptions r JOIN orders o ON o.id=r.order_id JOIN users c ON c.id=r.customer_id
      JOIN users u ON u.id=r.referrer_id JOIN wallet_accounts w ON w.user_id=r.referrer_id
    WHERE r.created_at>=? AND r.created_at<=?
  )`;
  const dateBindings = [now, range.start ?? 0, range.end];
  const reasons = Object.entries(referralProgress)
    .filter(([, progress]) => progress.status === status)
    .map(([reason]) => reason);
  const statusWhere =
    status === 'all'
      ? '1=1'
      : `reason IN (${reasons.map(() => '?').join(',')})`;
  const searchColumns = [
    'orderNumber',
    'customerName',
    'customerEmail',
    'referrerName',
    'referrerEmail',
    'referralCode',
  ];
  const searchWhere = `(${searchColumns.map((column) => `INSTR(LOWER(${column}),?)>0`).join(' OR ')})`;
  const tableWhere = `WHERE ${statusWhere} AND ${searchWhere}`;
  const tableBindings = [
    ...dateBindings,
    ...(status === 'all' ? [] : reasons),
    ...searchColumns.map(() => query.toLowerCase()),
  ];
  const [campaign, accepted, issued, balances, count] = await Promise.all([
    getReferralCampaign(db),
    db
      .prepare(
        `${activity} SELECT discountPaisa,rewardPaisa,reason,orderStatus FROM activity`,
      )
      .bind(...dateBindings)
      .all<{
        discountPaisa: number;
        rewardPaisa: number;
        reason: ReferralReason;
        orderStatus: string;
      }>(),
    db
      .prepare(
        "SELECT amount_paisa AS amount FROM wallet_entries WHERE kind='referral_reward' AND created_at>=? AND created_at<=?",
      )
      .bind(range.start ?? 0, range.end)
      .all<{ amount: number }>(),
    db
      .prepare('SELECT balance_paisa AS balance FROM wallet_accounts')
      .all<{ balance: number }>(),
    db
      .prepare(`${activity} SELECT COUNT(*) AS n FROM activity ${tableWhere}`)
      .bind(...tableBindings)
      .first<{ n: number }>(),
  ]);
  const activityCount = count?.n ?? 0;
  const pages = Math.max(1, Math.ceil(activityCount / PAGE_SIZE));
  const page = Math.min(validPage, pages);
  const rows = await db
    .prepare(
      `${activity} SELECT * FROM activity ${tableWhere} ORDER BY createdAt DESC,orderId DESC LIMIT ? OFFSET ?`,
    )
    .bind(...tableBindings, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<ReferralActivity>();
  await requireSuperAdmin(db, actor);
  return {
    campaign,
    range,
    query,
    status,
    page,
    pages,
    activityCount,
    activity: rows.results,
    totals: {
      discountPaisa: exactSum(
        accepted.results
          .filter((row) => row.orderStatus !== 'cancelled')
          .map((row) => row.discountPaisa),
      ),
      waitingPaisa: exactSum(
        accepted.results
          .filter(
            (row) =>
              ![
                'issued',
                'order_cancelled',
                'order_refunded',
                'return_completed',
                'account_inactive',
              ].includes(row.reason),
          )
          .map((row) => row.rewardPaisa),
      ),
      issuedPaisa: exactSum(issued.results.map((row) => row.amount)),
      balancePaisa: exactSum(balances.results.map((row) => row.balance)),
      referralOrders: accepted.results.length,
    },
  };
}
