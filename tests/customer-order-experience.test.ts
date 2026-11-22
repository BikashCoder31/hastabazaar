import assert from 'node:assert/strict';
import test from 'node:test';
import { actionableOrderFixture } from './helpers/order-response-fixture';
import { reportPreparationIssue } from '../lib/orders/response-cases';
import { CustomerDelayAnswerError, keepCustomerDelayProposal, readCustomerDelayQuestions } from '../lib/orders/customer-delay-answer';
import { customerDeliveryProblem, customerParcelState } from '../lib/orders/customer-parcel-state';
import { readCustomerOrderParcels } from '../lib/orders/customer-parcels';
import { customerOrderPaymentAction } from '../lib/orders/customer-order-list';

void test('only the buyer can keep the current seller proposal and a retry creates one audit entry', async () => {
  const fixture = await actionableOrderFixture();
  try {
    const now = fixture.releasedAt + 60_000;
    fixture.setClock(now);
    const [item] = fixture.rows;
    const buyer = { id: 'customer', authSubject: 'customer' };
    const caseRow = await reportPreparationIssue(fixture.db,
      { actorId: 'registered-owner', requestId: 'customer-delay-fixture', expectedRevision: null, now },
      { portionId: String(item.portionId), itemIds: [String(item.id)], kind: 'delay',
        detail: 'PRIVATE-SELLER-DETAIL: a material is unavailable in this disposable fixture.', proposedReadyAt: now + 3_600_000 });
    const [question] = await readCustomerDelayQuestions(fixture.db, buyer, { orderId: fixture.orderId });
    assert.equal(question.id, caseRow.id);
    assert.doesNotMatch(JSON.stringify(question), /PRIVATE-SELLER-DETAIL/);
    const input = { caseId: question.id, proposedReadyAt: question.proposedReadyAt, revision: question.revision };
    await assert.rejects(keepCustomerDelayProposal(fixture.db, { ...buyer, authSubject: 'other-subject' }, input),
      (error: unknown) => error instanceof CustomerDelayAnswerError && error.status === 404);
    await assert.rejects(keepCustomerDelayProposal(fixture.db, buyer, { ...input, revision: input.revision + 1 }),
      (error: unknown) => error instanceof CustomerDelayAnswerError && error.status === 409);
    const before = fixture.sqlite.prepare('SELECT * FROM order_response_cases WHERE id=?').get(question.id);
    const result = await keepCustomerDelayProposal(fixture.db, buyer, input);
    assert.deepEqual(await keepCustomerDelayProposal(fixture.db, buyer, input), result);
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM order_response_cases WHERE id=?').get(question.id), before);
    assert.deepEqual(await readCustomerDelayQuestions(fixture.db, buyer, { orderId: fixture.orderId }), []);
    assert.equal((await readCustomerDelayQuestions(fixture.db, buyer, { orderId: fixture.orderId, includeAnswered: true }))[0].answered, true);
    const audit = fixture.sqlite.prepare("SELECT actor_id,reason,created_at FROM audit_logs WHERE action='order.response.customer.kept' AND subject_id=?").all(question.id);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor_id, buyer.id);
    assert.ok(Number(audit[0].created_at) > 0);
    assert.match(String(audit[0].reason), /chose to keep/);
    fixture.sqlite.prepare("DELETE FROM user_roles WHERE user_id=? AND role='customer'").run(buyer.id);
    await assert.rejects(keepCustomerDelayProposal(fixture.db, buyer, input),
      (error: unknown) => error instanceof CustomerDelayAnswerError && error.status === 404);
  } finally { fixture.dispose(); }
});

