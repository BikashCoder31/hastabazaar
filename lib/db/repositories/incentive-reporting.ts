import { IncentiveError } from '../../incentives/types';
import {getLoyaltyState} from './loyalty';
import { nepalRewardDay } from '../../incentives/loyalty-policy';
import { incentiveDate, incentiveMoney } from '../../incentives/presentation';
import {
  INCENTIVE_REPORT_PAGE_SIZE,
  reportWindow,
  type IncentiveActor,
  type IncentiveFilters,
  type IncentiveHistoryRow,
  type PromoAdminReport,
  type PromoActivityRow,
  type LoyaltyAdminReport,
  type LoyaltyActivityRow,
  type LoyaltyCustomerRow,
  type LoyaltyRecordedCycle,
  type ReportMoneyPaisa,
  type ReportWindow,
} from '../../incentives/reporting';

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
        AND EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=u.id AND role.role='super_admin')`)
      .bind(actor.id, actor.authSubject)
      .first())
  ) {
    throw new IncentiveError('unauthorized');
  }
}

const offset = (page: number) => (page - 1) * INCENTIVE_REPORT_PAGE_SIZE;
const substring = (columns: string[]) =>
  `(${columns.map((column) => `INSTR(LOWER(COALESCE(${column},'')),?)>0`).join(' OR ')})`;
const searchValues = (query: string, count: number) =>
  Array<string>(count).fill(query.toLowerCase());
const searchCustomers = substring(['u.display_name', 'u.email', 'u.id']);
const searchPromo = substring([
  'c.code',
  'r.label',
  'u.display_name',
  'u.email',
  'o.order_number',
]);

function stateJson(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const record = parsed as Record<string, unknown>;
    return record.response &&
      typeof record.response === 'object' &&
      !Array.isArray(record.response)
      ? (record.response as Record<string, unknown>)
      : record;
  } catch {
    return {};
  }
}
function term(state: Record<string, unknown>, key: string): unknown {
  const terms = state.terms;
  return terms && typeof terms === 'object' && !Array.isArray(terms)
    ? (terms as Record<string, unknown>)[key]
    : undefined;
}
const textValue = (value: unknown) => {
  if (value === null || value === undefined) return 'None';
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : 'Unknown';
};
const pointValue = (value: unknown) =>
  typeof value === 'number'
    ? `${value.toLocaleString('en-NP')} points`
    : textValue(value);
const moneyValue = (value: unknown) =>
  typeof value === 'number' ? incentiveMoney(value) : textValue(value);
const dateValue = (value: unknown) =>
  typeof value === 'number' ? `${incentiveDate(value)} NPT` : textValue(value);
const percentValue = (value: unknown) =>
  typeof value === 'number' ? `${value / 100}%` : textValue(value);
const boolValue = (value: unknown) =>
  value === true ? 'Yes' : value === false ? 'No' : textValue(value);
type ChangeField = [string, string, (value: unknown) => string];
const promoTermFields: ChangeField[] = [
  ['label', 'Label', textValue],
  ['kind', 'Discount type', textValue],
  ['fixedPaisa', 'Fixed discount', moneyValue],
  ['percentBps', 'Percentage', percentValue],
  ['maxDiscountPaisa', 'Maximum discount', moneyValue],
  ['minimumSubtotalPaisa', 'Minimum subtotal', moneyValue],
  ['budgetPaisa', 'Budget', moneyValue],
  ['totalUseLimit', 'Total use limit', textValue],
  ['perCustomerUseLimit', 'Per customer use limit', textValue],
  ['startsAt', 'Starts', dateValue],
  ['endsAt', 'Ends', dateValue],
];
const loyaltyTermFields: ChangeField[] = [
  ['enabled', 'Enabled', boolValue],
  ['dailyPoints', 'Daily points', pointValue],
  ['pointsPerBlock', 'Points per block', pointValue],
  ['creditPaisaPerBlock', 'Wallet credit per block', moneyValue],
  ['dailyBudgetPoints', 'Daily point budget', pointValue],
  ['lifetimeBudgetPoints', 'Lifetime point budget', pointValue],
  ['startsAt', 'Starts', dateValue],
  ['endsAt', 'Ends', dateValue],
];
const stateFields: ChangeField[] = [
  ['paused', 'Paused', boolValue],
  ['revision', 'Revision', textValue],
  ['publishedRevision', 'Published revision', textValue],
  ['draftRevision', 'Draft revision', textValue],
  ['scheduledRevision','Scheduled revision',textValue],
  ['scheduledFor','Scheduled start · Nepal time',dateValue],
  ['scheduledUnpause','Scheduled activation may unpause earning',boolValue],
  ['scheduleBlockedReason','Scheduled change needs review',textValue],
  ['usedCount', 'Uses consumed', textValue],
  ['spentPaisa', 'Discount consumed', moneyValue],
  ['issuedPoints', 'Points issued', pointValue],
  ['redeemedPoints', 'Points redeemed', pointValue],
  ['creditedPaisa', 'Wallet credit issued', moneyValue],
];
interface HistoryRecord {
  id: string;
  action: string;
  actorName: string;
  reason: string;
  createdAt: number;
  code: string | null;
  label: string | null;
  previousJson: string | null;
  nextJson: string | null;
}
function historyRow(
  row: HistoryRecord,
  kind: 'promo_campaign' | 'loyalty_config',
): IncentiveHistoryRow {
  const previous = stateJson(row.previousJson),
    next = stateJson(row.nextJson);
  const changes: IncentiveHistoryRow['changes'] = [];
  for (const [key, label, format] of kind === 'promo_campaign'
    ? promoTermFields
    : loyaltyTermFields) {
    const before = term(previous, key),
      after = term(next, key);
    if (before !== after)
      changes.push({ label, before: format(before), after: format(after) });
  }
  if (kind === 'loyalty_config') {
    const beforeWeekly = term(previous, 'weeklyPoints'),
      afterWeekly = term(next, 'weeklyPoints');
    for (let day = 0; day < 7; day++) {
      const before = Array.isArray(beforeWeekly)
          ? beforeWeekly[day]
          : undefined,
        after = Array.isArray(afterWeekly) ? afterWeekly[day] : undefined;
      if (before !== after)
        changes.push({
          label: `Day ${day + 1} reward`,
          before: pointValue(before),
          after: pointValue(after),
        });
    }
    const beforeGrace = term(previous, 'graceEnabled') === true,
      afterGrace = term(next, 'graceEnabled') === true;
    if (beforeGrace !== afterGrace)
      changes.push({
        label: 'Grace enabled',
        before: boolValue(beforeGrace),
        after: boolValue(afterGrace),
      });
  }
  for (const [key, label, format] of stateFields) {
    if (previous[key] !== next[key])
      changes.push({
        label,
        before: format(previous[key]),
        after: format(next[key]),
      });
  }
  const code = term(next, 'code') ?? term(previous, 'code') ?? row.code;
  const label = term(next, 'label') ?? term(previous, 'label') ?? row.label;
  return {
    id: row.id,
    action: row.action,
    actorName: row.actorName,
    reason: row.reason,
    createdAt: row.createdAt,
    subjectLabel:
      kind === 'promo_campaign'
        ? [code, label]
            .filter(
              (value): value is string =>
                typeof value === 'string' && value.length > 0,
            )
            .join(' · ') || 'Promo campaign'
        : 'Daily loyalty',
    changes,
  };
}
/** Audit search is deliberately global within the report subject; Nepal dates still apply. */
async function history(
  db: D1Database,
  kind: 'promo_campaign' | 'loyalty_config',
  window: ReportWindow,
) {
  const [count, rows] = await Promise.all([
    db
      .prepare(
        'SELECT COUNT(*) n FROM audit_logs WHERE subject_type=? AND created_at>=? AND created_at<?',
      )
      .bind(kind, window.fromAt, window.toAt)
      .first<{ n: number }>(),
    db
      .prepare(`SELECT l.id,l.action,COALESCE(u.display_name,CASE WHEN l.action='loyalty.schedule_activated' THEN 'Automatic scheduled change' ELSE 'Staff member' END) AS actorName,l.reason,l.created_at AS createdAt,
      c.code,r.label,l.previous_json AS previousJson,l.next_json AS nextJson
      FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id
      LEFT JOIN promo_campaigns c ON l.subject_type='promo_campaign' AND c.id=l.subject_id
      LEFT JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=COALESCE(c.current_revision,c.draft_revision)
      WHERE l.subject_type=? AND l.created_at>=? AND l.created_at<?
      ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`)
      .bind(
        kind,
        window.fromAt,
        window.toAt,
        INCENTIVE_REPORT_PAGE_SIZE,
        offset(window.historyPage),
      )
      .all<HistoryRecord>(),
  ]);
  return {
    history: rows.results.map((row) => historyRow(row, kind)),
    historyCount: count?.n ?? 0,
  };
}

const maximumReportNumber = BigInt(Number.MAX_SAFE_INTEGER);
function reportMoney(value: bigint): ReportMoneyPaisa {
  return value <= maximumReportNumber ? Number(value) : value.toString();
}
interface PromoCampaignTotalsRow {
  active: number;
  draft: number;
  usedCount: number;
  spentPaisa: number;
  publishedBudgetPaisa: number;
}
/** Each stored amount is safe; cross-campaign sums need unbounded integer arithmetic. */
function promoTotals(
  rows: PromoCampaignTotalsRow[],
): PromoAdminReport['totals'] {
  let active = 0,
    drafts = 0,
    usedCount = 0;
  let spentPaisa = BigInt(0),
    publishedBudgetPaisa = BigInt(0),
    remainingBudgetPaisa = BigInt(0);
  for (const row of rows) {
    active += row.active;
    drafts += row.draft;
    usedCount += row.usedCount;
    const spent = BigInt(row.spentPaisa),
      budget = BigInt(row.publishedBudgetPaisa);
    spentPaisa += spent;
    publishedBudgetPaisa += budget;
    if (budget > spent) remainingBudgetPaisa += budget - spent;
  }
  return {
    campaigns: rows.length,
    active,
    drafts,
    usedCount,
    spentPaisa: reportMoney(spentPaisa),
    publishedBudgetPaisa: reportMoney(publishedBudgetPaisa),
    remainingBudgetPaisa: reportMoney(remainingBudgetPaisa),
  };
}

export async function getPromoAdminReport(
  db: D1Database,
  actor: IncentiveActor,
  filters: IncentiveFilters = {},
  now: number = Date.now(),
): Promise<PromoAdminReport> {
  await requireSuperAdmin(db, actor);
  const window = reportWindow(filters);
  nepalRewardDay(now);
  const activityFrom = `FROM promo_redemptions d JOIN promo_campaigns c ON c.id=d.campaign_id
    JOIN promo_revisions r ON r.campaign_id=d.campaign_id AND r.revision=d.revision
    JOIN users u ON u.id=d.customer_id JOIN orders o ON o.id=d.order_id`;
  const activityWhere = `WHERE d.created_at>=? AND d.created_at<? AND ${searchPromo}`;
  const bindings = [
    window.fromAt,
    window.toAt,
    ...searchValues(window.query, 5),
  ];
  const [campaigns, filteredDiscounts, activity, audit] = await Promise.all([
    db
      .prepare(`SELECT CASE WHEN c.status='published' AND c.paused=0 AND r.starts_at<=? AND r.ends_at>?
        AND c.used_count<r.total_use_limit AND c.spent_paisa<r.budget_paisa THEN 1 ELSE 0 END AS active,
      CASE WHEN c.draft_revision IS NOT NULL THEN 1 ELSE 0 END AS draft,
      c.used_count AS usedCount,c.spent_paisa AS spentPaisa,
      COALESCE(CASE WHEN c.status='published' THEN r.budget_paisa ELSE 0 END,0) AS publishedBudgetPaisa
      FROM promo_campaigns c LEFT JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision`)
      .bind(now, now)
      .all<PromoCampaignTotalsRow>(),
    db
      .prepare(
        `SELECT d.discount_paisa AS discountPaisa ${activityFrom} ${activityWhere}`,
      )
      .bind(...bindings)
      .all<{ discountPaisa: number }>(),
    db
      .prepare(`SELECT d.id,c.code,r.label,u.display_name AS customerName,u.email AS customerEmail,
      o.id AS orderId,o.order_number AS orderNumber,o.status AS orderStatus,o.payment_status AS paymentStatus,
      d.subtotal_paisa AS subtotalPaisa,d.discount_paisa AS discountPaisa,
      COALESCE((SELECT SUM(i.commission_paisa) FROM order_items i WHERE i.order_id=d.order_id),0) AS commissionPaisa,
      d.revision,d.created_at AS createdAt ${activityFrom} ${activityWhere}
      ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, INCENTIVE_REPORT_PAGE_SIZE, offset(window.page))
      .all<PromoActivityRow>(),
    history(db, 'promo_campaign', window),
  ]);
  await requireSuperAdmin(db, actor);
  const filteredDiscountPaisa = filteredDiscounts.results.reduce(
    (sum, row) => sum + BigInt(row.discountPaisa),
    BigInt(0),
  );
  return {
    observedAt: now,
    totals: promoTotals(campaigns.results),
    activity: activity.results,
    activityCount: filteredDiscounts.results.length,
    filteredDiscountPaisa: reportMoney(filteredDiscountPaisa),
    ...audit,
    window,
  };
}

