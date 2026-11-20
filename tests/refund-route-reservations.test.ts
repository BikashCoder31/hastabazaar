import assert from 'node:assert/strict';
import test from 'node:test';
import { REFUND_ROUTE_CAPABILITIES } from '../lib/payments/refund-route-capabilities';
import { createRefundRouteSimulationRepository } from '../lib/payments/refund-route-reservations';
import { nativeFinanceClone } from './helpers/native-finance-clone';
import { refundPacketFixture } from './helpers/refund-funding-fixture';

function simulationBinding() {
  return {
    [REFUND_ROUTE_CAPABILITIES]: { fonepaySimulationAdmission: true, fonepaySimulationRetainedRead: true },
  };
}

type PacketFixture = Awaited<ReturnType<typeof refundPacketFixture>>;

function prepareBank(f: PacketFixture, db: D1Database, requestId: string) {
  return f.m.prepareRefundPacket(db, f.ctx(requestId, '0'), {
    obligationId: f.obligationId,
    destinationVersionId: f.destinationId,
    fundingStatementId: f.fundingId,
    reason: 'Reserve exact verified bank funds for this original fictional obligation.',
  });
}

function registerCapture(f: PacketFixture, repository: ReturnType<typeof createRefundRouteSimulationRepository>) {
  return repository.registerCapture({ orderId: f.orderId, transactionId: 'FICTIONAL-FONEPAY-CAPTURE',
    sessionNumber: 'FICTIONAL-FONEPAY-SESSION', capturedPaisa: f.cashPaisa, currency: 'NPR' });
}

void test('the real bank packet keeps the shared reservation through uncertainty and retires it on verified settlement', async () => {
  const f = await refundPacketFixture();
  try {
    const packet = await f.m.prepareRefundPacket(f.db, f.ctx('shared-bank-prepare', '0'), {
      obligationId: f.obligationId, destinationVersionId: f.destinationId,
      fundingStatementId: f.fundingId, reason: 'Reserve the exact fictional bank transfer for the approved refund.',
    });
    const slot = () => f.sqlite.prepare('SELECT bank_packet_id AS bank FROM refund_route_reservations WHERE obligation_id=?').get(f.obligationId);
    assert.equal(slot()?.bank, packet.id);
    assert.throws(() => f.sqlite.prepare('DELETE FROM refund_route_reservations WHERE obligation_id=?').run(f.obligationId), /refund_route_release_proof_required/);

    const approved = await f.m.approveRefundPacket(f.db, f.ctx('shared-bank-approve', '0'), {
      packetId: packet.id, reason: 'Approve the exact fictional company funds already verified for the refund.',
    });
    const started = await f.m.startRefundPacket(f.db, f.ctx('shared-bank-start', String(approved.revision)), {
      packetId: packet.id, reason: 'Start the exact approved fictional bank instruction for this original refund.',
    });
    const uncertain = await f.m.recordRefundPacketOutcome(f.db, f.ctx('shared-bank-unknown', String(started.revision)), {
      packetId: packet.id, outcome: 'uncertain', reason: 'The fictional bank has not established the outcome of this instruction.',
      evidenceReference: 'FICTIONAL-UNRESOLVED-NATIVE-REFUND',
    });
    assert.equal(slot()?.bank, packet.id);
    assert.throws(() => f.sqlite.prepare('DELETE FROM refund_route_reservations WHERE obligation_id=?').run(f.obligationId), /refund_route_release_proof_required/);
    await f.m.recordRefundPacketOutcome(f.db, f.ctx('shared-bank-paid', String(uncertain.revision)), {
      packetId: packet.id, outcome: 'paid', reason: 'Independent evidence confirms the actual fictional outgoing transfer.',
      evidenceReference: 'FICTIONAL-FULL-NATIVE-BANK-OUTCOME', transactionIdentity: 'FICTIONAL-SHARED-REFUND-DEBIT',
      bankAt: Date.now() - 100, amountPaisa: f.cashPaisa, completedTransferConfirmed: true, exactBeneficiaryConfirmed: true,
    });
    assert.equal(slot(), undefined);
    assert.equal(f.sqlite.prepare("SELECT amount_paisa AS amount FROM company_outgoing_bank_identities WHERE packet_kind='refund' AND packet_id=?").get(packet.id)?.amount, f.cashPaisa);
    assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(f.obligationId)?.state, 'completed');
  } finally {
    f.dispose();
  }
});

