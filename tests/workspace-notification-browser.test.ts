import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';

void test('bell preserves input and unread count through an outage, shares confirmed read state and returns keyboard focus', async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const notice = { id: 'fixture-notice', audienceRole: 'seller', channel: 'in_app', requiredPermission: null,
    subjectEn: 'Fictional product correction', subjectNe: 'काल्पनिक उत्पादन सुधार', bodyEn: 'Review your product.', bodyNe: 'आफ्नो उत्पादन हेर्नुहोस्।',
    status: 'sent', relatedType: 'product', relatedId: 'fictional-product', productStatus: 'needs_changes', orderNumber: null, createdAt: 1, readAt: null };
  const bundle = await build({ stdin: { sourcefile: 'workspace-bell-fixture.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {NotificationBell} from './components/account/notification-bell';
    import {NotificationList} from './components/account/notification-list';
    import {SellerNavigationView} from './components/seller/seller-navigation';
    createRoot(document.getElementById('root')!).render(<>
      <label>Unfinished work<input defaultValue="Keep my draft" /></label>
      <NotificationBell workspace="seller" accountId="fixture-owner" />
      <div id="inbox"><NotificationList workspace="seller" accountId="fixture-owner" initial={[${JSON.stringify(notice)}]} /></div>
      <SellerNavigationView pathname="/seller" tradingName="Fictional applicant" sellerId={null} />
    </>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-workspace-links', setup(builder) {
      stubFixtureLink(builder);
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture-navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-navigation' }, () => ({ contents: 'export function usePathname(){return "/seller"}', loader: 'js' }));
    } }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let fail = false, read = false, writes = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    // Every request is intercepted: no application server, persistent database or provider is involved.
    await page.route('**/*', async (route: { request(): { url(): string; method(): string }; fulfill(response: unknown): Promise<void>; abort(): Promise<void> }) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://workspace.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' });
      if (url.pathname === '/api/notifications/fixture-notice/read') {
        assert.equal(route.request().method(), 'POST'); read = true; writes++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      if (url.pathname === '/api/notifications') return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
        body: JSON.stringify(fail ? { error: 'Fictional outage' } : { unreadCount: read ? 100 : 101,
          items: url.searchParams.get('filter') === 'unread' && read ? [{ ...notice, id: 'older-notice', subjectEn: 'Older unread notice' }] : [{ ...notice, readAt: read ? 2 : null }] }) });
      return route.abort();
    });
    await page.goto('https://workspace.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const bell = page.getByRole('button', { name: 'Notifications: 101 unread', exact: true });
    await bell.waitFor(); assert.equal(await bell.textContent(), '99+');
    await page.getByLabel('Unfinished work').fill('Still editing'); fail = true; await bell.click();
    const panel = page.getByRole('region', { name: 'Recent notifications' });
    await panel.getByRole('alert').waitFor(); assert.equal(await bell.count(), 1); assert.equal(writes, 0);
    fail = false; await panel.getByRole('button', { name: 'Retry', exact: true }).click();
    await panel.getByRole('button', { name: 'Mark as read', exact: true }).click();
    await page.getByRole('button', { name: 'Notifications: 100 unread', exact: true }).waitFor();
    assert.equal(await page.locator('#inbox').getByRole('button', { name: 'Mark as read', exact: true }).count(), 0);
    assert.equal(writes, 1); assert.equal(await page.getByLabel('Unfinished work').inputValue(), 'Still editing');
    await panel.getByRole('button', { name: 'Unread', exact: true }).click();
    await panel.getByText('Older unread notice').waitFor();
    await panel.getByRole('button', { name: 'Close', exact: true }).focus(); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Notifications: 100 unread', exact: true }).evaluate((element: Element) => element === document.activeElement), true);
    const menu = page.getByRole('button', { name: 'Open seller menu' });
    const dialog = page.getByRole('dialog', { name: 'Seller Studio' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('link', { name: 'Earnings & bank' }).count(), 1);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await menu.evaluate((element: Element) => element === document.activeElement), true);
  } finally { await browser.close(); }
});
