import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import tailwind from '@tailwindcss/postcss';
import type { Route } from 'playwright';
import postcss from 'postcss';
import { renderToStaticMarkup } from 'react-dom/server';
import { adminSections } from '../components/admin/admin-sections';
import { adminNavigation } from '../lib/admin/navigation';
import { ACTOR_INTENT_HEADER } from '../lib/http/actor-intent';
import { can, moneyViewPermissions } from '../lib/marketplace/permissions';
import { BUILT_IN_STAFF_ACCESS_TEMPLATES } from '../lib/staff/access';
import { incomingParcelFixture } from './helpers/incoming-parcel-fixture';
import { agreedSellerRecoveryFixture } from './helpers/seller-recovery-fixture';

const origin = 'https://money-view.fixture.test';
const viewer = { role: 'admin', permissions: moneyViewPermissions } as const;
const actorId = 'fictional-money-viewer';
const authSubject = 'fictional-money-subject';

declare global {
  var moneyViewFixture: { db: D1Database; subject: string };
}

const reactModule = import.meta.resolve('react');
registerHooks({ resolve(specifier, context, next) {
  const mock = {
    'cloudflare:workers': `export const env={get DB(){return globalThis.moneyViewFixture.db},APP_ORIGIN:${JSON.stringify(origin)},HASTABAZAAR_RUNTIME_ENV:'test'}`,
    '@/app/auth': `export async function getAuthenticatedUser(){return {userId:globalThis.moneyViewFixture.subject}}; export const requireAuthenticatedUser=getAuthenticatedUser;`,
    'next/navigation': `export function redirect(path){throw Object.assign(new Error(path),{status:302,location:path})} export function notFound(){throw Object.assign(new Error('Not found'),{status:404})} export function useRouter(){return{refresh(){}}} export function usePathname(){return '/admin/payments'} export function useSearchParams(){return new URLSearchParams()}`,
    'next/link': `import React from ${JSON.stringify(reactModule)}; export default function Link({prefetch,children,...props}){return React.createElement('a',props,children)}`,
  }[specifier];
  return mock ? { url: 'data:text/javascript,' + encodeURIComponent(mock), shortCircuit: true } : next(specifier, context);
} });

void test('Money profile exposes only its financial tabs and leaves existing templates unchanged', () => {
  const template = BUILT_IN_STAFF_ACCESS_TEMPLATES.find(item => item.id === 'money-view-only');
  assert.deepEqual(template?.permissions, moneyViewPermissions);
  assert.deepEqual(BUILT_IN_STAFF_ACCESS_TEMPLATES.find(item => item.id === 'reports-only')?.permissions, ['audit_log.view']);
  assert.deepEqual(adminSections(viewer.role, viewer.permissions).map(section => [section.label, section.tabs.map(tab => tab.label)]), [
    ['Money', ['Courier cash', 'Payouts', 'Payout run', 'Refunds & recoveries']],
    ['Reports', ['Business report']],
  ]);
  const shown = adminNavigation(viewer.role, viewer.permissions).map(item => item.href);
  assert.deepEqual(new Set(shown), new Set(['/admin/payments', '/admin/payouts', '/admin/payouts/run',
    '/admin/payments/refunds', '/admin/payments/recoveries', '/admin/analytics']));
  for (const right of moneyViewPermissions) assert.equal(can('admin', right), false);
  for (const right of ['payout.prepare', 'payout.approve', 'payout.mark_paid', 'payment.receipt.verify', 'refund.approve.standard', 'refund.approve.high_value', 'audit_log.view'] as const) {
    assert.equal(can(viewer, right), false, right);
  }
});

function assignProfile(fixture: Pick<Awaited<ReturnType<typeof incomingParcelFixture>>, 'now' | 'sqlite'>) {
  const now = fixture.now;
  fixture.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,'Fictional Money Viewer','active','en-NP',?,?)")
    .run(actorId, authSubject, 'money-viewer@fixture.test', now, now);
  fixture.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,'admin','reviewer',?)").run(actorId, now);
  fixture.sqlite.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_at,updated_by) VALUES(?,?,1,?,\'reviewer\')')
    .run(actorId, JSON.stringify(moneyViewPermissions), now);
}

