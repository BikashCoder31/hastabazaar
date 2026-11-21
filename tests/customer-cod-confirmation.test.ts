import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/public-checkout-runtime';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';
import { installFixtureCustomerCodSchema } from './helpers/customer-cod-fixture';
import { readCustomerWorkspace } from '../lib/admin/customers';
import { setCustomerCodConfirmation } from '../lib/admin/customers-cod-confirmation';
import { confirmFirstCodReview, customerMustConfirmCod, getFirstCodReview } from '../lib/orders/first-cod-review';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { saveFormDraft, publishFormDraft } from '../lib/db/repositories/form-catalog';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { readTodayCodConfirmations } from '../components/admin/overview-today-data';

const note = 'Customer did not confirm the cash-on-delivery order.';
const reviewer = { actorId: 'reviewer', actorSubject: 'reviewer' };
const flag = { ...reviewer, customerId: 'customer', enabled: true, reason: 'Record repeated issues reported by the courier.', requestId: 'cod-fixture-changed', now: Date.now() };

async function checkout(fixture: Awaited<ReturnType<typeof publicCheckoutFixture>>) {
  globalThis.publicCheckoutDb = fixture.db;
  globalThis.publicCheckoutActor = { userId: 'customer', authSubject: 'customer', email: 'customer@local.hastabazaar.test' };
  const { POST } = await import('../app/api/checkout/route');
  const response = await POST(fixture.request());
  const body = await response.json() as { orderNumber: string };
  assert.equal(response.status, 201, JSON.stringify(body));
  const order = fixture.sqlite.prepare('SELECT id, grand_total_paisa AS total FROM orders WHERE order_number=?').get(body.orderNumber);
  assert.ok(order);
  return { id: String(order.id), total: Number(order.total), orderNumber: body.orderNumber };
}

void test('uninstalled customer toggle is hidden and a low-total cash checkout is unchanged', async () => {
  const f = await publicCheckoutFixture();
  try {
    const customers = await readCustomerWorkspace(f.db, { customer: 'customer' }, Date.now());
    assert.equal(customers.customer?.codConfirmationRequired, null);
    assert.equal(await customerMustConfirmCod(f.db, 'customer'), false);
    await assert.rejects(() => setCustomerCodConfirmation(f.db, flag), { status: 404 });
    const order = await checkout(f);
    assert.equal(await getFirstCodReview(f.db, order.id), null);
    assert.deepEqual(await readTodayCodConfirmations(f.db, '/admin'), []);
  } finally {
    globalThis.publicCheckoutActor = null;
    f.dispose();
  }
});

void test('only Super Admin can switch the installed flag, with an immutable reason on exact replay', async () => {
  const f = await publicCheckoutFixture();
  try {
    installFixtureCustomerCodSchema(f.sqlite);
    await assert.rejects(() => setCustomerCodConfirmation(f.db, { ...flag, actorId: 'delegate', actorSubject: 'delegate' }));
    await assert.rejects(() => setCustomerCodConfirmation(f.db, { ...flag, reason: ' ' }), { status: 400 });
    await setCustomerCodConfirmation(f.db, flag);
    await setCustomerCodConfirmation(f.db, flag);
    await assert.rejects(() => setCustomerCodConfirmation(f.db, { ...flag, reason: 'Different request with the same key.' }), { status: 409 });
    const on = await readCustomerWorkspace(f.db, { customer: 'customer' }, Date.now());
    assert.equal(on.customer?.codConfirmationRequired, true);
    assert.equal(await customerMustConfirmCod(f.db, 'customer'), true);
    await setCustomerCodConfirmation(f.db, { ...flag, enabled: false, requestId: 'cod-fixture-turned-off', reason: 'Remove the contact requirement after review.' });
    assert.equal(await customerMustConfirmCod(f.db, 'customer'), false);
    const audit = f.sqlite.prepare("SELECT actor_id, subject_id, reason FROM audit_logs WHERE action='customer.cod_confirmation.changed' ORDER BY rowid").all();
    assert.deepEqual(audit.map(row => ({ ...row })), [
      { actor_id: 'reviewer', subject_id: 'customer', reason: flag.reason },
      { actor_id: 'reviewer', subject_id: 'customer', reason: 'Remove the contact requirement after review.' },
    ]);
    assert.equal(await getFirstCodReview(f.db, (await checkout(f)).id), null);
  } finally {
    globalThis.publicCheckoutActor = null;
    f.dispose();
  }
});

