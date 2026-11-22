import assert from 'node:assert/strict';
import test from 'node:test';
import { readFinanceWorkItems } from '../lib/admin/finance-work-items';
import { resolveReminderDestination } from '../lib/operations/reminder-destination';
import { processReminderDispatch } from '../lib/operations/reminder-dispatch';
import { isCurrentReminderNotice } from '../lib/operations/reminder-notice-sources';
import { getReturnHandling, recordReturnHandling } from '../lib/returns/handling';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { refundPacketFixture } from './helpers/refund-funding-fixture';

const environment = resolveRuntimeEnvironment({ runtimeEnvironment: 'test', nodeEnvironment: 'test' });
type Fixture = Awaited<ReturnType<typeof refundPacketFixture>>;

function setClock(fixture: Fixture, now: number) {
  fixture.sqlite.function('strftime', { varargs: true }, (...args) =>
    String(args[0]) === '%s'
      ? String(Math.floor(now / 1000))
      : (now % 60000 / 1000).toFixed(3).padStart(6, '0'));
}

async function dispatchAt(fixture: Fixture, now: number) {
  setClock(fixture, now);
  const result = await processReminderDispatch(fixture.db, { now });
  assert.deepEqual(result.failures, []);
}

function milestoneRows(fixture: Fixture) {
  return fixture.sqlite.prepare(
    "SELECT id,milestone,due_at FROM operational_reminder_milestones WHERE family='refund_obligation' AND source_id=? ORDER BY due_at,milestone",
  ).all(fixture.obligationId);
}

async function staffNotice(fixture: Fixture, milestoneId: string) {
  return fixture.db.prepare(`SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,
    audience_role audience,channel,request_id requestId,required_permission requiredPermission FROM notification_messages
    WHERE related_id=? AND recipient_user_id='reviewer' AND channel='in_app'`)
    .bind(milestoneId).first<Parameters<typeof isCurrentReminderNotice>[1]>();
}

