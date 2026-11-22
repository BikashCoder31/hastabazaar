import assert from 'node:assert/strict';
import test from 'node:test';
import { createFonepayRefundSimulator } from '../lib/payments/fonepay-refund-simulation';
import {
  readRefundRouteCapabilities,
  REFUND_ROUTE_CAPABILITIES,
} from '../lib/payments/refund-route-capabilities';

const original = {
  orderId: 'fixture-order',
  transactionId: 'fixture-transaction',
  sessionNumber: 'fixture-session',
};
const capture = {
  ...original,
  capturedPaisa: 10000,
  currency: 'NPR' as const,
  refundEligible: true,
};
const request = {
  original,
  obligationId: 'fixture-obligation',
  authorizedPaisa: 6000,
  amountPaisa: 6000,
  currency: 'NPR',
  idempotencyKey: 'fixture-request',
};

function fixture() {
  const binding = {
    [REFUND_ROUTE_CAPABILITIES]: {
      fonepaySimulationAdmission: true,
      fonepaySimulationRetainedRead: true,
    },
  };
  return {
    binding,
    simulator: createFonepayRefundSimulator(binding, [capture]),
  };
}

void test('the fixture requires explicit route controls and an eligible exact captured NPR payment', () => {
  assert.deepEqual(
    readRefundRouteCapabilities(undefined),
    readRefundRouteCapabilities({}),
  );
  assert.deepEqual(readRefundRouteCapabilities({}), {
    fonepaySimulationAdmission: false,
    fonepaySimulationRetainedRead: false,
    refundWalletBalance: false,
    refundWalletShopping: false,
    refundWalletWithdrawal: false,
    refundWalletFees: false,
  });
  assert.deepEqual(
    readRefundRouteCapabilities({
      [REFUND_ROUTE_CAPABILITIES]: { refundWalletShopping: true },
    }),
    {
      fonepaySimulationAdmission: false,
      fonepaySimulationRetainedRead: false,
      refundWalletBalance: false,
      refundWalletShopping: true,
      refundWalletWithdrawal: false,
      refundWalletFees: false,
    },
  );
  assert.throws(
    () => createFonepayRefundSimulator({}, [capture]).requestRefund(request),
    /disabled/i,
  );
  const createOnly = {
    [REFUND_ROUTE_CAPABILITIES]: { fonepaySimulationAdmission: true },
  };
  assert.throws(
    () =>
      createFonepayRefundSimulator(createOnly, [capture]).requestRefund(
        request,
      ),
    /disabled/i,
  );

  const { simulator } = fixture();
  assert.equal(simulator.checkEligibility(request).eligible, true);
  for (const change of [
    { original: { ...original, orderId: 'different' } },
    { original: { ...original, transactionId: 'fixture-checkout-replay-key' } },
    { original: { ...original, sessionNumber: 'FIXTURE-SESSION' } },
    { amountPaisa: 6000.5 },
    { currency: 'USD' },
    { authorizedPaisa: 10001, amountPaisa: 10001 },
  ])
    assert.equal(
      simulator.checkEligibility({ ...request, ...change }).eligible,
      false,
    );
  const { binding } = fixture();
  const ineligible = createFonepayRefundSimulator(binding, [
    { ...capture, refundEligible: false },
  ]);
  assert.throws(() => ineligible.requestRefund(request), /eligible/i);
});

