import { marketplaceSummaryRange } from '@/lib/admin/marketplace-period';
import { checkoutCommitClock } from '@/lib/checkout/commit-policy-guards';
import { staffReadGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { paidManualReleaseChecks } from './manual-payment-lifecycle';
import { ManualPaymentError } from './manual-receipts';

export type BankTransferLane = 'check' | 'waiting' | 'release' | 'problems' | 'done';
export type BankTransferCounts = Record<BankTransferLane, number>;

type BankClaim = {
  id: string;
  amountPaisa: number;
  paymentDate: string;
  bankReference: string | null;
  submittedAt: number;
  state: string;
  revision: number;
  note: string;
  evidenceIds: string[];
};

export type BankTransferOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  itemName: string | null;
  sellerName: string | null;
  itemCount: number;
  sellerCount: number;
  revision: number;
  orderStatus: string;
  closureReason: string | null;
  closedAt: number | null;
  paidAt: number | null;
  releasedAt: number | null;
  cutoffAt: number;
  deadlineAt: number;
  payablePaisa: number;
  receivedPaisa: number;
  accountVersionId: string;
  releaseOrderReady: number | null;
  releaseItemsReady: number | null;
  releaseWithoutHold: number | null;
  lane: BankTransferLane | 'history';
  claim: BankClaim | null;
};

type QueueRow = Omit<BankTransferOrder, 'claim'> & {
  claimId: string | null;
  claimAmount: number;
  claimDate: string;
  claimReference: string | null;
  claimSubmittedAt: number;
  claimState: string;
  claimRevision: number;
  claimNote: string;
  claimEvidence: string;
};

type UnmatchedCredit = { id: string; receiptId: string; reference: string; bankAt: number; count: number };
export type BankTransferQueue = { now: number; counts: BankTransferCounts; orders: BankTransferOrder[]; unmatched: UnmatchedCredit[] };

class BankTransferAccessError extends ManualPaymentError {
  constructor(message: string) { super(message, 403); }
}
const financePermissions = ['payment.receipt.verify'] as const;

function queueQuery(db: D1Database) {
  const checks = paidManualReleaseChecks(db);
  return `WITH transfers AS (
    SELECT w.order_id AS id, o.order_number AS orderNumber, o.customer_id AS customerId,
      u.display_name AS customerName, o.status AS orderStatus, w.revision, w.closed_at AS closedAt, w.closure_reason AS closureReason,
      w.paid_at AS paidAt, w.released_at AS releasedAt, w.cutoff_at AS cutoffAt, w.deadline_at AS deadlineAt,
      b.payable_paisa AS payablePaisa, b.received_paisa AS receivedPaisa, i.account_version_id AS accountVersionId,
      c.id AS claimId, c.claimed_amount_paisa AS claimAmount, c.payment_date AS claimDate,
      c.bank_reference AS claimReference, c.first_submitted_at AS claimSubmittedAt, c.current_state AS claimState,
      c.revision AS claimRevision, c.note AS claimNote, c.evidence_ids_json AS claimEvidence,
      CASE WHEN w.paid_at IS NOT NULL AND w.released_at IS NULL THEN (${checks.order}) ELSE NULL END AS releaseOrderReady,
      CASE WHEN w.paid_at IS NOT NULL AND w.released_at IS NULL THEN (${checks.items}) ELSE NULL END AS releaseItemsReady,
      CASE WHEN w.paid_at IS NOT NULL AND w.released_at IS NULL THEN (${checks.noHold}) ELSE NULL END AS releaseWithoutHold,
      EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=w.order_id
        AND e.state<>'resolved' AND e.kind NOT IN ('fulfillment_release','cod_remittance')) AS hasProblem,
      EXISTS(SELECT 1 FROM company_payment_account_current a WHERE a.version_id=i.account_version_id) AS currentAccount
    FROM manual_payment_cutoffs w JOIN orders o ON o.id=w.order_id JOIN users u ON u.id=o.customer_id
    JOIN manual_payment_balances b ON b.order_id=w.order_id JOIN company_payment_instructions i ON i.order_id=w.order_id
    LEFT JOIN manual_payment_claims c ON c.order_id=w.order_id
  ), queue AS (
    SELECT t.*,
      CASE WHEN hasProblem THEN 'problems'
        WHEN releasedAt IS NOT NULL OR closedAt IS NOT NULL OR orderStatus='cancelled'
          THEN CASE WHEN COALESCE(closedAt,releasedAt)>=? THEN 'done' ELSE 'history' END
        WHEN paidAt IS NOT NULL THEN CASE WHEN releaseOrderReady AND releaseItemsReady AND releaseWithoutHold
          AND receivedPaisa>=payablePaisa THEN 'release' ELSE 'problems' END
        WHEN cutoffAt<=? OR receivedPaisa>0 OR NOT currentAccount OR claimState='rejected' THEN 'problems'
        WHEN claimState IN ('submitted','clarified') THEN 'check'
        ELSE 'waiting' END AS lane
    FROM transfers t
  )`;
}