interface LoyaltyLiveRow {
  scheduleBlockedReason:string|null;
  revision: number;
  enabled: number;
  paused: number;
  dailyPoints: number;
  weeklyPointsJson: string | null;
  graceEnabled: number;
  pointsPerBlock: number;
  creditPaisaPerBlock: number;
  dailyBudgetPoints: number | null;
  lifetimeBudgetPoints: number | null;
  startsAt: number | null;
  endsAt: number | null;
  issuedPoints: number;
  redeemedPoints: number;
  creditedPaisa: number;
}
interface StoredLoyaltyCycle {
  cycleDay: number | null;
  cycleNumber: number | null;
  graceUsed: number | null;
  graceApplied: number | null;
  cycleResetReason: LoyaltyRecordedCycle['resetReason'];
  claimDate: string | null;
}
function recordedCycle(
  row: StoredLoyaltyCycle,
): LoyaltyRecordedCycle | undefined {
  if (
    row.cycleDay === null ||
    row.cycleNumber === null ||
    row.claimDate === null
  )
    return undefined;
  return {
    day: row.cycleDay,
    number: row.cycleNumber,
    graceUsed: row.graceUsed === 1,
    graceApplied: row.graceApplied === 1,
    resetReason: row.cycleResetReason,
    claimDate: row.claimDate,
  };
}
function reportCycleRow<T extends StoredLoyaltyCycle>(row: T) {
  const {
    cycleDay: _day,
    cycleNumber: _number,
    graceUsed: _used,
    graceApplied: _applied,
    cycleResetReason: _reason,
    claimDate: _date,
    ...rest
  } = row;
  return rest;
}
export async function getLoyaltyAdminReport(
  db: D1Database,
  actor: IncentiveActor,
  filters: IncentiveFilters = {},
  now: number = Date.now(),
): Promise<LoyaltyAdminReport> {
  await requireSuperAdmin(db, actor);
  const window = reportWindow(filters),
    today = nepalRewardDay(now).localDate;
  const activityUnion = `SELECT id,user_id,'daily_claim' AS kind,awarded_points AS points,0 AS credit_paisa,revision,created_at,
    cycle_day,cycle_number,grace_used,grace_applied,cycle_reset_reason,local_date AS claim_date FROM loyalty_daily_claims
    UNION ALL SELECT id,user_id,'redemption' AS kind,-points AS points,credit_paisa,revision,created_at,
    NULL,NULL,NULL,NULL,NULL,NULL FROM loyalty_redemptions`;
  const activityFrom = `FROM (${activityUnion}) a JOIN users u ON u.id=a.user_id`;
  const activityWhere = `WHERE a.created_at>=? AND a.created_at<? AND ${searchCustomers}`;
  const bindings = [
    window.fromAt,
    window.toAt,
    ...searchValues(window.query, 3),
  ];
  const customerFrom =
    'FROM loyalty_accounts a JOIN users u ON u.id=a.user_id LEFT JOIN wallet_accounts w ON w.user_id=u.id';
  const latestClaimJoin = `LEFT JOIN loyalty_daily_claims latest ON latest.id=(SELECT d.id FROM loyalty_daily_claims d WHERE d.user_id=u.id ORDER BY d.local_date DESC,d.created_at DESC,d.id DESC LIMIT 1)`;
  const [
    live,
    counts,
    activityCount,
    activity,
    customerCount,
    customers,
    audit,
  ] = await Promise.all([
    getLoyaltyState(db,actor.id,now,actor.authSubject,{publishedOnly:true}).then((state):LoyaltyLiveRow=>({
      revision:state.publishedRevision,enabled:Number(state.terms.enabled),paused:Number(state.paused),dailyPoints:state.terms.dailyPoints,
      weeklyPointsJson:state.terms.weeklyPoints?JSON.stringify(state.terms.weeklyPoints):null,graceEnabled:Number(state.terms.graceEnabled??false),
      pointsPerBlock:state.lockedDenomination?.pointsPerBlock??state.terms.pointsPerBlock,creditPaisaPerBlock:state.lockedDenomination?.creditPaisaPerBlock??state.terms.creditPaisaPerBlock,
      dailyBudgetPoints:state.terms.dailyBudgetPoints,lifetimeBudgetPoints:state.terms.lifetimeBudgetPoints,startsAt:state.terms.startsAt,endsAt:state.terms.endsAt,
      issuedPoints:state.issuedPoints,redeemedPoints:state.redeemedPoints,creditedPaisa:state.creditedPaisa,scheduleBlockedReason:state.scheduleBlockedReason,
    })),
    db
      .prepare(`SELECT (SELECT COUNT(*) FROM loyalty_accounts) AS customers,
      (SELECT COUNT(DISTINCT user_id) FROM loyalty_daily_claims WHERE local_date=?) AS claimedToday,
      (SELECT COUNT(*) FROM loyalty_daily_claims) AS claims,(SELECT COUNT(*) FROM loyalty_redemptions) AS redemptions`)
      .bind(today)
      .first<{
        customers: number;
        claimedToday: number;
        claims: number;
        redemptions: number;
      }>(),
    db
      .prepare(`SELECT COUNT(*) n ${activityFrom} ${activityWhere}`)
      .bind(...bindings)
      .first<{ n: number }>(),
    db
      .prepare(`SELECT a.id,a.kind,u.id AS customerId,u.display_name AS customerName,u.email AS customerEmail,
      a.points,a.credit_paisa AS creditPaisa,a.revision,a.created_at AS createdAt,
      a.cycle_day AS cycleDay,a.cycle_number AS cycleNumber,a.grace_used AS graceUsed,
      a.grace_applied AS graceApplied,a.cycle_reset_reason AS cycleResetReason,a.claim_date AS claimDate ${activityFrom} ${activityWhere}
      ORDER BY a.created_at DESC,a.id DESC,a.kind DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, INCENTIVE_REPORT_PAGE_SIZE, offset(window.page))
      .all<LoyaltyActivityRow & StoredLoyaltyCycle>(),
    db
      .prepare(`SELECT COUNT(*) n ${customerFrom} WHERE ${searchCustomers}`)
      .bind(...searchValues(window.query, 3))
      .first<{ n: number }>(),
    db
      .prepare(`SELECT u.id,u.display_name AS name,u.email,a.balance_points AS balancePoints,
      COALESCE(w.balance_paisa,0) AS walletBalancePaisa,
      (SELECT COUNT(*) FROM loyalty_daily_claims d WHERE d.user_id=u.id) AS claims,
      COALESCE((SELECT SUM(d.points) FROM loyalty_redemptions d WHERE d.user_id=u.id),0) AS redeemedPoints,
      (SELECT MAX(e.created_at) FROM loyalty_points_entries e WHERE e.user_id=u.id) AS lastActivityAt,
      latest.cycle_day AS cycleDay,latest.cycle_number AS cycleNumber,latest.grace_used AS graceUsed,
      latest.grace_applied AS graceApplied,latest.cycle_reset_reason AS cycleResetReason,latest.local_date AS claimDate
      ${customerFrom} ${latestClaimJoin} WHERE ${searchCustomers} ORDER BY LOWER(u.display_name),u.id LIMIT ? OFFSET ?`)
      .bind(
        ...searchValues(window.query, 3),
        INCENTIVE_REPORT_PAGE_SIZE,
        offset(window.customerPage),
      )
      .all<LoyaltyCustomerRow & StoredLoyaltyCycle>(),
    history(db, 'loyalty_config', window),
  ]);
  await requireSuperAdmin(db, actor);
  if (!live || !counts) throw new IncentiveError('unavailable');
  const {
    issuedPoints,
    redeemedPoints,
    creditedPaisa,
    weeklyPointsJson,
    graceEnabled,
    ...terms
  } = live;
  return {
    observedAt: now,
    totals: {
      ...counts,
      issuedPoints,
      redeemedPoints,
      creditedPaisa,
      outstandingPoints: issuedPoints - redeemedPoints,
    },
    liveTerms: {
      ...terms,
      enabled: live.enabled === 1,
      paused: live.paused === 1,
      ...(weeklyPointsJson === null
        ? {}
        : {
            weeklyPoints: JSON.parse(weeklyPointsJson) as number[],
            graceEnabled: graceEnabled === 1,
          }),
    },
    activity: activity.results.map((row) => {
      const cycle = recordedCycle(row);
      return { ...reportCycleRow(row), ...(cycle ? { cycle } : {}) };
    }),
    activityCount: activityCount?.n ?? 0,
    customers: customers.results.map((row) => {
      const cycle = recordedCycle(row);
      return {
        ...reportCycleRow(row),
        ...(cycle ? { recordedCycle: cycle } : {}),
      };
    }),
    customerCount: customerCount?.n ?? 0,
    ...audit,
    window,
  };
}