void test('parcel presentation uses the active actor and the customer-safe delivery reason', () => {
  const expected = {
    placed: 'hastabazaar', confirmed: 'seller', packing: 'seller', ready_for_pickup: 'courier', pickup_requested: 'courier',
    label_pending: 'courier', label_ready: 'courier', pickup_scheduled: 'courier', dispatched: 'courier', delivery_failed: 'hastabazaar',
    return_to_origin: 'courier', returning: 'courier', returned: 'done', delivered: 'done', cancelled: 'done', awaiting_cod_confirmation: 'hastabazaar',
  };
  for (const [status, actor] of Object.entries(expected)) assert.equal(customerParcelState({ status }).actor, actor, status);
  assert.equal(customerParcelState({ status: 'confirmed', proposedDate: true }).actor, 'you');
  assert.equal(customerParcelState({ status: 'placed', bankDue: true }).actor, 'you');
  assert.equal(customerParcelState({ status: 'placed', bankReview: true }).actor, 'hastabazaar');
  assert.equal(customerParcelState({ status: 'placed', codPending: true }).condition, 'waiting');
  assert.equal(customerParcelState({ status: 'cancelled', bankDue: true, proposedDate: true }).actor, 'done');
  assert.equal(customerParcelState({ status: 'ready_for_pickup' }).stage, 'packed');
  assert.equal(customerParcelState({ status: 'dispatched' }).stage, 'with-courier');
  assert.equal(customerParcelState({ status: 'delivered' }).stage, 'delivered');
  assert.equal(customerParcelState({ status: 'delivery_failed' }).condition, 'problem');
  assert.equal(customerDeliveryProblem('not_reached'), 'The courier couldn’t reach you.');
  assert.doesNotMatch(customerDeliveryProblem('PRIVATE-COURIER-NOTE'), /PRIVATE-COURIER-NOTE/);
});

void test('existing bank balances, claim review and cutoff decide whose turn payment is', () => {
  const payable = { status: 'placed', paymentMode: 'prepaid', paymentDeadline: 200, paymentCutoff: 300,
    paymentClosed: null, paymentVerified: null, paymentReleased: null, claimStatus: null,
    remainingPaisa: 10_500, paymentException: 0, now: 100 };
  assert.deepEqual(customerOrderPaymentAction(payable), { bankAction: true, bankReview: false });
  assert.deepEqual(customerOrderPaymentAction({ ...payable, remainingPaisa: null }), { bankAction: false, bankReview: false });
  assert.deepEqual(customerOrderPaymentAction({ ...payable, claimStatus: 'submitted' }), { bankAction: false, bankReview: true });
  assert.deepEqual(customerOrderPaymentAction({ ...payable, paymentVerified: 101 }), { bankAction: false, bankReview: true });
  assert.deepEqual(customerOrderPaymentAction({ ...payable, now: 210, claimStatus: 'needs_information' }), { bankAction: true, bankReview: false });
  assert.deepEqual(customerOrderPaymentAction({ ...payable, now: 310, claimStatus: 'needs_information' }), { bankAction: false, bankReview: false });
  assert.deepEqual(customerOrderPaymentAction({ ...payable, paymentException: 1 }), { bankAction: false, bankReview: true });
});

void test('the shared parcel read works before the delivery-reason migration and ships only authorized order scope', async () => {
  const fixture = await actionableOrderFixture({ secondOffer: true });
  try {
    const result = await readCustomerOrderParcels(fixture.db, [fixture.orderId, 'missing-order']);
    const parcels = result.get(fixture.orderId) ?? [];
    assert.equal(result.has('missing-order'), false);
    assert.ok(parcels.length);
    assert.equal(parcels.flatMap(parcel => parcel.items).length, fixture.rows.length);
    assert.ok(parcels.every(parcel => parcel.status === 'confirmed' && parcel.failureReason === null && parcel.codPaisa === null));
    const publicRead = await readCustomerOrderParcels(fixture.db, [fixture.orderId], { withItems: false, withCash: false });
    assert.ok(publicRead.get(fixture.orderId)?.every(parcel => !parcel.items.length && parcel.codPaisa === null));
  } finally { fixture.dispose(); }
});
