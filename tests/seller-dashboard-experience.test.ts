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

void test('mobile navigation shows daily links and retains all pages in the menu', async () => {
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
      canReplyToReviews:true,
      publicShopHref: '/makers/owned-shop',
      addProductHref: '/seller/products/new',
      openOrderCount: 3,
      shopLive: true,
    }),
  );
  const quick = html.match(
    /<nav aria-label="Seller quick links"[\s\S]*?<\/nav>/,
  )?.[0];
  assert.ok(quick, 'Daily navigation must be identified');
  assert.equal((quick.match(/<a /g) ?? []).length, 5);
  assert.equal((html.match(/data-mobile-shortcut=/g) ?? []).length, 6);
  assert.match(quick, /aria-label="3 orders to prepare"/);
  for (const href of [
    '/seller',
    '/seller/orders',
    '/seller/products',
    '/seller/products/new',
    '/seller/finance',
  ])
    assert.ok(quick.includes(`href="${href}"`));
  assert.match(html, /Shop is live/);
  assert.doesNotMatch(html, /Seller reference:/);
  assert.match(html, /<dialog[\s\S]*All seller pages[\s\S]*Shipping/);
  assert.match(html, /href="\/seller\/shipping"[^>]*aria-current="location"/);
  for (const href of [
    '/seller/reviews',
    '/seller/cases',
    '/seller/profile',
    '/seller/finance',
    '/seller/registration',
    '/seller/requests',
    '/makers/owned-shop',
    '/account',
  ])
    assert.ok(html.includes(`href="${href}"`));
});

