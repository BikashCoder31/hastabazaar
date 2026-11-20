import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire, registerHooks } from 'node:module';
import { build } from 'esbuild';

Object.assign(globalThis, { sellerConsentElement: createElement });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/link')
      return {
        shortCircuit: true,
        url:
          'data:text/javascript,' +
          encodeURIComponent(
            "export default function Link({children,...props}){return globalThis.sellerConsentElement('a',props,children)}",
          ),
      };
    if (specifier === 'next/navigation')
      return {
        shortCircuit: true,
        url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}',
      };
    return nextResolve(specifier, context);
  },
});

void test('main agreement consent does not promise a fixed percentage or pre-accept later fee schedules', async () => {
  const { SellerAgreementAcceptance } =
    await import('../components/seller/seller-agreement-acceptance');
  for (const context of ['a', 'b', 'c']) {
    const props = { termsContext: context.repeat(64) };
    const html = renderToStaticMarkup(
      createElement(SellerAgreementAcceptance, props),
    );
    const visibleText = html.replace(/<[^>]*>/g, ' ');
    assert.doesNotMatch(visibleText, /\d+(?:\.\d+)?%/);
    assert.match(html, /href="\/seller\/finance"/);
    assert.match(html, /separate acceptance/);
    assert.match(html, /effective date/);
  }
});

void test('revised agreement context requires fresh consent before any acceptance request', async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SellerAgreementAcceptance} from './components/seller/seller-agreement-acceptance';const root=createRoot(document.getElementById('root'));window.reviseTerms=(context)=>root.render(<SellerAgreementAcceptance termsContext={context}/>);root.render(<SellerAgreementAcceptance termsContext={'a'.repeat(64)}/>);`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'isolated-next-boundaries',
        setup(b) {
          b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({
            path: a.path,
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
            loader: 'tsx',
            resolveDir: process.cwd(),
            contents:
              a.path === 'next/link'
                ? "import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}"
                : 'export function useRouter(){return {refresh(){window.refreshCount=(window.refreshCount||0)+1}}}',
          }));
        },
      },
    ],
  });
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const attempts: unknown[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  try {
    await page.route(
      '**/*',
      async (route: {
        request(): {
          method(): string;
          url(): string;
          postData(): string | null;
        };
        fulfill(value: object): Promise<void>;
        abort(): Promise<void>;
      }) => {
        const request = route.request();
        if (
          request.method() === 'POST' &&
          new URL(request.url()).pathname === '/api/seller/agreements'
        ) {
          attempts.push(JSON.parse(request.postData() ?? '{}'));
          return route.fulfill({
            contentType: 'application/json',
            body: '{"status":"accepted"}',
          });
        }
        if (request.method() !== 'GET') return route.abort();
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><head><title>Isolated seller consent</title><style>[role="checkbox"]{display:inline-flex;width:20px;height:20px;border:1px solid black}</style></head><body><div id="root"></div></body></html>',
        });
      },
    );
    await page.goto('https://seller-consent.example.test/seller');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const checkbox = page.getByRole('checkbox');
    const accept = page.getByRole('button', {
      name: 'Accept current agreement',
      exact: true,
    });
    await checkbox.check();
    assert.equal(await accept.isEnabled(), true);
    await page.evaluate(() => {
      (window as unknown as { reviseTerms(context: string): void }).reviseTerms(
        'b'.repeat(64),
      );
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="checkbox"]')
          ?.getAttribute('aria-checked') === 'false',
      undefined,
      { timeout: 3000 },
    );
    assert.equal(await checkbox.isChecked(), false);
    assert.equal(await accept.isDisabled(), true);
    assert.deepEqual(attempts, []);
    await checkbox.check();
    await accept.click();
    await page.waitForFunction(() =>
      Boolean((window as unknown as { refreshCount?: number }).refreshCount),
    );
    assert.deepEqual(attempts, [
      { accepted: true, language: 'en', termsContext: 'b'.repeat(64) },
    ]);
    assert.equal(await page.getByRole('status').textContent({ timeout: 3000 }), 'Your acceptance of the current agreement has been recorded.');
    assert.equal(await accept.isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await browser.close();
  }
});
