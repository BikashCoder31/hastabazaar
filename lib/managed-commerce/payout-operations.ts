import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import {payoutRegistrationBlocker,payoutRegistrationGuards} from '../payments/payout-registration-readiness';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import { currentFormVersionGuards } from '../forms/native-version';
import { formAnswerSourceSql, formAnswerSnapshotMatches } from '../forms/answer-proof';
import { digestFormRequest } from '../forms/submission';
import type { FormAnswerSnapshot } from '../forms/types';
import { assertSimulationAllowed, SIMULATED_RECORD_LABEL, type RuntimeEnvironment } from '../staging/environment';
import { ManagedSettlementError } from './settlement-errors';
import { managedSettlementReadySql } from './settlement-readiness';
import {managedRefundFactsColumns,managedRefundReconciled,managedRefundFactsGuard,type ManagedRefundFacts} from './refund-readiness';
import { protectedPayoutGuards } from '../sellers/protected-change-policy';
import {protectedPayoutReplacementStatements} from '../sellers/protected-payout-disposition';

export type ManagedFinanceForm = { formId: string; versionId: string; answers: FormAnswerSnapshot };
export type ManagedFinanceContext = {
  actorId: string; requestId: string; now: number; reason?: string; environment: RuntimeEnvironment; form?: ManagedFinanceForm;
};
export interface ManagedPayoutReceipt { payoutId: string; requestId: string; status: string; simulation: true }
export interface ManagedFinanceSummary {
  calculatedPaisa: number; earnedPaisa: number; heldPaisa: number; eligiblePaisa: number; paidPaisa: number; balancePaisa: number;
  reservedPaisa: number; payablePaisa: number; blockedPaisa: number; refundOffsetPaisa: number; needsReconciliation: boolean;
}
const simulationEntitlementSql="EXISTS(SELECT 1 FROM managed_commercial_snapshots simulation_original WHERE simulation_original.id=e.snapshot_id AND simulation_original.record_kind='simulation')";
const activeStatuses = "('prepared','approved','processing','failed')";

/** Paid allocations are deducted once; permanent legacy links remain readable. */
export function managedEntitlementNetSql(entitlement = 'e') {
  if (!/^[a-z_]+$/.test(entitlement)) throw new Error('Invalid entitlement alias.');
  return `COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=${entitlement}.id),0)
    -COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.entitlement_id=${entitlement}.id AND a.disposition='paid'),0)
    -COALESCE((SELECT SUM(x.amount_paisa) FROM managed_payout_entries pe JOIN managed_payouts p ON p.id=pe.payout_id
      JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=${entitlement}.id AND p.status='paid'
      AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=${entitlement}.id)),0)`;
}
const sellerBalanceSql = `COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=? AND ${simulationEntitlementSql}),0)
  -COALESCE((SELECT SUM(amount_paisa) FROM managed_payouts WHERE seller_id=? AND record_kind='simulation' AND status='paid'),0)`;
