import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { cloneElement, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixture = { enabled: false, authCalls: 0, databaseCalls: 0 };
const globals = globalThis as typeof globalThis & {
  riderHoldFixture: typeof fixture;
  riderHoldElement: typeof createElement;
  riderHoldClone: typeof cloneElement;
};
globals.riderHoldFixture = fixture;
globals.riderHoldElement = createElement;
globals.riderHoldClone = cloneElement;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers': 'export const env={}',
      'next/link':
        'export default function Link(props){return globalThis.riderHoldElement("a",props)}',
      'next/navigation':
        'export function usePathname(){return "/account"};export function useRouter(){return {refresh(){}}};export function notFound(){throw Error("Not found")};export function redirect(path){throw Error("Redirect: "+path)}',
      '@/app/auth':
        'export function signOutPath(){return "/logout"};export async function getAuthenticatedUser(){globalThis.riderHoldFixture.authCalls++;return null};export async function requireAuthenticatedUser(){globalThis.riderHoldFixture.authCalls++;throw Error("Authentication reached")}',
      '@/lib/auth/customer':
        'export class CustomerAuthorizationError extends Error{};export async function requireCustomerPage(){globalThis.riderHoldFixture.authCalls++;return {userId:"buyer",displayName:"Fictional buyer",email:"buyer@example.invalid"}};export async function requireCustomerApi(){globalThis.riderHoldFixture.authCalls++;throw Error("Paused request reached authentication")};export async function getCustomerUser(){return null}',
      '@/lib/auth/seller':
        'export async function getSellerUser(){return {sellerId:"seller",userId:"buyer"}}',
      '@/lib/db/d1':
        'export function requireDatabase(){globalThis.riderHoldFixture.databaseCalls++;throw Error("Paused surface reached the database")};export function requireMediaBucket(){throw Error("Paused surface reached private media")}',
      '@/lib/riders/availability':
        'export function isRiderPortalEnabled(){return globalThis.riderHoldFixture.enabled}',
      '../riders/availability':
        'export function isRiderPortalEnabled(){return globalThis.riderHoldFixture.enabled}',
      '@/components/ui/sidebar':
        'const Wrapper=({children})=>globalThis.riderHoldElement("div",null,children);export const Sidebar=Wrapper,SidebarContent=Wrapper,SidebarHeader=Wrapper,SidebarMenu=Wrapper,SidebarMenuItem=Wrapper,SidebarProvider=Wrapper;export function SidebarMenuButton({render,children}){return globalThis.riderHoldClone(render,{},children)}',
      '@/components/layout/site-header':
        'export function SiteHeader(){return null}',
      '@/components/layout/site-footer':
        'export function SiteFooter(){return null}',
    };
    return stubs[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});
function reset(enabled = false) {
  fixture.enabled = enabled;
  fixture.authCalls = 0;
  fixture.databaseCalls = 0;
}

void test('held account navigation hides assigned deliveries even for an approved rider', async () => {
  reset();
  const { AccountNavigation } =
    await import('../components/account/account-navigation');
  const html = renderToStaticMarkup(
    createElement(AccountNavigation, {
      displayName: 'Fictional rider',
      email: 'rider@example.invalid',
      signOutPath: '/logout',
      showAssignedDeliveries: true,
    }),
  );
  assert.doesNotMatch(html, /href="\/rider"|Assigned deliveries/);
  for (const path of ['/account/orders', '/account/wallet', '/account/profile'])
    assert.ok(html.includes(`href="${path}"`));
});
void test('held account layout keeps the seller switch and shopping content without rider lookups', async () => {
  reset();
  const { default: AccountLayout } = await import('../app/account/layout');
  const html = renderToStaticMarkup(
    await AccountLayout({
      children: createElement('p', null, 'Shopping account content'),
    }),
  );
  assert.doesNotMatch(
    html,
    /href="\/rider"|Rider dashboard|Rider application status/,
  );
  assert.match(html, /href="\/seller"/);
  assert.match(html, /Shopping account content/);
  assert.equal(fixture.databaseCalls, 0);
});
for (const path of ['../app/rider/page', '../app/rider/form-history/page'])
  void test(`direct held page ${path} shows a notice before reading rider identity or records`, async () => {
    reset();
    const { default: Page } = (await import(path)) as {
      default: () => Promise<React.ReactNode>;
    };
    const html = renderToStaticMarkup(await Page());
    assert.match(html, /Rider services are on hold/);
    assert.doesNotMatch(
      html,
      /<form|Submit rider application|Assigned parcels/,
    );
    assert.match(html, /href="\/account"/);
    assert.equal(fixture.authCalls, 0);
    assert.equal(fixture.databaseCalls, 0);
  });
