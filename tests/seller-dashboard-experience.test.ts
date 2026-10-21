import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';

Object.assign(globalThis, { sellerExperienceCreateElement: createElement });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/navigation')
      return {
        url: 'data:text/javascript,export function usePathname(){return "/seller"}',
        shortCircuit: true,
      };
    if (specifier === 'next/link')
      return {
        url:
          'data:text/javascript,' +
          encodeURIComponent(
            "export default function Link({children,prefetch,...props}){return globalThis.sellerExperienceCreateElement('a',props,children)}",
          ),
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});

void test('program history waits for its client controls and retains mounted draft fields', async () => {
  const ui = await import('../components/seller/seller-program-details').catch(
    () => null,
  );
  assert.ok(ui, 'The program details disclosure must expose its loading state');
  const html = renderToStaticMarkup(
    createElement(
      ui.SellerProgramDetails,
      null,
      createElement('input', {
        name: 'unsaved-note',
        defaultValue: 'Keep these unsaved notes',
      }),
    ),
  );
  assert.match(html, /<button[^>]*aria-disabled="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Keep these unsaved notes/);
});

void test('mobile navigation keeps four daily destinations and all secondary pages reachable', async () => {
  const ui = await import('../components/seller/seller-navigation');
  assert.ok(
    'SellerNavigationView' in ui,
    'Navigation must expose the responsive view',
  );
  const html = renderToStaticMarkup(
    createElement(ui.SellerNavigationView, {
      pathname: '/seller/shipping/parcel-1',
      tradingName: 'Fixture shop',
      sellerId: 'owned-shop',
    }),
  );
  const quick = html.match(
    /<nav aria-label="Seller quick links"[\s\S]*?<\/nav>/,
  )?.[0];
  assert.ok(quick, 'Daily navigation must be identified');
  assert.equal((quick.match(/<a /g) ?? []).length, 4);
  for (const href of [
    '/seller',
    '/seller/orders',
    '/seller/products',
    '/seller/finance',
  ])
    assert.ok(quick.includes(`href="${href}"`));
  assert.match(html, /<details[\s\S]*More[\s\S]*Shipping/);
  assert.match(html, /href="\/seller\/shipping"[^>]*aria-current="page"/);
  for (const href of [
    '/seller/reviews',
    '/seller/cases',
    '/seller/analytics',
    '/seller/notifications',
    '/seller/profile',
    '/makers/owned-shop',
    '/account',
  ])
    assert.ok(html.includes(`href="${href}"`));
});

const products = {
  total: 12,
  published: 5,
  pendingApproval: 2,
  rejected: 1,
  drafts: 1,
  outOfStock: 2,
  needsChanges: 3,
  lowStock: 4,
};
const work = {
  toPack: 6,
  packing: 2,
  ready: 1,
  needsChanges: 3,
  awaitingConfirmation: 0,
};
const registered = {
  availablePaisa: 12345,
  pendingPaisa: 6789,
  grossSalesPaisa: 100000,
  commissionPaisa: -12500,
  commissionReversalPaisa: 250,
  refundPaisa: -800,
  paidPaisa: 20000,
};

// Catch hiding actionable work below non-actionable catalog status, or treating review as a seller task.
void test('seller action overview prioritizes owned work and separates waiting review', async () => {
  const ui = await import('../components/seller/seller-action-overview').catch(
    () => null,
  );
  assert.ok(ui, 'Seller action overview must exist');
  const html = renderToStaticMarkup(
    createElement(ui.SellerActionOverview, {
      products,
      work,
      cases: { returns: 2, complaints: 1 },
    }),
  ).replaceAll('&amp;', '&');
  assert.ok(html.indexOf('Orders to pack') < html.indexOf('Listing changes'));
  assert.match(html, /6[\s\S]*Start packing/);
  assert.match(html, /href="\/seller\/products\?status=needs_changes"/);
  assert.match(html, /href="\/seller\/cases"/);
  assert.ok(
    html.indexOf('Needs your action') < html.indexOf('Waiting for review'),
  );
  assert.doesNotMatch(html, /rejected and requiring correction/);
});

void test('empty action queue does not invent urgent work from pending or rejected products', async () => {
  const ui = await import('../components/seller/seller-action-overview').catch(
    () => null,
  );
  assert.ok(ui, 'Seller action overview must exist');
  const html = renderToStaticMarkup(
    createElement(ui.SellerActionOverview, {
      products: { ...products, needsChanges: 0, outOfStock: 0 },
      work: {
        toPack: 0,
        packing: 0,
        ready: 0,
        needsChanges: 0,
        awaitingConfirmation: 1,
      },
      cases: { returns: 0, complaints: 0 },
    }),
  );
  assert.match(html, /No tasks need your action/);
  assert.match(html, /Waiting for review/);
  assert.doesNotMatch(html, /Start packing|Update stock/);
  assert.match(html, /Waiting for staff confirmation/);
});

// Catch recalculating old commission from today's saved rate or presenting a request as payment.
void test('earnings shows recorded balances and labels saved commission for new orders only', async () => {
  const ui = await import('../components/seller/seller-earnings-summary').catch(
    () => null,
  );
  assert.ok(ui, 'Seller earnings summary must exist');
  const html = renderToStaticMarkup(
    createElement(ui.SellerEarningsSummary, {
      earnings: {
        registered,
        commission: { basisPoints: 725, version: 'saved-725', acceptedAt: 1 },
        managed: null,
        participationRoute: 'registered_seller',
        hasRegisteredRecords: true,
      },
    }),
  );
  assert.match(html, /123\.45/);
  assert.match(html, /67\.89/);
  assert.match(html, /200\.00/);
  assert.match(html, /125\.00/);
  assert.match(html, /-NPR\s*125\.00/);
  assert.match(html, /-NPR\s*8\.00/);
  assert.match(html, /7\.25%/);
  assert.match(html, /new orders/);
  assert.doesNotMatch(html, /9% company|91% maker/);
  assert.match(html, /request does not transfer money/);
});

void test('managed earnings stay separate and use saved retention without changing recorded amounts', async () => {
  const ui = await import('../components/seller/seller-earnings-summary').catch(
    () => null,
  );
  assert.ok(ui, 'Seller earnings summary must exist');
  const summary = {
    calculatedPaisa: 91000,
    earnedPaisa: 91000,
    heldPaisa: 5000,
    eligiblePaisa: 34000,
    paidPaisa: 20000,
    balancePaisa: 71000,
    reservedPaisa: 10000,
    payablePaisa: 34000,
    blockedPaisa: 27000,
    refundOffsetPaisa: 0,
    needsReconciliation: false,
  };
  for (const [retentionBps, company, maker] of [
    [900, '9%', '91%'],
    [1250, '12.5%', '87.5%'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ui.SellerEarningsSummary, {
        earnings: {
          registered,
          commission: { basisPoints: 725, version: 'saved-725', acceptedAt: 1 },
          participationRoute: 'managed_maker',
          hasRegisteredRecords: false,
          managed: {
            summary,
            retentionBps,
            commercialModel: 'managed_sale_linked_percentage_v1',
          },
        },
      }),
    );
    assert.match(html, /Managed Maker earnings/);
    assert.ok(
      html.includes(company + ' company') && html.includes(maker + ' maker'),
    );
    assert.match(html, /340\.00/);
    assert.match(html, /270\.00/);
    assert.doesNotMatch(html, /7\.25%|id="registered-earnings-title"/);
  }
});

void test('12% offers display the 88% remainder and pending consent without repricing earnings', async () => {
  const {SellerEarningsSummary}=await import('../components/seller/seller-earnings-summary');
  const base={registered,commission:{basisPoints:1200,version:'current-12',acceptedAt:null},commissionAccepted:false,participationRoute:'registered_seller',hasRegisteredRecords:true,managed:null};
  const registeredHtml=renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:base}));
  assert.match(registeredHtml,/12% company/);assert.match(registeredHtml,/88% seller/);
  assert.match(registeredHtml,/acceptance.*required|review and accept/i);assert.match(registeredHtml,/125\.00/);
  const makerHtml=renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:{...base,participationRoute:'managed_maker',hasRegisteredRecords:false,
    managed:{retentionBps:null,offeredRetentionBps:1200,commercialModel:'managed_sale_linked_percentage_v1',summary:{calculatedPaisa:91000,earnedPaisa:91000,heldPaisa:0,eligiblePaisa:91000,paidPaisa:0,balancePaisa:91000,reservedPaisa:0,payablePaisa:91000,blockedPaisa:0,refundOffsetPaisa:0,needsReconciliation:false}}}}));
  assert.match(makerHtml,/12% company/);assert.match(makerHtml,/88% maker/);
  assert.match(makerHtml,/review and accept/i);assert.match(makerHtml,/910\.00/);assert.doesNotMatch(makerHtml,/880\.00/);
});

