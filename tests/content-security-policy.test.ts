import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { marketplaceSecurityHeaders } from '../lib/http/security-headers';

async function withPolicyFixture(check: (page: import('playwright').Page) => Promise<void>) {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx',
      contents: `import React, {useState} from 'react';
        import {hydrateRoot} from 'react-dom/client';
        function Counter() {
          const [count, setCount] = useState(0);
          return <button id="hydrated-button" onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>;
        }
        hydrateRoot(document.getElementById('root'), <Counter/>);
      `,
    },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Every request is fulfilled locally. No server, account or database is used.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, 'https://csp.fixture');
      if (url.pathname === '/fixture.js') {
        return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
      }
      assert.equal(url.pathname, '/page');
      return route.fulfill({
        contentType: 'text/html', headers: marketplaceSecurityHeaders,
        body: `<!doctype html><html><head><base href="/injected-base/"></head><body>
          <a id="relative-link" href="orders">Orders</a>
          <button id="injected-handler" onclick="window.injectedHandlerExecuted=true">Injected handler</button>
          <div id="root"><button id="hydrated-button">Count: 0</button></div>
          <script>window.fixtureBootstrapExecuted=true;</script>
          <script src="/fixture.js"></script>
        </body></html>`,
      });
    });
    await page.goto('https://csp.fixture/page');
    await page.locator('#hydrated-button').click();
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Reflect.get(window, 'fixtureBootstrapExecuted')), true,
      'Existing bootstrap scripts and production React hydration must keep working');
    await check(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

void test('CSP blocks injected event attributes without blocking hydrated React events', async () => {
  await withPolicyFixture(async page => {
    await page.locator('#injected-handler').click();
    assert.equal(await page.evaluate(() => Reflect.get(window, 'injectedHandlerExecuted')), undefined);
  });
});

void test('CSP prevents even same-origin base tags from redirecting relative links', async () => {
  await withPolicyFixture(async page => {
    assert.equal(await page.locator('#relative-link').evaluate((link: HTMLAnchorElement) => link.href),
      'https://csp.fixture/orders');
  });
});
