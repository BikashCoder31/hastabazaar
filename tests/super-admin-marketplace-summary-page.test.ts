import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const fixture = {
  createElement,
  role: 'super_admin',
  permissions: ['audit_log.view'],
  privateReads: 0,
  databaseReads: 0,
  bankTransferReads: 0,
  bankTransferCount: 0,
  periods: [] as string[],
  topSellers: [
    {
      sellerId: 'seller-1',
      sellerName: 'Clay & <Craft>',
      salesPaisa: 123456,
      orderCount: 2,
      unitsDelivered: 3,
    },
  ],
};
(
  globalThis as typeof globalThis & {
    marketplaceDashboardFixture?: typeof fixture;
  }
).marketplaceDashboardFixture = fixture;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers': 'export const env={};',
      'next/navigation':
        'export function redirect(path){throw new Error("Redirect: "+path)};export function usePathname(){return "/admin"};export function useSearchParams(){return new URLSearchParams()};export function useRouter(){return{refresh(){},push(){},replace(){}}}',
      'next/link':
        'export default function Link({children,scroll,prefetch,...props}){return globalThis.marketplaceDashboardFixture.createElement("a",props,children)}',
      '@/lib/auth/staff':
        'export async function requireStaffPage(){const f=globalThis.marketplaceDashboardFixture;return {id:"fixture",displayName:"Local Super Admin",role:f.role,permissions:f.permissions}}',
      '@/lib/db/d1':
        'export function requireDatabase(){globalThis.marketplaceDashboardFixture.databaseReads++;return {batch:async()=>[]}}',
      // This file isolates page rendering. Actual database/scope races run in admin-overview-authority.test.ts.
      '@/lib/db/repositories/staff-mutation-guard':
        'export async function staffMutationGuard(){const f=globalThis.marketplaceDashboardFixture;return {role:f.role,permissions:f.permissions,statements:[]}}',
      '@/lib/db/repositories/admin-workspace':
        'export async function getAdminWorkSummary(){return {sellers:0,products:0,readyOrders:0,returns:0,complaints:0,payoutRequests:0,approvals:null}}',
      '@/lib/payments/bank-transfer-queue':
        'export async function readBankTransferWorkCount(){const f=globalThis.marketplaceDashboardFixture;f.bankTransferReads++;return f.bankTransferCount}',
      '@/lib/db/repositories/admin-marketplace-summary':
        'export async function getSuperAdminMarketplaceSummary(db,role,now,period){const f=globalThis.marketplaceDashboardFixture;f.privateReads++;f.periods.push(period);if(role!=="super_admin")throw Error("Private summary queried by Admin");return {users:{total:12},sellers:{total:7,approved:3,pendingReview:2},topSellers:f.topSellers}}',
    };
    return stubs[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});

