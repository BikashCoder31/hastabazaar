import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixturePage } from './helpers/browser-fixture-types';

type Kind = 'hub' | 'terms' | 'referral';
type LayoutBrowser = {
  newPage(options: {
    viewport: { width: number; height: number };
  }): Promise<FixturePage>;
  close(): Promise<void>;
};
const css = readFile(resolve('app/globals.css'), 'utf8').then(
  async (source) =>
    (
      await postcss([tailwindcss({ base: process.cwd() })]).process(source, {
        from: resolve('app/globals.css'),
      })
    ).css,
);
const bundles = new Map<Kind, Promise<string>>();
function bundle(kind: Kind) {
  let result = bundles.get(kind);
  if (!result) {
    const page =
      kind === 'terms'
        ? `import {LegalPolicyPage} from './components/layout/legal-policy-page';
      async function content(){return <LegalPolicyPage policyKey="terms"/>}`
        : `import Page from './app/${kind === 'hub' ? 'legal' : 'referral-terms'}/page'; async function content(){return await Page()}`;
    result = build({
      stdin: {
        sourcefile: 'legal-layout-fixture.tsx',
        resolveDir: process.cwd(),
        loader: 'tsx',
        contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';${page}
      content().then(node=>createRoot(document.getElementById('root')!).render(node));`,
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          name: 'legal-layout-shell',
          setup(bundler) {
            stubFixtureLink(bundler);
            bundler.onResolve(
              {
                filter:
                  /^(?:@\/components\/layout\/|\.\/)site-(header|footer)$/,
              },
              (args) => ({ path: args.path, namespace: 'legal-shell' }),
            );
            bundler.onLoad(
              { filter: /.*/, namespace: 'legal-shell' },
              (args) => ({
                loader: 'tsx',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('header')
                  ? `import React from 'react';export function SiteHeader(){return <header className="sticky top-0 z-40 h-40 bg-white">Fixture header</header>}`
                  : `import React from 'react';export function SiteFooter(){return <footer>Fixture footer</footer>}`,
              }),
            );
            bundler.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
              path: 'env',
              namespace: 'legal-data',
            }));
            bundler.onResolve(
              { filter: /^@\/lib\/db\/repositories\/wallet$/ },
              () => ({ path: 'campaign', namespace: 'legal-data' }),
            );
            bundler.onLoad(
              { filter: /.*/, namespace: 'legal-data' },
              (args) => ({
                loader: 'js',
                contents:
                  args.path === 'env'
                    ? 'export const env={DB:{}}'
                    : 'export async function getReferralCampaign(){return {enabled:true,friendDiscountPaisa:5000,minimumSubtotalPaisa:150000,rewardPaisa:5000,returnWindowDays:7}}',
              }),
            );
          },
        },
      ],
    }).then((result) => result.outputFiles[0].text);
    bundles.set(kind, result);
  }
  return result;
}
async function fixture(kind: Kind, width: number) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  )) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<LayoutBrowser>;
    };
  };
  const [styles, script] = await Promise.all([css, bundle(kind)]);
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div id="root"></div>`,
      }),
    );
    await page.goto('https://legal-layout.test/');
    await page.addScriptTag({ content: script });
    await page
      .getByRole('heading', {
        name:
          kind === 'hub'
            ? 'Legal & Policies'
            : kind === 'terms'
              ? 'Terms & Conditions'
              : 'Welcome to Hastabazaar',
        exact: true,
      })
      .waitFor();
    return { page, browser };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

void test('legal hub card actions align within each row despite different title and description lengths', async () => {
  for (const width of [768, 1440]) {
    const f = await fixture('hub', width);
    try {
      const cards = await f.page.evaluate(() =>
        Array.from(document.querySelectorAll('main a.group')).map((card) => ({
          top: card.getBoundingClientRect().top,
          bottom: card.querySelector(':scope > span')!.getBoundingClientRect()
            .bottom,
        })),
      );
      assert.equal(cards.length, 9);
      for (const card of cards)
        for (const peer of cards.filter(
          (peer) => Math.abs(peer.top - card.top) < 1,
        ))
          assert.ok(
            Math.abs(peer.bottom - card.bottom) < 1.5,
            `Uneven card action positions at ${width}px`,
          );
    } finally {
      await f.browser.close();
    }
  }
});

void test('policy anchors and the sticky menu stay clear of the storefront header when a section opens', async () => {
  const f = await fixture('terms', 1440);
  try {
    await f.page
      .getByRole('link', { name: 'Our marketplace', exact: true })
      .click();
    await f.page.waitForFunction(() => location.hash === '#our-marketplace');
    const layout = await f.page.evaluate(() => ({
      header: document.querySelector('header')!.getBoundingClientRect().bottom,
      sidebar: document.querySelector('aside')!.getBoundingClientRect().top,
      section: document
        .querySelector('#our-marketplace')!
        .getBoundingClientRect().top,
    }));
    assert.ok(
      layout.sidebar >= layout.header + 12,
      `Sticky menu overlaps header: ${JSON.stringify(layout)}`,
    );
    assert.ok(
      layout.section >= layout.header + 12,
      `Section anchor overlaps header: ${JSON.stringify(layout)}`,
    );
  } finally {
    await f.browser.close();
  }
});

void test('referral actions keep readable single-line buttons within narrow-screen content', async () => {
  for (const width of [320, 390]) {
    const f = await fixture('referral', width);
    try {
      const box = await f.page
        .getByRole('link', { name: 'Explore the marketplace', exact: true })
        .evaluate((link) => ({
          height: link.getBoundingClientRect().height,
          right: link.getBoundingClientRect().right,
        }));
      assert.ok(
        box.height <= 52,
        `Primary action wraps into a tall button at ${width}px: ${box.height}`,
      );
      assert.ok(box.right <= width, `Primary action overflows at ${width}px`);
      assert.ok(
        await f.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
    } finally {
      await f.browser.close();
    }
  }
});
