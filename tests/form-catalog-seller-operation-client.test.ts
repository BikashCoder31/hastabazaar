import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
  'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

void test('reply and managed attempts survive lost success, reject changed replay, and require a confirmed new ID', async () => {
  // oxlint-disable-next-line typescript/no-explicit-any -- The bundled browser supplies this type.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'seller-operation-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ReviewReplyForm } from './components/seller/review-reply-form';
      import { SellerManagedProgramWorkspace } from './components/seller/managed-program-workspace';
      const kind = location.pathname.slice(1);
      const workspace = { participationRoute:'managed_maker', applicationStage:'active',
        commercialModel:'managed_fixed_supplier_price_v1', products:[{id:'product-one',name:'Fictional item',sku:'SKU-1'}],
        supplies:[], transitions:[] };
      createRoot(document.getElementById('root')!).render(kind === 'reply'
        ? <ReviewReplyForm sellerId="seller-one" reviewId="review-one" version={0}
            initialBody="Fictional reply text." status={undefined} />
        : <SellerManagedProgramWorkspace sellerId="seller-one" workspace={workspace as any} />);
    `, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'seller-operation-fixture-boundaries', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  type Payload = Record<string, unknown>;
  const requests: Payload[] = [];
  let saved: { id: string; content: string } | null = null;
  let loseNextSuccess = true;
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- The bundled browser supplies this type.
    await page.route('https://seller-operations.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ config: { formId: decodeURIComponent(url.pathname.slice('/api/forms/'.length)),
          version: 1, publishedAt: 1, fields: [] } }) });
      const payload = JSON.parse(route.request().postData() ?? '{}') as Payload;
      requests.push(payload);
      const id = String(payload.requestId ?? payload.idempotencyKey);
      const content = JSON.stringify(Object.fromEntries(Object.entries(payload)
        .filter(([key]) => key !== 'requestId' && key !== 'idempotencyKey')));
      if (loseNextSuccess) {
        saved = { id, content };
        loseNextSuccess = false;
        return route.abort('failed');
      }
      if (saved?.id === id && saved.content !== content)
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: '{"error":"Request reference belongs to different content."}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    for (const [kind, formId] of [
      ['reply', 'seller.review-reply'],
      ['supply', 'seller.managed-supply-proposal'],
      ['transition', 'seller.managed-transition-request'],
    ] as const) {
      const selector = `[data-form-id="${formId}"]`;
      const storageKey = `hastabazaar:profile-attempt:${formId}:${kind === 'reply' ? 'seller-one:review-one' : 'seller-one'}`;
      const mount = async () => {
        await page.goto(`https://seller-operations.test/${kind}`);
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.waitForFunction((target: string) => {
          const form = document.querySelector<HTMLFormElement>(target);
          return form?.querySelector<HTMLButtonElement>('button')?.disabled === false;
        }, selector);
        if (kind === 'supply') {
          await page.locator(`${selector} select[name="productId"]`).selectOption('product-one');
          await page.locator(`${selector} input[name="quantity"]`).fill('2');
          await page.locator(`${selector} input[name="agreedUnitNpr"]`).fill('500');
          await page.locator(`${selector} input[name="agreementVersion"]`).fill('SIM-FIXED-V1');
          await page.locator(`${selector} input[name="payoutBeneficiaryReference"]`).fill('SIM-MAKER-ACCOUNT');
        }
        if (kind === 'transition') {
          await page.locator('details summary').click();
          for (const [name, value] of [['legalName', 'Registered Fictional Maker'], ['registrationAuthority', 'Cottage Office'],
            ['registrationNumber', 'REG-TEST'], ['taxRegistrationNumber', 'PAN-TEST'],
            ['agreementVersion', 'SIM-REGISTERED-V1']] as const)
            await page.locator(`${selector} input[name="${name}"]`).fill(value);
          await page.locator(`${selector} textarea[name="evidenceReferences"]`).fill('private-document-one');
        }
      };
      const submit = async () => page.evaluate((target: string) =>
        document.querySelector<HTMLFormElement>(target)?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), selector);
      const formText = async () => page.locator('body').innerText();
      await mount();
      requests.length = 0; saved = null; loseNextSuccess = true;
      await submit();
      try { await page.waitForFunction(() => /couldn.t connect|Failed to fetch|Action failed/.test(
        document.body.textContent ?? ''), undefined, { timeout: 5000 }); }
      catch { throw new Error(`${kind}: first lost response was not shown; requests=${requests.length}; text=${await formText()}`); }
      const first = String(requests[0].requestId ?? requests[0].idempotencyKey);
      assert.match(first, /^[0-9a-f-]{36}$/i);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), first);
      await mount();
      await submit();
      await page.waitForFunction(() => /awaiting moderation|record saved/.test(document.body.textContent ?? ''));
      assert.equal(String(requests[1].requestId ?? requests[1].idempotencyKey), first);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), null);

      await mount();
      requests.length = 0; saved = null; loseNextSuccess = true;
      await submit();
      await page.waitForFunction(() => /couldn.t connect|Failed to fetch|Action failed/.test(document.body.textContent ?? ''));
      const original = String(requests[0].requestId ?? requests[0].idempotencyKey);
      await mount();
      if (kind === 'reply') await page.locator(`${selector} textarea`).fill('Changed fictional reply text.');
      else if (kind === 'supply') await page.locator(`${selector} input[name="quantity"]`).fill('3');
      else await page.locator(`${selector} textarea[name="evidenceReferences"]`).fill('different-private-document');
      await submit();
      await page.waitForFunction(() => document.body.textContent?.includes('different content'));
      assert.equal(String(requests[1].requestId ?? requests[1].idempotencyKey), original);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), original);
      const reset = page.getByRole('button', { name: `Start a new ${kind === 'reply' ? 'review reply' : kind === 'supply' ? 'managed supply' : 'managed transition'} attempt` });
      page.once('dialog', async (dialog: { message(): string; dismiss(): Promise<void> }) => {
        assert.match(dialog.message(), /duplicate/i); await dialog.dismiss();
      });
      await reset.click();
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), original);
      page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
        assert.match(dialog.message(), /duplicate/i); await dialog.accept();
      });
      await reset.click();
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), null);
      await submit();
      await page.waitForFunction(() => /awaiting moderation|record saved/.test(document.body.textContent ?? ''));
      assert.notEqual(String(requests[2].requestId ?? requests[2].idempotencyKey), original);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), null);
      assert.match(await formText(), /awaiting moderation|record saved/);
    }
  } finally { await page.close(); await browser.close(); }
});
