import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import {
  seedIncentiveCustomer,
  seedIncentiveInventory,
  incentiveItem,
} from './helpers/incentive-db';
import { publishForm } from './helpers/loyalty-fixture';
import { claimDailyPoints } from '../lib/db/repositories/loyalty';

declare global {
  var incentiveReportRouteDb: D1Database;
  var incentiveReportRouteActor: {
    id: string;
    authSubject: string;
    role: 'admin' | 'super_admin';
  } | null;
  var incentiveReportAuthRedirect: boolean;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.incentiveReportRouteDb}}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: `data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){if(permission!=='commercial_policy.manage')throw new Error('Wrong staff permission');if(globalThis.incentiveReportAuthRedirect)throw new Error('NEXT_REDIRECT secret private account');if(!globalThis.incentiveReportRouteActor)throw new StaffAuthorizationError('Authentication required.',401);return globalThis.incentiveReportRouteActor;}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const NOW = Date.parse('2026-09-29T00:00:00Z');
async function routes() {
  const promo = await import('../app/api/admin/promo-codes/report/route').catch(
    () => null,
  );
  const loyalty = await import('../app/api/admin/loyalty/report/route').catch(
    () => null,
  );
  assert.ok(promo, 'The promo report route must exist');
  assert.ok(loyalty, 'The loyalty report route must exist');
  return [promo, loyalty];
}
async function fixture() {
  const f = await incentiveReportDatabase();
  globalThis.incentiveReportRouteDb = f.db;
  globalThis.incentiveReportRouteActor = {
    id: 'super',
    authSubject: 'super',
    role: 'super_admin',
  };
  globalThis.incentiveReportAuthRedirect = false;
  for (const id of ['super', 'admin', 'customer'])
    await seedIncentiveCustomer(f.db, id);
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('admin','admin',1)",
    )
    .run();
  await f.db
    .prepare(
      "UPDATE users SET display_name='=HYPERLINK(attack)' WHERE id='customer'",
    )
    .run();
  await seedIncentiveInventory(f.db);
  await publishForm(f.db, 'account.daily-reward');
  await f.db
    .prepare(
      "INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES ('campaign','SAVE10',1,1)",
    )
    .run();
  await f.db
    .prepare(`INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at)
    VALUES ('campaign',1,'Artisan gift','fixed',1000,0,0,253402300799999,100,100,100000,'super','seed-promo','Fixture','promo-form',1)`)
    .run();
  await f.db
    .prepare(
      "UPDATE promo_campaigns SET current_revision=1,status='published' WHERE id='campaign'",
    )
    .run();
  for (let i = 0; i < 27; i++) {
    const id = `order-${String(i).padStart(2, '0')}`;
    await f.db.batch([
      f.db
        .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label)
        VALUES (?,?,'customer','customer@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,9500,'cod','unpaid',1,1,1000,'campaign',1,'SAVE10','Artisan gift')`)
        .bind(id, `FIX-${id}`),
      incentiveItem(f.db, `${id}-a`, id, 1000),
      f.db
        .prepare(`INSERT INTO promo_redemptions(id,campaign_id,revision,customer_id,order_id,actor_id,request_id,payload_digest,response_json,discount_paisa,subtotal_paisa,created_at)
        VALUES (?,'campaign',1,'customer',?,'customer',?,?,'{}',1000,10000,?)`)
        .bind(`promo-${id}`, id, `request-${id}`, 'a'.repeat(64), NOW + i),
    ]);
  }
  await f.db
    .prepare(`INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at)
    VALUES (1,1,100,100,1000,0,253402300799999,10000,100000,'super','seed-loyalty','Fixture','loyalty-form',1)`)
    .run();
  await f.db
    .prepare('UPDATE loyalty_config SET current_revision=1,paused=0')
    .run();
  for (let i = 0; i < 27; i++)
    await claimDailyPoints(f.db, {
      userId: 'customer',
      authSubject: 'customer',
      requestId: `claim-${i}`,
      expectedVersion: 1,
      formVersionId: 'account.daily-reward-v1',
      now: NOW + i * 86400000,
    });
  return f;
}
const request = (kind: number, query = '') =>
  new Request(
    `http://localhost/api/admin/${kind === 0 ? 'promo-codes' : 'loyalty'}/report${query ? `?${query}` : ''}`,
  );

