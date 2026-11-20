import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
  'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

void test('maker save clicks submit validated profiles and profile attempts survive lost responses and reload', async () => {
  // oxlint-disable-next-line typescript/no-explicit-any -- Bundled Playwright supplies the browser type.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'profile-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MakerApplicationProfileForm } from './components/seller/maker-application-profile-form';
      import { SellerProfileForm } from './components/seller/seller-profile-form';
      const sellerId = location.pathname.split('/')[2];
      const accountId = new URLSearchParams(location.search).get('account') || 'account-one';
      const maker = location.pathname.startsWith('/maker/');
      const version = Number(new URLSearchParams(location.search).get('version') || 1);
      const profile = { sellerId, version, publicName: 'Fictional Studio', publicCity: 'Birgunj',
        craftExperience: [], socialLinks: {}, tradingName: 'Fictional Studio', businessDescription: '',
        productCategories: '', supportPhone: '9800000000', supportEmail: 'studio@example.test',
        province: 'Madhesh', district: 'Parsa', municipality: 'Birgunj', ward: '', locality: 'Workshop' };
      createRoot(document.getElementById('root')!).render(maker
        ? <MakerApplicationProfileForm profile={profile as any} />
        : <SellerProfileForm profile={profile as any} sellerId={sellerId} accountId={accountId} />);
    `, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'profile-fixture-boundaries', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const attempts = new Map<string, Array<{ requestId: string; expectedVersion?: number; publicCity?: string; body: string; actorId?: string }>>();
  const recorded = new Set<string>();
  const checks: Array<{ requestId: string; sellerId: string; actorId: string }> = [];
  let recordLostWorkshopSave = false;
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Browser route type belongs to bundled Playwright.
    await page.route('https://profile.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/maker/') || url.pathname.startsWith('/seller/'))
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ config: { formId: url.pathname.endsWith('maker-profile') ? 'seller.maker-profile' : 'seller.profile',
          version: 1, publishedAt: 1, fields: [] } }) });
      const req = route.request();
      if (url.pathname === '/api/seller/profile' && req.method() === 'GET') {
        const requestId = url.searchParams.get('requestId') ?? '';
        const actorId = req.headers()['x-hastabazaar-actor'] ?? '';
        const sellerId = url.searchParams.get('sellerId') ?? '';
        checks.push({ requestId, sellerId, actorId });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          requestId, status: recorded.has(JSON.stringify([actorId, sellerId, requestId])) ? 'recorded' : 'unconfirmed',
        }) });
      }
      const multipart = req.headers()['content-type']?.startsWith('multipart/form-data');
      const payload = (multipart ? Object.fromEntries(await new Request(req.url(), { method: 'POST',
        headers: { 'content-type': req.headers()['content-type'] }, body: req.postDataBuffer() }).formData())
        : JSON.parse(req.postData() ?? '{}')) as {
        requestId?: string; idempotencyKey?: string; expectedVersion?: number; publicCity?: string;
      };
      const key = `${url.pathname}:${route.request().headers()['x-seller-context'] ?? ''}`;
      const list = attempts.get(key) ?? [];
      list.push({ requestId: payload.requestId ?? payload.idempotencyKey ?? '',
        expectedVersion: payload.expectedVersion === undefined ? undefined : Number(payload.expectedVersion), publicCity: payload.publicCity,
        body: req.postData() ?? '', actorId: req.headers()['x-hastabazaar-actor'] });
      attempts.set(key, list);
      if (url.pathname === '/api/seller/profile' && (recordLostWorkshopSave || list.length > 1))
        recorded.add(JSON.stringify([req.headers()['x-hastabazaar-actor'], new URL(page.url()).pathname.split('/')[2], payload.idempotencyKey]));
      if (list.length === 1) return route.abort('failed');
      if (url.pathname === '/api/seller/public-profile' && list[0].requestId === payload.requestId &&
        (list[0].expectedVersion !== Number(payload.expectedVersion) || list[0].publicCity !== payload.publicCity))
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: '{"error":"Request reference conflicts with the saved profile."}' });
      if (url.pathname === '/api/seller/public-profile' && list[0].requestId !== payload.requestId &&
        Number(payload.expectedVersion) !== 2)
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: '{"error":"The profile owner or version changed."}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    async function mount(path: string) {
      await page.goto(`https://profile.test${path}`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled === false ||
        [...document.querySelectorAll<HTMLButtonElement>('form button')].some(button => button.textContent === 'Check original workshop result' && !button.disabled));
    }
    async function submit() {
      if (await page.locator('form').getAttribute('data-form-id') === 'seller.maker-profile') {
        await page.getByRole('button', { name: 'Save maker profile', exact: true }).click();
        return;
      }
      await page.locator('button[type="submit"]').click();
    }
    for (const [path, endpoint, storage] of [
      ['/maker/seller-one?version=1', '/api/seller/public-profile', 'hastabazaar:profile-attempt:seller.maker-profile:seller-one'],
    ] as const) {
      await mount(path);
      if (path.startsWith('/maker/')) {
        await page.locator('input[name="publicCity"]').fill('');
        await submit();
        assert.equal(await page.locator('input[name="publicCity"]').evaluate((input: HTMLInputElement) => input.validity.valueMissing), true);
        assert.equal(attempts.get(`${endpoint}:`)?.length ?? 0, 0);
        await page.locator('input[name="publicCity"]').fill('Birgunj');
      }
      await submit();
      await page.waitForFunction(() => /couldn’t connect|Failed to fetch/.test(document.querySelector('form')?.textContent ?? ''));
      const first = attempts.get(`${endpoint}:`)?.[0]?.requestId;
      assert.match(first ?? '', /^[0-9a-f-]{36}$/i);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storage), first);
      await mount(path.startsWith('/maker/') ? '/maker/seller-one?version=2' : path);
      await submit();
      await page.waitForFunction(() => /saved\.|conflicts/.test(document.querySelector('form')?.textContent ?? ''));
      assert.match(await page.locator('form').innerText(), /saved\./);
      assert.deepEqual(attempts.get(`${endpoint}:`)?.map((item) => item.requestId), [first, first]);
      if (path.startsWith('/maker/')) {
        assert.deepEqual(attempts.get(`${endpoint}:`)?.map((item) => item.expectedVersion), [1, 1]);
        assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(`${key}:expected-version`), storage), null);
      }
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storage), null);
    }
    attempts.set('/api/seller/public-profile:', []);
    await mount('/maker/seller-two?version=1');
    await submit();
    await page.waitForFunction(() => /couldn’t connect|Failed to fetch/.test(document.querySelector('form')?.textContent ?? ''));
    const makerOriginal = attempts.get('/api/seller/public-profile:')?.[0]?.requestId;
    const makerKey = 'hastabazaar:profile-attempt:seller.maker-profile:seller-two';
    assert.ok(makerOriginal);
    await mount('/maker/seller-two?version=2');
    await page.locator('input[name="publicCity"]').fill('Kathmandu');
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('conflicts'));
    assert.equal(attempts.get('/api/seller/public-profile:')?.[1]?.requestId, makerOriginal);
    assert.equal(attempts.get('/api/seller/public-profile:')?.[1]?.expectedVersion, 1);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), makerKey), makerOriginal);
    const makerReset = page.getByRole('button', { name: 'Start a new maker profile attempt' });
    page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate history/i);
      await dialog.accept();
    });
    await makerReset.click();
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), makerKey), null);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(`${key}:expected-version`), makerKey), null);
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Maker profile saved.'));
    assert.notEqual(attempts.get('/api/seller/public-profile:')?.[2]?.requestId, makerOriginal);
    assert.equal(attempts.get('/api/seller/public-profile:')?.[2]?.expectedVersion, 2);
    const workshopKey = (sellerId: string, accountId = 'account-one') =>
      `hastabazaar:profile-attempt:seller.profile:${JSON.stringify([accountId, sellerId])}`;
    await mount('/seller/seller-one');
    await page.locator('input[name="locality"]').fill('Private retry workshop');
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('We couldn’t connect.'));
    const inMemory = attempts.get('/api/seller/profile:')![0];
    assert.equal(inMemory.actorId, 'account-one');
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), workshopKey('seller-one')), inMemory.requestId);
    assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...Object.fromEntries(Object.entries(sessionStorage)), ...Object.fromEntries(Object.entries(localStorage)) })), /Private retry workshop|studio@example\.test/);
    assert.equal(await page.locator('input[name="locality"]').isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Start a new seller profile attempt', exact: true }).count(), 0);
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Private workshop details saved.'));
    assert.deepEqual(attempts.get('/api/seller/profile:')?.map(item => item.body), [inMemory.body, inMemory.body]);
    assert.deepEqual(checks.at(-1), { requestId: inMemory.requestId, sellerId: 'seller-one', actorId: 'account-one' });
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), workshopKey('seller-one')), null);

    // A reload retains an opaque actor/owner reference, never private fields to resend.
    attempts.set('/api/seller/profile:', []);
    recordLostWorkshopSave = true;
    await mount('/seller/seller-one');
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('We couldn’t connect.'));
    const committed = attempts.get('/api/seller/profile:')![0].requestId;
    await mount('/seller/seller-one?account=account-two');
    assert.equal(await page.getByRole('button', { name: 'Check original workshop result', exact: true }).count(), 0);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), workshopKey('seller-one')), committed);
    await mount('/seller/seller-one');
    assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
    await page.getByRole('button', { name: 'Check original workshop result', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Original workshop update was recorded.'));
    assert.equal(attempts.get('/api/seller/profile:')?.length, 1, 'Reload checks the original receipt without reconstructing a PATCH.');
    assert.deepEqual(checks.at(-1), { requestId: committed, sellerId: 'seller-one', actorId: 'account-one' });
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), workshopKey('seller-one')), null);

    attempts.set('/api/seller/profile:', []);
    recordLostWorkshopSave = false;
    await mount('/seller/seller-two');
    await submit();
    await page.waitForFunction(() => /couldn’t connect|Failed to fetch/.test(document.querySelector('form')?.textContent ?? ''));
    const original = attempts.get('/api/seller/profile:')?.[0]?.requestId;
    const sellerTwoKey = workshopKey('seller-two');
    assert.ok(original);
    await mount('/seller/seller-two');
    assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
    await page.getByRole('button', { name: 'Check original workshop result', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('No original receipt is confirmed.'));
    assert.equal(attempts.get('/api/seller/profile:')?.length, 1);
    assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
    const reset = page.getByRole('button', { name: 'Start a new seller profile attempt' });
    page.once('dialog', async (dialog: { message(): string; dismiss(): Promise<void> }) => {
      assert.match(dialog.message(), /unconfirmed and may still have succeeded/i);
      await dialog.dismiss();
    });
    await reset.click();
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), sellerTwoKey), original);
    page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
      assert.match(dialog.message(), /unconfirmed and may still have succeeded/i);
      await dialog.accept();
    });
    await reset.click();
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), sellerTwoKey), null);
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Private workshop details saved.'));
    assert.notEqual(attempts.get('/api/seller/profile:')?.[1]?.requestId, original);
  } finally { await page.close(); await browser.close(); }
});