function guard(db: D1Database, predicate: string, values: (string | number | null)[]) {
  const id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
function context(input: ManagedFinanceContext, expectedForm: string) {
  assertSimulationAllowed(input.environment);
  if (!Number.isSafeInteger(input.now) || input.now <= 0 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/.test(input.requestId))
    throw new ManagedSettlementError('A valid server time and payment request reference are required.');
  const reason = input.reason?.trim() ?? 'Reviewed local simulated managed payment';
  if (reason.length < 8 || reason.length > 1000 || (input.form && (!input.reason || input.form.formId !== expectedForm || input.form.answers.formId !== expectedForm)))
    throw new ManagedSettlementError('Review the financial form and add a reason of 8–1,000 characters.');
  return reason;
}
async function balance(db: D1Database, sellerId: string) {
  const row = await db.prepare(`SELECT ${sellerBalanceSql} AS amount`).bind(sellerId, sellerId).first<{ amount: number }>();
  const amount = Number(row?.amount ?? 0);
  if (!Number.isSafeInteger(amount)) throw new ManagedSettlementError('The maker balance needs financial review.');
  return amount;
}
async function receiving(db: D1Database, sellerId: string, destination?: string) {
  const row = await db.prepare('SELECT payout_beneficiary_reference AS reference FROM seller_participation_profiles WHERE seller_id=?')
    .bind(sellerId).first<{ reference: string | null }>();
  const reference = row?.reference?.trim();
  if (!reference || reference.length < 3 || reference.length > 191 || destination !== undefined && destination.trim() !== reference)
    throw new ManagedSettlementError('Use the maker’s current reviewed receiving reference.');
  return reference;
}
function formGuards(db: D1Database, input: ManagedFinanceContext) {
  if (!input.form) return [];
  return currentFormVersionGuards(db, input.form.formId, input.form.versionId);
}
function answer(db: D1Database, input: ManagedFinanceContext, subjectType: string, subjectId: string) {
  return input.form ? [buildFormAnswerInsert(db, { formId: input.form.formId, requestId: input.requestId,
    versionId: input.form.versionId, subjectType, subjectId, actorId: input.actorId, answers: input.form.answers, now: input.now })] : [];
}
function audit(db: D1Database, input: ManagedFinanceContext, action: string, subjectType: string, subjectId: string, reason: string, next: object) {
  return db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), input.actorId, action, subjectType, subjectId, reason, JSON.stringify(next), input.requestId, input.now);
}
async function replay(db: D1Database, input: ManagedFinanceContext, action: string, digest: string, subjectType: string, subjectId?: string) {
  const row = await db.prepare('SELECT actor_id AS actorId,action,subject_type AS subjectType,subject_id AS subjectId,next_json AS json FROM audit_logs WHERE request_id=?')
    .bind(input.requestId).first<{ actorId: string; action: string; subjectType: string; subjectId: string; json: string }>();
  if (!row) return null;
  const receipt = JSON.parse(row.json) as { catalogDigest: string; status?: string; released?: number };
  if (row.actorId !== input.actorId || row.action !== action || row.subjectType !== subjectType ||
    subjectId !== undefined && row.subjectId !== subjectId || receipt.catalogDigest !== digest)
    throw new ManagedSettlementError('This request reference was already used for different payment details.');
  if (input.form) {
    const proof = await db.prepare(`SELECT answers_json AS answersJson FROM ${formAnswerSourceSql(db)} original_answers
      WHERE form_id=? AND request_id=? AND actor_id=? AND config_version_id=? AND subject_type=? AND subject_id=?`)
      .bind(input.form.formId, input.requestId, input.actorId, input.form.versionId, subjectType, row.subjectId).first<{answersJson:string}>();
    if (!proof || !formAnswerSnapshotMatches(proof.answersJson, input.form.answers))
      throw new ManagedSettlementError('The original payment form receipt needs review.');
  }
  const permission = action === 'managed_payout.paid' ? 'payout.mark_paid'
    : action === 'managed_payout.approved' || action === 'managed_payout.cancelled' ? 'payout.approve' : 'payout.prepare';
  await staffMutationGuard(db, input.actorId, permission, ManagedSettlementError,
    input.form || action !== 'managed_payout.prepared' ? 'super_admin' : undefined);
  const parent = subjectType === 'seller'
    ? await db.prepare('SELECT 1 FROM seller_profiles WHERE id=?').bind(row.subjectId).first()
    : await db.prepare('SELECT 1 FROM managed_payouts WHERE id=?').bind(row.subjectId).first();
  if (!parent) throw new ManagedSettlementError('The original payment parent needs review.');
  return { ...receipt, subjectId: row.subjectId };
}
function digest(input: ManagedFinanceContext, values: object, reason: string) {
  return digestFormRequest({ ...values, reason, form: input.form ?? null });
}
async function atomic(db: D1Database, statements: D1PreparedStatement[]) {
  try { return await db.batch(statements); }
  catch { throw new ManagedSettlementError('The balance, case, receiving reference, authority or form changed. Reconcile or reload before retrying.'); }
}
type Position = ManagedRefundFacts & { id: string; amount: number; version: number; ready: number };
async function positions(db: D1Database, sellerId: string, now: number): Promise<Position[]> {
  const result = await db.prepare(`SELECT e.id,e.version,${managedEntitlementNetSql()} AS amount,${managedRefundFactsColumns()},
    CASE WHEN ${managedSettlementReadySql('e', now)} AND e.status IN ('eligible','part_paid','paid') AND e.eligible_at<=? THEN 1 ELSE 0 END AS ready
    FROM managed_entitlements e WHERE e.seller_id=? AND ${simulationEntitlementSql} ORDER BY e.id`).bind(now, sellerId).all<Position>();
  for (const row of result.results) if (!Number.isSafeInteger(Number(row.amount))) throw new ManagedSettlementError('An earning amount needs financial review.');
  return result.results.map(row => ({ ...row, amount: Number(row.amount),ready:row.ready&&managedRefundReconciled(row)?1:0 }));
}

