import assert from 'node:assert/strict';
import test from 'node:test';
import { createFonepayRefundSimulator } from '../lib/payments/fonepay-refund-simulation';
import { REFUND_ROUTE_CAPABILITIES } from '../lib/payments/refund-route-capabilities';
import { createRefundRouteSimulationRepository } from '../lib/payments/refund-route-reservations';
import { refundPacketFixture } from './helpers/refund-funding-fixture';

void test('the Fonepay fixture reserves first, reconciles only a proved remainder, and preserves actual tender', async () => {
  const source = await refundPacketFixture();
  try {
    const row = await source.m.getRefundObligation(source.db, source.obligationId);
    assert.ok(row?.orderId);
    const authorizedPaisa = row.cashPaisa;
    const settledPaisa = 20_001;
    const remainingPaisa = authorizedPaisa - settledPaisa;
    assert.ok(remainingPaisa > 0);

    const original = { orderId: row.orderId, transactionId: 'FICTIONAL-FONEPAY-SALE', sessionNumber: 'FICTIONAL-SESSION' };
    const binding = { [REFUND_ROUTE_CAPABILITIES]: { fonepaySimulationAdmission: true, fonepaySimulationRetainedRead: true } };
    const captured = { ...original, capturedPaisa: authorizedPaisa, currency: 'NPR' as const };
    const provider = createFonepayRefundSimulator(binding, [{ ...captured, refundEligible: true }]);
    const repository = createRefundRouteSimulationRepository(source.db, binding);
    const capture = await repository.registerCapture(captured);
    const reserve = (requestId: string, amountPaisa: number) => repository.reserve({
      obligationId: row.id, captureId: capture.id, route: 'fonepay', requestId, amountPaisa,
    });
    const request = (idempotencyKey: string, amountPaisa: number) => provider.requestRefund({
      original, obligationId: row.id, authorizedPaisa, amountPaisa, currency: 'NPR', idempotencyKey,
    });
    const bank = () => source.m.prepareRefundPacket(source.db, source.ctx('simulated-lock-test-bank', '0'), {
      obligationId: row.id, destinationVersionId: source.destinationId,
      fundingStatementId: source.fundingId, reason: 'Prepare only the original verified company-bank amount.',
    });
    const recorded = () => [
      'refund_obligations', 'refunds', 'payments', 'wallet_entries', 'shipping_parcels',
      'company_outgoing_bank_identities', 'outgoing_payment_packets',
    ].map(name => source.sqlite.prepare(`SELECT * FROM ${name} ORDER BY 1`).all());
    const previous = recorded();

    const first = await reserve('fictional-attempt-one', authorizedPaisa);
    assert.equal((await reserve('fictional-attempt-one', authorizedPaisa)).id, first.id);
    const submitted = request(first.requestId, first.amountPaisa);
    const scope = { original, obligationId: row.id, providerReference: submitted.providerReference };
    async function firstFact(eventReference: string, state: 'submitted' | 'uncertain' | 'partial' | 'closed',
      figures: {settledPaisa?: number; confirmedUnsentPaisa?: number; proofReference?: string} = {}) {
      const result = provider.recordOutcome({ ...scope, eventReference, status: state, ...figures });
      await repository.recordOutcome({ attemptId: first.id, providerReference: result.providerReference,
        eventReference, status: state, ...figures });
      return result;
    }
    await firstFact('fictional-submission', 'submitted');
    await firstFact('fictional-provisional', 'partial', { settledPaisa });
    await firstFact('fictional-uncertain', 'uncertain');
    await assert.rejects(bank());
    await assert.rejects(reserve('fictional-competing-attempt', remainingPaisa));
    const closed = await firstFact('fictional-partial-final', 'closed', {
      settledPaisa, confirmedUnsentPaisa: remainingPaisa, proofReference: 'FICTIONAL-REMAINDER-NOT-SENT',
    });
    assert.equal(closed.remainingPaisa, remainingPaisa);
    await assert.rejects(reserve('fictional-remainder-exceeds-cap', remainingPaisa + 1));

    const second = await reserve('fictional-attempt-two', remainingPaisa);
    const continuation = request(second.requestId, second.amountPaisa);
    const newScope = { original, obligationId: row.id, providerReference: continuation.providerReference };
    binding[REFUND_ROUTE_CAPABILITIES].fonepaySimulationAdmission = false;
    assert.ok(provider.lookupByReference(scope));
    assert.ok(await repository.readByReference({ route: 'fonepay', providerReference: scope.providerReference }));
    const terminal = { eventReference: 'fictional-remainder-paid', status: 'settled' as const,
      settledPaisa: remainingPaisa, proofReference: 'FICTIONAL-EXACT-CREDIT' };
    const settled = provider.recordOutcome({ ...newScope, ...terminal });
    await repository.recordOutcome({ attemptId: second.id, providerReference: settled.providerReference, ...terminal });
    assert.equal(settled.remainingPaisa, 0);
    assert.deepEqual(recorded(), previous);
    await assert.rejects(reserve('fictional-disabled-admission', 1));

    // Simulation only: the independently verified native bank amount remains entirely payable.
    assert.ok((await bank()).id);
    assert.equal(source.sqlite.prepare('SELECT amount_paisa AS amount FROM outgoing_payment_packets').get()?.amount, authorizedPaisa);
  } finally {
    source.dispose();
  }
});
