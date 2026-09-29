import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { categoryMediaDb } from './helpers/category-media-db';
import { prepareFirstCodReview } from '../lib/orders/first-cod-review';
import { orderPresentation } from '../lib/commerce/order-presentation';
const context = globalThis as typeof globalThis & {
  codDb: D1Database;
  codActor: string | null;
};
registerHooks({
  resolve(specifier, ctx, next) {
    const stubs: Record<string, string> = {
      'cloudflare:workers':
        'export const env={get DB(){return globalThis.codDb}}',
      '@/lib/auth/staff':
        'export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){if(permission!=="order.manage")throw Error("Wrong permission");if(!globalThis.codActor)throw new StaffAuthorizationError("Authentication required",401);return {id:globalThis.codActor,role:"admin"}}',
    };
    return stubs[specifier]
      ? {
          url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]),
          shortCircuit: true,
        }
      : next(specifier, ctx);
  },
});
void test('held customer wording says awaiting confirmation, cancellation wording remains accurate', () => {
  assert.equal(
    orderPresentation('confirmed', 'pending', true).title,
    'Your order is awaiting COD confirmation.',
  );
  assert.equal(
    orderPresentation('cancelled', 'pending', true).title,
    'Your order was cancelled.',
  );
});
void test('staff COD confirmation endpoint protects origin/auth/body/current permission, binds replay and records one decision', async () => {
  assert.ok(
    existsSync(
      new URL(
        '../app/api/admin/orders/[id]/first-cod-confirmation/route.ts',
        import.meta.url,
      ),
    ),
    'Confirmation endpoint exists',
  );
  const { POST } =
    await import('../app/api/admin/orders/[id]/first-cod-confirmation/route');
  const f = await categoryMediaDb();
  context.codDb = f.db;
  context.codActor = null;
  try {
    for (const [id, role] of [
      ['buyer', 'customer'],
      ['admin', 'admin'],
      ['outsider', 'customer'],
    ]) {
      f.sqlite
        .prepare(
          "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'Fictional','active',1,1)",
        )
        .run(id, id, id + '@example.test');
      f.sqlite
        .prepare(
          'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
        )
        .run(id, role);
    }
    f.sqlite.exec(
      "INSERT INTO orders(id,order_number,receipt_token_hash,customer_id,customer_email,customer_phone,status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at) VALUES ('held','held','hash','buyer','buyer@example.test','9800000000','confirmed','en-NP','NPR','fixture','{}','{}',490000,0,10000,0,0,500000,'cod','pending',100,100,100)",
    );
    await f.db.batch(
      prepareFirstCodReview(f.db, {
        customerId: 'buyer',
        orderId: 'held',
        totalPaisa: 500000,
        now: 100,
      }),
    );
    const { transitionSellerFulfillment, transitionAdminFulfillment } =
      await import('../lib/db/repositories/fulfillment');
    const { prepareSellerParcels } = await import('../lib/operations/parcels');
    const { assignDelivery } = await import('../lib/delivery/repository');
    for (const action of ['start_packing', 'ready_for_pickup'] as const)
      await assert.rejects(
        () =>
          transitionSellerFulfillment(f.db, {
            orderId: 'held',
            sellerId: 's',
            actorId: 'buyer',
            action,
            note: 'Fictional gate check',
            requestId: 'gate-' + action,
            now: 101,
          }),
        /awaiting.*confirmation/,
      );
    for (const action of ['dispatch', 'deliver'] as const)
      await assert.rejects(
        () =>
          transitionAdminFulfillment(f.db, {
            orderId: 'held',
            actorId: 'admin',
            action,
            note: 'Fictional gate check',
            requestId: 'gate-' + action,
            now: 101,
          }),
        /awaiting.*confirmation/,
      );
    await assert.rejects(
      () =>
        prepareSellerParcels(f.db, {
          orderId: 'held',
          actorId: 'admin',
          requestId: 'gate-parcels',
          now: 101,
        }),
      /awaiting.*confirmation/,
    );
    await assert.rejects(
      () =>
        assignDelivery(f.db, {
          orderId: 'held',
          actorId: 'admin',
          method: 'courier',
          courierName: 'Fictional',
          now: 101,
        }),
      /awaiting.*confirmation/,
    );
    const body = {
      reason: 'Buyer confirmed the order by phone.',
      requestId: 'confirm-route-1',
    };
    const request = (payload: unknown = body, origin = 'https://cod.test') =>
      new Request(
        'https://cod.test/api/admin/orders/held/first-cod-confirmation',
        {
          method: 'POST',
          headers: { Origin: origin, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
    const post = (r: Request) =>
      POST(r, { params: Promise.resolve({ id: 'held' }) });
    assert.equal((await post(request())).status, 401);
    context.codActor = 'admin';
    assert.equal(
      (await post(request(body, 'https://hostile.test'))).status,
      403,
    );
    assert.equal(
      (await post(request({ ...body, status: 'confirmed' }))).status,
      400,
    );
    assert.equal((await post(request({ ...body, reason: 'bad' }))).status, 400);
    assert.equal(
      (await post(request({ ...body, reason: 'x'.repeat(20000) }))).status,
      413,
    );
    context.codActor = 'outsider';
    assert.equal((await post(request())).status, 409);
    context.codActor = 'admin';
    assert.equal((await post(request())).status, 200);
    assert.equal((await post(request())).status, 200);
    assert.equal(
      (await post(request({ ...body, reason: 'A different staff decision.' })))
        .status,
      409,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action='order.first_cod_confirmed'",
        )
        .get()!.n,
      1,
    );
  } finally {
    f.dispose();
  }
});

void test('pending COD emails and tracking presentation explicitly await confirmation', async () => {
  const { buildOrderEmail } = await import('../lib/email/order-updates');
  const { orderProgress } = await import('../lib/orders/progress');
  const email = buildOrderEmail(
    {
      orderNumber: 'FICTIONAL-1',
      eventStatus: 'confirmed',
      currentStatus: 'confirmed',
      firstCodPending: true,
      email: 'fictional@example.test',
      cashPaisa: 500000,
      walletPaisa: 0,
      discountPaisa: 0,
      trackingCode: null,
      occurredAt: 100,
    },
    'https://cod.test',
  );
  assert.match(email.subject, /Awaiting COD confirmation/);
  assert.match(email.text, /before.*packing|before.*preparing/i);
  assert.doesNotMatch(email.html, />Confirmed</);
  assert.equal(
    orderProgress('awaiting_cod_confirmation').label,
    'Awaiting COD confirmation',
  );
});