const unmatchedReceipts = `FROM manual_payment_exceptions e
 JOIN company_money_receipts r ON r.id=e.receipt_id
 WHERE e.order_id IS NULL AND r.kind='bank_credit' AND e.kind IN ('unallocated_credit','currency_mismatch')
 AND e.state<>'resolved'`;

async function readQueueTime(db: D1Database) {
  const row = await db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`).first<{ now: number }>();
  const now = Number(row?.now);
  if (!Number.isSafeInteger(now)) throw new Error('Could not read the bank transfer clock.');
  return { now, today: marketplaceSummaryRange('today', now).start! };
}

async function laneCounts(db: D1Database, query: string, today: number, now: number) {
  const [orders, loose] = await Promise.all([
    db.prepare(query + " SELECT lane, COUNT(*) AS count FROM queue WHERE lane<>'history' GROUP BY lane")
      .bind(today, now).all<{ lane: BankTransferLane; count: number }>(),
    db.prepare('SELECT COUNT(*) AS count ' + unmatchedReceipts).first<{ count: number }>(),
  ]);
  const counts: BankTransferCounts = { check: 0, waiting: 0, release: 0, problems: 0, done: 0 };
  for (const { lane, count } of orders.results) counts[lane] = Number(count);
  counts.problems += Number(loose?.count ?? 0);
  return counts;
}

export async function readBankTransferWorkCount(db: D1Database, actorId: string) {
  await staffReadGuard(db, actorId, financePermissions, BankTransferAccessError);
  const { now, today } = await readQueueTime(db);
  const { check, release, problems } = await laneCounts(db, queueQuery(db), today, now);
  await staffReadGuard(db, actorId, financePermissions, BankTransferAccessError);
  return check + release + problems;
}

export async function readBankTransferQueue(db: D1Database, actorId: string, exactOrder?: string): Promise<BankTransferQueue> {
  await staffReadGuard(db, actorId, financePermissions, BankTransferAccessError);
  const { now, today } = await readQueueTime(db);
  const query = queueQuery(db);
  const [counts, rows, unmatched] = await Promise.all([
    laneCounts(db, query, today, now),
    db.prepare(query + `, displayed AS (
      SELECT q.*, ROW_NUMBER() OVER (PARTITION BY lane ORDER BY deadlineAt,id) AS position
      FROM queue q WHERE ${exactOrder ? '(q.id=? OR q.orderNumber=?)' : "q.lane<>'history'"}
    ) SELECT q.*,
      (SELECT p.product_name_snapshot FROM order_items p WHERE p.order_id=q.id AND p.fulfillment_status<>'cancelled' ORDER BY p.id LIMIT 1) AS itemName,
      (SELECT p.seller_name_snapshot FROM order_items p WHERE p.order_id=q.id AND p.fulfillment_status<>'cancelled' ORDER BY p.id LIMIT 1) AS sellerName,
      (SELECT COUNT(*) FROM order_items p WHERE p.order_id=q.id AND p.fulfillment_status<>'cancelled') AS itemCount,
      (SELECT COUNT(DISTINCT p.seller_id) FROM order_items p WHERE p.order_id=q.id AND p.fulfillment_status<>'cancelled') AS sellerCount
      FROM displayed q WHERE q.position<=50
      ORDER BY q.deadlineAt, q.id`).bind(today, now, ...exactOrder ? [exactOrder, exactOrder] : []).all<QueueRow>(),
    db.prepare(`SELECT e.id, r.id AS receiptId, r.transaction_identity AS reference, r.bank_at AS bankAt, COUNT(*) OVER() AS count
      ${unmatchedReceipts} ORDER BY r.bank_at,e.id LIMIT 100`).all<UnmatchedCredit>(),
  ]);
  await staffReadGuard(db, actorId, financePermissions, BankTransferAccessError);
  const orders = rows.results.map(({
    claimId, claimAmount, claimDate, claimReference, claimSubmittedAt, claimState, claimRevision, claimNote, claimEvidence, ...row
  }): BankTransferOrder => ({
    ...row,
    claim: claimId ? {
      id: claimId, amountPaisa: claimAmount, paymentDate: claimDate, bankReference: claimReference,
      submittedAt: claimSubmittedAt, state: claimState, revision: claimRevision, note: claimNote,
      evidenceIds: JSON.parse(claimEvidence) as string[],
    } : null,
  }));
  return { now, counts, orders, unmatched: unmatched.results };
}