const routes = [
  [
    '../app/api/orders/[orderNumber]/rider-code/route',
    '/api/orders/held-order/rider-code',
  ],
  ['../app/api/rider/application/route', '/api/rider/application'],
  ['../app/api/rider/reports/route', '/api/rider/reports'],
  ['../app/api/rider/remittances/route', '/api/rider/remittances'],
  ['../app/api/rider/verify-code/route', '/api/rider/verify-code'],
  [
    '../app/api/rider/orders/[id]/location/route',
    '/api/rider/orders/held-job/location',
  ],
  [
    '../app/api/rider/parcels/[id]/location/route',
    '/api/rider/parcels/held-job/location',
  ],
] as const;
for (const [modulePath, path] of routes)
  void test(`held ${path} rejects an action before authentication, payload parsing, database or media work`, async () => {
    reset();
    const { POST } = (await import(modulePath)) as {
      POST: (
        request: Request,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>;
    };
    const response = await POST(
      new Request('https://marketplace.test' + path, {
        method: 'POST',
        headers: { Origin: 'https://marketplace.test' },
        body: 'deliberately malformed',
      }),
      { params: Promise.resolve({ id: 'held-job' }) },
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(
      ((await response.json()) as { code: string }).code,
      'rider_program_on_hold',
    );
    assert.equal(fixture.authCalls, 0);
    assert.equal(fixture.databaseCalls, 0);
  });
void test('held rider form configuration is unavailable without changing staff form authorization', async () => {
  reset();
  const { GET } = await import('../app/api/forms/[formId]/route');
  for (const formId of [
    'rider.application',
    'rider.report',
    'rider.remittance',
    'rider.code-verify',
  ]) {
    assert.equal(
      (
        await GET(new Request('https://marketplace.test/api/forms/' + formId), {
          params: Promise.resolve({ formId }),
        })
      ).status,
      404,
    );
  }
  assert.equal(fixture.authCalls, 0);
  assert.equal(fixture.databaseCalls, 0);
  await GET(
    new Request('https://marketplace.test/api/forms/staff.rider-control-1'),
    { params: Promise.resolve({ formId: 'staff.rider-control-1' }) },
  );
  assert.equal(fixture.authCalls, 1, 'Staff authorization still runs normally');
});
void test('held notification actions omit the rider portal and retain staff rider operations', async () => {
  reset();
  const { notificationDestination } =
    await import('../lib/operations/notification-links');
  assert.equal(
    notificationDestination('customer', 'customer', 'rider_assignment', 'job'),
    null,
  );
  assert.equal(
    notificationDestination('staff', 'staff', 'rider_report', 'report'),
    '/admin/riders',
  );
  fixture.enabled = true;
  assert.equal(
    notificationDestination('customer', 'customer', 'rider_assignment', 'job'),
    '/rider',
  );
});
void test('configured hero rider links are hidden while ordinary shopping links remain', async () => {
  reset();
  const { HomepageHeroCopy } =
    await import('../components/homepage/homepage-hero-copy');
  const { INITIAL_HOMEPAGE_HERO_SLIDES } =
    await import('../lib/homepage/hero-slides');
  const slide = {
    ...INITIAL_HOMEPAGE_HERO_SLIDES[0],
    primaryActionHref: '/rider?source=hero',
    primaryActionLabel: 'Apply as a rider',
    secondaryActionHref: '/shop',
    secondaryActionLabel: 'Shop the collection',
  };
  const html = renderToStaticMarkup(createElement(HomepageHeroCopy, { slide }));
  assert.doesNotMatch(html, /href="\/rider|Apply as a rider/);
  assert.match(html, /href="\/shop"/);
  fixture.enabled = true;
  const enabled = renderToStaticMarkup(
    createElement(HomepageHeroCopy, { slide }),
  );
  assert.match(enabled, /href="\/rider\?source=hero"/);
});