export async function getManagedBlockedEarnings(db:D1Database,sellerId:string,now:number) {
  return (await positions(db,sellerId,now)).filter(row=>row.amount!==0&&!row.ready);
}

export async function getManagedFinanceSummary(db: D1Database, sellerId: string, now = Date.now()): Promise<ManagedFinanceSummary> {
  const [all, currentBalance, totals] = await Promise.all([
    positions(db, sellerId, now), balance(db, sellerId),
    db.prepare(`SELECT COALESCE(SUM(calculated_paisa),0) AS calculated,
      COALESCE(SUM(CASE WHEN earned_at IS NOT NULL THEN calculated_paisa ELSE 0 END),0) AS earned,
      COALESCE(SUM(CASE WHEN status='held' THEN (${managedEntitlementNetSql()}) ELSE 0 END),0) AS held,
      COALESCE((SELECT SUM(amount_paisa) FROM managed_payouts WHERE seller_id=? AND record_kind='simulation' AND status='paid'),0) AS paid,
      COALESCE((SELECT SUM(amount_paisa) FROM managed_payouts WHERE seller_id=? AND record_kind='simulation' AND status IN ${activeStatuses}),0) AS reserved
      FROM managed_entitlements e WHERE seller_id=? AND ${simulationEntitlementSql}`).bind(sellerId, sellerId, sellerId)
      .first<{ calculated: number; earned: number; held: number; paid: number; reserved: number }>(),
  ]);
  const reservedPaisa = Number(totals?.reserved ?? 0);
  const needsReconciliation = all.reduce((sum, row) => sum + row.amount, 0) !== currentBalance;
  const available = all.filter(row => row.ready).reduce((sum, row) => sum + row.amount, 0);
  const payablePaisa = reservedPaisa || needsReconciliation || all.some(row => row.amount < 0 && !row.ready) ? 0 : Math.max(0, available);
  return { calculatedPaisa: Number(totals?.calculated ?? 0), earnedPaisa: Number(totals?.earned ?? 0), heldPaisa: Number(totals?.held ?? 0),
    paidPaisa: Number(totals?.paid ?? 0), balancePaisa: currentBalance, reservedPaisa, payablePaisa, eligiblePaisa: payablePaisa,
    blockedPaisa: all.filter(row => !row.ready && row.amount > 0).reduce((sum, row) => sum + row.amount, 0),
    refundOffsetPaisa: -all.filter(row => row.amount < 0).reduce((sum, row) => sum + row.amount, 0), needsReconciliation };
}
function positionGuards(db: D1Database, sellerId: string, selected: Position[], now: number) {
  return selected.flatMap(row => guard(db, `EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND e.seller_id=?
    AND e.version=? AND (${managedEntitlementNetSql()})=? AND ${managedSettlementReadySql('e', now)} AND ${managedRefundFactsGuard(row)}
    AND e.status IN ('eligible','part_paid','paid') AND e.eligible_at<=?)`, [row.id, sellerId, row.version, row.amount, now]));
}

function previewFingerprint(sellerId: string, reference: string | null, all: Position[], currentBalance: number) {
  return digestFormRequest({ sellerId, receivingReference: reference, positions: all, balancePaisa: currentBalance });
}
export async function getManagedPayoutPreview(db: D1Database, sellerId: string, now = Date.now()) {
  const [all, currentBalance, receiver, pending] = await Promise.all([
    positions(db, sellerId, now), balance(db, sellerId),
    db.prepare('SELECT payout_beneficiary_reference AS reference FROM seller_participation_profiles WHERE seller_id=?')
      .bind(sellerId).first<{ reference: string | null }>(),
    db.prepare(`SELECT 1 FROM managed_payouts WHERE seller_id=? AND record_kind='simulation' AND status IN ${activeStatuses}`).bind(sellerId).first(),
  ]);
  const reference = receiver?.reference?.trim() ?? null;
  const needsReview = all.reduce((sum, row) => sum + row.amount, 0) !== currentBalance || all.some(row => row.amount < 0 && !row.ready);
  const amountPaisa = pending || needsReview || !reference ? 0 : Math.max(0, all.filter(row => row.ready).reduce((sum, row) => sum + row.amount, 0));
  return { amountPaisa, balancePaisa: currentBalance, receivingReference: reference, needsReview,
    hasUnpaidReservation: Boolean(pending), snapshotDigest: await previewFingerprint(sellerId, reference, all, currentBalance) };
}