void test('Super Admin sees account totals and a clearly labelled, escaped seller ranking', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'super_admin';
  fixture.privateReads = 0;
  const html = renderToStaticMarkup(await Dashboard());
  assert.match(html, /Marketplace summary/);
  assert.match(html, /Users registered/);
  assert.doesNotMatch(html, /New users/);
  assert.match(html, /Seller sign-ups/);
  assert.match(html, /Approved sellers/);
  assert.match(html, /Awaiting review/);
  for (const [label, value] of [
    ['Users registered', '12'],
    ['Seller sign-ups', '7'],
    ['Approved sellers', '3'],
    ['Awaiting review', '2'],
  ]) {
    assert.match(
      html,
      new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${value}</dd>`),
    );
  }
  assert.match(html, /Top 5 sellers/);
  assert.match(html, /All time/);
  assert.match(html, /refunds and commission are not deducted/i);
  assert.match(html, /Clay &amp; &lt;Craft&gt;/);
  assert.match(html, /1,234\.56/);
  assert.match(html, /Orders/);
  assert.match(html, /Items/);
  assert.equal(fixture.privateReads, 1);
});

void test('Today puts operational metrics before the task board and keeps the marketplace report reachable',async()=>{
 const {default:Dashboard}=await import('../app/admin/page');fixture.role='super_admin';fixture.topSellers=[];
 fixture.bankTransferCount=2;
 const html=renderToStaticMarkup(await Dashboard());
 fixture.bankTransferCount=0;
 assert.match(html,/<h1[^>]*>Good morning, Local<\/h1>/);assert.match(html,/with no owner yet/);
 for(const label of ['Orders today','Courier cash due','Returns &amp; complaints','System checks','Needs action','Refresh checks'])assert.ok(html.includes(label),label);
 assert.ok(html.indexOf('aria-label="Work totals"')<html.indexOf('id="seller-review-queue"'));
 assert.ok(html.indexOf('id="seller-review-queue"')<html.indexOf('data-operational-summary'));
 assert.match(html,/<details[^>]*data-operational-summary="true"[^>]*>/);
 assert.doesNotMatch(html,/<details[^>]*data-operational-summary="true"[^>]*\sopen(?:=|>)/);
 assert.match(html,/System health is unknown/);assert.doesNotMatch(html,/All clear/);
 assert.match(html,/Recent decisions/);assert.ok(html.indexOf('recent-decisions-heading')<html.indexOf('data-operational-summary'));
 assert.match(html,/2 transfers need attention/);assert.match(html,/href="\/admin\/payments\?view=incoming"/);
});

void test('Admin with report access receives no private summary markup or reads', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'admin';
  fixture.permissions = ['audit_log.view'];
  fixture.privateReads = 0;
  const html = renderToStaticMarkup(await Dashboard());
  assert.doesNotMatch(
    html,
    /Marketplace summary|Clay|Seller sign-ups|Top 5 sellers/,
  );
  assert.equal(fixture.privateReads, 0);
});

void test('narrowly scoped staff can enter Overview without private reports or finance reads', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'admin';
  fixture.permissions = [];
  fixture.privateReads = 0;
  fixture.databaseReads = 0;
  fixture.bankTransferReads = 0;
  const html=renderToStaticMarkup(await Dashboard());
  assert.match(html,/Good morning/);
  assert.doesNotMatch(html,/Marketplace summary|Top 5 sellers|href="\/admin\/analytics"|href="\/admin\/activity"|Check bank transfers/);
  assert.equal(fixture.privateReads, 0);
  assert.equal(fixture.bankTransferReads, 0);
  assert.equal(fixture.databaseReads, 1);
});

void test('Super Admin sees an honest empty ranking when no sales exist', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'super_admin';
  fixture.topSellers = [];
  const html = renderToStaticMarkup(await Dashboard());
  assert.match(html, /No delivered sales yet/);
  assert.doesNotMatch(html, /Clay/);
});

void test('the four URL periods select one shared filter and reach the private query', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'super_admin';
  fixture.periods = [];
  fixture.topSellers = [];
  for (const [period, label] of [
    ['today', 'Today'],
    ['7d', 'Last 7 days'],
    ['30d', 'Last 30 days'],
    ['all', 'All time'],
  ]) {
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({ period }) }),
    );
    assert.match(
      html,
      new RegExp(
        `href="/admin\\?period=${period}"[^>]*aria-current="page"[^>]*>${label}</a>`,
      ),
    );
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, /Nepal time/);
    assert.match(html, /current status/i);
    assert.equal(
      (html.match(/<dt class="text-sm font-medium/g) ?? []).length,
      4,
    );
    if (period !== 'all')
      assert.match(html, /No delivered sales in this period/);
  }
  assert.deepEqual(fixture.periods, ['today', '7d', '30d', 'all']);
});

void test('missing, invalid and repeated URL periods safely select All time', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'super_admin';
  fixture.periods = [];
  for (const period of [undefined, 'invalid', ['today', '30d']]) {
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({ period }) }),
    );
    assert.match(html, /href="\/admin\?period=all"[^>]*aria-current="page"/);
  }
  assert.deepEqual(fixture.periods, ['all', 'all', 'all']);
});

void test('Admin cannot fetch summary data or see filters through any period URL', async () => {
  const { default: Dashboard } = await import('../app/admin/page');
  fixture.role = 'admin';
  fixture.permissions = ['audit_log.view'];
  fixture.privateReads = 0;
  for (const period of ['today', '7d', '30d', 'all']) {
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({ period }) }),
    );
    assert.doesNotMatch(
      html,
      /Marketplace summary period|Top 5 sellers|Users registered/,
    );
  }
  assert.equal(fixture.privateReads, 0);
});

void test(
  'populated summary fits desktop and small screens',
  { skip: !process.env.MARKETPLACE_SUMMARY_SCREENSHOTS },
  async (t) => {
    const { default: Dashboard } = await import('../app/admin/page');
    fixture.role = 'super_admin';
    fixture.topSellers = [
      {
        sellerId: 'first',
        sellerName:
          'Fictional Himalayan Handwoven Crafts Cooperative with a long shop name',
        salesPaisa: 123456789,
        orderCount: 320,
        unitsDelivered: 790,
      },
      {
        sellerId: 'second',
        sellerName: 'Fictional Clay & Craft',
        salesPaisa: 9876543,
        orderCount: 71,
        unitsDelivered: 140,
      },
    ];
    const markup = renderToStaticMarkup(await Dashboard());
    const [{ default: postcss }, { default: tailwind }, { chromium }] =
      await Promise.all([
        import('postcss'),
        import('@tailwindcss/postcss'),
        import('playwright'),
      ]);
    const css = (
      await postcss([tailwind()]).process(
        await readFile('app/globals.css', 'utf8'),
        { from: resolve('app/globals.css') },
      )
    ).css;
    const directory = process.env.MARKETPLACE_SUMMARY_SCREENSHOTS!;
    await mkdir(directory, { recursive: true });
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ??
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
    try {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await t.test(
          `${viewport.width}px populated ranking wraps without horizontal overflow`,
          async () => {
            const page = await browser.newPage({ viewport });
            try {
              await page.route('**/*', (route) => route.abort());
              await page.setContent(
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body><main style="max-width:1100px;margin:auto;padding:20px">${markup}</main></body></html>`,
              );
              const disclosure = page.locator('details[data-operational-summary]');
              assert.equal(await disclosure.getAttribute('open'), null);
              await disclosure.locator(':scope > summary').click();
              const section = page.getByRole('region', {
                name: 'Marketplace summary',
                exact: true,
              });
              await section.scrollIntoViewIfNeeded();
              assert.equal(await section.getByRole('listitem').count(), 2);
              assert.equal(
                await section
                  .getByText('1,234,567.89', { exact: false })
                  .count(),
                1,
              );
              assert.equal(
                await page.evaluate(
                  () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth,
                ),
                true,
              );
              const bounds = await section.boundingBox();
              assert.ok(
                bounds &&
                  bounds.x >= 0 &&
                  bounds.x + bounds.width <= viewport.width,
              );
              await section.screenshot({
                path: join(
                  directory,
                  `populated-summary-${viewport.width}.png`,
                ),
              });
            } finally {
              await page.close();
            }
          },
        );
      }
    } finally {
      await browser.close();
    }
  },
);
