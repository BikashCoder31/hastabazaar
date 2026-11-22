import type { PayoutCandidate, PayoutRequestRow, PayoutRow } from '@/lib/db/repositories/payouts';

export const payoutStages = [
  { id: 'earning', label: 'Earning', color: '#815406' },
  { id: 'ready', label: 'Ready to approve', color: '#A8232E' },
  { id: 'sent', label: 'Sent to bank', color: '#284788' },
  { id: 'paid', label: 'Paid this month', color: '#236548' },
] as const;

export type PayoutStage = (typeof payoutStages)[number]['id'];

export type PayoutBoardRow = {
  id: string;
  sellerId: string;
  sellerName: string;
  reference: string;
  amountPaisa: number;
  at: number | null;
  status: string;
  badge: string;
};

export type PayoutFilters = {
  q: string;
  seller: string;
  month: string;
  minimum: string;
};

const zone = 'Asia/Kathmandu';
const money = new Intl.NumberFormat('en-NP', {
  style: 'currency', currency: 'NPR', currencyDisplay: 'code', minimumFractionDigits: 0,
});
const shortDate = new Intl.DateTimeFormat('en-NP', { month: 'short', day: 'numeric', timeZone: zone });
const dateTime = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone });
const monthDate = new Intl.DateTimeFormat('en-NP', { month: 'long', year: 'numeric', timeZone: zone });
const monthKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: zone });

export function payoutAmount(paisa: number) {
  return money.format(paisa / 100).replace('\u00a0', ' ');
}

export function payoutDate(at: number, withTime = false) {
  return (withTime ? dateTime : shortDate).format(at);
}

export function payoutMonth(at: number) {
  return monthKey.format(at);
}

export function payoutMonthLabel(month: string) {
  return monthDate.format(new Date(month + '-01T12:00:00+05:45'));
}

const stageDetails = {
  earning: 'Earnings building up for future payouts',
  ready: 'Waiting for your approval',
  sent: 'Record the actual bank outcome',
  paid: 'Bank payment confirmed',
};

export const payoutStageDetails = stageDetails;

export function nativePayoutRow(payout: PayoutRow): PayoutBoardRow {
  const badges = {
    prepared: 'Ready', scheduled: 'Ready', approved: 'Approved', processing: 'Instruction in progress',
    paid: 'Paid', failed: 'Transfer failed', rejected: 'Rejected', reversed: 'Reversed',
  };
  return {
    id: 'payout:' + payout.id, sellerId: payout.sellerId, sellerName: payout.tradingName,
    reference: payout.payoutNumber, amountPaisa: payout.amountPaisa, status: payout.status,
    at: payout.paidAt ?? payout.processedAt ?? payout.approvedAt ?? payout.createdAt,
    badge: badges[payout.status],
  };
}

export function payoutBoardGroups(input: {
  candidates: readonly PayoutCandidate[];
  held: readonly { sellerId: string; tradingName: string; amountPaisa: number }[];
  payouts: readonly PayoutRow[];
  requests: readonly PayoutRequestRow[];
  now: number;
}) {
  const submitted = input.requests.filter(request => request.status === 'submitted');
  const requestedSellers = new Set(submitted.map(request => request.sellerId));
  const candidatesBySeller = new Map(input.candidates.map(candidate => [candidate.sellerId, candidate]));
  const groups: Record<PayoutStage, PayoutBoardRow[]> = { earning: [], ready: [], sent: [], paid: [] };
  const history: PayoutBoardRow[] = [];
  const approved: PayoutBoardRow[] = [];

  for (const request of submitted) {
    const balance = candidatesBySeller.get(request.sellerId);
    groups.ready.push({
      id: 'request:' + request.id, sellerId: request.sellerId, sellerName: request.tradingName,
      reference: 'Seller request', amountPaisa: balance?.amountPaisa ?? request.availableAmountSnapshotPaisa,
      at: request.createdAt, status: request.status, badge: balance ? 'Requested' : 'Needs review',
    });
  }
  const heldBySeller = new Map(input.held.map(balance => [balance.sellerId, balance]));
  const earningSellers = new Map([...input.held, ...input.candidates].map(row => [row.sellerId, row.tradingName]));
  for (const [sellerId, sellerName] of earningSellers) {
    const available = requestedSellers.has(sellerId) ? 0 : (candidatesBySeller.get(sellerId)?.amountPaisa ?? 0);
    const held = heldBySeller.get(sellerId)?.amountPaisa ?? 0;
    if (available + held <= 0) continue;
    groups.earning.push({
      id: 'earning:' + sellerId, sellerId, sellerName,
      reference: 'Seller earnings', amountPaisa: available + held, at: null, status: 'earning',
      badge: available ? 'Available earnings' : 'In delivery hold',
    });
  }
  for (const payout of input.payouts) {
    const row = nativePayoutRow(payout);
    history.push(row);
    if (payout.status === 'prepared' || payout.status === 'scheduled') groups.ready.push(row);
    if (payout.status === 'approved') approved.push(row);
    if (payout.status === 'processing') groups.sent.push(row);
    if (payout.status === 'paid' && payout.paidAt !== null && payoutMonth(payout.paidAt) === payoutMonth(input.now)) groups.paid.push(row);
  }
  return { groups, history, approved };
}

export function matchingPayouts(rows: readonly PayoutBoardRow[], filters: PayoutFilters) {
  const query = filters.q.toLocaleLowerCase('en-NP');
  const minimum = filters.minimum ? Number(filters.minimum) * 100 : 0;
  return rows.filter(row =>
    (!query || (row.sellerName + ' ' + row.reference).toLocaleLowerCase('en-NP').includes(query))
    && (!filters.seller || row.sellerId === filters.seller)
    && (!filters.month || (row.at !== null && payoutMonth(row.at) === filters.month))
    && (!filters.minimum || row.amountPaisa >= minimum),
  );
}