void test('customer flag holds checkout before seller work and adds the exact order to Today until staff confirms', async () => {
  const f = await publicCheckoutFixture();
  try {
    installFixtureCustomerCodSchema(f.sqlite);
    await setCustomerCodConfirmation(f.db, flag);
    const order = await checkout(f);
    const review = await getFirstCodReview(f.db, order.id);
    assert.equal(review?.status, 'pending');
    assert.equal(review?.totalPaisa, order.total);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM order_response_portions WHERE order_id=?').get(order.id)?.total, 0);
    const [task] = await readTodayCodConfirmations(f.db, '/admin');
    assert.equal(task.codConfirmationOrderId, order.id);
    assert.equal(task.title, 'Call to confirm COD order ' + order.orderNumber);
    assert.match(task.context, /Fictional|9811111111/);
    await confirmFirstCodReview(f.db, {
      orderId: order.id, actorId: 'reviewer', reason: 'Customer confirmed this order by phone.', requestId: 'phone-confirmed-fixture', now: Date.now(),
    });
    assert.equal((await getFirstCodReview(f.db, order.id))?.status, 'confirmed');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM order_response_portions WHERE order_id=?').get(order.id)?.total, 1);
    assert.deepEqual(await readTodayCodConfirmations(f.db, '/admin'), []);
  } finally {
    globalThis.publicCheckoutActor = null;
    f.dispose();
  }
});

void test('cancel from Today uses the audited native cancellation and an exact retry', async () => {
  const f = await publicCheckoutFixture();
  try {
    installFixtureCustomerCodSchema(f.sqlite);
    await setCustomerCodConfirmation(f.db, flag);
    const order = await checkout(f);
    const formId = 'staff.order-fulfillment';
    const draft = await saveFormDraft(f.db, {
      formId, actorId: 'reviewer', actorRole: 'super_admin', expectedPublishedVersion: 0,
      config: { formId, fields: [] }, reason: 'Publish an isolated native fulfillment test form.', requestId: 'test-publish-form-draft', now: Date.now(),
    });
    const published = await publishFormDraft(f.db, {
      formId, draftId: draft.id, actorId: 'reviewer', actorRole: 'super_admin', expectedDraftRevision: draft.revision,
      expectedPublishedVersion: 0, reason: 'Publish an isolated native fulfillment test form.', requestId: 'test-publish-form', now: Date.now(),
    });
    const requestId = 'test-cancel-not-confirmed';
    const form = await validateSellerFormSubmission(f.db, formId, published.version, [], requestId);
    const change = { orderId: order.id, actorId: 'reviewer', requestId, action: 'cancel' as const, note,
      codNotConfirmed: true, now: Date.now(), form: { requestId, versionId: form.versionId, answers: form.answers } };
    await transitionAdminFulfillment(f.db, change);
    await transitionAdminFulfillment(f.db, change);
    await assert.rejects(() => transitionAdminFulfillment(f.db, { ...change, codNotConfirmed: false }), /reference already used/);
    assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(order.id)?.status, 'cancelled');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM order_cancellation_events WHERE order_id=?').get(order.id)?.total, 1);
    const audit = f.sqlite.prepare("SELECT actor_id, reason, next_json FROM audit_logs WHERE action='cancellation.form_submitted' AND subject_id=?").get(order.id);
    assert.equal(audit?.actor_id, 'reviewer');
    assert.equal(audit.reason, note);
    assert.equal((JSON.parse(String(audit.next_json)) as { codNotConfirmed: boolean }).codNotConfirmed, true);
    assert.deepEqual(await readTodayCodConfirmations(f.db, '/admin'), []);
  } finally {
    globalThis.publicCheckoutActor = null;
    f.dispose();
  }
});

void test('installed customer flag never applies a COD hold to a bank-payment checkout', async () => {
  const f = await publicCheckoutFixture({ bank: true });
  try {
    installFixtureCustomerCodSchema(f.sqlite);
    await setCustomerCodConfirmation(f.db, flag);
    const order = await checkout(f);
    assert.equal(await getFirstCodReview(f.db, order.id), null);
    assert.equal(f.sqlite.prepare('SELECT payment_mode FROM orders WHERE id=?').get(order.id)?.payment_mode, 'prepaid');
  } finally {
    globalThis.publicCheckoutActor = null;
    f.dispose();
  }
});
