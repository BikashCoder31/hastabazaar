import './helpers/rider-enabled-fixture';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { cloneElement, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

interface AccountFixture {
  seller: { userId: string; sellerId: string; tradingName: string } | null;
  superAdmin?: boolean;
  profile: { status: string } | null;
  riderLookups: string[];
}
const globals = globalThis as typeof globalThis & {
  accountRoleFixture: AccountFixture;
  accountRoleElement: typeof createElement;
  accountRoleClone: typeof cloneElement;
  accountRoleDatabase: object;
};
globals.accountRoleElement = createElement;
globals.accountRoleClone = cloneElement;
globals.accountRoleDatabase = {};
registerHooks({ resolve(specifier, context, nextResolve) {
  const stubs: Record<string, string> = {
    'cloudflare:workers': 'export const env={DB:globalThis.accountRoleDatabase}',
    'next/link': 'export default function Link({prefetch,...props}){return globalThis.accountRoleElement("a",props)}',
    'next/navigation': 'export function usePathname(){return "/account"}',
    '@/app/auth': 'export function signOutPath(path){return "/logout?return_to="+encodeURIComponent(path)}',
    '@/lib/auth/customer': 'export async function requireCustomerPage(){return {userId:"customer-user-id",authSubject:"external-auth-subject",displayName:"Fictional customer",email:"customer@example.invalid",isSuperAdmin:Number(Boolean(globalThis.accountRoleFixture.superAdmin))}}',
    '@/lib/auth/seller': 'export async function getSellerUser(){return globalThis.accountRoleFixture.seller}',
    '@/lib/riders/repository': 'export async function riderProfile(db,userId){if(db!==globalThis.accountRoleDatabase)throw Error("Unexpected database");globalThis.accountRoleFixture.riderLookups.push(userId);return globalThis.accountRoleFixture.profile}',
    '@/components/ui/sidebar': 'const Wrapper=({children})=>globalThis.accountRoleElement("div",null,children);export const Sidebar=Wrapper,SidebarContent=Wrapper,SidebarHeader=Wrapper,SidebarMenu=Wrapper,SidebarMenuItem=Wrapper,SidebarProvider=Wrapper;export function SidebarMenuButton({render,children}){return globalThis.accountRoleClone(render,{},children)}',
    '@/components/layout/site-header': 'export function SiteHeader(){return null}',
    '@/components/layout/site-footer': 'export function SiteFooter(){return null}',
  };
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : nextResolve(specifier, context);
} });

const scenarios = [
  { name: 'seller without rider participation', seller: true, status: null, riderLabel: null },
  { name: 'seller with approved rider participation', seller: true, status: 'approved', riderLabel: 'Rider dashboard' },
  { name: 'seller with pending rider participation', seller: true, status: 'pending', riderLabel: 'Rider application status' },
  { name: 'seller with rejected rider participation', seller: true, status: 'rejected', riderLabel: 'Rider application status' },
  { name: 'ordinary customer', seller: false, status: null, riderLabel: 'Rider dashboard / apply' },
  { name: 'approved rider customer', seller: false, status: 'approved', riderLabel: 'Rider dashboard' },
  { name: 'pending rider customer', seller: false, status: 'pending', riderLabel: 'Rider application status' },
] as const;

for (const scenario of scenarios) {
  void test(`account role links for ${scenario.name}`, async () => {
    globals.accountRoleFixture = {
      seller: scenario.seller ? { userId: 'customer-user-id', sellerId: 'seller-profile-id', tradingName: 'Fictional pottery' } : null,
      profile: scenario.status ? { status: scenario.status } : null,
      riderLookups: [],
    };
    const { default: AccountLayout } = await import('../app/account/layout');
    const html = renderToStaticMarkup(await AccountLayout({ children: createElement('p', null, 'Shopping account content') }));
    assert.equal(html.includes('href="/seller"'), scenario.seller);
    assert.equal(html.includes('Switch to Seller Studio'), scenario.seller);
    assert.equal(html.includes('You also sell as Fictional pottery'), scenario.seller);
    assert.doesNotMatch(html, /href="\/admin"|Back to Super Admin/);
    assert.match(html, />Customer account</);
    assert.equal(html.includes('href="/rider"'), scenario.riderLabel !== null);
    assert.equal(html.includes('Assigned deliveries'), scenario.status === 'approved');
    if (scenario.riderLabel) assert.ok(html.includes(`>${scenario.riderLabel}</a>`), 'Rider navigation must describe the actual participation state.');
    assert.deepEqual(globals.accountRoleFixture.riderLookups, ['customer-user-id'], 'Resolve participation from the authenticated database user, never an auth subject or seller profile ID.');
    assert.match(html, /Fictional customer/);
    assert.match(html, /customer@example.invalid/);
    const logout = html.match(/<form\b[^>]*action="\/logout\?return_to=%2F"[^>]*>([\s\S]*?)<\/form>/);
    assert.ok(logout, "Logout must submit to the existing return target.");
    assert.match(logout[0], /method="POST"/);
    assert.match(logout[0], /target="_top"/);
    assert.match(logout[1], /<button[^>]*type="submit"/);
    assert.doesNotMatch(html, /href="\/logout/);
    for (const path of ['/account/orders', '/account/wallet', '/account/wishlist', '/account/addresses', '/account/profile']) assert.ok(html.includes(`href="${path}"`), `Retain shopping link ${path}.`);
    assert.match(html, /Shopping account content/);
  });
}

void test('a customer with Super Admin access sees the admin switch on both layouts', async () => {
  globals.accountRoleFixture = { seller: null, superAdmin: true, profile: null, riderLookups: [] };
  const { default: AccountLayout } = await import('../app/account/layout');
  const html = renderToStaticMarkup(await AccountLayout({ children: null }));
  assert.equal((html.match(/href="\/admin"/g) ?? []).length, 2);
  assert.equal((html.match(/Back to Super Admin/g) ?? []).length, 2);
  assert.doesNotMatch(html, /href="\/seller"|Switch to Seller Studio/);
});

void test('account navigation defaults to hiding assigned deliveries unless approved rider access is supplied', async () => {
  const { AccountNavigation } = await import('../components/account/account-navigation');
  const html = renderToStaticMarkup(createElement(AccountNavigation, { displayName: 'Fictional customer', email: 'customer@example.invalid', signOutPath: '/logout' }));
  assert.doesNotMatch(html, /href="\/rider"|Assigned deliveries/);
  assert.match(html, /href="\/account\/orders"/);
});

void test('settings and wallet tabs keep their original URL and expose the selected page to assistive technology', async () => {
  const { CustomerSettings, CustomerWallet } = await import('../components/account/account-sections');
  const settings = {
    profile: '/account/profile',
    addresses: '/account/addresses',
    notifications: '/account/notifications',
    security: '/account/security',
    privacy: '/account/privacy',
  } as const;
  const wallet = {
    credit: '/account/wallet',
    rewards: '/account/rewards',
    referrals: '/account/referrals',
    refunds: '/account/refunds',
  } as const;

  function assertTabLinks(html: string, paths: readonly string[], selectedPath: string) {
    const links = html.match(/<a\b[^>]*>/g) ?? [];
    assert.deepEqual(
      links.filter(link => link.includes('aria-current="page"')).map(link => link.match(/href="([^"]+)"/)?.[1]),
      [selectedPath],
    );
    for (const path of paths) assert.ok(links.some(link => link.includes(`href="${path}"`)), path);
  }

  for (const active of Object.keys(settings) as (keyof typeof settings)[]) {
    const props = { active, children: null };
    const html = renderToStaticMarkup(createElement(CustomerSettings, props));
    assertTabLinks(html, Object.values(settings), settings[active]);
  }
  for (const active of ['credit', 'rewards', 'referrals'] as const) {
    const props = { active, children: null };
    const html = renderToStaticMarkup(createElement(CustomerWallet, props));
    assertTabLinks(html, Object.values(wallet), wallet[active]);
  }
});