void test('seller navigation does not invent a public shop destination for an applicant', async () => {
  const { SellerNavigationView } = await import('../components/seller/seller-navigation');
  const html = renderToStaticMarkup(createElement(SellerNavigationView, { pathname: '/seller/registration', tradingName: 'Unpublished fixture', sellerId: 'private-seller',canReplyToReviews:false }));
  assert.doesNotMatch(html, /href="\/makers\//);
  assert.match(html, /Not live yet/);
  assert.match(html, /Documents &amp; agreement/);
});

void test('review navigation follows actual approved Seller authority rather than active Maker participation',async()=>{
 const{activatedLiveMakerFixture}=await import('./helpers/activated-live-maker-fixture'),{completeVersionFixture}=await import('./helpers/complete-version-fixture'),{getSellerCenterAccess}=await import('../lib/db/repositories/seller-center-access'),{SellerNavigationView}=await import('../components/seller/seller-navigation');
 const maker=await activatedLiveMakerFixture('navigation-existing-review-eligibility'),registered=await completeVersionFixture();
 try{
  assert.ok(maker.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const owner=maker.sqlite.prepare('SELECT user_id FROM seller_profiles WHERE id=?').get(maker.sellerId)!.user_id;assert.ok(typeof owner==='string');
  maker.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run('navigation-maker-subject',owner);
  const makerAccess=await getSellerCenterAccess(maker.db,'navigation-maker-subject');assert.ok(makerAccess);assert.equal(maker.liveEligibility.enabled,true);assert.equal(makerAccess.status,'under_review');assert.equal(makerAccess.approvedSeller,false);
  assert.equal(maker.sqlite.prepare("SELECT COUNT(*)n FROM user_roles WHERE user_id=? AND role='seller'").get(owner)!.n,0);
  const render=(access:NonNullable<typeof makerAccess>)=>renderToStaticMarkup(createElement(SellerNavigationView,{pathname:'/seller/profile',tradingName:access.tradingName,sellerId:access.sellerId,canReplyToReviews:access.approvedSeller}));
  const makerHtml=render(makerAccess);assert.doesNotMatch(makerHtml,/href="\/seller\/reviews"/);assert.match(makerHtml,/href="\/seller\/requests"/);
  const sellerAccess=await getSellerCenterAccess(registered.db,'registered-owner');assert.ok(sellerAccess);assert.equal(sellerAccess.approvedSeller,true);assert.match(render(sellerAccess),/href="\/seller\/reviews"/);
  registered.sqlite.exec("UPDATE user_roles SET role='customer' WHERE user_id='registered-owner' AND role='seller'");const revoked=await getSellerCenterAccess(registered.db,'registered-owner');assert.ok(revoked);assert.equal(revoked.approvedSeller,false);assert.doesNotMatch(render(revoked),/href="\/seller\/reviews"/);
 }finally{maker.dispose();registered.dispose();}
});

void test('review and seller task layouts distinguish unavailable evidence, waiting and recorded outcomes', async () => {
  const { ReviewWorkspace } = await import('../components/admin/review-workspace');
  const { SellerTaskSummary } = await import('../components/seller/seller-task-summary');
  const review = renderToStaticMarkup(createElement(ReviewWorkspace, {
    record: { name: 'Fictional document', reference: 'DOC-1', type: 'Replacement permission', owner: null, version: '2', status: 'Awaiting review', backHref: '/admin/sellers?q=fictional' },
    summary: 'Hastabazaar must review the request.', current: 'Verified version 1', proposed: 'Replacement requested',
    evidence: createElement('p', { role: 'alert' }, 'Evidence unavailable. Retry the protected viewer.'),
    dependencies: 'Current evidence remains effective.', decision: createElement('button', { disabled: true }, 'View evidence before deciding'), history: 'Original verification retained.',
  }));
  assert.match(review, /Unassigned/); assert.match(review, /Verified version 1/); assert.match(review, /Replacement requested/);
  assert.match(review, /role="alert"/); assert.match(review, /<button disabled/); assert.match(review, /<details id="review-history"/);
  const unavailable = renderToStaticMarkup(createElement(SellerTaskSummary, { tasks: [], unavailable: true }));
  assert.match(unavailable, /could not be loaded/); assert.doesNotMatch(unavailable, /No recorded review tasks/);
  const task = renderToStaticMarkup(createElement(SellerTaskSummary, { tasks: [{ id: 'task-1', priority: false, nextUpdateAt: null, sourceType: 'document_change', sourceId: 'change-1', sourceRevision: '1', startedAt: 1, dueAt: 86400001, triagedAt:null,status: 'awaiting_review', sourceStatus: 'pending', title: 'Document change permission', nextActor: 'Hastabazaar', href: '/seller/registration#request-change-1' }] }));
  assert.match(task, /Next: Hastabazaar/); assert.match(task, /Reading a notification does not complete/);
});

const registered = {
  availablePaisa: 12345,
  pendingPaisa: 6789,
  grossSalesPaisa: 100000,
  commissionPaisa: -12500,
  commissionReversalPaisa: 250,
  refundPaisa: -800,
  paidPaisa: 20000,
};
// Original historical fee, before the separate 250-paisa ledger reversal above.
const marketplaceFees = { originalStandardPaisa: 12500, originalWaivedPaisa: 0, originalNetPaisa: 12500 };
const noMarketplaceFees = { originalStandardPaisa: 0, originalWaivedPaisa: 0, originalNetPaisa: 0 };

// Catch hiding actionable work below non-actionable catalog status, or treating review as a seller task.
void test('seller action overview prioritizes owned work and separates waiting review', async () => {
  const { SellerActionOverview } = await import('../components/seller/seller-action-overview');
  const html = renderToStaticMarkup(createElement(SellerActionOverview, {
    first: {
      key: 'order-1', family: 'order', title: 'Start preparing HB-1',
      detail: 'Fictional cup', severity: 'urgent', dueAt: 60_000, href: '/seller/orders/HB-1', action: 'Open order',
      readyDateHref: '/seller/order-responses/HB-1',
    },
    remaining: [
      { key: 'return-1', family: 'return', title: 'Reply to a return', detail: 'Fictional cup', severity: 'normal',
        dueAt: 120_000, href: '/seller/cases', action: 'Reply' },
      { key: 'product-1', family: 'product', title: 'Fix product listing', detail: 'Changes requested', severity: 'normal',
        dueAt: null, href: '/seller/products?status=needs_changes', action: 'Fix product' },
    ],
    waiting: [
      { key: 'product-2', family: 'review', title: 'Product review', detail: 'Submitted', severity: 'normal',
        dueAt: null, href: '/seller/products/product-2/edit', action: 'Open review' },
    ],
    unavailable: false,
  }));
  assert.ok(html.indexOf('Start preparing HB-1') < html.indexOf('Fix product listing'));
  assert.ok(html.indexOf('Reply to a return') < html.indexOf('Fix product listing'));
  assert.ok(html.indexOf('Your turn') < html.indexOf('With Hastabazaar'));
  assert.match(html, /href="\/seller\/products\?status=needs_changes"/);
  assert.match(html, /href="\/seller\/cases"/);
  assert.match(html, /href="\/seller\/order-responses\/HB-1"/);
  assert.match(html, /With Hastabazaar[\s\S]*Product review/);
  assert.doesNotMatch(html, /rejected and requiring correction/);
});

void test('empty action queue does not invent urgent work from pending or rejected products', async () => {
  const { SellerActionOverview } = await import('../components/seller/seller-action-overview');
  const html = renderToStaticMarkup(createElement(SellerActionOverview, {
    remaining: [],
    waiting: [
      { key: 'review-1', family: 'review', title: 'Product review', detail: 'Submitted', severity: 'normal',
        dueAt: null, href: '/seller/products/product-1/edit', action: 'Open review' },
      { key: 'order-1', family: 'order', title: 'Payment confirmation', detail: 'Hastabazaar is confirming cash on delivery', severity: 'normal',
        dueAt: null, href: '/seller/orders/HB-1', action: 'Open order' },
    ],
    unavailable: false,
  }));
  assert.match(html, /No tasks need you right now/);
  assert.match(html, /With Hastabazaar[\s\S]*Product review[\s\S]*Payment confirmation/);
  assert.doesNotMatch(html, /Do this first|Start preparing|Update stock/);
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
        marketplaceFees,
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
  for (const [retentionBps, fee] of [
    [900, '9%'],
    [1250, '12.5%'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ui.SellerEarningsSummary, {
        earnings: {
          registered,
          marketplaceFees: noMarketplaceFees,
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
      html.includes(fee + ' selling fee'),
    );
    assert.match(html, /340\.00/);
    assert.match(html, /270\.00/);
    assert.doesNotMatch(html, /7\.25%|id="registered-earnings-title"/);
  }
});

void test('12% offers use the approved single fee wording and pending consent without repricing earnings', async () => {
  const {SellerEarningsSummary}=await import('../components/seller/seller-earnings-summary');
  const base={registered,marketplaceFees,commission:{basisPoints:1200,version:'current-12',acceptedAt:null},commissionAccepted:false,participationRoute:'registered_seller',hasRegisteredRecords:true,managed:null};
  const registeredHtml=renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:base}));
  assert.match(registeredHtml,/12% selling fee/);assert.doesNotMatch(registeredHtml,/12% company|88% seller/);
  assert.match(registeredHtml,/acceptance.*required|review and accept/i);assert.match(registeredHtml,/125\.00/);
  const makerHtml=renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:{...base,marketplaceFees:noMarketplaceFees,participationRoute:'managed_maker',hasRegisteredRecords:false,
    managed:{retentionBps:null,offeredRetentionBps:1200,commercialModel:'managed_sale_linked_percentage_v1',summary:{calculatedPaisa:91000,earnedPaisa:91000,heldPaisa:0,eligiblePaisa:91000,paidPaisa:0,balancePaisa:91000,reservedPaisa:0,payablePaisa:91000,blockedPaisa:0,refundOffsetPaisa:0,needsReconciliation:false}}}}));
  assert.match(makerHtml,/12% selling fee/);assert.doesNotMatch(makerHtml,/12% company|88% maker/);
  assert.match(makerHtml,/review and accept/i);assert.match(makerHtml,/910\.00/);assert.doesNotMatch(makerHtml,/880\.00/);
});

void test('unavailable current terms show recorded earnings without inventing a rate', async () => {
  const {SellerEarningsSummary} = await import('../components/seller/seller-earnings-summary');
  const html = renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:{registered,marketplaceFees,commission:null,currentRateUnavailable:true,participationRoute:'registered_seller',hasRegisteredRecords:true,managed:null}}));
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
          marketplaceFees,
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
          marketplaceFees: route === 'registered_seller' ? marketplaceFees : noMarketplaceFees,
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
