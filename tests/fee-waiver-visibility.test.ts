import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import {
  feeWaiverCheckoutFixture,
  feeWaiverTerms,
} from './helpers/fee-waiver-fixture';
import {seedLegacyPublishedCampaign,seedLegacyRevision,seedLegacyOrderFees} from './helpers/legacy-fee-history-fixture';
import * as repo from '../lib/db/repositories/fee-waivers';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getCommissionReport } from '../lib/db/repositories/commission-reporting';
import {
  calculateMarketplaceFee,
  type FeeBreakdown,
} from '../lib/marketplace/fee-waivers';
import { adminNavigation } from '../lib/admin/navigation';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import { getSellerEarnings } from '../lib/seller/earnings';

async function renderModule(path: string) {
  const bundle = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [
      {
        name: 'navigation',
        setup(b) {
          stubFixtureLink(b);
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'router',
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: 'export const useRouter=()=>({refresh(){}})',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const result = {
    exports: {} as Record<string, ComponentType<Record<string, unknown>>>,
  };
  runInNewContext(bundle.outputFiles[0].text, {
    module: result,
    exports: result.exports,
    require: createRequire(import.meta.url),
    process,
    crypto,
  });
  return result.exports;
}
void test('fee waiver destination is discoverable only by Super Admin', () => {
  assert.ok(
    adminNavigation('super_admin').some((l) => l.href === '/admin/fee-waivers'),
  );
  for (const role of ['admin', 'seller', 'customer'])
    assert.equal(
      adminNavigation(role).some((l) => l.href === '/admin/fee-waivers'),
      false,
    );
});
void test('fee breakdown shows standard 10%, named full waiver and net 0%; historical rate stays recorded', async () => {
  assert.ok(
    existsSync('components/seller/marketplace-fee-breakdown.tsx'),
    'Fee display exists',
  );
  const { MarketplaceFeeBreakdown } = await renderModule(
    'components/seller/marketplace-fee-breakdown.tsx',
  );
  const fee = calculateMarketplaceFee(10000, 1000, {
    ...feeWaiverTerms,
    id: 'c',
    revision: 2,
    state: 'published',
  });
  const html = renderToStaticMarkup(
    createElement(MarketplaceFeeBreakdown, {
      fee,
      campaignName: 'Original launch',
    }),
  );
  assert.match(html, /Standard marketplace fee.*10%/);
  assert.match(html, /Full fee waiver.*Original launch/);
  assert.match(html, /Net marketplace fee.*0%/);
  const old: FeeBreakdown = {
    standardBps: 1250,
    basePaisa: 10000,
    standardPaisa: 1250,
    waivedPaisa: 0,
    netPaisa: 1250,
    campaignId: null,
    campaignRevision: null,
  };
  const historical = renderToStaticMarkup(
    createElement(MarketplaceFeeBreakdown, { fee: old, campaignName: null }),
  );
  assert.match(historical, /12\.5%/);
  assert.match(historical, /No campaign waiver/);
  assert.doesNotMatch(historical, /Original launch/);
});
void test('order and commission views read campaign name from immutable checkout version after rename', async (t) => {
  t.mock.method(Date, 'now', () => 101);
  assert.equal(
    typeof repo.readOrderMarketplaceFeeViews,
    'function',
    'Immutable named fee reader exists',
  );
  const f = await feeWaiverCheckoutFixture();
  try {
    const published = await seedLegacyPublishedCampaign(f.database,'visible-history',feeWaiverTerms);
    const order = await createCodOrder(
      f.database,
      'token',
      'receipt',
      f.input,
      100,
      'checkout-buyer',
    );
    const savedOrder=f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!;
    await seedLegacyOrderFees(f.database,String(savedOrder.id),published);
    await seedLegacyRevision(f.database,{...published,revision:3,name:'Renamed later'});
    const ids = (
      await f.database
        .prepare(
          'SELECT i.id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?',
        )
        .bind(order.orderNumber)
        .all<{ id: string }>()
    ).results.map((x) => x.id);
    const views = await repo.readOrderMarketplaceFeeViews(f.database, ids);
    assert.equal(views[0].campaignName, 'Global launch');
    assert.equal(views[0].fee.campaignRevision, published.revision);
    const report = await getCommissionReport(f.database, {});
    assert.deepEqual(report.rows[0].campaignNames, ['Global launch']);
    const { CommissionReport } = await renderModule('components/admin/commission-report.tsx');
    const reportHtml = renderToStaticMarkup(createElement(CommissionReport,{report,filters:{}}));
    assert.match(reportHtml,/Full fee waiver.*Global launch/);
    assert.doesNotMatch(reportHtml,/Renamed later/);
    assert.match(reportHtml,/Original net marketplace fees/);
    const earnings = await getSellerEarnings(f.database,'seller-a',101);
    const { SellerEarningsSummary } = await renderModule('components/seller/seller-earnings-summary.tsx');
    const earningsHtml = renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings}));
    assert.match(earningsHtml,/Original standard fees/);
    assert.match(earningsHtml,/Original fees waived/);
    assert.match(earningsHtml,/Original net fees/);
  } finally {
    await f.dispose();
  }
});
void test('seller fee notice shows the supplied 10% rate and excludes legacy campaign relief', async () => {
  const { SellerMarketplaceFeeNotice } = await renderModule(
    'components/seller/commission-fee-notice.tsx',
  );
  assert.equal(typeof SellerMarketplaceFeeNotice, 'function');
  const html = renderToStaticMarkup(
    createElement(SellerMarketplaceFeeNotice, {
      basisPoints: 1000,
      // An obsolete campaign prop deliberately exercises the legacy exclusion.
      campaign: {
        ...feeWaiverTerms,
        id: 'c',
        revision: 2,
        state: 'published',
        name: 'Seller launch',
      },
    }),
  );
  assert.equal((html.match(/10%/g) ?? []).length, 1);
  assert.match(html, /Selling fee: 10%\. Current consent is required for new orders\./);
  assert.match(html, /Customer service fee campaigns do not change the seller fee\./);
  assert.match(html, /Original orders keep their recorded amounts\./);
  assert.doesNotMatch(html, /Full fee waiver|Seller launch|Standard marketplace fee|Net marketplace fee/);
});
void test('actual promo manager ignores legacy relief in the authorized inner editor', async () => {
  const { PromoCodeManager } = await renderModule(
    'components/admin/promo-code-manager.tsx',
  );
  const terms = {
    code: 'SAVE10',
    label: 'Fictional savings',
    kind: 'fixed',
    fixedPaisa: 1000,
    minimumSubtotalPaisa: 0,
    startsAt: 10,
    endsAt: 253402300799999,
    totalUseLimit: 10,
    perCustomerUseLimit: 2,
    budgetPaisa: 10000,
  };
  const html = renderToStaticMarkup(
    createElement(PromoCodeManager, {actorId:'reviewer',
      role: 'super_admin',
      initialPage: {
        campaigns: [
          {
            campaignId: 'promo',
            version: 1,
            revision: 1,
            draftRevision: 1,
            publishedRevision: 1,
            terms,
            paused: false,
            usedCount: 0,
            spentPaisa: 0,
            maximumCustomerUsedCount: 0,
          },
        ],
        nextCursor: null,
      },
      defaultCommissionBps: 1000,
      feeWaiver: {
        ...feeWaiverTerms,
        id: 'c',
        revision: 2,
        state: 'published',
        name: 'Preview launch',
      },
    }),
  );
  assert.doesNotMatch(html, /Preview launch/);
  assert.match(html, /data-promo-preview-commission-paisa="10000"/);
  assert.match(html, /10\.00/);
});