void test('a void without valid evidence cannot commit while the bank packet holds the reservation', async () => {
  const f = await refundPacketFixture();
  try {
    const packet = await prepareBank(f, f.db, 'held-bank-prepare');
    const shortEvidence = '😀'.repeat(4);
    const requestId = 'held-bank-void';
    const voidInput = { packetId: packet.id, notSentConfirmed: true, evidenceReference: shortEvidence,
      reason: 'Independent records confirm the fictional bank instruction was never sent.' };
    await assert.rejects(() => f.m.voidUnsentRefundPacket(f.db, f.ctx(requestId, String(packet.revision)), voidInput),
      /evidence that no instruction was sent/);

    await assert.rejects(() => f.db.batch([
      f.db.prepare("UPDATE outgoing_payment_packets SET state='void', revision=revision+1, recorded_by='reviewer', recorded_at=?, evidence_reference=? WHERE id=?")
        .bind(Date.now(), shortEvidence, packet.id),
      f.db.prepare(`INSERT INTO refund_obligation_events(id,obligation_id,actor_id,action,public_message,private_details_json,request_id,created_at)
        VALUES(?,?,'reviewer','packet_voided',?,?,?,?)`)
        .bind('invalid-held-bank-void', f.obligationId, 'Fictional unsent instruction.', JSON.stringify(voidInput), 'invalid-held-bank-void', Date.now()),
    ]), /refund_route_release_proof_required/);
    assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(packet.id)?.state, 'prepared');
    assert.equal(f.sqlite.prepare('SELECT bank_packet_id FROM refund_route_reservations WHERE obligation_id=?').get(f.obligationId)?.bank_packet_id, packet.id);
    assert.equal(f.sqlite.prepare('SELECT id FROM refund_obligation_events WHERE id=?').get('invalid-held-bank-void'), undefined);

    // A rejected write leaves the same packet and request available for corrected evidence.
    await f.m.voidUnsentRefundPacket(f.db, f.ctx(requestId, String(packet.revision)), {
      ...voidInput, evidenceReference: '😀'.repeat(8),
    });
    assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(packet.id)?.state, 'void');
    assert.equal(f.sqlite.prepare('SELECT bank_packet_id FROM refund_route_reservations WHERE obligation_id=?').get(f.obligationId), undefined);
  } finally {
    f.dispose();
  }
});

