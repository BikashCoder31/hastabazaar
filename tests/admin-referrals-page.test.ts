import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { seedIncentiveCustomer } from './helpers/incentive-db';

const state = {
  role: 'super_admin',
  db: null as D1Database | null,
  reads: 0,
  createElement,
};
(
  globalThis as typeof globalThis & { referralPageFixture: typeof state }
).referralPageFixture = state;
registerHooks({
  resolve(specifier, context, next) {
    const stubs: Record<string, string> = {
      'cloudflare:workers':
        'export const env={get DB(){return globalThis.referralPageFixture.db}};',
      '@/lib/auth/staff':
        'export async function requireStaffPage(){return {id:"super",authSubject:"super",role:globalThis.referralPageFixture.role}}',
      '@/lib/db/d1':
        'export function requireDatabase(env){globalThis.referralPageFixture.reads++;return env.DB}',
      'next/link':
        'export default function Link({children,prefetch,scroll,...props}){return globalThis.referralPageFixture.createElement("a",props,children)}',
      'next/navigation': 'export function useRouter(){return {refresh(){}}}',
    };
    return stubs[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});

void test('Admin cannot access referral totals, search, filters or settings through direct section URLs', async () => {
  const { default: Page } = await import('../app/admin/referrals/page');
  state.role = 'admin';
  state.reads = 0;
  for (const view of ['overview', 'settings', 'activity', 'history']) {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ view, period: 'today' }) }),
    );
    assert.match(html, /Only the Super Admin/);
    assert.doesNotMatch(
      html,
      /NPR|Referral activity|Review changes|Last 7 days/,
    );
  }
  assert.equal(state.reads, 0);
});

void test('Super Admin overview exposes all four shared date filters, saved offer and exact separate zero totals', async () => {
  const { default: Page } = await import('../app/admin/referrals/page');
  const f = await incentiveReportDatabase();
  try {
    await seedIncentiveCustomer(f.db, 'super');
    f.sqlite.exec(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    );
    state.db = f.db;
    state.role = 'super_admin';
    for (const period of ['today', '7d', '30d', 'all']) {
      const html = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve({ period }) }),
      );
      assert.match(html, /Current saved offer/);
      assert.match(html, /Active/);
      assert.match(html, /Friend discounts applied/);
      assert.match(html, /Referrer rewards waiting/);
      assert.match(html, /Referrer rewards issued/);
      assert.match(html, /Current unused shopping credit/);
      assert.match(html, /Nepal time/);
      assert.match(
        html,
        new RegExp(`period=${period}[^"]*"[^>]*aria-current="true"`),
      );
      assert.doesNotMatch(html, /Discounts \+ potential rewards/);
      assert.match(html, /does not change with the date filter/);
    }
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          view: 'activity',
          q: '<unsafe>',
          status: 'blocked',
        }),
      }),
    );
    assert.match(html, /No referrals match these filters/);
    assert.match(html, /&lt;unsafe&gt;/);
    assert.doesNotMatch(html, /<unsafe>/);
    assert.match(html, /name="period" value="all"/);
    const history = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ view: 'history' }) }),
    );
    assert.match(history, /staff-form-history\?kind=referral-settings/);
    assert.match(history, /admin\/activity/);
    f.sqlite.exec('UPDATE referral_campaign SET enabled=0');
    const paused = renderToStaticMarkup(await Page());
    assert.match(paused, /Paused · no new referrals/);
    assert.match(paused, /accepted orders keep their saved offer/);
  } finally {
    state.db = null;
    f.dispose();
  }
});

void test('recorded activity renders escaped names, the order link and the saved offer instead of current campaign amounts', async () => {
  const { default: Page } = await import('../app/admin/referrals/page');
  const f = await incentiveReportDatabase();
  try {
    for (const id of ['super', 'friend', 'referrer']) await seedIncentiveCustomer(f.db, id);
    f.sqlite.exec(`INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1);
      UPDATE users SET display_name='<script>Maker</script>' WHERE id='referrer';
      INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,
        shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,
        created_at,updated_at,referral_discount_paisa)
        VALUES ('referral-order','HK-REFERRAL','friend','friend@example.test','9800000000','confirmed','en-NP','fixture','{}',10000,500,9500,'cod','unpaid',1,1,1000);
      INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at)
        VALUES ('friend','referrer','referral-order','9800000000',500,14,1)`);
    state.db = f.db; state.role = 'super_admin';
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'activity' }) })).replaceAll('\u00a0', ' ');
    assert.match(html, /href="\/admin\/orders\/referral-order"/);
    assert.match(html, /Friend:.*NPR 10\.00/);
    assert.match(html, /Referrer:.*NPR 5\.00/);
    assert.match(html, /14-day wait/);
    assert.match(html, /Waiting for delivery/);
    assert.match(html, /&lt;script&gt;Maker&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>Maker/);
    assert.match(html, /NPT/);
  } finally { state.db = null; f.dispose(); }
});