void test('a provisional partial holds the original attempt until distinct terminal proof fixes its exact remainder', () => {
  const { simulator } = fixture();
  const attempt = simulator.requestRefund(request);
  const scope = {
    original,
    obligationId: request.obligationId,
    providerReference: attempt.providerReference,
  };
  const partial = {
    ...scope,
    status: 'partial' as const,
    settledPaisa: 2001,
    proofReference: 'fixture-provisional-proof',
    eventReference: 'fixture-provisional',
  };
  simulator.recordOutcome({
    ...scope,
    status: 'uncertain',
    eventReference: 'fixture-uncertain',
  });
  assert.equal(simulator.recordOutcome(partial).settledPaisa, 0);
  assert.equal(simulator.lookupByReference(scope)?.reservedPaisa, 6000);
  assert.equal(simulator.lookupByReference(scope)?.reportedPaisa, 2001);
  assert.throws(
    () =>
      simulator.requestRefund({
        ...request,
        idempotencyKey: 'competing-request',
      }),
    /reserved/i,
  );

  const final = {
    ...partial,
    status: 'closed' as const,
    confirmedUnsentPaisa: 3999,
    eventReference: 'fixture-closed',
  };
  assert.throws(() => simulator.recordOutcome(final), /proof/i);
  const correctFinal = { ...final, proofReference: 'fixture-final-proof' };
  assert.throws(
    () =>
      simulator.recordOutcome({ ...correctFinal, confirmedUnsentPaisa: 3998 }),
    /remainder/i,
  );
  const completed = simulator.recordOutcome(correctFinal);
  assert.equal(completed.settledPaisa, 2001);
  assert.equal(completed.remainingPaisa, 3999);
  assert.equal(completed.reservedPaisa, 0);
  assert.deepEqual(simulator.recordOutcome(correctFinal), completed);
  assert.throws(
    () => simulator.recordOutcome({ ...correctFinal, settledPaisa: 2000 }),
    /replay/i,
  );

  const retry = {
    ...request,
    idempotencyKey: 'fixture-retry',
    amountPaisa: 3999,
  };
  assert.throws(
    () => simulator.requestRefund({ ...retry, amountPaisa: 4000 }),
    /remainder/i,
  );
  assert.throws(
    () => simulator.requestRefund({ ...retry, authorizedPaisa: 7000 }),
    /original authorization/i,
  );
  const second = simulator.requestRefund(retry);
  const secondScope = { ...scope, providerReference: second.providerReference };
  assert.throws(
    () =>
      simulator.recordOutcome({
        ...secondScope,
        status: 'settled',
        settledPaisa: 3998,
        proofReference: 'fixture-retry-proof',
        eventReference: 'fixture-retry-event',
      }),
    /full amount/i,
  );
  const result = simulator.recordOutcome({
    ...secondScope,
    status: 'settled',
    settledPaisa: 3999,
    proofReference: 'fixture-retry-proof',
    eventReference: 'fixture-retry-event',
  });
  assert.equal(result.remainingPaisa, 0);
  assert.equal(simulator.checkEligibility(retry).eligible, false);
});

void test('exact replay and scoped provider reads survive closing admission', () => {
  const { binding, simulator } = fixture();
  const attempt = simulator.requestRefund(request);
  const scope = {
    original,
    obligationId: request.obligationId,
    providerReference: attempt.providerReference,
  };
  assert.deepEqual(simulator.requestRefund(request), attempt);
  assert.throws(
    () => simulator.requestRefund({ ...request, amountPaisa: 5000 }),
    /replay/i,
  );
  assert.equal(
    simulator.lookupByReference({
      ...scope,
      obligationId: 'foreign-obligation',
    }),
    null,
  );
  assert.throws(
    () =>
      simulator.recordOutcome({
        ...scope,
        original: { ...original, sessionNumber: 'foreign-session' },
        status: 'submitted',
        eventReference: 'foreign-event',
      }),
    /scope/i,
  );

  binding[REFUND_ROUTE_CAPABILITIES].fonepaySimulationAdmission = false;
  assert.throws(
    () =>
      simulator.requestRefund({ ...request, idempotencyKey: 'fixture-new' }),
    /disabled/i,
  );
  assert.deepEqual(simulator.requestRefund(request), attempt);
  const submitted = simulator.recordOutcome({
    ...scope,
    status: 'submitted',
    eventReference: 'fixture-submitted',
  });
  assert.deepEqual(simulator.lookupByReference(scope), submitted);
  assert.equal(submitted.reservedPaisa, 6000);
  assert.equal(submitted.settledPaisa, 0);
});

void test('the capture cap and provider evidence cannot be reused by a different obligation', () => {
  const { simulator } = fixture();
  const first = simulator.requestRefund(request);
  const scope = {
    original,
    obligationId: request.obligationId,
    providerReference: first.providerReference,
  };
  const final = {
    ...scope,
    status: 'settled' as const,
    settledPaisa: 6000,
    proofReference: 'fixture-settlement',
    eventReference: 'fixture-settlement-event',
  };
  const newRefund = {
    ...request,
    obligationId: 'different-obligation',
    amountPaisa: 4000,
    authorizedPaisa: 4000,
    idempotencyKey: 'different-request',
  };
  assert.throws(
    () =>
      simulator.requestRefund({
        ...newRefund,
        amountPaisa: 4001,
        authorizedPaisa: 4001,
      }),
    /capture/i,
  );
  const next = simulator.requestRefund(newRefund);
  simulator.recordOutcome(final);
  const nextScope = {
    ...scope,
    obligationId: newRefund.obligationId,
    providerReference: next.providerReference,
  };
  assert.throws(
    () =>
      simulator.recordOutcome({ ...final, ...nextScope, settledPaisa: 4000 }),
    /replay/i,
  );
  assert.throws(
    () =>
      simulator.recordOutcome({
        ...final,
        ...nextScope,
        settledPaisa: 4000,
        eventReference: 'new-event',
      }),
    /proof/i,
  );
  assert.equal(simulator.lookupByReference(nextScope)?.reservedPaisa, 4000);
});