void test('provisional settlement keeps the slot and definitive evidence opens only the exact simulated remainder', async () => {
  const f = await refundPacketFixture();
  try {
    const binding = simulationBinding();
    const repository = createRefundRouteSimulationRepository(f.db, binding);
    await assert.rejects(() => registerCapture(f, createRefundRouteSimulationRepository(f.db)), /admission is disabled/);
    const admissionOnly = simulationBinding();
    admissionOnly[REFUND_ROUTE_CAPABILITIES].fonepaySimulationRetainedRead = false;
    const unavailable = createRefundRouteSimulationRepository(f.db, admissionOnly);
    await assert.rejects(() => registerCapture(f, unavailable), /admission is disabled/);
    const capture = await registerCapture(f, repository);
    assert.deepEqual(await registerCapture(f, repository), capture);
    await assert.rejects(() => repository.registerCapture({ ...capture, capturedPaisa: capture.capturedPaisa + 1 }), /different original payment/);

    const readOriginalMoney = () => Object.fromEntries([
      'refund_obligations', 'refund_obligation_events', 'refunds', 'orders', 'payments', 'wallet_accounts', 'wallet_entries',
      'seller_ledger_entries', 'company_money_receipts', 'manual_receipt_uses', 'company_outgoing_bank_identities',
      'outgoing_payment_packets', 'parcel_cash_records',
    ].map(table => [table, f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
    const originalMoney = readOriginalMoney();
    const reservation = { obligationId: f.obligationId, captureId: capture.id, route: 'fonepay' as const,
      requestId: 'synthetic-fonepay-reserve', amountPaisa: f.cashPaisa };
    await assert.rejects(() => unavailable.reserve(reservation), /admission is disabled/);
    const attempt = await repository.reserve(reservation);
    assert.deepEqual(await repository.reserve(reservation), attempt);
    await assert.rejects(() => repository.reserve({ ...reservation, amountPaisa: reservation.amountPaisa - 1 }), /different attempt/);
    await assert.rejects(() => prepareBank(f, f.db, 'bank-during-simulation'), /refund_route_already_reserved/);
    assert.throws(() => f.sqlite.prepare(`INSERT OR REPLACE INTO refund_route_reservations(obligation_id,simulation_attempt_id)
      VALUES(?,?)`).run(f.obligationId, attempt.id), /refund_route_already_reserved/);

    const providerReference = 'FICTIONAL-FONEPAY-REFUND';
    const submitted = { attemptId: attempt.id, providerReference, eventReference: 'simulated-submit', status: 'submitted' as const };
    assert.deepEqual(await repository.recordOutcome(submitted), await repository.recordOutcome(submitted));
    const settledPaisa = 20_001;
    const remainingPaisa = f.cashPaisa - settledPaisa;
    await repository.recordOutcome({ ...submitted, eventReference: 'simulated-provisional', status: 'partial', settledPaisa });
    await assert.rejects(() => repository.reserve({ ...reservation, route: 'pickup', requestId: 'before-finality', amountPaisa: remainingPaisa }), /refund_route_already_reserved/);
    const final = { ...submitted, eventReference: 'simulated-final', status: 'closed' as const,
      settledPaisa, confirmedUnsentPaisa: remainingPaisa, proofReference: 'FICTIONAL-FONEPAY-CLOSED-REMAINDER' };
    await assert.rejects(() => repository.recordOutcome({ ...final, confirmedUnsentPaisa: remainingPaisa - 1 }), /refund_route_event_outcome_mismatch/);
    binding[REFUND_ROUTE_CAPABILITIES].fonepaySimulationAdmission = false;
    await assert.rejects(() => repository.reserve({ ...reservation, requestId: 'disabled-attempt' }), /admission is disabled/);
    const closed = await repository.recordOutcome(final);
    assert.deepEqual(await repository.readByReference({ route: 'fonepay', providerReference }), { attempt, latestOutcome: closed });
    await assert.rejects(() => repository.recordOutcome({ ...final, settledPaisa: settledPaisa - 1 }), /different outcome/);
    await assert.rejects(() => repository.recordOutcome({ ...final, eventReference: 'new-after-final' }), /refund_route_event_retained|refund_route_event_outcome_mismatch/);

    binding[REFUND_ROUTE_CAPABILITIES].fonepaySimulationAdmission = true;
    const retry = { ...reservation, route: 'pickup' as const, requestId: 'next-exact-remainder', amountPaisa: remainingPaisa };
    await assert.rejects(() => repository.reserve({ ...retry, amountPaisa: remainingPaisa + 1 }), /refund_route_amount_or_capture_mismatch/);
    const replacement = await repository.reserve(retry);
    await repository.recordOutcome({ attemptId: replacement.id, providerReference: 'FICTIONAL-PICKUP-REFUND',
      eventReference: 'simulated-pickup-paid', status: 'settled', settledPaisa: remainingPaisa,
      proofReference: 'FICTIONAL-PICKUP-CONFIRMED' });
    assert.deepEqual(readOriginalMoney(), originalMoney);
    const bank = await prepareBank(f, f.db, 'native-bank-after-fixture-settlement');
    assert.equal(f.sqlite.prepare('SELECT amount_paisa AS amount FROM outgoing_payment_packets WHERE id=?').get(bank.id)?.amount, f.cashPaisa);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS count FROM company_outgoing_bank_identities').get()?.count, 0);
  } finally {
    f.dispose();
  }
});

void test('a historical live bank packet still excludes simulation until recorded unsent', async () => {
  const f = await refundPacketFixture();
  try {
    const trigger = f.sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name='refund_route_bank_reserve'").get()?.sql;
    assert.equal(typeof trigger, 'string');
    // Seed one packet as it existed before the reservation migration in this disposable fixture.
    f.sqlite.exec('DROP TRIGGER refund_route_bank_reserve');
    const bank = await prepareBank(f, f.db, 'legacy-bank-before-slot');
    f.sqlite.exec(String(trigger));
    assert.equal(f.sqlite.prepare('SELECT count(*) AS count FROM refund_route_reservations').get()?.count, 0);
    const repository = createRefundRouteSimulationRepository(f.db, simulationBinding());
    const capture = await registerCapture(f, repository);
    const input = { obligationId: f.obligationId, captureId: capture.id, route: 'fonepay' as const,
      requestId: 'legacy-guard-simulation', amountPaisa: f.cashPaisa };
    await assert.rejects(() => repository.reserve(input), /refund_route_already_reserved/);
    await f.m.voidUnsentRefundPacket(f.db, f.ctx('legacy-bank-proven-unsent', String(bank.revision)), {
      packetId: bank.id, notSentConfirmed: true, evidenceReference: 'FICTIONAL-INDEPENDENT-UNSENT-PROOF',
      reason: 'Independent records confirm the original fictional bank instruction was never sent.',
    });
    assert.equal((await repository.reserve(input)).amountPaisa, f.cashPaisa);
  } finally {
    f.dispose();
  }
});

void test('in native D1 a competing bank preparation and simulated reservation have one winner', async () => {
  const f = await refundPacketFixture();
  let target: Awaited<ReturnType<typeof nativeFinanceClone>> | undefined;
  try {
    target = await nativeFinanceClone(f.sqlite);
    const { db } = target;
    const repository = createRefundRouteSimulationRepository(db, simulationBinding());
    const capture = await registerCapture(f, repository);
    const results = await Promise.allSettled([
      prepareBank(f, db, 'competing-real-native-packet'),
      repository.reserve({ obligationId: f.obligationId, captureId: capture.id, route: 'fonepay',
        requestId: 'competing-simulated-native-packet', amountPaisa: f.cashPaisa }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, String(results.map(result => result.status === 'rejected' ? result.reason : result.status)));
    const slot = await db.prepare(`SELECT bank_packet_id AS bank,simulation_attempt_id AS simulation
      FROM refund_route_reservations WHERE obligation_id=?`).bind(f.obligationId).first<{ bank: string | null; simulation: string | null }>();
    assert.ok(slot?.bank || slot?.simulation);
    const id = results.find(result => result.status === 'fulfilled')?.value.id;
    assert.equal(slot?.bank ?? slot?.simulation, id);
    const counts = await db.prepare(`SELECT
      (SELECT count(*) FROM outgoing_payment_packets WHERE obligation_id=?) AS bank,
      (SELECT count(*) FROM refund_route_simulation_attempts WHERE obligation_id=?) AS simulation`)
      .bind(f.obligationId, f.obligationId).first<{ bank: number; simulation: number }>();
    assert.equal(Number(counts?.bank) + Number(counts?.simulation), 1);
  } finally {
    await target?.dispose();
    f.dispose();
  }
});
