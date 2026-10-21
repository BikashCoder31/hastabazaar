export interface CommissionFilters {
  from?: string;
  to?: string;
  query?: string;
  sellerId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface CommissionTotals {
  /** Original checkout snapshots, including cancelled/refunded lines; not earned revenue. */
  originalStandardPaisa: number;
  originalWaivedPaisa: number;
  earnedPaisa: number;
  reversedPaisa: number;
  netPaisa: number;
  pendingPaisa: number;
  missingEntries: number;
}

export interface CommissionOrderRow extends CommissionTotals {
  /** Names from the immutable campaign revisions referenced by these items. */
  campaignNames?: string[];
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  placedAt: number;
  eligibleBasePaisa: number;
  originalCommissionPaisa: number;
  /** Recorded standard rates, before any checkout waiver. */
  minRateBps: number;
  maxRateBps: number;
  itemCount: number;
  status: 'earned' | 'pending' | 'cancelled';
  paymentStatus: string;
  orderStatus: string;
}

export interface CommissionReport {
  totals: CommissionTotals;
  rows: CommissionOrderRow[];
  totalRows: number;
  page: number;
  pageSize: number;
  sellers: { id: string; name: string }[];
}

export const commissionMoney = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
export const commissionDate = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
