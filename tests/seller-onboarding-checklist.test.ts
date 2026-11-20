import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmOfferStock, pauseOfferStock } from '../lib/products/offer-inventory';
import { getProductPublicationReview, reviewProductPublication } from '../lib/products/publication';
import { getSellerOnboardingChecklist } from '../lib/sellers/onboarding-checklist';
import { getSellerReadiness } from '../lib/sellers/readiness';
import { readyCheckoutSeller } from './helpers/checkout-contact';
import { productPublicationFixture } from './helpers/product-publication-fixture';

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