void test('report JSON and CSV require active exact Super Admin identity and keep failures private', async () => {
  const handlers = await routes();
  const f = await fixture();
  try {
    for (const [kind, route] of handlers.entries()) {
      for (const format of ['', 'format=csv']) {
        globalThis.incentiveReportRouteActor = null;
        let response = await route.GET(request(kind, format));
        assert.equal(response.status, 401);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        globalThis.incentiveReportRouteActor = {
          id: 'admin',
          authSubject: 'admin',
          role: 'admin',
        };
        assert.equal((await route.GET(request(kind, format))).status, 403);
        globalThis.incentiveReportRouteActor = {
          id: 'super',
          authSubject: 'other-subject',
          role: 'super_admin',
        };
        assert.equal((await route.GET(request(kind, format))).status, 403);
        globalThis.incentiveReportRouteActor = {
          id: 'super',
          authSubject: 'super',
          role: 'super_admin',
        };
        await f.db
          .prepare("UPDATE users SET status='disabled' WHERE id='super'")
          .run();
        assert.equal((await route.GET(request(kind, format))).status, 403);
        await f.db
          .prepare("UPDATE users SET status='active' WHERE id='super'")
          .run();
        globalThis.incentiveReportAuthRedirect = true;
        response = await route.GET(request(kind, format));
        assert.equal(response.headers.get('Location'), null);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.doesNotMatch(
          await response.text(),
          /secret|NEXT_REDIRECT|private account/,
        );
        globalThis.incentiveReportAuthRedirect = false;
      }
    }
  } finally {
    f.dispose();
  }
});

void test('report query validation rejects duplicates, unknown fields, invalid dates and invalid pagination', async () => {
  const handlers = await routes();
  const f = await fixture();
  try {
    for (const [kind, route] of handlers.entries()) {
      for (const query of [
        'page=1&page=2',
        'query=a&query=b',
        'format=csv&format=csv',
        'unexpected=x',
        'q=x',
        'format=exe',
        'page=0',
        'page=-1',
        'page=1.2',
        'page=1e2',
        'page=',
        'page=100001',
        'historyPage=0',
        'customerPage=0',
        'from=2026-02-30',
        'from=2026-09-30&to=2026-09-29',
        `query=${'x'.repeat(101)}`,
      ]) {
        const response = await route.GET(request(kind, query));
        assert.equal(response.status, 400, `${kind}:${query}`);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
      }
      const response = await route.GET(
        request(kind, 'page=2&historyPage=1&customerPage=2'),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const report = (await response.json()) as {
        activity: unknown[];
        activityCount: number;
      };
      assert.equal(report.activity.length, 2);
      assert.equal(report.activityCount, 27);
    }
  } finally {
    f.dispose();
  }
});

void test('CSV exports only the current filtered activity page with Nepal dates, NPR money and formula neutralization', async () => {
  const handlers = await routes();
  const f = await fixture();
  try {
    for (const [kind, route] of handlers.entries()) {
      const response = await route.GET(
        request(
          kind,
          'format=csv&page=2&query=HYPERLINK&from=2026-09-29&to=2026-10-25',
        ),
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get('Content-Type') ?? '', /text\/csv/);
      assert.match(
        response.headers.get('Content-Disposition') ?? '',
        /attachment/,
      );
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const csv = await response.text();
      assert.equal(csv.trimEnd().split('\r\n').length, 3);
      assert.match(csv, /"'=HYPERLINK\(attack\)"/);
      assert.match(csv, /NPT/);
      assert.match(csv, /NPR/);
      assert.doesNotMatch(csv, /"customer","=HYPERLINK/);
      const empty = await route.GET(
        request(kind, 'format=csv&query=nobody-matches'),
      );
      assert.equal((await empty.text()).trimEnd().split('\r\n').length, 1);
    }
  } finally {
    f.dispose();
  }
});
