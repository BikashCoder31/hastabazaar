import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixturePage } from './helpers/browser-fixture-types';
import {
  getLegalPolicyDocument,
  publicLegalPolicies,
  publicLegalPolicyNavigation,
  type PublicLegalPolicyKey,
} from '../lib/content/legal-policies';

interface PolicyPage extends FixturePage {
  emulateMedia(options: { media: 'print' | 'screen' }): Promise<void>;
}
type PolicyBrowser = {
  newPage(options: {
    viewport: { width: number; height: number };
  }): Promise<PolicyPage>;
  close(): Promise<void>;
};

let compiledCss: Promise<string> | undefined;
function storefrontCss() {
  return (compiledCss ??= readFile(resolve('app/globals.css'), 'utf8').then(
    async (source) =>
      (
        await postcss([tailwindcss({ base: process.cwd() })]).process(source, {
          from: resolve('app/globals.css'),
        })
      ).css,
  ));
}

const bundles = new Map<PublicLegalPolicyKey, Promise<string>>();
function policyBundle(policyKey: PublicLegalPolicyKey) {
  let compiled = bundles.get(policyKey);
  if (!compiled) {
    compiled = build({
      stdin: {
        sourcefile: 'legal-policy-fixture.tsx',
        loader: 'tsx',
        resolveDir: process.cwd(),
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';
          import {LegalPolicyPage} from './components/layout/legal-policy-page';
          createRoot(document.getElementById('root')).render(<LegalPolicyPage policyKey=${JSON.stringify(policyKey)} document={${JSON.stringify(getLegalPolicyDocument(policyKey, policyKey === 'seller-agreement' ? 900 : undefined))}}/>);`,
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          name: 'policy-fixture-shell',
          setup(bundler) {
            stubFixtureLink(bundler);
            bundler.onResolve(
              { filter: /^\.\/site-(header|footer)$/ },
              (args) => ({
                path: args.path,
                namespace: 'policy-shell',
              }),
            );
            bundler.onLoad(
              { filter: /.*/, namespace: 'policy-shell' },
              (args) => ({
                loader: 'tsx',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('header')
                  ? "import React from 'react';export function SiteHeader(){return <header className='h-20'>Fictional shell header</header>}"
                  : "import React from 'react';export function SiteFooter(){return <footer>Fictional shell footer</footer>}",
              }),
            );
          },
        },
      ],
    }).then((result) => result.outputFiles[0].text);
    bundles.set(policyKey, compiled);
  }
  return compiled;
}

async function fixture(
  policyKey: PublicLegalPolicyKey,
  width: number,
  height = 900,
) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  )) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<PolicyBrowser>;
    };
  };
  const [css, bundle] = await Promise.all([
    storefrontCss(),
    policyBundle(policyKey),
  ]);
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route('**/*', async (route) => {
      assert.equal(
        new URL(route.request().url()).origin,
        'https://legal-policy.test',
      );
      assert.equal(route.request().method(), 'GET');
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      });
    });
    await page.goto(
      'https://legal-policy.test' + publicLegalPolicies[policyKey].href,
    );
    await page.addScriptTag({ content: bundle });
    await page
      .getByRole('heading', {
        name: publicLegalPolicies[policyKey].title,
        exact: true,
      })
      .waitFor();
    return { browser, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

for (const policyKey of ['returns', 'shipping'] as const) {
  void test(
    policyKey +
      ' key answer is visible before navigation in the first mobile and desktop viewport',
    async () => {
      for (const width of [360, 390, 430, 1440]) {
        const h = await fixture(policyKey, width, width < 1000 ? 844 : 900);
        try {
          const answer = h.page.locator('[data-policy-key-answer]');
          assert.equal(
            await answer.count(),
            1,
            'A shopper sees the policy key answer near the title',
          );
          const text = await answer.textContent();
          if (policyKey === 'returns') {
            assert.match(text ?? '', /unused, unaltered/);
            assert.match(text ?? '', /accessories and labels/);
            assert.match(text ?? '', /7 calendar days after delivery/);
            assert.match(
              text ?? '',
              /goods supplied sealed.*15 calendar days.*original seal remains intact/i,
            );
            assert.match(text ?? '', /exclusions and full conditions apply/);
            assert.match(
              text ?? '',
              /protections for damaged, defective or misdescribed items remain/i,
            );
          } else {
            assert.match(
              text ?? '',
              /district estimates do not confirm delivery availability/i,
            );
            assert.match(text ?? '', /address accepted for your order/i);
            assert.match(
              text ?? '',
              /each store.s delivery charge.*checkout total before you order/i,
            );
            assert.match(text ?? '', /different stores may arrive separately/i);
          }
          const layout = await h.page.evaluate(() => {
            const answer = document.querySelector<HTMLElement>(
              '[data-policy-key-answer]',
            )!;
            const navigation = document.querySelector<HTMLElement>('aside')!;
            const article = document.querySelector<HTMLElement>('article')!;
            const mobile = document.querySelector<HTMLElement>(
              '[data-policy-navigation="mobile"]',
            )!;
            return {
              answerTop: answer.getBoundingClientRect().top,
              answerBottom: answer.getBoundingClientRect().bottom,
              navigationTop: navigation.getBoundingClientRect().top,
              articleTop: article.getBoundingClientRect().top,
              viewportHeight: innerHeight,
              pageWidth: document.documentElement.scrollWidth,
              closed: Array.from(mobile.querySelectorAll('details')).every(
                (disclosure) => !disclosure.open,
              ),
            };
          });
          assert.ok(
            layout.answerTop >= 0 &&
              layout.answerBottom <= layout.viewportHeight,
            'The complete key answer fits the first viewport at ' +
              width +
              'px',
          );
          assert.ok(
            layout.answerBottom <= layout.navigationTop &&
              layout.answerBottom <= layout.articleTop,
            'The key answer precedes both navigation and full terms',
          );
          assert.equal(
            layout.closed,
            true,
            'Mobile navigation begins collapsed',
          );
          assert.ok(layout.pageWidth <= width, 'No horizontal overflow');
          assert.equal(
            await answer
              .getByRole('link', { name: 'Read full conditions' })
              .getAttribute('href'),
            policyKey === 'returns'
              ? '#standard-returns'
              : '#delivery-availability-and-charges',
          );
        } finally {
          await h.browser.close();
        }
      }
    },
  );
}

void test('mobile policy disclosures begin closed and keep full terms close to the introduction without overflow', async () => {
  for (const policyKey of ['returns', 'shipping'] as const) {
    for (const width of [320, 360, 390, 430, 768]) {
      const h = await fixture(policyKey, width);
      try {
        const layout = await h.page.evaluate(() => {
          const mobile = document.querySelector<HTMLElement>(
            '[data-policy-navigation="mobile"]',
          )!;
          const article = document.querySelector<HTMLElement>('article')!;
          const introduction =
            document.querySelector<HTMLElement>('[data-policy-key-answer]') ??
            document.querySelector<HTMLElement>('h1 + p')!;
          return {
            open: Array.from(mobile.querySelectorAll('details')).map(
              (el) => el.open,
            ),
            navHeight: mobile.getBoundingClientRect().height,
            introductionBottom: introduction.getBoundingClientRect().bottom,
            articleTop: article.getBoundingClientRect().top,
            pageWidth: document.documentElement.scrollWidth,
          };
        });
        assert.deepEqual(layout.open, [false, false]);
        assert.ok(
          layout.navHeight <= 120,
          'Collapsed controls leave room for actual policy content',
        );
        assert.ok(
          layout.articleTop - layout.introductionBottom <= 225,
          'Full policy follows the compact controls',
        );
        assert.ok(layout.pageWidth <= width, 'No horizontal page overflow');
        assert.equal(
          await h.page
            .getByRole('navigation', { name: 'Legal policies', exact: true })
            .isVisible(),
          false,
        );
        assert.equal(
          await h.page
            .getByRole('navigation', { name: 'On this page', exact: true })
            .isVisible(),
          false,
        );
        assert.ok(
          (await h.page.locator('article').textContent())?.includes(
            policyKey === 'returns'
              ? '7 calendar days after delivery'
              : 'Separate delivery charges must be included',
          ),
        );
      } finally {
        await h.browser.close();
      }
    }
  }
});

void test('native policy disclosures work with keyboard, identify the current page and retain section anchors', async () => {
  const h = await fixture('returns', 390, 844);
  try {
    const policies = h.page.locator(
      '[data-policy-disclosure="policies"] summary',
    );
    await policies.press('Enter');
    await h.page
      .locator(
        '[data-policy-navigation="mobile"] nav[aria-label="Legal policies"]',
      )
      .waitFor();
    const current = h.page.locator(
      '[data-policy-navigation="mobile"] [aria-current="page"]',
    );
    assert.equal(
      await current.textContent(),
      publicLegalPolicies.returns.title,
    );
    assert.equal(await current.getAttribute('href'), '/returns');
    assert.equal(
      await h.page
        .locator(
          '[data-policy-navigation="mobile"] nav[aria-label="Legal policies"] a',
        )
        .count(),
      publicLegalPolicyNavigation.length + 1,
    );
    assert.equal(
      await h.page
        .locator(
          '[data-policy-navigation="mobile"] a[href="/seller-agreement"]',
        )
        .count(),
      0,
      'Commercial terms are absent from customer policy navigation',
    );
    await policies.press('Enter');
    assert.equal(await current.isVisible(), false);
    const contents = h.page.locator(
      '[data-policy-disclosure="contents"] summary',
    );
    await contents.press('Space');
    const standardReturns = h.page.locator(
      '[data-policy-navigation="mobile"] a[href="#standard-returns"]',
    );
    await standardReturns.waitFor();
    await standardReturns.click();
    await h.page.waitForFunction(() => location.hash === '#standard-returns');
    assert.equal(
      await h.page.locator('article #standard-returns').textContent(),
      'Standard returns',
    );
    assert.equal(await h.page.locator('article #standard-returns').count(), 1);
  } finally {
    await h.browser.close();
  }
});

void test('desktop policy navigation and contents remain immediately available and all public routes are linked', async () => {
  const h = await fixture('shipping', 1440);
  try {
    const desktop = h.page.locator('[data-policy-navigation="desktop"]');
    assert.equal(await desktop.isVisible(), true);
    assert.equal(
      await h.page.locator('[data-policy-navigation="mobile"]').isVisible(),
      false,
    );
    for (const policy of publicLegalPolicyNavigation) {
      assert.equal(
        await desktop
          .getByRole('link', { name: policy.title, exact: true })
          .getAttribute('href'),
        policy.href,
      );
    }
    assert.equal(
      await desktop.locator('[aria-current="page"]').textContent(),
      publicLegalPolicies.shipping.title,
    );
    const availability = desktop.getByRole('link', {
      name: 'Delivery availability and charges',
      exact: true,
    });
    assert.equal(await availability.isVisible(), true);
    await availability.click();
    await h.page.waitForFunction(
      () => location.hash === '#delivery-availability-and-charges',
    );
    assert.equal(
      await h.page
        .locator('article #delivery-availability-and-charges')
        .count(),
      1,
    );
  } finally {
    await h.browser.close();
  }
});

void test('every policy keeps its canonical paragraphs, headings and lists, including when printed', async () => {
  for (const policyKey of Object.keys(
    publicLegalPolicies,
  ) as PublicLegalPolicyKey[]) {
    const h = await fixture(policyKey, 390);
    try {
      const body = await h.page.locator('article').textContent();
      const markdown = getLegalPolicyDocument(
        policyKey,
        policyKey === 'seller-agreement' ? 900 : undefined,
      );
      for (const paragraph of markdown
        .split(/\r?\n\r?\n/)
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith('#'))) {
        if (paragraph.startsWith('|')) {
          const rows = paragraph.split(/\r?\n/).map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
            .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
          for (const [index, cells] of rows.entries()) {
            for (const cell of cells) assert.ok(await h.page.locator('article table')
              .getByRole(index === 0 ? 'columnheader' : 'cell', { name: cell, exact: true }).count() > 0,
            `${policyKey}: retained table cell ${cell}`);
          }
          continue;
        }
        const plain = paragraph
          .replace(/^[-*]\s+/gm, '')
          .replace(/^\d+\.\s+/gm, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\s+/g, ' ');
        assert.ok(
          body?.replace(/\s+/g, ' ').includes(plain),
          `${policyKey}: retained ${plain.slice(0, 80)}`,
        );
      }
      await h.page.emulateMedia({ media: 'print' });
      assert.equal(await h.page.locator('aside').isVisible(), false);
      assert.equal(await h.page.locator('article').isVisible(), true);
      assert.equal(
        await h.page.locator('article').textContent(),
        body,
        'Print keeps the complete policy',
      );
    } finally {
      await h.browser.close();
    }
  }
});
