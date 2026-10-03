import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixturePage } from './helpers/browser-fixture-types';

type FilterBrowser = {
  newPage(options: {
    viewport: { width: number; height: number };
  }): Promise<FixturePage>;
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

async function fixture(
  width: number,
  height: number,
  mobile = true,
  unavailable = false,
) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  )) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<FilterBrowser>;
    };
  };
  const bundle = await build({
    stdin: {
      sourcefile: 'catalogue-filter-fixture.tsx',
      loader: 'tsx',
      resolveDir: process.cwd(),
      contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CatalogueFilters} from './components/catalog/catalog-filters';
    import {MobileCatalogFilters} from './components/catalog/mobile-catalog-filters';
    const props={query:'basket',sort:'price-low',minimumPriceNpr:'12.50',
      categories:Array.from({length:12},(_,i)=>({id:'category-'+i,slug:'craft-'+i,nameEn:'Craft '+i})),
      occasions:Array.from({length:13},(_,i)=>({id:'occasion-'+i,slug:'gift-'+i,nameEn:'Gift '+i})),
      selectedCategories:['craft-0'],selectedOccasions:['gift-0'],
      config:{formId:'catalog.filters',version:1,publishedAt:1,fields:[{key:'minimum_price_npr',label:'Minimum price',type:'number',status:'active'}]},
      unavailable:${unavailable}};
    window.filterSubmissions=[];
    document.addEventListener('submit',event=>{event.preventDefault();const form=event.target;
      window.filterSubmissions.push({method:form.method,action:new URL(form.action).pathname,entries:Array.from(new FormData(form).entries())});});
    createRoot(document.getElementById('root')).render(${
      mobile
        ? '<MobileCatalogFilters activeCount={4}><CatalogueFilters {...props} presentation="sheet" idPrefix="mobile"/></MobileCatalogFilters>'
        : '<CatalogueFilters {...props} idPrefix="desktop"/>'
    });
  `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'catalogue-link-fixture', setup: stubFixtureLink }],
  });
  const css = await storefrontCss();
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const navigations: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    assert.equal(
      url.origin,
      'https://catalogue-filter.test',
      'Requests stay inside the isolated fictional fixture',
    );
    assert.equal(request.method(), 'GET');
    navigations.push(url.pathname + url.search);
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
    });
  });
  await page.goto(
    'https://catalogue-filter.test/shop?q=basket&category=craft-0&occasion=gift-0&sort=price-low&custom.minimum_price_npr=12.50',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  if (mobile) await page.getByRole('button', { name: /Filter & sort/ }).click();
  await page.getByLabel(/^Search$/).waitFor();
  if (mobile)
    await page.waitForFunction(() => {
      const panel = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]',
      );
      return Boolean(
        panel && Math.abs(panel.getBoundingClientRect().left) < 0.01,
      );
    });
  return { browser, page, navigations };
}

async function sheetGeometry(page: FixturePage) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(
      '[data-slot="sheet-content"]',
    )!;
    const body = panel.querySelector<HTMLElement>(
      '[data-catalog-filter-body]',
    )!;
    return {
      header: panel
        .querySelector<HTMLElement>('[data-slot="sheet-header"]')!
        .getBoundingClientRect()
        .toJSON(),
      close: panel
        .querySelector<HTMLElement>('[data-slot="sheet-close"]')!
        .getBoundingClientRect()
        .toJSON(),
      body: body.getBoundingClientRect().toJSON(),
      actions: panel
        .querySelector<HTMLElement>('[data-catalog-filter-actions]')!
        .getBoundingClientRect()
        .toJSON(),
      scrollTop: body.scrollTop,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      panelScrollTop: panel.scrollTop,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
}

void test('mobile filter header, Close and Apply/Reset stay visible while only the long filter body scrolls', async () => {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [430, 932],
    [768, 1024],
  ]) {
    const h = await fixture(width, height);
    try {
      const before = await sheetGeometry(h.page);
      assert.ok(
        before.scrollHeight > before.clientHeight,
        'Real occasion/category options must require scrolling',
      );
      assert.ok(before.header.bottom <= before.body.top + 1);
      assert.ok(before.actions.top >= before.body.bottom - 1);
      assert.ok(
        before.actions.bottom <= height + 1,
        'Apply/Reset fit inside the viewport',
      );
      assert.ok(
        before.close.top >= 0 && before.close.bottom <= before.header.bottom,
      );
      assert.ok(before.pageWidth <= width, 'No horizontal page overflow');
      await h.page.locator('[data-catalog-filter-body]').evaluate((body) => {
        body.scrollTop = body.scrollHeight;
      });
      const after = await sheetGeometry(h.page);
      assert.ok(after.scrollTop > 0);
      for (const region of ['header', 'close', 'actions'] as const) {
        for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
          assert.ok(
            Math.abs(after[region][edge] - before[region][edge]) < 1,
            `${region} ${edge} stays fixed while filter options scroll`,
          );
        }
      }
      assert.equal(after.panelScrollTop, 0);
      assert.equal(
        await h.page
          .getByRole('button', { name: 'Show matching products', exact: true })
          .isVisible(),
        true,
      );
      assert.equal(
        await h.page
          .getByRole('link', { name: 'Reset filters', exact: true })
          .isVisible(),
        true,
      );
    } finally {
      await h.browser.close();
    }
  }
});

void test('mobile Apply submits selected native GET fields, and Reset clears all filters including sorting and unsaved edits', async () => {
  const h = await fixture(390, 844);
  try {
    await h.page.getByLabel(/^Search$/).fill('woven gift');
    await h.page.getByLabel(/^Sort by$/).selectOption('name');
    await h.page.getByLabel(/^Minimum price$/).fill('20.25');
    await h.page.getByLabel(/^Gift 12$/).check();
    await h.page.getByLabel(/^Craft 11$/).check();
    await h.page
      .getByRole('button', { name: 'Show matching products', exact: true })
      .click();
    const submissions = await h.page.evaluate(
      () =>
        (
          window as unknown as {
            filterSubmissions: {
              method: string;
              action: string;
              entries: [string, string][];
            }[];
          }
        ).filterSubmissions,
    );
    assert.deepEqual(submissions, [
      {
        method: 'get',
        action: '/shop',
        entries: [
          ['q', 'woven gift'],
          ['sort', 'name'],
          ['custom.minimum_price_npr', '20.25'],
          ['occasion', 'gift-0'],
          ['occasion', 'gift-12'],
          ['category', 'craft-0'],
          ['category', 'craft-11'],
        ],
      },
    ]);
    await h.page.getByLabel(/^Search$/).fill('unsaved search');
    await h.page
      .getByRole('link', { name: 'Reset filters', exact: true })
      .click();
    await h.page.waitForFunction(
      () => location.pathname === '/shop' && location.search === '',
    );
    assert.equal(h.navigations.at(-1), '/shop');
  } finally {
    await h.browser.close();
  }
});

void test('mobile filter keyboard focus stays in the sheet and Escape restores the trigger and applied criteria', async () => {
  const h = await fixture(360, 640);
  try {
    await h.page.getByLabel(/^Search$/).fill('saved until apply');
    await h.page.getByLabel(/^Craft 11$/).check();
    await h.page
      .getByRole('button', { name: 'Close', exact: true })
      .press('Tab');
    await h.page.waitForFunction(
      () =>
        Boolean(document.activeElement?.closest('[data-slot="sheet-content"]')),
      undefined,
      { timeout: 2000 },
    );
    await h.page.getByLabel(/^Search$/).press('Shift+Tab');
    await h.page.waitForFunction(
      () =>
        Boolean(document.activeElement?.closest('[data-slot="sheet-content"]')),
      undefined,
      { timeout: 2000 },
    );
    await h.page.locator(':focus').press('Escape');
    await h.page
      .locator('[data-slot="sheet-content"]')
      .waitFor({ state: 'hidden' });
    assert.equal(
      await h.page.evaluate(() =>
        document.activeElement?.getAttribute('data-slot'),
      ),
      'sheet-trigger',
    );
    await h.page.getByRole('button', { name: /Filter & sort/ }).click();
    await h.page.getByLabel(/^Search$/).waitFor();
    assert.equal(await h.page.getByLabel(/^Search$/).inputValue(), 'basket');
    assert.equal(
      await h.page
        .getByLabel(/^Craft 11$/)
        .evaluate((el) => (el as HTMLInputElement).checked),
      false,
    );
  } finally {
    await h.browser.close();
  }
});

void test('desktop filter Apply keeps all existing query fields and Clear resets the URL', async () => {
  const h = await fixture(1440, 900, false);
  try {
    assert.equal(
      await h.page
        .getByRole('heading', { name: 'Find a gift', exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await h.page
        .getByRole('link', { name: 'Reset filters', exact: true })
        .count(),
      0,
    );
    await h.page
      .getByRole('button', { name: 'Show matching products', exact: true })
      .click();
    const submissions = await h.page.evaluate(
      () =>
        (
          window as unknown as {
            filterSubmissions: {
              method: string;
              action: string;
              entries: [string, string][];
            }[];
          }
        ).filterSubmissions,
    );
    assert.deepEqual(submissions, [
      {
        method: 'get',
        action: '/shop',
        entries: [
          ['q', 'basket'],
          ['sort', 'price-low'],
          ['custom.minimum_price_npr', '12.50'],
          ['occasion', 'gift-0'],
          ['category', 'craft-0'],
        ],
      },
    ]);
    await h.page.getByRole('link', { name: 'Clear', exact: true }).click();
    await h.page.waitForFunction(() => location.search === '');
    assert.equal(h.navigations.at(-1), '/shop');
  } finally {
    await h.browser.close();
  }
});

void test('unavailable filter configuration keeps Apply disabled while Reset remains available', async () => {
  const h = await fixture(390, 844, true, true);
  try {
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Show matching products', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await h.page
        .getByRole('link', { name: 'Reset filters', exact: true })
        .isVisible(),
      true,
    );
  } finally {
    await h.browser.close();
  }
});