export async function prepareManagedPayout(db: D1Database, input: ManagedFinanceContext & {
  sellerId: string; destinationReference: string; scheduledFor: number; expectedAmountPaisa?: number; expectedSnapshot?: string;
}): Promise<string> {
  const reason = context(input, 'staff.managed-payout-preparation');
  const authority = await staffMutationGuard(db, input.actorId, 'payout.prepare', ManagedSettlementError, input.form ? 'super_admin' : undefined);
  const intent = await digest(input, { sellerId: input.sellerId, destinationReference: input.destinationReference, scheduledFor: input.scheduledFor,
    expectedAmountPaisa: input.expectedAmountPaisa ?? null, expectedSnapshot: input.expectedSnapshot ?? null }, reason);
  const previous = await replay(db, input, 'managed_payout.prepared', intent, 'managed_payout');
  if (previous) return previous.subjectId;
  if (!Number.isSafeInteger(input.scheduledFor) || input.scheduledFor < 0) throw new ManagedSettlementError('Choose a valid Nepal-time payment processing date.');
  const reference = await receiving(db, input.sellerId, input.destinationReference);
  const blocker=await payoutRegistrationBlocker(db,input.sellerId,'managed',input.now,reference);
  if(blocker)throw new ManagedSettlementError(blocker);
  if (await db.prepare(`SELECT 1 FROM managed_payouts WHERE seller_id=? AND record_kind='simulation' AND status IN ${activeStatuses}`).bind(input.sellerId).first())
    throw new ManagedSettlementError('Complete or cancel the maker’s current unpaid reservation first.');
  const all = await positions(db, input.sellerId, input.now);
  const currentBalance = await balance(db, input.sellerId);
  if (all.reduce((sum, row) => sum + row.amount, 0) !== currentBalance) throw new ManagedSettlementError('Legacy paid amounts need reconciliation before another payment.');
  if (all.some(row => row.amount < 0 && !row.ready)) throw new ManagedSettlementError('A refund offset or related case needs reconciliation.');
  const selected = all.filter(row => row.amount !== 0 && row.ready);
  const amount = selected.reduce((sum, row) => sum + row.amount, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ManagedSettlementError('A positive, unblocked eligible maker balance is required.');
  if ((input.form && (!Number.isSafeInteger(input.expectedAmountPaisa) || !/^[a-f0-9]{64}$/.test(input.expectedSnapshot ?? ''))) ||
    (input.expectedAmountPaisa !== undefined && input.expectedAmountPaisa !== amount) ||
    (input.expectedSnapshot !== undefined && input.expectedSnapshot !== await previewFingerprint(input.sellerId, reference, all, currentBalance)))
    throw new ManagedSettlementError('The maker balance preview changed. Reload and review it before preparing payment.');
  const id = crypto.randomUUID(), status = authority.role === 'super_admin' ? 'approved' : 'prepared';
  await atomic(db, [
    ...payoutRegistrationGuards(db,input.sellerId,'managed',reference),
    db.prepare('UPDATE managed_entitlements SET updated_at=updated_at WHERE seller_id=?').bind(input.sellerId),
    ...authority.statements, ...formGuards(db, input),...protectedPayoutGuards(db,input.sellerId,input.actorId,{model:'managed'}),
    ...guard(db, `(${sellerBalanceSql})=? AND NOT EXISTS(SELECT 1 FROM managed_payouts WHERE seller_id=? AND record_kind='simulation' AND status IN ${activeStatuses})
      AND EXISTS(SELECT 1 FROM seller_participation_profiles WHERE seller_id=? AND payout_beneficiary_reference=?)`,
      [input.sellerId, input.sellerId, currentBalance, input.sellerId, input.sellerId, reference]),
    ...positionGuards(db, input.sellerId, selected, input.now),
    db.prepare(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,
      prepared_by,approved_by,scheduled_for,request_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, input.sellerId, `SIM-MP-${input.now}-${id.slice(0,8)}`, amount, status, reference, SIMULATED_RECORD_LABEL,
        input.actorId, status === 'approved' ? input.actorId : null, input.scheduledFor, input.requestId, input.now, input.now),
    ...selected.map(row => db.prepare(`INSERT INTO managed_payout_allocations(payout_id,entitlement_id,amount_paisa,disposition,created_at,request_id,actor_id)
      VALUES(?,?,?,'reserved',?,?,?)`).bind(id, row.id, row.amount, input.now, input.requestId, input.actorId)),
    audit(db, input, 'managed_payout.prepared', 'managed_payout', id, reason, { catalogDigest: intent, status, amountPaisa: amount, simulationLabel: SIMULATED_RECORD_LABEL }),
    ...answer(db, input, 'managed_payout', id),
    ...protectedPayoutReplacementStatements(db,{model:'managed',payoutId:id,sellerId:input.sellerId,actorId:input.actorId,now:input.now}),
  ]);
  return id;
}

async function payout(db: D1Database, payoutId: string) {
  const row = await db.prepare(`SELECT id,seller_id AS sellerId,status,amount_paisa AS amount,updated_at AS updatedAt,
    scheduled_for AS scheduledFor,destination_reference AS destination FROM managed_payouts WHERE id=? AND record_kind='simulation'`)
    .bind(payoutId).first<{ id: string; sellerId: string; status: string; amount: number; updatedAt: number; scheduledFor: number; destination: string }>();
  if (!row) throw new ManagedSettlementError('Managed payout not found.');
  if (!Number.isSafeInteger(Number(row.amount)) || Number(row.amount) <= 0) throw new ManagedSettlementError('The recorded payment amount needs financial review.');
  return row;
}
async function reservation(db: D1Database, row: Awaited<ReturnType<typeof payout>>) {
  const result = await db.prepare(`SELECT entitlement_id AS id,amount_paisa AS amount FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved'
    UNION ALL SELECT x.entitlement_id AS id,SUM(x.amount_paisa) AS amount FROM managed_payout_entries pe
      JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=?
      AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=x.entitlement_id)
      GROUP BY x.entitlement_id`).bind(row.id, row.id).all<{ id: string; amount: number }>();
  if (!result.results.length || result.results.reduce((sum, entry) => sum + Number(entry.amount), 0) !== row.amount)
    throw new ManagedSettlementError('The payment reservation needs reconciliation with its original earnings.');
  return result.results;
}

export async function transitionManagedPayout(db: D1Database, input: ManagedFinanceContext & {
  payoutId: string; action: 'approve' | 'mark_paid'; providerReference?: string; expectedStatus?: string;
}): Promise<ManagedPayoutReceipt> {
  const reason = context(input, 'staff.managed-payout-action');
  requireExecutionPacket(input.action);
  const authority = await staffMutationGuard(db, input.actorId, input.action === 'approve' ? 'payout.approve' : 'payout.mark_paid', ManagedSettlementError, 'super_admin');
  const action = input.action === 'approve' ? 'managed_payout.approved' : 'managed_payout.paid';
  const intent = await digest(input, { payoutId: input.payoutId, action: input.action, providerReference: input.providerReference ?? null, expectedStatus: input.expectedStatus ?? null }, reason);
  const previous = await replay(db, input, action, intent, 'managed_payout', input.payoutId);
  if (previous) return { payoutId: input.payoutId, requestId: input.requestId, status: previous.status!, simulation: true };
  const row = await payout(db, input.payoutId);
  if(input.action==='approve'){
    const blocker=await payoutRegistrationBlocker(db,row.sellerId,'managed',input.now,row.destination);
    if(blocker)throw new ManagedSettlementError(blocker);
  }
  const required = input.action === 'approve' ? 'prepared' : 'approved', next = input.action === 'approve' ? 'approved' : 'paid';
  if (row.status !== required || input.expectedStatus !== undefined && input.expectedStatus !== row.status)
    throw new ManagedSettlementError('The payment status changed. Reload before continuing.');
  const provider = input.providerReference?.trim() ?? null;
  if (input.action === 'mark_paid' && (!provider || provider.length < 3 || provider.length > 191 || row.scheduledFor > input.now))
    throw new ManagedSettlementError('Wait until the processing date and record the simulated payment reference.');
  await receiving(db, row.sellerId, row.destination);
  const allocated = await reservation(db, row);
  const all = await positions(db, row.sellerId, input.now);
  const selected = allocated.map(entry => {
    const current = all.find(position => position.id === entry.id);
    if (!current?.ready || current.amount !== Number(entry.amount)) throw new ManagedSettlementError('The reserved balance changed or a refund/case needs reconciliation. Cancel the unpaid reservation before preparing the correct amount.');
    return current;
  });
  const currentBalance = await balance(db, row.sellerId);
  const reservedIds = new Set(selected.map(entry=>entry.id));
  if (all.reduce((sum,entry)=>sum+entry.amount,0)!==currentBalance || currentBalance<row.amount ||
    all.some(entry=>entry.amount<0&&!reservedIds.has(entry.id)))
    throw new ManagedSettlementError('A refund offset or the maker balance changed. Cancel the unpaid reservation and prepare the reconciled amount.');
  const stateGuards = guard(db, `EXISTS(SELECT 1 FROM managed_payouts WHERE id=? AND seller_id=? AND status=? AND updated_at=? AND amount_paisa=?)
    AND (${sellerBalanceSql})=? AND EXISTS(SELECT 1 FROM seller_participation_profiles WHERE seller_id=? AND payout_beneficiary_reference=?)`,
    [row.id, row.sellerId, required, row.updatedAt, row.amount, row.sellerId, row.sellerId, currentBalance, row.sellerId, row.destination]);
  const reservationGuards = guard(db, `(COALESCE((SELECT SUM(amount_paisa) FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved'),0)
    +COALESCE((SELECT SUM(x.amount_paisa) FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
      WHERE pe.payout_id=? AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=x.entitlement_id)),0))=?
    AND ((SELECT COUNT(*) FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved')
      +(SELECT COUNT(DISTINCT x.entitlement_id) FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
        WHERE pe.payout_id=? AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=x.entitlement_id)))=?`,
    [row.id, row.id, row.amount, row.id, row.id, selected.length]);
  // Recheck every seller-wide debt, including an old paid sale refunded after
  // preparation. A concurrent new earning can mask that debt in the total.
  const offsetGuards = guard(db, `NOT EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.seller_id=? AND ${simulationEntitlementSql}
    AND (${managedEntitlementNetSql()})<0
    AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=? AND a.entitlement_id=e.id AND a.disposition='reserved')
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
      WHERE pe.payout_id=? AND x.entitlement_id=e.id
      AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=e.id)))
    AND COALESCE((SELECT SUM(${managedEntitlementNetSql()}) FROM managed_entitlements e WHERE e.seller_id=? AND ${simulationEntitlementSql}),0)=(${sellerBalanceSql})`,
    [row.sellerId,row.id,row.id,row.sellerId,row.sellerId,row.sellerId]);
  await atomic(db, [
    ...(input.action==='approve'?payoutRegistrationGuards(db,row.sellerId,'managed',row.destination):[]),
    db.prepare('UPDATE managed_entitlements SET updated_at=updated_at WHERE seller_id=?').bind(row.sellerId),
    ...authority.statements, ...formGuards(db, input), ...stateGuards, ...reservationGuards, ...offsetGuards, ...positionGuards(db, row.sellerId, selected, input.now),
    ...protectedPayoutGuards(db,row.sellerId,input.actorId,{id:row.id,model:'managed'}),
    db.prepare(`UPDATE managed_payouts SET status=?,approved_by=CASE WHEN ?='approved' THEN ? ELSE approved_by END,
      provider_reference=CASE WHEN ?='paid' THEN ? ELSE provider_reference END,paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END,updated_at=? WHERE id=?`)
      .bind(next, next, input.actorId, next, provider, next, input.now, input.now, row.id),
    ...(next === 'paid' ? [
      db.prepare("UPDATE managed_payout_allocations SET disposition='paid',terminal_at=? WHERE payout_id=? AND disposition='reserved'").bind(input.now, row.id),
      ...selected.filter(entry => entry.amount > 0).map(entry => db.prepare("UPDATE managed_entitlements SET status='paid',paid_at=?,version=version+1,updated_at=? WHERE id=?")
        .bind(input.now, input.now, entry.id)),
    ] : []),
    audit(db, input, action, 'managed_payout', row.id, reason, { catalogDigest: intent, status: next, providerReference: provider }),
    ...answer(db, input, 'managed_payout', row.id),
  ]);
  return { payoutId: row.id, requestId: input.requestId, status: next, simulation: true };
}

export async function cancelManagedPayout(db: D1Database, input: ManagedFinanceContext & { payoutId: string; expectedStatus?: string }): Promise<ManagedPayoutReceipt> {
  const reason = context(input, 'staff.managed-payout-action');
  const authority = await staffMutationGuard(db, input.actorId, 'payout.approve', ManagedSettlementError, 'super_admin');
  const intent = await digest(input, { payoutId: input.payoutId, action: 'cancel', expectedStatus: input.expectedStatus ?? null }, reason);
  const previous = await replay(db, input, 'managed_payout.cancelled', intent, 'managed_payout', input.payoutId);
  if (previous) return { payoutId: input.payoutId, requestId: input.requestId, status: 'rejected', simulation: true };
  const row = await payout(db, input.payoutId);
  if (!['prepared','approved'].includes(row.status) || input.expectedStatus !== undefined && input.expectedStatus !== row.status)
    throw new ManagedSettlementError('Only an unexecuted, unchanged reservation can be cancelled. Processing or uncertain failures require outcome reconciliation; paid history is permanent.');
  await atomic(db, [...authority.statements, ...formGuards(db, input),
    ...guard(db, `EXISTS(SELECT 1 FROM managed_payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND p.status=? AND p.updated_at=? AND p.paid_at IS NULL AND p.provider_reference IS NULL AND s.user_id<>?)
      AND NOT EXISTS(SELECT 1 FROM seller_payout_review_blocks WHERE payout_model='managed' AND payout_id=?)`, [row.id, row.status, row.updatedAt,input.actorId,row.id]),
    db.prepare("UPDATE managed_payouts SET status='rejected',updated_at=? WHERE id=?").bind(input.now, row.id),
    db.prepare("UPDATE managed_payout_allocations SET disposition='released',terminal_at=? WHERE payout_id=? AND disposition='reserved'").bind(input.now, row.id),
    audit(db, input, 'managed_payout.cancelled', 'managed_payout', row.id, reason, { catalogDigest: intent, status: 'rejected' }),
    ...answer(db, input, 'managed_payout', row.id),
  ]);
  return { payoutId: row.id, requestId: input.requestId, status: 'rejected', simulation: true };
}

export async function releaseManagedEligibility(db: D1Database, input: ManagedFinanceContext & { sellerId: string }) {
  const reason = context(input, 'staff.managed-eligibility-release');
  const authority = await staffMutationGuard(db, input.actorId, 'payout.prepare', ManagedSettlementError, 'super_admin');
  if (!await db.prepare('SELECT 1 FROM seller_profiles WHERE id=?').bind(input.sellerId).first()) throw new ManagedSettlementError('Maker history not found.');
  const intent = await digest(input, { sellerId: input.sellerId, action: 'release' }, reason);
  const previous = await replay(db, input, 'managed_settlement.eligibility_released', intent, 'seller', input.sellerId);
  if (previous) return { sellerId: input.sellerId, requestId: input.requestId, released: previous.released!, simulation: true as const };
  const candidates = await db.prepare(`SELECT e.id,e.version,${managedRefundFactsColumns()} FROM managed_entitlements e WHERE e.seller_id=? AND ${simulationEntitlementSql} AND e.status='held'
    AND ${managedSettlementReadySql('e', input.now)}`).bind(input.sellerId).all<ManagedRefundFacts & { id: string; version: number }>();
  const rows=candidates.results.filter(managedRefundReconciled);
  await atomic(db, [...authority.statements, ...formGuards(db, input),
    ...guard(db,'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?)',[input.sellerId,input.actorId]),
    ...rows.flatMap(row => guard(db, `EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND e.seller_id=?
      AND e.status='held' AND e.version=? AND ${managedSettlementReadySql('e', input.now)} AND ${managedRefundFactsGuard(row)})`, [row.id, input.sellerId, row.version])),
    ...rows.map(row => db.prepare("UPDATE managed_entitlements SET status='eligible',eligible_at=hold_until,version=version+1,updated_at=? WHERE id=?").bind(input.now, row.id)),
    audit(db, input, 'managed_settlement.eligibility_released', 'seller', input.sellerId, reason, { catalogDigest: intent, released: rows.length }),
    ...answer(db, input, 'seller', input.sellerId),
  ]);
  return { sellerId: input.sellerId, requestId: input.requestId, released: rows.length, simulation: true as const };
}

/** Reuses the native allocation, offset and original-refund calculations for exact execution snapshots. */
export async function managedPayoutExecutionSource(db:D1Database,payoutId:string,now:number){
 const input={now},row=await payout(db,payoutId),required=row.status;
 if(!['prepared','approved','failed'].includes(row.status)||row.scheduledFor>now)throw new ManagedSettlementError('Review the current eligible original managed payment and processing date.');
  await receiving(db, row.sellerId, row.destination);
  const allocated = await reservation(db, row);
  const all = await positions(db, row.sellerId, input.now);
  const selected = allocated.map(entry => {
    const current = all.find(position => position.id === entry.id);
    if (!current?.ready || current.amount !== Number(entry.amount)) throw new ManagedSettlementError('The reserved balance changed or a refund/case needs reconciliation. Cancel the unpaid reservation before preparing the correct amount.');
    return current;
  });
  const currentBalance = await balance(db, row.sellerId);
  const reservedIds = new Set(selected.map(entry=>entry.id));
  if (all.reduce((sum,entry)=>sum+entry.amount,0)!==currentBalance || currentBalance<row.amount ||
    all.some(entry=>entry.amount<0&&!reservedIds.has(entry.id)))
    throw new ManagedSettlementError('A refund offset or the maker balance changed. Cancel the unpaid reservation and prepare the reconciled amount.');
  const stateGuards = guard(db, `EXISTS(SELECT 1 FROM managed_payouts WHERE id=? AND seller_id=? AND status=? AND updated_at=? AND amount_paisa=?)
    AND (${sellerBalanceSql})=? AND EXISTS(SELECT 1 FROM seller_participation_profiles WHERE seller_id=? AND payout_beneficiary_reference=?)`,
    [row.id, row.sellerId, required, row.updatedAt, row.amount, row.sellerId, row.sellerId, currentBalance, row.sellerId, row.destination]);
  const reservationGuards = guard(db, `(COALESCE((SELECT SUM(amount_paisa) FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved'),0)
    +COALESCE((SELECT SUM(x.amount_paisa) FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
      WHERE pe.payout_id=? AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=x.entitlement_id)),0))=?
    AND ((SELECT COUNT(*) FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved')
      +(SELECT COUNT(DISTINCT x.entitlement_id) FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
        WHERE pe.payout_id=? AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=x.entitlement_id)))=?`,
    [row.id, row.id, row.amount, row.id, row.id, selected.length]);
  // Recheck every seller-wide debt, including an old paid sale refunded after
  // preparation. A concurrent new earning can mask that debt in the total.
  const offsetGuards = guard(db, `NOT EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.seller_id=? AND ${simulationEntitlementSql}
    AND (${managedEntitlementNetSql()})<0
    AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=? AND a.entitlement_id=e.id AND a.disposition='reserved')
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
      WHERE pe.payout_id=? AND x.entitlement_id=e.id
      AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=pe.payout_id AND a.entitlement_id=e.id)))
    AND COALESCE((SELECT SUM(${managedEntitlementNetSql()}) FROM managed_entitlements e WHERE e.seller_id=? AND ${simulationEntitlementSql}),0)=(${sellerBalanceSql})`,
    [row.sellerId,row.id,row.id,row.sellerId,row.sellerId,row.sellerId]);
 return {row,selected,currentBalance,guards:[...stateGuards,...reservationGuards,...offsetGuards,...positionGuards(db,row.sellerId,selected,now)]};
}

function requireExecutionPacket(action:string){if(action==='mark_paid')throw new ManagedSettlementError('Record the actual bank outcome through the original verified execution packet.');}
