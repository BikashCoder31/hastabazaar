import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile, lstat } from 'node:fs/promises';
import { assertHostedBrowserState } from '../scripts/testing/verify-packaged-browser-gates.mjs';

(globalThis as unknown as { React: typeof React }).React = React;
registerHooks({ resolve(specifier, context, nextResolve) {
  const mock = specifier === 'cloudflare:workers' ? 'export const env={DB:{}}'
    : specifier === '@/lib/db/d1' ? 'export function requireDatabase(){return {}}'
    : specifier === '@/lib/forms/runtime' ? 'export async function resolvePublishedForm(db,formId){return {formId,version:1,publishedAt:1,fields:[]}}'
    : specifier === '@/app/auth' ? 'export async function getAuthenticatedUser(){return null}'
    : specifier === 'next/navigation' ? 'export function redirect(){throw Error("Unexpected redirect")};export function useRouter(){return {refresh(){}}}'
    : specifier === 'next/link' ? 'export default function Link(props){return globalThis.React.createElement("a",{href:props.href},props.children)}'
    : specifier === '@/components/auth/google-sign-in' ? 'export function GoogleSignIn(){return null}'
    : null;
  return mock ? { url: `data:text/javascript,${mock}`, shortCircuit: true } : nextResolve(specifier, context);
} });

void test('identity and seller forms render their exact registered form IDs', async () => {
  const identity = [
    ['../app/login/page', ['identity.login-password', 'identity.email-code-request']],
    ['../app/register/page', ['identity.register']],
    ['../app/login/code/page', ['identity.email-code-verify']],
    ['../app/forgot-password/page', ['identity.password-reset-request']],
    ['../app/forgot-password/reset/page', ['identity.password-reset-complete']],
  ] as const;
  for (const [path, ids] of identity) {
    const Page = (await import(path)).default;
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    for (const id of ids) assert.ok(html.includes(`data-form-id="${id}"`), `${path} omitted ${id}`);
    assert.equal((html.match(/<form\b/g) ?? []).length, ids.length);
  }
  const { ProductSubmissionForm } = await import('../components/seller/product-submission-form');
  const { InventoryEditor } = await import('../components/seller/inventory-editor');
  const { SellerProfileForm } = await import('../components/seller/seller-profile-form');
  const { MakerApplicationProfileForm } = await import('../components/seller/maker-application-profile-form');
  const forms = [
    ['seller.product-submission', React.createElement(ProductSubmissionForm, { categories: [], occasions: [] })],
    ['seller.inventory', React.createElement(InventoryEditor, { productId: 'fictional-product', quantity: 1, productName: 'Fictional item' })],
    ['seller.profile', React.createElement(SellerProfileForm, { sellerId: 'fictional-seller', profile: {
      tradingName: 'Fictional seller', businessDescription: null, productCategories: null,
      supportPhone: '9800000000', supportEmail: 'fixture@example.test', province: 'Bagmati',
      district: 'Kathmandu', municipality: 'Kathmandu', ward: null, locality: 'Fictional locality',
    } })],
    ['seller.maker-profile', React.createElement(MakerApplicationProfileForm, { profile: {
      sellerId: 'fictional-seller', version: 1, publicName: 'Fictional maker', publicCity: 'Kathmandu',
      craftExperience: [], socialLinks: {}, participationRoute: 'managed_maker', applicationStage: 'active',
      taxStatus: null, commercialModel: null, legalSellerReference: null, invoiceIssuerReference: null,
      payoutBeneficiaryReference: null, returnDestinationType: 'maker_address',
    } })],
  ] as const;
  for (const [id, element] of forms) assert.ok(renderToStaticMarkup(element).includes(`data-form-id="${id}"`), `Rendered component omitted ${id}`);
});

