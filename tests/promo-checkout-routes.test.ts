import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import {
  createIncentiveDb,
  seedIncentiveCustomer,
  seedIncentiveInventory,
} from './helpers/incentive-db';
import {
  savePromoDraft,
  publishPromo,
} from '../lib/db/repositories/promo-codes';
import { hashOpaqueToken, CART_COOKIE } from '../lib/cart/session';
import {
  FORM_REGISTRY,
  IMPLEMENTED_FORM_ADAPTERS,
} from '../lib/forms/registry';
declare global {
  var checkoutPromoDb: D1Database;
  var checkoutPromoActor: {
    userId: string;
    authSubject: string;
    email: string;
  } | null;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.checkoutPromoDb},APP_ORIGIN:"http://localhost:3000",HASTABAZAAR_RUNTIME_ENV:"test"}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/customer')
      return {
        url: `data:text/javascript,export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function getCustomerUser(){return globalThis.checkoutPromoActor};export async function requireExistingCustomerApi(){if(!globalThis.checkoutPromoActor)throw new CustomerAuthorizationError('Authentication required.',401);return globalThis.checkoutPromoActor;}`,
        shortCircuit: true,
      };
    if (specifier === '@/lib/email/send-order-updates')
      return {
        url: 'data:text/javascript,export async function sendPendingOrderUpdates(){}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/analytics/request')
      return {
        url: 'data:text/javascript,export async function recordRequestTrafficEvent(){return {}}',
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
void test('promo quote receiver rejects unsafe origin and guests', async () => {
  const route = await import('../app/api/checkout/promo/route');
  const req = (origin: string) =>
    new Request('http://localhost:3000/api/checkout/promo', {
      method: 'POST',
      headers: { Origin: origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'SAVE10',
        formVersion: 1,
        customAnswers: [],
      }),
    });
  assert.equal((await route.POST(req('https://attacker.test'))).status, 403);
  assert.equal((await route.POST(req('http://localhost:3000'))).status, 401);
});
void test('promo quote registers actual protected no-answer receiver', () => {
  assert.ok(FORM_REGISTRY['commerce.promo-quote']);
  assert.equal(
    FORM_REGISTRY['commerce.promo-quote'].capabilities.answerBehavior,
    'none',
  );
  assert.equal(
    IMPLEMENTED_FORM_ADAPTERS['commerce.promo-quote']?.route,
    '/api/checkout/promo',
  );
});

