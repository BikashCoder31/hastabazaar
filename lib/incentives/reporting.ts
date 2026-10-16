import { parseNepalDateTime } from './presentation';

export const INCENTIVE_REPORT_PAGE_SIZE = 25;
/** Aggregate monetary totals can exceed one transaction's safe-number bound. */
export type ReportMoneyPaisa = number | string;
export interface IncentiveFilters {
  query?: string;
  from?: string;
  to?: string;
  page?: number;
  historyPage?: number;
  customerPage?: number;
}
export interface ReportWindow {
  query: string;
  from: string;
  to: string;
  fromAt: number;
  toAt: number;
  page: number;
  historyPage: number;
  customerPage: number;
}
export function reportWindow(filters: IncentiveFilters = {}): ReportWindow {
  const query = (filters.query ?? '').trim();
  if (query.length > 100)
    throw new RangeError('Search must have at most 100 characters.');
  const date = (value: string | undefined, end = false) => {
    if (!value) return end ? 253402300799999 : 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new RangeError('Choose a valid report date.');
    return parseNepalDateTime(value + 'T00:00') + (end ? 86400000 : 0);
  };
  const fromAt = date(filters.from),
    toAt = date(filters.to, true);
  if (fromAt >= toAt)
    throw new RangeError('The end date must be on or after the start date.');
  const page = filters.page ?? 1,
    historyPage = filters.historyPage ?? 1,
    customerPage = filters.customerPage ?? 1;
  if (
    ![page, historyPage, customerPage].every(
      (value) => Number.isSafeInteger(value) && value >= 1 && value <= 100000,
    )
  )
    throw new RangeError('Choose a valid report page.');
  return {
    query,
    from: filters.from ?? '',
    to: filters.to ?? '',
    fromAt,
    toAt,
    page,
    historyPage,
    customerPage,
  };
}
export function filtersFromParams(
  params: Record<string, string | string[] | undefined>,
): IncentiveFilters {
  const value = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;
  return {
    query: value('query'),
    from: value('from'),
    to: value('to'),
    page: value('page') === undefined ? 1 : Number(value('page')),
    historyPage:
      value('historyPage') === undefined ? 1 : Number(value('historyPage')),
    customerPage:
      value('customerPage') === undefined ? 1 : Number(value('customerPage')),
  };
}
export function reportCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const cell = (value: string | number | null) => {
    let text = value === null ? '' : String(value);
    if (
      typeof value === 'string' &&
      (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
    )
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') +
    '\r\n'
  );
}

export interface IncentiveActor {
  id: string;
  authSubject: string;
}
export interface IncentiveHistoryRow {
  id: string;
  action: string;
  actorName: string;
  reason: string;
  createdAt: number;
  subjectLabel: string;
  changes: { label: string; before: string; after: string }[];
}
export interface PromoActivityRow {
  id: string;
  code: string;
  label: string;
  customerName: string;
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  subtotalPaisa: number;
  discountPaisa: number;
  commissionPaisa: number;
  revision: number;
  createdAt: number;
}
export interface PromoAdminReport {
  observedAt: number;
  totals: {
    campaigns: number;
    active: number;
    drafts: number;
    usedCount: number;
    spentPaisa: ReportMoneyPaisa;
    publishedBudgetPaisa: ReportMoneyPaisa;
    remainingBudgetPaisa: ReportMoneyPaisa;
  };
  activity: PromoActivityRow[];
  activityCount: number;
  filteredDiscountPaisa: ReportMoneyPaisa;
  history: IncentiveHistoryRow[];
  historyCount: number;
  window: ReportWindow;
}
export interface LoyaltyActivityRow {
  id: string;
  kind: 'daily_claim' | 'redemption';
  customerId: string;
  customerName: string;
  customerEmail: string;
  points: number;
  creditPaisa: number;
  revision: number;
  createdAt: number;
  cycle?: LoyaltyRecordedCycle;
}
/** Historical position saved with a successful claim, independent of today's eligibility. */
export interface LoyaltyRecordedCycle {
  day: number;
  number: number;
  graceUsed: boolean;
  graceApplied: boolean;
  resetReason: 'first_claim' | 'missed_day' | 'cycle_complete' | null;
  claimDate: string;
}
export interface LoyaltyCustomerRow {
  id: string;
  name: string;
  email: string;
  balancePoints: number;
  walletBalancePaisa: number;
  claims: number;
  redeemedPoints: number;
  lastActivityAt: number | null;
  recordedCycle?: LoyaltyRecordedCycle;
}
export interface LoyaltyAdminReport {
  observedAt: number;
  totals: {
    customers: number;
    claimedToday: number;
    claims: number;
    redemptions: number;
    issuedPoints: number;
    redeemedPoints: number;
    creditedPaisa: number;
    outstandingPoints: number;
  };
  liveTerms: {
    scheduleBlockedReason?:string|null;
    dailyPoints: number;
    weeklyPoints?: readonly number[];
    graceEnabled?: boolean;
    pointsPerBlock: number;
    creditPaisaPerBlock: number;
    dailyBudgetPoints: number | null;
    lifetimeBudgetPoints: number | null;
    startsAt: number | null;
    endsAt: number | null;
    paused: boolean;
    enabled: boolean;
    revision: number;
  };
  activity: LoyaltyActivityRow[];
  activityCount: number;
  customers: LoyaltyCustomerRow[];
  customerCount: number;
  history: IncentiveHistoryRow[];
  historyCount: number;
  window: ReportWindow;
}
