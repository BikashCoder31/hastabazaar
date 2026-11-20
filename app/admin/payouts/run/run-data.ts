import type { StaffUser } from '@/lib/auth/staff';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { PayoutConflictError, preparePayoutOperationStatements, standardLedgerEligibility } from '@/lib/db/repositories/payouts';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { digestFormRequest, isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { payoutRequestReadySql, sellerPayoutRequestReadiness } from '@/lib/payments/payout-request-readiness';
import { protectedGuard } from '@/lib/sellers/protected-change-policy';
import { payoutDate } from '../workspace-data';
import { payoutRunCalendar } from './run-calendar';

export const payoutRunForm = 'staff.payout-2';
const requestPrefix = 'payout-run-';
const groupLength = requestPrefix.length + 36;
const requestLength = groupLength + 1 + 32;

export type PayoutRunRow = {
  id: string;
  reference: string;
  seller: string;
  amountPaisa: number;
  orderCount: number;
  bankLabel: string;
  blocker: string | null;
  review: string | null;
};

export type PayoutRunData = {
  rows: PayoutRunRow[];
  calendar: ReturnType<typeof payoutRunCalendar>;
  holdDays: number;
  lastRun: { at: number; count: number; amountPaisa: number } | null;
};

type RunSource = {
  id: string;
  reference: string;
  seller: string;
  sellerId: string;
  status: string;
  amountPaisa: number;
  updatedAt: number;
  destinationMatches: number;
  beneficiaryVersionId: string | null;
  identityRevision: number | null;
  bankRevision: number | null;
  bankChange: number;
  protectedBlock: number;
  orderCount: number;
  openReturnCount: number;
  missingDelivery: number;
  availableAt: number | null;
  reservedPaisa: number | null;
  invalidSources: number;
};

function runSourceSql(exactPayout: boolean) {
  return `SELECT p.id, p.payout_number AS reference, s.trading_name AS seller, s.id AS sellerId,
      p.status, p.amount_paisa AS amountPaisa, p.updated_at AS updatedAt,
      COALESCE(p.destination_reference=s.payout_account_reference, 0) AS destinationMatches,
      CASE WHEN substr(p.destination_reference,1,12)='BENEFICIARY:' THEN substr(p.destination_reference,13) END AS beneficiaryVersionId,
      revisions.identity_revision AS identityRevision, revisions.bank_revision AS bankRevision,
      EXISTS(SELECT 1 FROM seller_capability_holds h JOIN seller_protected_change_cases c ON c.id=h.case_id
        WHERE h.seller_id=s.id AND h.capability='payouts' AND h.released_at IS NULL AND c.kind='bank') AS bankChange,
      EXISTS(SELECT 1 FROM seller_payout_review_blocks b WHERE b.payout_model='registered' AND b.payout_id=p.id) AS protectedBlock,
      COUNT(DISTINCT o.id) AS orderCount,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM return_requests r WHERE r.order_item_id=i.id AND r.status NOT IN ('rejected','resolved'))
        THEN 1 ELSE 0 END) AS openReturnCount,
      SUM(CASE WHEN e.order_item_id IS NOT NULL AND
        (i.id IS NULL OR o.id IS NULL OR o.status<>'delivered' OR i.fulfillment_status<>'delivered') THEN 1 ELSE 0 END) AS missingDelivery,
      MAX(e.available_at) AS availableAt, SUM(e.amount_paisa) AS reservedPaisa,
      SUM(CASE WHEN e.id IS NOT NULL AND
        (e.seller_id<>s.id OR (i.id IS NOT NULL AND i.seller_id<>s.id) OR NOT (${standardLedgerEligibility('e')}))
        THEN 1 ELSE 0 END) AS invalidSources
    FROM payouts p
    JOIN seller_profiles s ON s.id=p.seller_id
    LEFT JOIN seller_protected_revisions revisions ON revisions.seller_id=s.id
    LEFT JOIN payout_entries pe ON pe.payout_id=p.id AND pe.released_at IS NULL
    LEFT JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
    LEFT JOIN order_items i ON i.id=e.order_item_id
    LEFT JOIN orders o ON o.id=i.order_id
    WHERE p.status IN ('prepared','scheduled') AND s.user_id<>? ${exactPayout ? 'AND p.id=?' : ''}
    GROUP BY p.id, p.payout_number, s.trading_name, s.id, p.status, p.amount_paisa, p.created_at, p.updated_at,
      p.destination_reference, s.payout_account_reference, revisions.identity_revision, revisions.bank_revision`;
}

function sourceBlocker(source: RunSource, now: number): string | null {
  if (!source.orderCount || source.missingDelivery)
    return 'Review the delivery records for these payout items.';
  if (source.availableAt !== null && source.availableAt > now)
    return 'In delivery hold until ' + payoutDate(source.availableAt, true) + '.';
  if (source.openReturnCount)
    return 'These earnings include an item with an open return.';
  if (source.bankChange) return 'Bank change pending.';
  if (source.protectedBlock) return 'A protected identity or bank review is holding this payout. Resolve the original review first.';
  if (!source.destinationMatches) return 'Review the verified beneficiary and current identity before payouts.';
  if (source.availableAt === null || source.amountPaisa <= 0 || source.reservedPaisa !== source.amountPaisa || source.invalidSources)
    return 'Reconcile changed earnings, refund offsets and the exact original reserved entries before paying.';
  return null;
}

function reviewProof(source: RunSource, beneficiaryVersionId: string) {
  return digestFormRequest([source.id, source.status, source.updatedAt, source.amountPaisa,
    source.orderCount, source.availableAt, source.identityRevision, source.bankRevision, beneficiaryVersionId]);
}

export async function readPayoutRunRows(db: D1Database, actorId: string, now: number, exactPayoutId?: string) {
  const sources = (await db.prepare(runSourceSql(exactPayoutId !== undefined) + ' ORDER BY p.created_at, p.id')
    .bind(actorId, ...(exactPayoutId !== undefined ? [exactPayoutId] : [])).all<RunSource>()).results;
  const bankBySeller = new Map<string, ReturnType<typeof sellerPayoutRequestReadiness>>();
  async function readBank(sellerId: string) {
    let bank = bankBySeller.get(sellerId);
    if (!bank) {
      bank = sellerPayoutRequestReadiness(db, sellerId, now);
      bankBySeller.set(sellerId, bank);
    }
    return bank;
  }
  return Promise.all(sources.map(async (source): Promise<PayoutRunRow> => {
    const blocker = sourceBlocker(source, now);
    const common = {
      id: source.id, reference: source.reference, seller: source.seller,
      amountPaisa: source.amountPaisa, orderCount: source.orderCount,
    };
    if (blocker) return { ...common, blocker, bankLabel: '', review: null };
    const bank = await readBank(source.sellerId);
    if (!bank.ready || !bank.beneficiaryVersionId || bank.beneficiaryVersionId !== source.beneficiaryVersionId)
      return { ...common, blocker: bank.blocker ?? 'Review the verified beneficiary and current identity before payouts.', bankLabel: '', review: null };
    return {
      ...common, blocker: null, bankLabel: bank.maskedBeneficiary ?? 'Verified bank account',
      review: await reviewProof(source, bank.beneficiaryVersionId),
    };
  }));
}

async function readLastPayoutRun(db: D1Database, actorId: string) {
  const nativeRunEvents = `FROM payout_events e JOIN payouts p ON p.id=e.payout_id
    JOIN seller_profiles s ON s.id=p.seller_id WHERE s.user_id<>? AND e.action='approve'
      AND substr(e.request_id,1,${requestPrefix.length})=? AND length(e.request_id)=${requestLength}`;
  return db.prepare(`SELECT MAX(e.created_at) AS at, COUNT(*) AS count, SUM(p.amount_paisa) AS amountPaisa
    ${nativeRunEvents} AND substr(e.request_id,1,${groupLength})=(
      SELECT substr(e.request_id,1,${groupLength}) ${nativeRunEvents} ORDER BY e.created_at DESC, e.id DESC LIMIT 1
    ) GROUP BY substr(e.request_id,1,${groupLength})`)
    .bind(actorId, requestPrefix, actorId, requestPrefix).first<PayoutRunData['lastRun'] & object>();
}

export async function readPayoutRun(db: D1Database, actorId: string, now = Date.now()): Promise<PayoutRunData> {
  const [rows, weekday, cutoff, timezone, hold, lastRun] = await Promise.all([
    readPayoutRunRows(db, actorId, now),
    getEffectiveBusinessSetting(db, 'payout_processing_weekday', now),
    getEffectiveBusinessSetting(db, 'payout_cutoff_local_time', now),
    getEffectiveBusinessSetting(db, 'payout_timezone', now),
    getEffectiveBusinessSetting(db, 'seller_delivery_hold_days', now),
    readLastPayoutRun(db, actorId),
  ]);
  return {
    rows, calendar: payoutRunCalendar(now, weekday.value, cutoff.value, timezone.value),
    holdDays: hold.value, lastRun,
  };
}

export type PayoutRunApproval = {
  payoutId: string;
  review: string;
  runId: string;
  note: string;
  formVersion: unknown;
  customAnswers: unknown;
};

export async function approveRunPayout(db: D1Database, staff: Pick<StaffUser, 'id' | 'role'>, input: PayoutRunApproval) {
  const now = Date.now();
  const { payoutId, runId, review, note } = input;
  const suffix = (await digestFormRequest([staff.id, payoutId, review])).slice(0, 32);
  const requestId = requestPrefix + runId + '-' + suffix;
  const form = await validateSellerFormSubmission(db, payoutRunForm, input.formVersion, input.customAnswers, requestId);
  const prepare = () => preparePayoutOperationStatements(db, {
    payoutId, actorId: staff.id, actorRole: staff.role, action: 'approve', note, requestId, now,
    form: { formId: payoutRunForm, requestId, versionId: form.versionId, answers: form.answers },
  });
  const prior = await db.prepare('SELECT 1 FROM payout_events WHERE request_id=? LIMIT 1').bind(requestId).first();
  if (prior) {
    await prepare(); // Native replay verifies the unchanged action and form proof.
    return;
  }
  const source = await db.prepare(runSourceSql(true)).bind(staff.id, payoutId).first<RunSource>();
  if (!source) throw new PayoutConflictError('This payout is no longer ready to approve.');
  const blocker = sourceBlocker(source, now);
  if (blocker) throw new PayoutConflictError(blocker);
  const bank = await sellerPayoutRequestReadiness(db, source.sellerId, now);
  if (!bank.beneficiaryVersionId || bank.beneficiaryVersionId !== source.beneficiaryVersionId) throw new PayoutConflictError(bank.blocker ?? 'Review the verified beneficiary and current identity before payouts.');
  if (review !== await reviewProof(source, bank.beneficiaryVersionId))
    throw new PayoutConflictError('The payout changed after review. Refresh the run and review it again.');
  const statements = await prepare();
  if (!statements.length) return; // Another identical request committed while preparing.
  try {
    await db.batch([
      ...protectedGuard(db, `EXISTS(SELECT 1 FROM (${runSourceSql(true)}) checked
        WHERE checked.sellerId=? AND checked.status=? AND checked.updatedAt=? AND checked.amountPaisa=?
          AND checked.destinationMatches=1 AND checked.beneficiaryVersionId=? AND checked.identityRevision=? AND checked.bankRevision=?
          AND checked.bankChange=0 AND checked.protectedBlock=0 AND checked.orderCount=?
          AND checked.openReturnCount=0 AND checked.missingDelivery=0 AND checked.availableAt=?
          AND checked.reservedPaisa=checked.amountPaisa AND checked.invalidSources=0)`,
      [staff.id, payoutId, source.sellerId, source.status, source.updatedAt, source.amountPaisa,
        source.beneficiaryVersionId, source.identityRevision, source.bankRevision, source.orderCount, source.availableAt]),
      ...protectedGuard(db, payoutRequestReadySql(now), [source.sellerId]),
      ...statements,
    ]);
  } catch (error) {
    if (await db.prepare('SELECT 1 FROM payout_events WHERE request_id=? LIMIT 1').bind(requestId).first()) {
      await prepare();
      return;
    }
    if (await isValidatedFormVersionStale(db, payoutRunForm, form.versionId))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    if (error instanceof Error && /CHECK constraint failed: valid|CONSTRAINT.*(?:operation_transaction_guards|staff_permission_guards)/i.test(error.message))
      throw new PayoutConflictError('The payout or your authority changed during approval. Refresh the run and review it again.');
    throw error;
  }
}
