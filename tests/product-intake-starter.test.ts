import assert from 'node:assert/strict';
import test from 'node:test';
import { copySellerIntakeProduct, listSellerIntakeStarter } from '../lib/products/intake-starter';
import { getProductWorkspace, saveProductWorkspace, submitProductIntake } from '../lib/products/intake-workspace';
import { getProductPublicationReview, reviewProductPublication } from '../lib/products/publication';
import { productPublicationFixture } from './helpers/product-publication-fixture';

void test('the starter uses the approved package size and current catalog cover, and lists unfinished owned drafts', async () => {
  const f = await productPublicationFixture();
  try {
    const ownerCommand = (requestId: string, expectedRevision: string | null, offset: number) => ({
      actorId: f.ctx.actorId, requestId, expectedRevision, now: f.now + offset,
    });
    const prepared = await saveProductWorkspace(f.db, ownerCommand('with-package-size', String(f.attached.revision), 4), {
      ...f.input, answers: { ...f.input.answers, packageSize: '10 × 8 × 3 cm', preparationDays: '4' },
    });
    const sent = await submitProductIntake(f.db, ownerCommand('send-package-size', String(prepared.revision), 5), {
      draftId: prepared.id, versionId: prepared.versionId, intent: 'review', note: '',
      replaceVersionId: f.sent.versionId, expectedCaseId: f.sent.caseId, expectedCaseRevision: String(f.sent.revision),
    });
    const review = await getProductPublicationReview(f.db, 'reviewer', sent.caseId);
    assert.equal(review.candidate.snapshot.answers.packageSize, '10 × 8 × 3 cm');
    await reviewProductPublication(f.db, {
      actorId: 'reviewer', requestId: 'publish-cup-with-package', expectedRevision: String(review.revision), now: f.now + 6,
    }, {
      caseId: sent.caseId, versionId: review.candidate.versionId, expectedCaseRevision: String(review.caseRevision),
      action: 'approve_and_publish', reason: 'Reviewed the actual fictional cup and its product information.',
      checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] },
    });
    const draftEdit = await saveProductWorkspace(f.db, ownerCommand('local-package-edit', String(prepared.revision), 7), {
      ...f.input, answers: { ...f.input.answers, packageSize: '40 × 30 × 20 cm', preparationDays: '9' },
    });
    const work = await getProductWorkspace(f.db, f.ctx.actorId, draftEdit.id);
    assert.equal(work.answers.packageSize, '40 × 30 × 20 cm');
    assert.equal(work.publication?.current?.details.packageSize, undefined);

    const copy = await copySellerIntakeProduct(f.db, ownerCommand('copy-approved-package', null, 8), 'registered', review.productId);
    const copied = await getProductWorkspace(f.db, f.ctx.actorId, copy.id);
    assert.equal(copied.answers.packageSize, '10 × 8 × 3 cm');
    assert.equal(copied.answers.preparationDays, '4');
    assert.equal(copied.packedWeightGrams, undefined);
    const named = await saveProductWorkspace(f.db, ownerCommand('save-unfinished-named-product', null, 9), {
      draftId: null, sellerId: 'registered', categoryId: null, answers: { nameEn: 'Unfinished sculpture' },
      offers: { axes: [], offers: [] }, mediaIds: [], privateReview: {},
    });

    assert.deepEqual(await listSellerIntakeStarter(f.db, f.ctx.actorId, 'registered'), {
      recentProducts: [{ id: review.productId, name: 'Fictional new cup', categoryName: 'Fictional Cups', pricePaisa: 80000, coverMediaId: 'photo' }],
      unfinishedDrafts: [
        { id: named.id, title: 'Unfinished sculpture', updatedAt: f.now + 9 },
        { id: copy.id, title: 'Untitled draft', updatedAt: f.now + 8 },
      ],
    });
    assert.deepEqual(await listSellerIntakeStarter(f.db, 'maker-user', 'registered'), { recentProducts: [], unfinishedDrafts: [] });
  } finally { f.dispose(); }
});