void test('binding refund date stays visible and alerts Finance through uncertain processing until verified settlement', async () => {
  const f = await refundPacketFixture();
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    const retained = f.sqlite.prepare(`SELECT r.authorized_at authorizedAt,d.binding_due_at binding
      FROM refund_obligations r JOIN refund_obligation_deadlines d ON d.obligation_id=r.id WHERE r.id=?`).get(f.obligationId)!;
    assert.equal(retained.binding, null);
    const dueAt = Number(retained.authorizedAt) + 60 * 60 * 1000;
    const prepared = await f.m.prepareRefundPacket(f.db, f.ctx('reminder-original-refund', '0'), {
      obligationId: f.obligationId, destinationVersionId: f.destinationId, fundingStatementId: f.fundingId,
      reason: 'Prepare the original exact fictional refund with its verified funding.',
    });
    const approved = await f.m.approveRefundPacket(f.db, f.ctx('reminder-approved', String(prepared.revision)), {
      packetId: prepared.id, reason: 'Approve the exact original fictional payment instructions.',
    });
    const processing = await f.m.startRefundPacket(f.db, f.ctx('reminder-started', String(approved.revision)), {
      packetId: prepared.id, reason: 'Track the original refund while its transfer is processing.',
    });
    const beforeBinding = await readFinanceWorkItems(f.db, 'reviewer', environment);
    assert.equal(beforeBinding.items.find(row => row.id === f.obligationId)?.dueAt, null);
    const handling = (await getReturnHandling(f.db, f.caseId))!;
    await recordReturnHandling(f.db, f.ctx('reminder-original-no-return', String(handling.revision)), {
      caseId: f.caseId, action: 'waive_return', quantity: 1, occurredAt: handling.now,
      evidenceReference: 'FICTIONAL-VERIFIED-UNSAFE-RETURN',
      privateNote: 'Review confirmed the damaged item is unsafe to collect.',
      publicMessage: 'No physical return is required for this refund.',
    });
    const firstDeadline = f.sqlite.prepare('SELECT revision,binding_due_at FROM refund_obligation_deadlines WHERE obligation_id=?')
      .get(f.obligationId)!;
    assert.ok(Number(firstDeadline.binding_due_at) > dueAt);
    await f.m.recordEarlierRefundDeadline(f.db, f.ctx('reminder-reviewed-date', String(firstDeadline.revision)), {
      obligationId: f.obligationId, dueAt, evidenceReference: 'FICTIONAL-EARLIER-REFUND-TERM',
      reason: 'The independently reviewed binding term falls on the earlier date.',
    });

    await dispatchAt(f, dueAt - 1);
    assert.deepEqual(milestoneRows(f), []);
    const finance = await readFinanceWorkItems(f.db, 'reviewer', environment);
    assert.equal(finance.items.find(row => row.id === f.obligationId)?.dueAt, dueAt);

    await dispatchAt(f, dueAt);
    const [binding] = milestoneRows(f);
    assert.equal(binding?.milestone, 'binding_due');
    assert.equal(binding.due_at, dueAt);
    const bindingNotice = await staffNotice(f, String(binding.id));
    assert.ok(bindingNotice);
    assert.ok(await isCurrentReminderNotice(f.db, bindingNotice, dueAt));
    assert.equal(await resolveReminderDestination(f.db, 'reviewer', String(binding.id), 'staff', dueAt),
      '/admin/payments/refunds?obligation=' + f.obligationId + '#refund-obligation-' + f.obligationId);
    assert.equal(await resolveReminderDestination(f.db, 'customer', String(binding.id), 'customer', dueAt), null);

    const uncertain = await f.m.recordRefundPacketOutcome(f.db, f.ctx('reminder-uncertain', String(processing.revision)), {
      packetId: prepared.id, outcome: 'uncertain', reason: 'The original transfer still needs independent confirmation.',
      evidenceReference: 'FICTIONAL-BANK-STATUS-AWAITING-PROOF',
    });
    await dispatchAt(f, dueAt + 1);
    assert.equal(milestoneRows(f).length, 1);
    assert.ok(await isCurrentReminderNotice(f.db, bindingNotice, dueAt + 1));

    const nextUpdateAt = Number(f.sqlite.prepare('SELECT next_update_at FROM refund_obligations WHERE id=?')
      .get(f.obligationId)!.next_update_at);
    await dispatchAt(f, nextUpdateAt);
    await dispatchAt(f, nextUpdateAt);
    const [, update] = milestoneRows(f);
    assert.equal(update?.milestone, 'promised_update');
    assert.equal(update.due_at, nextUpdateAt);
    assert.equal(milestoneRows(f).length, 2);
    const updateNotice = await staffNotice(f, String(update.id));
    assert.ok(updateNotice);
    assert.ok(await isCurrentReminderNotice(f.db, updateNotice, nextUpdateAt));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM company_outgoing_bank_identities WHERE packet_kind='refund'").get()!.n, 0);
    const recipients = f.sqlite.prepare(`SELECT DISTINCT audience_role FROM notification_messages WHERE related_id IN (?,?)`)
      .all(binding.id, update.id).map(row => row.audience_role);
    assert.deepEqual(recipients, ['staff']);

    const reconciling = await f.m.recordRefundPacketOutcome(f.db, f.ctx('reminder-new-update', String(uncertain.revision)), {
      packetId: prepared.id, outcome: 'uncertain', reason: 'Keep the exact original transfer under ongoing reconciliation.',
      evidenceReference: 'FICTIONAL-NEW-BANK-OUTCOME-EVIDENCE',
    });
    assert.equal(await isCurrentReminderNotice(f.db, updateNotice, nextUpdateAt), false);
    assert.ok(await isCurrentReminderNotice(f.db, bindingNotice, nextUpdateAt));

    const deadlineRevision = String(f.sqlite.prepare('SELECT revision FROM refund_obligation_deadlines WHERE obligation_id=?')
      .get(f.obligationId)!.revision);
    await f.m.recordEarlierRefundDeadline(f.db, f.ctx('reminder-earlier-proof', deadlineRevision), {
      obligationId: f.obligationId, dueAt: dueAt - 500, evidenceReference: 'FICTIONAL-CORRECTED-REFUND-TERM',
      reason: 'Later evidence establishes an earlier binding deadline for this exact refund.',
    });
    assert.equal(await isCurrentReminderNotice(f.db, bindingNotice, nextUpdateAt), false);
    await dispatchAt(f, nextUpdateAt);
    const corrected = milestoneRows(f).find(row => row.due_at === dueAt - 500);
    assert.equal(corrected?.milestone, 'binding_due');
    const correctedNotice = await staffNotice(f, String(corrected.id));
    assert.ok(correctedNotice);
    assert.ok(await isCurrentReminderNotice(f.db, correctedNotice, nextUpdateAt));

    await f.m.recordRefundPacketOutcome(f.db, f.ctx('reminder-verified-settlement', String(reconciling.revision)), {
      packetId: prepared.id, outcome: 'paid', amountPaisa: f.cashPaisa, bankAt: nextUpdateAt - 1,
      transactionIdentity: 'FICTIONAL-REFUND-REMINDER-PAID', evidenceReference: 'FICTIONAL-INDEPENDENT-REFUND-SETTLEMENT',
      completedTransferConfirmed: true, exactBeneficiaryConfirmed: true,
      reason: 'Verify the completed original refund to its exact intended beneficiary.',
    });
    assert.equal(await isCurrentReminderNotice(f.db, correctedNotice, nextUpdateAt), false);
    assert.equal(await resolveReminderDestination(f.db, 'reviewer', String(corrected.id), 'staff', nextUpdateAt), null);
    assert.ok(!(await readFinanceWorkItems(f.db, 'reviewer', environment)).items.some(row => row.id === f.obligationId));
  } finally {
    f.dispose();
  }
});
