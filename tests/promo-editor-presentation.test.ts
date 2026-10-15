import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PromoCampaignPage, PromoTerms } from '../lib/incentives/types';

type EditorModule = {
  PromoCodeManager: ComponentType<{
    role: string;
    initialPage: PromoCampaignPage;
    defaultCommissionBps?: number;
  }>;
  readEditorTerms: (
    data: FormData,
    preview?: boolean,
    original?: PromoTerms,
  ) => PromoTerms;
};
let modulePromise: Promise<EditorModule> | undefined;
function editor() {
  return (modulePromise ??= (async () => {
    const file = resolve('components/admin/promo-code-manager.tsx');
    const source = await readFile(file, 'utf8');
    const compiled = await build({
      stdin: {
        contents: source + '\nexport { readTerms as readEditorTerms };',
        resolveDir: process.cwd(),
        sourcefile: file,
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      jsx: 'automatic',
      external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
      plugins: [
        {
          name: 'promo-editor-navigation',
          setup(bundler) {
            bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({
              path: 'navigation',
              namespace: 'fixture',
            }));
            bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: 'exports.useRouter=()=>({refresh(){}})',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const result = { exports: {} as EditorModule };
    runInNewContext(compiled.outputFiles[0].text, {
      require: createRequire(import.meta.url),
      module: result,
      exports: result.exports,
      process,
      crypto,
    });
    return result.exports;
  })());
}
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    code: ' save10 ',
    label: 'Fictional savings',
    kind: 'fixed',
    fixedPaisa: '125.50',
    minimumSubtotalPaisa: '0.29',
    startsAt: '2026-10-14T10:00',
    endsAt: '2026-10-15T10:00',
    totalUseLimit: '10',
    perCustomerUseLimit: '2',
    budgetPaisa: '1000.90',
    ...overrides,
  }))
    data.set(key, value);
  return data;
}
const savedTerms: PromoTerms = {
  code: 'SAVE10',
  label: 'Fictional savings',
  kind: 'fixed',
  fixedPaisa: 12550,
  minimumSubtotalPaisa: 29,
  startsAt: Date.parse('2026-10-14T04:15:00Z'),
  endsAt: Date.parse('2026-10-15T04:15:00Z'),
  totalUseLimit: 10,
  perCustomerUseLimit: 2,
  budgetPaisa: 100090,
};
function page(terms: PromoTerms = savedTerms): PromoCampaignPage {
  return {
    campaigns: [
      {
        campaignId: 'fictional-a',
        version: 3,
        revision: 2,
        draftRevision: 2,
        publishedRevision: 1,
        terms,
        paused: false,
        usedCount: 2,
        spentPaisa: 2000,
        maximumCustomerUsedCount: 1,
      },
    ],
    nextCursor: 'more-fictional',
  };
}

void test('promo form sends exact paisa from NPR decimals and interprets dates in Nepal time', async () => {
  const { readEditorTerms } = await editor();
  assert.deepEqual(
    JSON.parse(JSON.stringify(readEditorTerms(form()))),
    savedTerms,
  );
  assert.throws(() => readEditorTerms(form({ fixedPaisa: '1.001' })));
  assert.throws(() => readEditorTerms(form({ budgetPaisa: '1e3' })));
  assert.throws(() => readEditorTerms(form({ startsAt: '2026-02-30T10:00' })));
});

void test('promo percentage entry preserves hundredths of a percent and NPR cap', async () => {
  const { readEditorTerms } = await editor();
  const parsed = readEditorTerms(
    form({
      kind: 'percentage',
      percentBps: '12.35',
      maxDiscountPaisa: '20.99',
    }),
  );
  assert.equal(parsed.kind, 'percentage');
  if (parsed.kind !== 'percentage')
    throw new Error('Percentage terms were not read.');
  assert.equal(parsed.percentBps, 1235);
  assert.equal(parsed.maxDiscountPaisa, 2099);
  assert.throws(() =>
    readEditorTerms(
      form({
        kind: 'percentage',
        percentBps: '100.01',
        maxDiscountPaisa: '20',
      }),
    ),
  );
});

void test('saving unchanged minute controls preserves original subminute timestamps', async () => {
  const { readEditorTerms } = await editor();
  const original = {
    ...savedTerms,
    startsAt: savedTerms.startsAt + 32123,
    endsAt: savedTerms.endsAt + 59999,
  };
  const unchanged = readEditorTerms(form(), false, original);
  assert.equal(unchanged.startsAt, original.startsAt);
  assert.equal(unchanged.endsAt, original.endsAt);
  const changed = readEditorTerms(
    form({ startsAt: '2026-10-14T10:01' }),
    false,
    original,
  );
  assert.equal(changed.startsAt, Date.parse('2026-10-14T04:16:00Z'));
  assert.equal(changed.endsAt, original.endsAt);
});

void test('cost illustration reads unsaved amounts before dates, identity and campaign limits are filled', async () => {
  const { readEditorTerms } = await editor();
  const data = new FormData();
  data.set('kind', 'fixed');
  data.set('fixedPaisa', '125.50');
  data.set('minimumSubtotalPaisa', '100');
  const parsed = readEditorTerms(data, true);
  assert.equal(parsed.fixedPaisa, 12550);
  assert.equal(parsed.minimumSubtotalPaisa, 10000);
  assert.throws(() => readEditorTerms(data));
});

void test('saved draft renders NPR amounts, Nepal dates and a commission cost illustration without presenting draft as live', async () => {
  const { PromoCodeManager } = await editor();
  const html = renderToStaticMarkup(
    createElement(PromoCodeManager, {
      role: 'super_admin',
      initialPage: page(),
      defaultCommissionBps: 900,
    }),
  );
  assert.match(html, /id="promo-fixedPaisa"[^>]*value="125\.50"/);
  assert.match(html, /id="promo-budgetPaisa"[^>]*value="1000\.90"/);
  assert.match(html, /id="promo-startsAt"[^>]*value="2026-10-14T10:00"/);
  assert.match(html, /aria-label="Loaded campaigns"/);
  assert.match(html, /Draft rules/);
  assert.match(html, /data-promo-preview-discount-paisa="12550"/);
  assert.match(html, /data-promo-preview-commission-paisa="9000"/);
  assert.match(html, /data-promo-preview-contribution-paisa="-3550"/);
  assert.match(html, /role="alert"[^>]*>[\s\S]*discount exceeds/);
  const denied = renderToStaticMarkup(
    createElement(PromoCodeManager, { role: 'admin', initialPage: page() }),
  );
  assert.doesNotMatch(
    denied,
    /staff\.promo-code|Loaded campaigns|promo-preview/,
  );
});

void test('saved percentage displays an ordinary percent and NPR cap in the editor and cost preview', async () => {
  const { PromoCodeManager } = await editor();
  const terms: PromoTerms = {
    code: 'SAVE20',
    label: 'Fictional percentage',
    kind: 'percentage',
    percentBps: 1235,
    maxDiscountPaisa: 2099,
    minimumSubtotalPaisa: 0,
    startsAt: savedTerms.startsAt,
    endsAt: savedTerms.endsAt,
    totalUseLimit: 10,
    perCustomerUseLimit: 2,
    budgetPaisa: 100090,
  };
  const html = renderToStaticMarkup(
    createElement(PromoCodeManager, {
      role: 'super_admin',
      initialPage: page(terms),
    }),
  );
  assert.match(html, /id="promo-percentBps"[^>]*value="12\.35"/);
  assert.match(html, /id="promo-maxDiscountPaisa"[^>]*value="20\.99"/);
  assert.match(html, /data-promo-preview-discount-paisa="2099"/);
  assert.doesNotMatch(html, /id="promo-fixedPaisa"/);
});