void test('unavailable current terms show recorded earnings without inventing a rate', async () => {
  const {SellerEarningsSummary} = await import('../components/seller/seller-earnings-summary');
  const html = renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:{registered,commission:null,currentRateUnavailable:true,participationRoute:'registered_seller',hasRegisteredRecords:true,managed:null}}));
  assert.match(html,/Current commission terms are unavailable/);
  assert.match(html,/125\.00/);
  assert.doesNotMatch(html,/(9|12)% company/);
});

void test('earnings preserves zero and negative positions without making them look paid', async () => {
  const ui = await import('../components/seller/seller-earnings-summary');
  for (const [availablePaisa, expected] of [
    [0, 'NPR\\s*0\\.00'],
    [-101, '-NPR\\s*1\\.01'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ui.SellerEarningsSummary, {
        earnings: {
          registered: { ...registered, availablePaisa },
          commission: {
            basisPoints: 900,
            version: 'saved-nine',
            acceptedAt: 1,
          },
          managed: null,
          participationRoute: 'registered_seller',
          hasRegisteredRecords: true,
        },
      }),
    );
    assert.match(html, new RegExp('Available for payout[\\s\\S]*?' + expected));
    assert.match(html, /Not yet paid/);
  }
});

void test('missing accepted terms, fixed suppliers and transitioned makers do not inherit an invented percentage', async () => {
  const ui = await import('../components/seller/seller-earnings-summary');
  const summary = {
    calculatedPaisa: 91000,
    earnedPaisa: 91000,
    heldPaisa: 0,
    eligiblePaisa: 91000,
    paidPaisa: 0,
    balancePaisa: 91000,
    reservedPaisa: 0,
    payablePaisa: 91000,
    blockedPaisa: 0,
    refundOffsetPaisa: 0,
    needsReconciliation: false,
  };
  for (const [commercialModel, route, expected] of [
    [
      'managed_sale_linked_percentage_v1',
      'managed_maker',
      'Current accepted sale-linked terms need review',
    ],
    [
      'managed_fixed_supplier_price_v1',
      'managed_maker',
      'Fixed supplier prices are separate',
    ],
    [
      null,
      'registered_seller',
      'Historical maker amounts keep their recorded terms',
    ],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ui.SellerEarningsSummary, {
        earnings: {
          registered,
          commission: { basisPoints: 725, version: 'saved-725', acceptedAt: 1 },
          participationRoute: route,
          hasRegisteredRecords: route === 'registered_seller',
          managed: { summary, retentionBps: null, commercialModel },
        },
      }),
    );
    assert.ok(html.includes(expected));
    assert.doesNotMatch(html, /9% company|91% maker/);
    assert.match(html, /910\.00/);
    if (commercialModel === null) {
      assert.match(html, /id="registered-earnings-title"/);
      assert.doesNotMatch(html, /Fixed supplier prices are separate/);
    }
    assert.doesNotMatch(html, /<p[^>]*>[^<]*<p/);
  }
});
