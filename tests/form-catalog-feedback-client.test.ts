import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
  'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

for (const kind of ['contact', 'footer'] as const) {
  void test(`${kind} ambiguous delivery retains one request across reload and conservatively handles lost responses`, async () => {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is supplied by the bundled runtime.
    const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), sourcefile: 'feedback-client-fixture.tsx', contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { CustomerContactForm } from './components/layout/customer-contact-form';
        import { FooterFeedbackForm } from './components/layout/footer-feedback-form';
        createRoot(document.getElementById('root')!).render(${kind === 'contact'
          ? '<CustomerContactForm kind="contact" />' : '<FooterFeedbackForm />'});
      `, loader: 'tsx' },
      bundle: true, write: false, platform: 'browser', format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'next-browser-shims', setup(bundler) {
        bundler.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({ path: args.path, namespace: 'next-browser-shims' }));
        bundler.onLoad({ filter: /.*/, namespace: 'next-browser-shims' }, (args) => ({
          contents: args.path === 'next/link'
            ? 'import React from "react"; export default function Link(props){return React.createElement("a", {href:props.href}, props.children)}'
            : 'export function usePathname(){return "/products/handmade-item"}',
          loader: 'tsx', resolveDir: process.cwd(),
        }));
      } }],
    });
    const browser = await chromium.launch({ headless: true,
      executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const page = await browser.newPage();
    const requests: { requestId: string; name: string }[] = [];
    let jobs = 0;
    let resolveSecond: () => void = () => {};
    const secondRequest = new Promise<void>((resolve) => { resolveSecond = resolve; });
    let resolveFourth: () => void = () => {};
    const fourthRequest = new Promise<void>((resolve) => { resolveFourth = resolve; });
    try {
      // oxlint-disable-next-line typescript/no-explicit-any -- Browser route type belongs to bundled Playwright.
      await page.route('https://feedback.test/**', async (route: any) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
        if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ config: { formId: kind === 'contact' ? 'public.contact' : 'public.footer-feedback', version: 1, publishedAt: 1, fields: [] } }) });
        const body = route.request().postData();
        assert.ok(body);
        const headers = route.request().headers();
        const contentType = headers['content-type'];
        const request = new Request('https://feedback.test/api/feedback', { method: 'POST', headers: { 'content-type': contentType }, body });
        const form = await request.formData();
        const requestId = form.get('requestId');
        const name = form.get('name');
        if (typeof requestId !== 'string' || typeof name !== 'string') throw new Error('Missing text payload');
        requests.push({ requestId, name });
        if (requests.length === 2) resolveSecond();
        if (requests.length === 1) {
          jobs++;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'delivery_uncertain',
            error: 'Delivery is uncertain. Your message may have been sent. Contact support before sending a new message.' }) });
        }
        if (requestId === requests[0].requestId && name !== requests[0].name)
          return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'request_id_conflict',
            error: 'Your earlier message may have been sent. These edits were not sent.' }) });
        if (requests.length === 3)
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{invalid-json' });
        if (requests.length === 4) {
          resolveFourth();
          return route.abort('failed');
        }
        jobs++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      });
      await page.goto('https://feedback.test/');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const form = page.locator('form[data-form-id]');
      await form.locator('[name="name"]').fill('Asha Rai');
      await form.locator('[name="email"]').fill('asha@example.test');
      await form.locator('[name="topic"]').selectOption('General question');
      if (kind === 'contact') await form.locator('[name="subject"]').fill('An order question');
      await form.locator('[name="message"]').fill('Could you help with this handmade item?');
      await form.locator('[name="privacyAcknowledgement"]').check();
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('form[data-form-id]')?.textContent?.includes('Delivery is uncertain'));
      await page.reload();
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const remounted = page.locator('form[data-form-id]');
      await remounted.locator('[name="name"]').fill('Asha Sherpa');
      await remounted.locator('[name="email"]').fill('asha@example.test');
      await remounted.locator('[name="topic"]').selectOption('General question');
      if (kind === 'contact') await remounted.locator('[name="subject"]').fill('An order question');
      await remounted.locator('[name="message"]').fill('Could you help with this handmade item?');
      await remounted.locator('[name="privacyAcknowledgement"]').check();
      await remounted.locator('button[type="submit"]').click();
      await secondRequest;
      assert.equal(requests.length, 2);
      assert.equal(requests[0].requestId, requests[1].requestId);
      assert.notEqual(requests[0].name, requests[1].name);
      assert.equal(jobs, 1);
      await page.waitForFunction(() => document.querySelector('form[data-form-id]')?.textContent?.includes('These edits were not sent'));
      assert.equal(await remounted.locator('button[type="submit"]').isDisabled(), false);
      assert.equal(await remounted.getByRole('button', { name: 'Refresh form' }).count(), 0);
      await remounted.locator('[name="name"]').fill('Asha Rai');
      await remounted.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('form[data-form-id]')?.textContent?.includes('may have been accepted'));
      await remounted.locator('button[type="submit"]').click();
      await fourthRequest;
      await page.waitForFunction(() => document.querySelector('form[data-form-id]')?.textContent?.includes('may have been accepted'));
      assert.equal(requests.length, 4);
      assert.equal(new Set(requests.map(({ requestId }) => requestId)).size, 1);
      assert.equal(jobs, 1);
      const startNew = remounted.getByRole('button', { name: /start a new message/i });
      assert.equal(await startNew.count(), 1);
      page.once('dialog', async (dialog: { message(): string; dismiss(): Promise<void> }) => {
        assert.match(dialog.message(), /contact support|duplicate/i);
        await dialog.dismiss();
      });
      await startNew.click();
      const storageKey = `hastabazaar:feedback-attempt:${kind === 'contact' ? 'public.contact' : 'public.footer-feedback'}`;
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), requests[0].requestId);
      page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
        assert.match(dialog.message(), /contact support|duplicate/i);
        await dialog.accept();
      });
      await startNew.click();
      await remounted.locator('[name="name"]').fill('New Message');
      await remounted.locator('[name="email"]').fill('asha@example.test');
      await remounted.locator('[name="topic"]').selectOption('General question');
      if (kind === 'contact') await remounted.locator('[name="subject"]').fill('Another question');
      await remounted.locator('[name="message"]').fill('Could you help with a different handmade item?');
      await remounted.locator('[name="privacyAcknowledgement"]').check();
      await remounted.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('form[data-form-id]')?.textContent?.includes('Thank you'));
      assert.notEqual(requests[4].requestId, requests[0].requestId);
      assert.equal(jobs, 2);
    } finally { await page.close(); await browser.close(); }
  });
}
