import assert from 'node:assert/strict';
import test from 'node:test';
import { addOfferCartLine } from '../lib/cart/offer-cart';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '../lib/db/repositories/marketplace-settings';
import { prepareSellerPayout, requestSellerPayout } from '../lib/db/repositories/payouts';
import { confirmOfferStock } from '../lib/products/offer-inventory';
import { getProductPublicationReview, reviewProductPublication } from '../lib/products/publication';
import { publicCatalogueQuery } from '../lib/products/public-catalogue-query';
import { getPublicOfferSet } from '../lib/products/public-offers';
import { reviewSellerDocument } from '../lib/sellers/document-review';
import { getSellerOnboardingChecklist } from '../lib/sellers/onboarding-checklist';
import { getSellerReadiness } from '../lib/sellers/readiness';
import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import { productPublicationFixture } from './helpers/product-publication-fixture';

void test('an approved registered seller can publish and take orders with missing or rejected evidence, and still cannot get a payout', async () => {
  const f = await productPublicationFixture('', Date.now() - 60_000, true);
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    const now = Date.now();
    const sellerId = 'registered';
    const sellerUserId = 'registered-owner';
    const terms = await getRegisteredSellerTerms(f.db, now);
    const acceptance = await prepareSellerCommissionAcceptance(f.db, {
      sellerId, actorId: sellerUserId, context: terms.context, requestId: 'evidence-fixture-terms', now, mode: 'approved_seller',
    });
    await f.db.batch([
      f.db.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=?,settlement_terms_reference=?,payout_account_reference=NULL WHERE id=?')
        .bind(terms.agreementVersion, now, 'FIXTURE-SETTLEMENT', sellerId),
      ...acceptance.statements,
    ]);
    f.sqlite.exec(`INSERT INTO seller_registration_intakes(seller_id,user_id,version,answers_json,documents_json,review_ready,updated_at)
      VALUES('registered','registered-owner',1,'{}','{}',1,1);
      UPDATE payout_requests SET status='rejected' WHERE id='legacy-payout';
      INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
      VALUES('evidence-fixture-earned','registered','sale',12000,1,'Fictional eligible previous earnings',1)`);
    await seedVerifiedCheckoutContact(f.db, 'customer', '9811111111', now);
    const review = await getProductPublicationReview(f.db, 'reviewer', f.sent.caseId);
    await reviewProductPublication(f.db, {
      actorId: 'reviewer', requestId: 'evidence-fixture-publish', expectedRevision: String(review.revision), now,
    }, {
      caseId: f.sent.caseId, versionId: review.candidate.versionId, expectedCaseRevision: String(review.caseRevision),
      action: 'approve_and_publish', reason: 'Review this actual fictional product and its public details.',
      checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] },
    });
    await confirmOfferStock(f.db, {
      actorId: sellerUserId, requestId: 'evidence-fixture-stock', expectedRevision: null, now,
    }, {offerId: 'cup', available: 5, reason: 'Count this fictional product stock.', independentStockConfirmed: true});

    for (const evidence of ['missing', 'rejected'] as const) {
      if (evidence === 'rejected') {
        const documentId = 'evidence-fixture-pan';
        f.sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
          VALUES(?,'registered','pan_certificate',?,'fictional-pan.png','image/png',20,'pending',?)`)
          .run(documentId, 'private/seller-documents/registered/' + documentId, now);
        await reviewSellerDocument(f.db, {
          sellerId, documentId, actorId: 'reviewer', reason: 'This fictional PAN scan is unreadable.',
          decision: 'reject', expectedReviewId: null, commandId: 'evidence-fixture-reject', now,
        });
      }

      const readiness = await getSellerReadiness(f.db, sellerId, now);
      assert.equal(readiness.route, 'registered_seller');
      assert.equal(readiness.newOrders, true, evidence);
      assert.equal(readiness.payouts, false, evidence);
      assert.equal(readiness.bankStatus, 'missing', evidence);
      assert.ok(readiness.blockers.some(blocker => blocker.capability === 'payouts' && blocker.sourceId.startsWith('identity:')));
      assert.equal(readiness.publicProductCount, 1);
      const catalogue = await publicCatalogueQuery(f.db, now);
      const orderable = await f.db.prepare(`${catalogue.withClause} SELECT ${catalogue.purchasable()} AS ready FROM products WHERE id=?`)
        .bind(review.productId).first<{ready: number}>();
      assert.equal(Boolean(orderable?.ready), true, evidence);
      const offers = await getPublicOfferSet(f.db, review.productId, now);
      assert.ok(offers?.orderable, evidence);
      const offer = offers.offers.find(choice => choice.id === 'cup');
      assert.ok(offer?.orderable, evidence);
      const cart = 'evidence-cart-' + evidence;
      await addOfferCartLine(f.db, cart, {
        productId: review.productId, offerId: offer.id, versionId: offers.versionId, publicVersionId: offers.publicVersionId,
        pricePaisa: offer.pricePaisa, quantity: 1, requestId: 'evidence-add-' + evidence,
      }, now);
      const placed = await createCodOrder(f.db, cart, 'evidence-receipt-' + evidence, {
        customerAuthSubject: 'customer', customerEmail: 'customer@local.hastabazaar.test', customerPhone: '9811111111',
        locale: 'en-NP', termsAccepted: true, idempotencyKey: 'evidence-order-' + evidence,
        address: {recipientName: 'Fictional Buyer', phone: '9811111111', province: 'Bagmati',
          district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional Ward'},
      }, now, 'customer');
      assert.equal(f.sqlite.prepare(`SELECT i.seller_id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?`)
        .get(placed.orderNumber)?.seller_id, sellerId, evidence);

      await assert.rejects(requestSellerPayout(f.db, {
        sellerId, actorId: sellerUserId, note: '', requestId: 'evidence-fixture-request-' + evidence, now,
      }), /current identity and PAN evidence before payouts/);
      await assert.rejects(prepareSellerPayout(f.db, {
        sellerId, actorId: 'reviewer', actorRole: 'super_admin', note: 'Attempt to pay fictional previous earnings.',
        requestId: 'evidence-fixture-payout-' + evidence, now,
      }), /current identity and PAN evidence before payouts/);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM payouts WHERE seller_id=?').get(sellerId)?.n, 0);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM payout_requests WHERE seller_id=? AND status='submitted'").get(sellerId)?.n, 0);
    }

    f.sqlite.exec("UPDATE seller_profiles SET seller_agreement_version='old-unaccepted-terms' WHERE id='registered'");
    const outdated = await getSellerReadiness(f.db, sellerId, now);
    assert.equal(outdated.newOrders, false);
    assert.ok(outdated.blockers.some(blocker => blocker.capability === 'newOrders' && blocker.sourceId === 'terms'));
    const setup = await getSellerOnboardingChecklist(f.db, {
      sellerId, ownerId: sellerUserId, stage: outdated.stage, readiness: outdated, viewer: {kind: 'seller'},
    });
    assert.equal(setup.steps.find(step => step.id === 'orders')?.action?.href, '#selling-fee-terms');

    const maker = await getSellerReadiness(f.db, 'maker', now);
    assert.equal(maker.route, 'managed_maker');
    assert.equal(maker.newOrders, false);
    assert.equal(maker.payouts, false);
    for (const capability of ['newOrders', 'payouts']) {
      assert.ok(maker.blockers.some(blocker => blocker.capability === capability && blocker.sourceId.startsWith('identity:')));
    }
  } finally {
    f.dispose();
  }
});