const origin = process.env.FORM_CATALOG_BROWSER_ORIGIN;
void test('contact and catalog controls fit a 232px viewport without hiding real fields', { skip: !origin, timeout: 110_000 }, async () => {
  const url = new URL(origin!);
  assert.equal(url.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const hostedState = process.env.FORM_CATALOG_HOSTED_STORAGE_STATE;
  if (hostedState) {
    const info = await lstat(hostedState);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 4096);
    if (process.platform !== 'win32') assert.equal(info.mode & 0o077, 0);
    assertHostedBrowserState(JSON.parse(await readFile(hostedState, 'utf8')), url.origin);
  }
  const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Browser dependency is supplied by the runtime.
  const { chromium } = await import(modulePath) as any;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const geometryFailures: string[] = [];
    for (const target of [{ path: '/contact-us', role: null, id: 'public.contact' },
      { path: '/admin/catalog', role: 'admin', id: 'staff.catalog' }]) {
      const context = await browser.newContext({ viewport: { width: 232, height: 900 }, reducedMotion: 'reduce',
        ...(target.role && hostedState ? { storageState: hostedState } : {}) });
      try {
        context.setDefaultTimeout(20_000);
        context.setDefaultNavigationTimeout(30_000);
        // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is runtime supplied.
        await context.route('**/*', (route: any) => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
        if (target.role && !hostedState) await context.addCookies([{ name: 'hastabazaar_local_test_role', value: target.role, url: url.origin, httpOnly: true, sameSite: 'Strict' }]);
        if (!target.role) {
          const denied = await context.request.get(`${url.origin}/api/forms/staff.catalog`, { timeout: 20_000, maxRedirects: 0 });
          assert.equal(denied.status(), 404, 'Anonymous staff form configuration must keep the normal non-disclosing refusal');
        }
        const page = await context.newPage();
        const browserErrors: string[] = [];
        page.on('pageerror', () => browserErrors.push('pageerror'));
        page.on('console', (message: { type(): string }) => { if (message.type() === 'error') browserErrors.push('console.error'); });
        const configResponse = page.waitForResponse((response: { url(): string; request(): { method(): string }; status(): number }) => {
          const requestUrl = new URL(response.url());
          return requestUrl.origin === url.origin && requestUrl.pathname === `/api/forms/${target.id}` && response.request().method() === 'GET';
        });
        // Attach rejection handling before navigation so setup failure cannot leak a pending rejection.
        void configResponse.catch(() => {});
        const navigation = await page.goto(`${url.origin}${target.path}`, { waitUntil: 'networkidle' });
        assert.equal(navigation?.status(), 200, 'The actual application page must load');
        assert.equal(new URL(page.url()).pathname, target.path);
        const configuration = await configResponse;
        assert.equal(configuration.status(), 200, 'Published form configuration must load before interaction. A Secure-cookie HTTP failure needs a transport ruling.');
        const body = await configuration.json();
        assert.equal(body.config.formId, target.id);
        assert.ok(Number.isSafeInteger(body.config.version) && body.config.version > 0);
        if (target.role) {
          if (hostedState) {
            const cookies = await context.cookies();
            const session = cookies.find((cookie: { name: string }) => cookie.name === 'hastabazaar_session');
            assert.ok(session?.secure === true && session.httpOnly === true, 'Hosted cookie attributes must remain intact');
            const requestHeaders = await configuration.request().allHeaders();
            const pageHeaders = await navigation.request().allHeaders();
            assert.ok(requestHeaders.cookie?.includes('hastabazaar_session=') && pageHeaders.cookie?.includes('hastabazaar_session='),
              'The real browser must send its still-Secure session to both protected page and API');
            assert.equal(cookies.some((cookie: { name: string }) => cookie.name === 'hastabazaar_local_test_role'), false);
          }
          await page.getByRole('button', { name: 'Add category', exact: true }).click();
        }
        const form = page.locator(`form[data-form-id="${target.id}"]`);
        await form.waitFor({ state: 'visible' });
        for (const field of body.config.fields.filter((field: { status: string }) => field.status === 'active'))
          assert.ok(await form.getByLabel(field.label, { exact: false }).count() > 0, 'Published configured controls must render');
        const geometry = await form.evaluate((element: HTMLFormElement) => {
          const width = window.innerWidth;
          const formRect = element.getBoundingClientRect();
          const controls = [...element.querySelectorAll<HTMLElement>('input:not([type="hidden"]),textarea,select,button')]
            .filter((control) => !control.closest('[aria-hidden="true"]') && control.getClientRects().length);
          const clipped = controls.filter((control) => { const r = control.getBoundingClientRect(); return r.left < 0 || r.right > width + 1; })
            .map((control) => ({ name: control.getAttribute('name') ?? control.textContent?.trim(), width: control.getBoundingClientRect().width }));
          const outsideForm = controls.filter((control) => { const r = control.getBoundingClientRect(); return r.left < formRect.left - 1 || r.right > formRect.right + 1; })
            .map((control) => control.getAttribute('name') ?? control.textContent?.trim());
          const globalWide = [...document.body.querySelectorAll<HTMLElement>('*')].filter((child) => !child.closest('[aria-hidden="true"]') && child.getClientRects().length && child.getBoundingClientRect().right > width + 1)
            .slice(0, 12).map((child) => ({ tag: child.tagName, class: child.className, text: child.textContent?.trim().slice(0, 50), width: child.getBoundingClientRect().width }));
          return { viewport: width, scrollWidth: document.documentElement.scrollWidth, clipped, outsideForm, globalWide };
        });
        if (geometry.clipped.length || geometry.outsideForm.length || geometry.scrollWidth > geometry.viewport + 1)
          geometryFailures.push(`${target.id}: ${JSON.stringify(geometry)}`);
        console.info(`${target.id}: viewport=${geometry.viewport}, scrollWidth=${geometry.scrollWidth}, clipped=${geometry.clipped.length}`);
        if (process.env.FORM_CATALOG_POLISH_EVIDENCE) await page.screenshot({
          path: `${process.env.FORM_CATALOG_POLISH_EVIDENCE}/polish-${target.role ? 'staff' : 'public'}-232-after.png`, fullPage: true,
        });
        assert.ok(await form.locator('input[required]').count() > 0);
        if (target.role) assert.ok(await form.locator('..').locator('h2').evaluate((heading: HTMLElement) => heading.getBoundingClientRect().height) <= 64,
          'Catalog heading should remain readable rather than wrapping letter by letter.');
        assert.equal(await page.locator('[data-nextjs-dialog-overlay]').count(), 0);
        assert.equal(await page.getByText(/session (?:has )?expired|sign in again/i).count(), 0);
        assert.deepEqual(browserErrors, [], 'The actual browser journey must have no console or framework errors');
      } finally { await context.close(); }
    }
    assert.deepEqual(geometryFailures, []);
  } finally { await browser.close(); }
});