void test('actual quote derives live cart/customer/time, records no financial state, and enforces body/version/guess bounds', async () => {
  const f = await createIncentiveDb();
  globalThis.checkoutPromoDb = f.db;
  try {
    await seedIncentiveCustomer(f.db);
    await seedIncentiveCustomer(f.db, 'super');
    await seedIncentiveInventory(f.db);
    await f.db
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
      )
      .run();
    for (const id of [
      'staff.promo-code',
      'commerce.promo-quote',
      'commerce.checkout',
    ])
      await f.db
        .prepare(
          `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,1,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`,
        )
        .bind(
          id + '-v1',
          id,
          JSON.stringify({ formId: id, fields: [] }),
          id + '-seed',
        )
        .run();
    const context = {
      actorId: 'super',
      requestId: 'route-draft',
      expectedVersion: 0,
      now: 100,
      reason: 'Fictional approved campaign',
      form: {
        formId: 'staff.promo-code' as const,
        versionId: 'staff.promo-code-v1',
        answers: {
          formId: 'staff.promo-code' as const,
          version: 1,
          answers: [],
        },
      },
    };
    const d = await savePromoDraft(f.db, context, {
      code: 'SAVE10',
      label: 'Save ten',
      kind: 'fixed',
      fixedPaisa: 1000,
      minimumSubtotalPaisa: 0,
      startsAt: 0,
      endsAt: 253402300799999,
      totalUseLimit: 20,
      perCustomerUseLimit: 3,
      budgetPaisa: 20000,
    });
    await publishPromo(
      f.db,
      { ...context, requestId: 'route-publish', expectedVersion: 1 },
      d.campaignId,
    );
    await f.db
      .prepare(
        "INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES ('cart',?,'NPR',253402300799999,1,1)",
      )
      .bind(await hashOpaqueToken('route-cart'))
      .run();
    await f.db
      .prepare(
        "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('item','cart','product',1,1,1)",
      )
      .run();
    // A quote may not recreate a missing wallet.
    await f.db
      .prepare("DELETE FROM wallet_accounts WHERE user_id='customer'")
      .run();
    globalThis.checkoutPromoActor = {
      userId: 'customer',
      authSubject: 'customer',
      email: 'customer@example.test',
    };
    const route = await import('../app/api/checkout/promo/route');
    const req = (body: unknown) =>
      new Request('http://localhost:3000/api/checkout/promo', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'content-type': 'application/json',
          Cookie: CART_COOKIE + '=route-cart',
        },
        body: JSON.stringify(body),
      });
    const base = { code: ' save10 ', formVersion: 1, customAnswers: [] };
    for (const forged of [
      { discountPaisa: 1 },
      { userId: 'super' },
      { customerId: 'super' },
      { now: 100 },
      { subtotalPaisa: 1 },
      { quoteIntent: 'fake' },
      { customAnswers: [{ fieldId: 'amount', value: 1 }] },
    ])
      assert.equal((await route.POST(req({ ...base, ...forged }))).status, 400);
    assert.equal(
      (await route.POST(req({ ...base, padding: 'x'.repeat(270000) }))).status,
      413,
    );
    assert.equal(
      (await route.POST(req({ ...base, formVersion: 2 }))).status,
      409,
    );
    const counts = async () =>
      Promise.all(
        [
          'users',
          'user_roles',
          'wallet_accounts',
          'orders',
          'promo_redemptions',
          'form_answer_sets',
        ].map(
          async (table) =>
            (await f.db
              .prepare(`SELECT COUNT(*) n FROM ${table}`)
              .first<{ n: number }>())!.n,
        ),
      );
    const before = await counts();
    const quoted = await route.POST(req(base));
    assert.equal(quoted.status, 200);
    const q = (await quoted.json()) as {
      subtotalPaisa: number;
      discountPaisa: number;
      quoteIntent: string;
      code: string;
    };
    assert.equal(q.subtotalPaisa, 10000);
    assert.equal(q.discountPaisa, 1000);
    assert.equal(q.code, 'SAVE10');
    assert.match(q.quoteIntent, /^[a-f0-9]{64}$/);
    assert.equal(
      (await route.GET(new Request('http://localhost:3000/api/checkout/promo')))
        .status,
      405,
    );
    assert.deepEqual(await counts(), before);
    await f.db
      .prepare("UPDATE products SET price_paisa=12000 WHERE id='product'")
      .run();
    const updated = (await (await route.POST(req(base))).json()) as {
      subtotalPaisa: number;
      quoteIntent: string;
    };
    assert.equal(updated.subtotalPaisa, 12000);
    assert.notEqual(updated.quoteIntent, q.quoteIntent);
    let last: Response = quoted;
    for (let i = 0; i < 20; i++) last = await route.POST(req(base));
    assert.equal(last.status, 429);
    assert.deepEqual(await counts(), before);
    // The main receiver must derive identity and money while carrying the server quote.
    await f.db
      .prepare(
        "UPDATE seller_profiles SET seller_agreement_version=? WHERE id='seller'",
      )
      .bind(SELLER_AGREEMENT_VERSION)
      .run();
    const main = await import('../app/api/checkout/route');
    const rate = await f.db
      .prepare(
        "SELECT version_id FROM delivery_rate_current WHERE id='default'",
      )
      .first<{ version_id: string }>();
    const payload = {
      customerEmail: 'forged@example.test',
      customerPhone: '9811111111',
      locale: 'en-NP',
      termsAccepted: true,
      idempotencyKey: crypto.randomUUID(),
      deliveryRateVersion: rate!.version_id,
      promoCode: 'SAVE10',
      promoRevision: 1,
      promoQuoteIntent: updated.quoteIntent,
      formVersion: 1,
      customAnswers: [],
      address: {
        recipientName: 'Fixture Buyer',
        phone: '9811111111',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        locality: 'Fixture locality',
      },
      discountPaisa: 999999,
      subtotalPaisa: 1,
      customerId: 'super',
      now: 100,
    };
    const mainReq = (body: unknown) =>
      new Request('http://localhost:3000/api/checkout', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'content-type': 'application/json',
          Cookie: CART_COOKIE + '=route-cart',
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await main.POST(mainReq({ ...payload, customerAuthSubject: 'forged' })))
        .status,
      400,
    );
    const actor = globalThis.checkoutPromoActor;
    globalThis.checkoutPromoActor = null;
    assert.equal((await main.POST(mainReq(payload))).status, 401);
    globalThis.checkoutPromoActor = actor;
    const placed = await main.POST(mainReq(payload));
    assert.equal(placed.status, 201);
    const result = (await placed.json()) as { grandTotalPaisa: number };
    assert.equal(result.grandTotalPaisa, 26000);
    const stored = await f.db
      .prepare(
        'SELECT customer_id,customer_email,item_subtotal_paisa,promo_discount_paisa FROM orders',
      )
      .first<{
        customer_id: string;
        customer_email: string;
        item_subtotal_paisa: number;
        promo_discount_paisa: number;
      }>();
    assert.equal(stored?.customer_id, 'customer');
    assert.equal(stored?.customer_email, 'customer@example.test');
    assert.equal(stored?.item_subtotal_paisa, 12000);
    assert.equal(stored?.promo_discount_paisa, 1000);
    assert.equal((await main.POST(mainReq(payload))).status, 201);
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM promo_redemptions')
          .first<{ n: number }>()
      )?.n,
      1,
    );
  } finally {
    globalThis.checkoutPromoActor = null;
    await f.dispose();
  }
});
