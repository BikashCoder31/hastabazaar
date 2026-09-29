import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type { FixtureBrowser } from './helpers/browser-fixture-types';

void test('mounted shortcut handles guests, verified availability, refresh events, expiry and identity changes', async () => {
  const bundled = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'rewards-fixture.tsx',
      loader: 'tsx',
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {RewardsShortcut} from './components/layout/rewards-shortcut';
      function Fixture(){const [subject,setSubject]=React.useState(null);window.__subject=setSubject;
        return <RewardsShortcut subjectId={subject} href={subject?'/account/rewards':'/login?return_to=%2Faccount%2Frewards'}/>}
      window.__path='/';createRoot(document.getElementById('root')).render(<Fixture/>);`,
    },
    outfile: 'rewards-fixture.js',
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'next-fixture',
        setup(builder) {
          builder.onResolve(
            { filter: /^next\/(link|navigation)$/ },
            ({ path }) => ({ path, namespace: 'fixture' }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: 'fixture' },
            ({ path }) => ({
              loader: 'js',
              resolveDir: process.cwd(),
              contents:
                path === 'next/link'
                  ? 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}'
                  : 'import {useSyncExternalStore} from "react";export function usePathname(){return useSyncExternalStore((cb)=>{window.addEventListener("route",cb);return ()=>window.removeEventListener("route",cb)},()=>window.__path,()=>"/")}',
            }),
          );
        },
      },
    ],
  });
  const modulePath =
    process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = (await import(modulePath)) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<FixtureBrowser>;
    };
  };
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  let reads = 0;
  let claimed = false;
  let unavailable = false;
  let expiresIn = 60_000;
  let delayed: (() => Promise<void>) | null = null;
  let delayNext = false;
  try {
    await page.route('https://reward-shortcut.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/')
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<div id="root"></div>',
        });
      assert.equal(url.pathname + url.search, '/api/account/rewards?limit=1');
      assert.equal(route.request().method(), 'GET');
      reads += 1;
      const now = Date.now();
      const reply = () =>
        route.fulfill({
          status: unavailable ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify({
            claimedToday: claimed,
            nextClaimAt: now + expiresIn,
            state: {
              status: 'active',
              enabled: true,
              paused: false,
              dailyPoints: 10,
              startsAt: now - 1000,
              endsAt: now + expiresIn,
            },
          }),
        });
      if (delayNext) {
        delayNext = false;
        delayed = reply;
        return;
      }
      await reply();
    });
    await page.goto('https://reward-shortcut.test/');
    await page.evaluate(
      (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      },
      bundled.outputFiles.find((file) => file.path.endsWith('.css'))!.text,
    );
    await page.addScriptTag({
      content: bundled.outputFiles.find((file) => file.path.endsWith('.js'))!
        .text,
    });
    const link = page.getByRole('link', { name: 'Daily rewards', exact: true });
    await link.waitFor();
    assert.equal(
      await link.getAttribute('href'),
      '/login?return_to=%2Faccount%2Frewards',
    );
    assert.equal(reads, 0);
    assert.equal(await page.locator('[data-reward-available]').count(), 0);
    const subject = (value: string | null) =>
      page.evaluate(
        (id) =>
          (
            window as unknown as { __subject: (value: string | null) => void }
          ).__subject(id),
        value,
      );
    const event = (name: string) =>
      page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
    await subject('subject-a');
    try {
      await page
        .locator('[data-reward-available="true"]')
        .waitFor({ timeout: 3000 });
    } catch (error) {
      throw new Error(
        `Mounted shortcut reads=${reads}, html=${await page.evaluate(() => document.body.innerHTML)}`,
        { cause: error },
      );
    }
    assert.equal(
      await page
        .getByRole('link', { name: 'Daily rewards, reward available' })
        .getAttribute('href'),
      '/account/rewards',
    );
    assert.equal(reads, 1);
    claimed = true;
    delayNext = true;
    await event('hastabazaar:rewards-updated');
    await page
      .locator('[data-reward-available]')
      .waitFor({ state: 'detached' });
    await page.waitForFunction(
      () =>
        document.querySelector('a')?.getAttribute('aria-label') ===
        'Daily rewards',
    );
    assert.equal(reads, 2);
    assert.ok(delayed);
    await (delayed as () => Promise<void>)();
    await page.waitForTimeout(30);
    assert.equal(await page.locator('[data-reward-available]').count(), 0);
    claimed = false;
    await event('focus');
    await page.locator('[data-reward-available]').waitFor();
    assert.equal(reads, 3);
    unavailable = true;
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    await page
      .locator('[data-reward-available]')
      .waitFor({ state: 'detached' });
    await page.waitForTimeout(30);
    assert.equal(reads, 4);
    unavailable = false;
    await page.evaluate(() => {
      (window as unknown as { __path: string }).__path = '/products';
      window.dispatchEvent(new Event('route'));
    });
    await page.locator('[data-reward-available]').waitFor();
    assert.equal(reads, 5);
    claimed = true;
    await subject('subject-b');
    await page
      .locator('[data-reward-available]')
      .waitFor({ state: 'detached' });
    await page.waitForTimeout(30);
    assert.equal(reads, 6);
    claimed = false;
    expiresIn = 180;
    await event('focus');
    await page.locator('[data-reward-available]').waitFor();
    unavailable = true;
    await page
      .locator('[data-reward-available]')
      .waitFor({ state: 'detached' });
    assert.ok(reads >= 8, 'expiry must trigger a new server read');
    unavailable = false;
    expiresIn = 60_000;
    await page.evaluate(() => {
      const timers = window as unknown as {
        setTimeout: (
          handler: TimerHandler,
          delay?: number,
          ...args: unknown[]
        ) => number;
      };
      const original = timers.setTimeout.bind(window);
      timers.setTimeout = (handler, delay, ...args) =>
        original(
          handler,
          delay !== undefined && delay >= 59_000 ? 100 : delay,
          ...args,
        );
    });
    const beforePoll = reads;
    await event('focus');
    await page.locator('[data-reward-available]').waitFor();
    unavailable = true;
    await page
      .locator('[data-reward-available]')
      .waitFor({ state: 'detached' });
    assert.equal(
      reads,
      beforePoll + 2,
      'a visible page must revalidate campaign changes before the daily boundary',
    );
    await subject(null);
    await page
      .getByRole('link', { name: 'Daily rewards', exact: true })
      .waitFor();
    const lastReads = reads;
    await event('focus');
    await event('hastabazaar:rewards-updated');
    await page.waitForTimeout(50);
    assert.equal(reads, lastReads);
  } finally {
    await browser.close();
  }
});