void test('actual Money pages render with read grants and action endpoints refuse the same profile', { timeout: 120_000 }, async () => {
  const cash = await incomingParcelFixture();
  try {
    const finance = await agreedSellerRecoveryFixture();
    try {
      assignProfile(cash);
      assignProfile(finance);
      const { default: courierPage } = await import('../app/admin/payments/page');
      const { default: payoutsPage } = await import('../app/admin/payouts/page');
      const { default: payoutDetail } = await import('../app/admin/payouts/[id]/page');
      const { default: payoutRun } = await import('../app/admin/payouts/run/page');
      const { default: refunds } = await import('../app/admin/payments/refunds/page');
      const { default: recoveries } = await import('../app/admin/payments/recoveries/page');
      const { default: recoveryDetail } = await import('../app/admin/payments/recoveries/[id]/page');
      const { default: reports } = await import('../app/admin/analytics/page');
      const { default: transfers } = await import('../app/admin/payments/payouts/page');
      const { default: adminToday } = await import('../app/admin/page');
      const query = Promise.resolve({});
      const denied = { status: 302, location: '/staff-access-denied' };
      globalThis.moneyViewFixture = { db: cash.db, subject: authSubject };
      const cashHtml = renderToStaticMarkup(await courierPage({ searchParams: query }));
      assert.match(cashHtml, /Fictional exact courier/);
      assert.doesNotMatch(cashHtml, /Save and match|Incoming payments and bank receipts/);
      await assert.rejects(courierPage({ searchParams: Promise.resolve({ view: 'incoming' }) }), denied);
      await assert.rejects(adminToday(), { status: 302, location: '/admin/payments' });

      globalThis.moneyViewFixture = { db: finance.db, subject: authSubject };
      await assert.rejects(transfers(), denied);
      const pages = [
        ['/admin/payments', cashHtml, 'Courier cash'],
        ['/admin/payouts', renderToStaticMarkup(await payoutsPage()), 'Money'],
        ['/admin/payouts/record', renderToStaticMarkup(await payoutDetail({ params: Promise.resolve({ id: finance.payoutId }) })), 'Payout history'],
        ['/admin/payouts/run', renderToStaticMarkup(await payoutRun()), 'Payout run'],
        ['/admin/payments/refunds', renderToStaticMarkup(await refunds({ searchParams: Promise.resolve({ obligation: finance.obligationId }) })), 'Refunds & funding'],
        ['/admin/payments/recoveries', renderToStaticMarkup(await recoveries()), 'Refunds & recoveries'],
        ['/admin/payments/recoveries/record', renderToStaticMarkup(await recoveryDetail({ params: Promise.resolve({ id: finance.recoveryId }) })), 'Seller recovery'],
        ['/admin/analytics', renderToStaticMarkup(await reports({ searchParams: Promise.resolve({ view: 'details' }) })), 'Reports'],
      ] as const;
      for (const [path, html] of pages) {
        assert.doesNotMatch(html, /TEST-RECOVERY-ORIGINAL|TEST-REFUND-001|TEST-MANUAL-0001/, path);
        assert.doesNotMatch(html, /data-form-id="(?:staff\.payout-2|system\.(?:refund|recovery)-finance)"|Download bank file|Apply eligible earnings|Record actual itemized contact|Prepare exact refund packet|Verified funding and bank transfers|Commerce, customers &amp; traffic/, path);
      }

      const payment = await import('../app/api/admin/payments/route');
      const accrual = await import('../app/api/admin/payouts/accrue/route');
      const prepare = await import('../app/api/admin/payouts/route');
      const payoutOperation = await import('../app/api/admin/payouts/[id]/route');
      const payoutRequest = await import('../app/api/admin/payout-requests/[id]/route');
      const runApproval = await import('../app/admin/payouts/run/approve/route');
      const payoutTransfer = await import('../app/api/admin/payout-transfers/route');
      const refundApi = await import('../app/api/admin/refunds/route');
      const recoveryApi = await import('../app/api/admin/recoveries/route');
      const reason = 'Fictional valid reason for a forbidden operation.';
      const post = (path: string, body: object = {}) => new Request(origin + path, { method: 'POST',
        headers: { 'content-type': 'application/json', origin, [ACTOR_INTENT_HEADER]: actorId }, body: JSON.stringify(body) });
      const payoutPath = '/api/admin/payouts/' + finance.payoutId;
      const payoutParams = { params: Promise.resolve({ id: finance.payoutId }) };
      const snapshots = (db: typeof finance.sqlite) => Object.fromEntries([
        ['payouts', db.prepare('SELECT id,status,updated_at FROM payouts ORDER BY id').all()],
        ['refunds', db.prepare('SELECT id,state,revision FROM refund_obligations ORDER BY id').all()],
        ['recoveries', db.prepare('SELECT id,state,revision FROM seller_recovery_cases ORDER BY id').all()],
        ['courier', db.prepare('SELECT COUNT(*) AS count FROM cod_company_receipt_allocations').get()],
      ]);
      const before = snapshots(finance.sqlite);
      const actions = [
        ['courier COD match', () => payment.POST(post('/api/admin/payments', { action: 'reconcile_cod', requestId: 'readonly-cod-match', expectedRevision: '0', input: {} }))],
        ['payout accrual', () => accrual.POST(post('/api/admin/payouts/accrue'))],
        ['payout preparation', () => prepare.POST(post('/api/admin/payouts'))],
        ['payout approval', () => payoutOperation.POST(post(payoutPath, { action: 'approve', idempotencyKey: 'readonly-payout-approve', note: reason }), payoutParams)],
        ['payout paid', () => payoutOperation.POST(post(payoutPath, { action: 'mark_paid', idempotencyKey: 'readonly-payout-paid', note: reason }), payoutParams)],
        ['payout request', () => payoutRequest.POST(post('/api/admin/payout-requests/fixture'), { params: Promise.resolve({ id: 'fixture' }) })],
        ['payout run approval', () => runApproval.POST(post('/admin/payouts/run/approve'))],
        ['payout transfer', () => payoutTransfer.POST(post('/api/admin/payout-transfers', { sourceFormId: 'system.payout-finance', action: 'prepare', requestId: 'readonly-transfer', expectedRevision: null, input: { model: 'registered', payoutId: finance.payoutId, accountVersionId: finance.accountVersionId, reason } }))],
        ['refund operation', () => refundApi.POST(post('/api/admin/refunds'))],
        ['recovery operation', () => recoveryApi.POST(post('/api/admin/recoveries'))],
      ] as const;
      for (const [description, run] of actions) {
        const response = await run();
        assert.equal(response.status, 403, description + ': ' + await response.text());
      }
      assert.deepEqual(snapshots(finance.sqlite), before);

      const cssSource = (await readFile('app/globals.css', 'utf8')).replace("@import 'tailwindcss';", "@import 'tailwindcss' source(none);\n@source '../app/admin';\n@source '../components/admin';\n@source '../components/ui';");
      const css = (await postcss([tailwind()]).process(cssSource, { from: resolve('app/globals.css') })).css +
        await readFile('app/admin/workspace.css', 'utf8');
      const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
      const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
      try {
        const page = await browser.newPage({ reducedMotion: 'reduce' });
        await page.route('**/*', async (route: Route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/fixture.css') return route.fulfill({ status: 200, contentType: 'text/css', body: css });
          const entry = pages.find(([path]) => path === url.pathname);
          if (!entry) return route.abort();
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div class="admin-shell"><aside class="admin-rail"></aside><div class="min-w-0"><main class="admin-workspace min-w-0">' + entry[1] + '</main></div></div>' });
        });
        for (const width of [390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          for (const [path, , heading] of pages) {
            const response = await page.goto(origin + path);
            assert.equal(response?.status(), 200, path);
            await page.getByRole('heading', { name: heading, exact: heading !== 'Payout run' }).first().waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${path} at ${width}px`);
            if (width === 390) {
              const small = await page.locator('main button').evaluateAll((buttons: HTMLButtonElement[]) => buttons.filter(button => {
                const rect = button.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.height < 44 && button.textContent?.trim() !== '?';
              }).map(button => button.textContent?.trim()));
              assert.deepEqual(small, [], `${path} mobile buttons`);
            }
          }
        }
      } finally { await browser.close(); }
    } finally { finance.dispose(); }
  } finally { cash.dispose(); }
});
