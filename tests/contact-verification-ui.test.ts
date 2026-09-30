import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const verified = {
  email: 'buyer@local.hastabazaar.test',
  phone: '+9779811111111',
  emailVerified: true,
  phoneVerified: true,
};
void test('HTTP 200 with malformed status or capture cannot establish verified contacts', async () => {
  const feature = await import('../lib/auth/contact-presentation').catch(
    () => null,
  );
  assert.ok(feature, 'Contact response validation must exist');
  assert.throws(() =>
    feature.parseContactStatus({ ...verified, emailVerified: 'true' }),
  );
  assert.throws(() =>
    feature.parseContactStatus({ ...verified, phone: 'not a phone' }),
  );
  assert.throws(() =>
    feature.parseContactStatus(
      { ...verified, email: 'other@local.hastabazaar.test' },
      verified,
    ),
  );
  assert.throws(() =>
    feature.parseContactRequest({
      verified: false,
      token: 'fake',
      expiresAt: Date.now() + 600000,
    }),
  );
  assert.throws(() =>
    feature.parseContactCaptures({ captures: { code: '123456' } }),
  );
  assert.throws(() =>
    feature.parseContactCaptures({
      captures: [
        {
          channel: 'phone',
          code: '123456',
          contact: '+9779811111111',
          expiresAt: Date.now() + 100000,
          label: 'production',
        },
      ],
    }),
  );
  assert.equal(feature.parseContactStatus(verified).emailVerified, true);
});

void test('mounted panel rejects malformed success and discards a late code response after owner changes', async () => {
  const playwrightPath =
    process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = (await import(playwrightPath)) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<FixtureBrowser>;
    };
  };
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'contact-ui-fixture.tsx',
      loader: 'tsx',
      contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {ContactVerificationPanel} from './components/account/contact-verification';
    const root=createRoot(document.getElementById('root')!);window.contactEvents=[];
    window.mount=(owner='buyer')=>root.render(<ContactVerificationPanel key="contact-panel" ownerKey={owner} initialStatus={{email:owner+'@local.hastabazaar.test',phone:owner==='buyer'?'+9779811111111':'+9779822222222',emailVerified:false,phoneVerified:false}} onStatusChange={value=>window.contactEvents.push(value)}/>);window.mount();
  `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'contact-navigation',
        setup(bundler) {
          bundler.onResolve(
            { filter: /^next\/(link|navigation)$/ },
            (args) => ({ path: args.path, namespace: 'navigation-shim' }),
          );
          bundler.onLoad(
            { filter: /.*/, namespace: 'navigation-shim' },
            (args) => ({
              contents:
                args.path === 'next/link'
                  ? 'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}'
                  : 'export function useRouter(){return {refresh(){}}}',
              loader: 'js',
              resolveDir: process.cwd(),
            }),
          );
        },
      },
    ],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  try {
    await page.route('https://contact.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"></div>',
      }),
    );
    await page.goto('https://contact.test/');
    await page.evaluate(() => {
      const w = window as unknown as {
        requests: {
          url: string;
          init?: RequestInit;
          resolve: (response: Response) => void;
        }[];
      };
      w.requests = [];
      window.fetch = (url, init) =>
        new Promise<Response>((resolve) =>
          w.requests.push({
            url:
              typeof url === 'string'
                ? url
                : url instanceof URL
                  ? url.href
                  : url.url,
            init,
            resolve,
          }),
        );
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() =>
      Boolean((window as unknown as { requests: unknown[] }).requests.length),
    );
    await page.evaluate(() => {
      const w = window as unknown as {
        requests: { resolve: (response: Response) => void }[];
      };
      w.requests.shift()!.resolve(
        new Response(
          JSON.stringify({
            email: 'buyer@local.hastabazaar.test',
            phone: '+9779811111111',
            emailVerified: 'true',
            phoneVerified: 'true',
          }),
          { status: 200 },
        ),
      );
    });
    await page.waitForTimeout(50);
    const events = await page.evaluate(
      () => (window as unknown as { contactEvents: unknown[] }).contactEvents,
    );
    assert.equal(
      events.some(
        (value) =>
          value !== null &&
          typeof value === 'object' &&
          'emailVerified' in value &&
          value.emailVerified === 'true',
      ),
      false,
      'Malformed success must never establish verified state',
    );
    await page.evaluate(() => {
      const w = window as unknown as { mount: (owner: string) => void };
      w.mount('other');
    });
    await page.waitForFunction(
      () => (window as unknown as { requests: unknown[] }).requests.length > 0,
    );
    await page.evaluate(() => {
      const w = window as unknown as {
        requests: { resolve: (response: Response) => void }[];
      };
      w.requests.shift()!.resolve(
        new Response(
          JSON.stringify({
            email: 'other@local.hastabazaar.test',
            phone: '+9779822222222',
            emailVerified: false,
            phoneVerified: false,
          }),
          { status: 200 },
        ),
      );
    });
    await page
      .getByRole('button', { name: 'Send phone code', exact: true })
      .click();
    await page.waitForFunction(
      () => (window as unknown as { requests: unknown[] }).requests.length > 0,
    );
    await page.evaluate(() => {
      const w = window as unknown as {
        requests: { resolve: (response: Response) => void }[];
      };
      w.requests.shift()!.resolve(
        new Response(
          JSON.stringify({
            verified: false,
            token: 'A'.repeat(43),
            expiresAt: Date.now() + 600000,
          }),
          { status: 200 },
        ),
      );
    });
    await page.getByLabel('SMS verification code').fill('123456');
    await page
      .getByRole('button', { name: 'Verify phone code', exact: true })
      .click();
    await page.waitForFunction(
      () => (window as unknown as { requests: unknown[] }).requests.length > 0,
    );
    await page.evaluate(() => {
      const w = window as unknown as { mount: (owner: string) => void };
      w.mount('buyer');
    });
    // Wait until the new owner's subscription is committed before delivering
    // the old owner's pending verification response.
    await page.waitForFunction(() =>
      (window as unknown as { requests: unknown[] }).requests.length > 1,
    );
    await page.evaluate(() => {
      const w = window as unknown as {
        requests: { resolve: (response: Response) => void }[];
      };
      w.requests.shift()!.resolve(
        new Response(
          JSON.stringify({
            verified: true,
            status: {
              email: 'other@local.hastabazaar.test',
              phone: '+9779822222222',
              emailVerified: false,
              phoneVerified: true,
            },
          }),
          { status: 200 },
        ),
      );
    });
    await page.waitForTimeout(50);
    const lateEvents = await page.evaluate(
      () =>
        (
          window as unknown as {
            contactEvents: { email?: string; phoneVerified?: boolean }[];
          }
        ).contactEvents,
    );
    assert.equal(
      lateEvents.some(
        (value) =>
          value?.email === 'other@local.hastabazaar.test' &&
          value.phoneVerified === true,
      ),
      false,
      'Late verification must not update checkout after the owner changes',
    );
    assert.equal(
      await page.getByLabel('SMS verification code').count(),
      0,
      'Late code response belongs only to the old owner',
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Send phone code', exact: true })
        .isEnabled(),
      true,
      'A new owner can request a fresh code',
    );
  } finally {
    await browser.close();
  }
});
