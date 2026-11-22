import './helpers/written-guidance-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { confirmOfferStock, pauseOfferStock } from '../lib/products/offer-inventory';
import { getProductPublicationReview, reviewProductPublication } from '../lib/products/publication';
import { getSellerOnboardingChecklist, type SellerOnboardingChecklistModel } from '../lib/sellers/onboarding-checklist';
import { getSellerReadiness } from '../lib/sellers/readiness';
import { readyCheckoutSeller } from './helpers/checkout-contact';
import { productPublicationFixture } from './helpers/product-publication-fixture';

const setupModel: SellerOnboardingChecklistModel = {
  audience: 'seller',
  steps: [
    { id: 'registration', title: 'Submit seller registration', status: 'Done', detail: 'Registration sent.' },
    { id: 'application', title: 'Approve the seller application', status: 'Done', detail: 'Application approved.' },
    { id: 'send', title: 'Send your first product for review', status: 'Pending', detail: 'Resume your saved draft.',
      action: { actor: 'seller', href: '/seller/products/new?draftId=fixture', label: 'Continue saved draft' } },
    { id: 'approve', title: 'Approve the first product', status: 'Pending', detail: 'Review starts after submission.' },
    { id: 'publish', title: 'Publish the first product', status: 'Pending', detail: 'A product must be approved before publication.' },
    { id: 'orders', title: 'Start taking orders', status: 'Pending', detail: 'Taking orders starts after publishing with stock.' },
  ],
};

void test('getting started picks the saved draft ahead of bank setup and keeps dependent steps later', async () => {
  const { SellerGettingStarted } = await import('../components/seller/seller-getting-started');
  const html = renderToStaticMarkup(createElement(SellerGettingStarted, {
    model: setupModel, bankStatus: 'missing', tradingName: 'Fixture shop', date: 'Sunday, November 22',
    agreement: 'Existing agreement controls',
  }));
  assert.match(html, /Welcome, Fixture shop/);
  assert.match(html, /2 of 8 steps done/);
  assert.match(html, /Do this first[\s\S]*Resume your saved draft\.[\s\S]*Continue saved draft/);
  assert.match(html, /href="\/seller\/products\/new\?draftId=fixture#product-help"[^>]*>Get help with a product/);
  assert.match(html, /Review starts after submission\.[\s\S]*?Later/);
  assert.match(html, /Existing agreement controls/);
});

void test('getting started preserves staff review, hold and unavailable states and their existing links', async () => {
  const { SellerGettingStarted } = await import('../components/seller/seller-getting-started');
  const model: SellerOnboardingChecklistModel = {
    ...setupModel,
    steps: setupModel.steps.map(step => {
      if (step.id === 'send') return { ...step, status: 'Done', action: undefined };
      if (step.id === 'approve') return { ...step, action: { actor: 'reviewer', href: '/seller/products/intakes/example', label: 'Follow product review' } };
      if (step.id === 'publish') return { ...step, status: 'On hold', action: { actor: 'reviewer', href: '/seller/products', label: 'View your products' } };
      if (step.id === 'orders') return { ...step, status: 'Unavailable', action: { actor: 'admin', href: '#seller-readiness', label: 'View live order checks' } };
      return step;
    }),
  };
  const html = renderToStaticMarkup(createElement(SellerGettingStarted, {
    model, bankStatus: 'pending', tradingName: 'Fixture shop', date: 'Sunday, November 22',
    agreement: null,
  }));
  assert.match(html, /4 of 8 steps done/);
  assert.match(html, /With Hastabazaar[\s\S]*Nothing needs you right now/);
  assert.match(html, /href="\/seller\/products\/intakes\/example"[^>]*>Follow product review/);
  assert.match(html, /On hold/);
  assert.match(html, /href="\/seller\/products"[^>]*>View your products/);
  assert.match(html, /Couldn’t check/);
  assert.match(html, /href="#seller-readiness"[^>]*>View live order checks/);
});

void test('the checklist follows review, separate publication and available stock for the same seller', async () => {
  const f = await productPublicationFixture('', undefined, true);
  try {
    const read = async (now: number, staff = false) => {
      const readiness = await getSellerReadiness(f.db, 'registered', now);
      const { steps } = await getSellerOnboardingChecklist(f.db, {
        sellerId: 'registered', ownerId: 'registered-owner', stage: readiness.stage, readiness,
        viewer: staff ? { kind: 'admin', actorId: 'reviewer' } : { kind: 'seller' },
      });
      return {
        next: steps.find(step => step.action),
        status: (id: (typeof steps)[number]['id']) => steps.find(step => step.id === id)?.status,
      };
    };
    const now = f.now + 4;
    const sent = await read(now, true);
    assert.equal(sent.status('send'), 'Done');
    assert.equal(sent.next?.id, 'approve');
    assert.equal(sent.next.action?.actor, 'reviewer');
    assert.match(sent.next.action?.href ?? '', new RegExp('^/admin/products/intakes/' + f.sent.caseId));
    assert.equal((await read(now)).next?.action?.href, '/seller/products/intakes/' + f.sent.caseId);

    const decide = async (action: 'approve_only' | 'publish_approved', at: number) => {
      const view = await getProductPublicationReview(f.db, 'reviewer', f.sent.caseId);
      await reviewProductPublication(f.db, { actorId: 'reviewer', requestId: action, expectedRevision: String(view.revision), now: at }, {
        caseId: f.sent.caseId, versionId: view.candidate.versionId, expectedCaseRevision: String(view.caseRevision),
        action, reason: 'Review and publish the exact fictional product.', checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] },
      });
    };
    await decide('approve_only', now);
    const approved = await read(now, true);
    assert.equal(approved.status('approve'), 'Done');
    assert.equal(approved.status('publish'), 'Pending');
    assert.equal(approved.next?.action?.actor, 'publisher');
    assert.match(approved.next?.action?.href ?? '', new RegExp('^/admin/products/publications/' + f.sent.caseId));

    await decide('publish_approved', now + 1);
    const published = await read(now + 1);
    assert.equal(published.status('publish'), 'Done');
    assert.equal(published.status('orders'), 'Pending', 'Publication alone does not clear seller checks');

    await readyCheckoutSeller({ database: f.db, sqlite: f.sqlite }, 'registered', 'registered-owner', 'reviewer', now + 2);
    const noStock = await read(now + 2);
    assert.equal(noStock.status('orders'), 'Pending', 'A ready seller without available stock cannot take an order yet');
    const stock = await confirmOfferStock(f.db, { ...f.ctx, requestId: 'checklist-count', now: now + 3 }, {
      offerId: 'cup', available: 3, independentStockConfirmed: true, reason: 'Counted three fictional products.'
    });
    const available = await read(now + 3);
    assert.equal(available.status('orders'), 'Done');
    assert.equal(available.next, undefined);

    await pauseOfferStock(f.db, { ...f.ctx, requestId: 'checklist-pause', expectedRevision: String(stock.revision), now: now + 4 }, {
      offerId: 'cup', paused: true, reason: 'Temporarily pause sales of the fictional product.',
    });
    const paused = await read(now + 4);
    assert.equal(paused.status('publish'), 'Done');
    assert.equal(paused.status('orders'), 'Pending');
    assert.equal(paused.next?.action?.actor, 'seller');
  } finally { f.dispose(); }
});
