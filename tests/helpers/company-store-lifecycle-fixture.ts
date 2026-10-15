import assert from 'node:assert/strict';
import { companyStoreMakerFixture } from './company-store-maker-fixture';
import { parseProductSubmission } from '../../lib/products/submission';
import { createProductSubmission, reviewProduct } from '../../lib/db/repositories/products';
import { reviewSellerApplication } from '../../lib/db/repositories/seller-applications';
import { createBusinessSettingDraft, publishBusinessSettingDraft } from '../../lib/db/repositories/business-settings';
import { getAcceptedManagedTerms } from '../../lib/managed-commerce/accepted-terms';
import { resolveRuntimeEnvironment } from '../../lib/staging/environment';
export async function readyMaker() {
  const f = await companyStoreMakerFixture();
  for (const [key, value] of [['managed_maker_program_mode', 'activation_enabled'],
    ['managed_maker_active_model', 'managed_sale_linked_percentage_v1']] as const) {
    const draft = await createBusinessSettingDraft(f.db, { key, value, actorId: 'reviewer', reason: 'Isolated company-store journey', requestId: `draft:${key}`, now: f.now });
    await publishBusinessSettingDraft(f.db, { id: draft.id, actorId: 'reviewer', expectedRevision: 1,
      reason: 'Enable isolated simulated journey', requestId: `publish:${key}`, effectiveFrom: f.now, now: f.now, simulationAllowed: true });
  }
  f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('craft','craft','Craft',1,1,1,1);
    INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('gift','gift','Gift',1,1,1,1);`);
  const productForm = new FormData();
  for (const [key, value] of Object.entries({ categoryId: 'craft', nameEn: 'Fictional cup', descriptionEn: 'A fictional handmade cup.',
    price: '1000', inventoryQuantity: '10', preparationDays: '1', occasionIds: 'gift' })) productForm.set(key, value);
  const parsed = parseProductSubmission(productForm); assert.ok(parsed.input, parsed.errors.join('\n'));
  await createProductSubmission(f.db, { productId: 'cup', sellerId: f.sellerId, actorId: f.actorId, slug: 'fictional-cup',
    input: parsed.input, workspaceMode: 'maker', now: f.now, images: Array.from({ length: 4 }, (_, index) => ({ id: `cup-photo-${index}`,
      objectKey: `private/product-media/maker/cup/photo-${index}`, originalName: `SIMULATED-${index}.png`, mimeType: 'image/png',
      sizeBytes: 100, altEn: 'Fictional cup', altNe: null, sortOrder: index })) });
  for (const action of ['start_review', 'approve'] as const) await reviewProduct(f.db, { productId: 'cup', actorId: 'reviewer', action,
    reason: 'Fictional listing reviewed independently', requestId: `review-product:${action}`, now: f.now + 1 });
  for (const action of ['start_review', 'approve_for_activation'] as const) await reviewSellerApplication(f.db, { sellerId: f.sellerId,
    actorId: 'reviewer', action, reason: 'Fictional no-PAN maker evidence reviewed', requestId: `review-maker:${action}`, now: f.now + 2 });
  const accepted = await getAcceptedManagedTerms(f.db, f.sellerId, f.now + 3); assert.ok(accepted);
  const activation = { sellerId: f.sellerId, actorId: 'reviewer', model: 'managed_sale_linked_percentage_v1' as const,
    legalSellerReference: accepted.snapshot.companyAccount.entityReference, invoiceIssuerReference: accepted.snapshot.companyAccount.entityReference,
    payoutBeneficiaryReference: 'SIM-REVIEWED-MAKER-RECEIVING', agreementVersion: accepted.agreementVersion,
    agreementLanguage: accepted.language, agreementAcceptedAt: accepted.acceptedAt, requestId: 'activate-fictional-maker', now: f.now + 3,
    environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'local_staging', nodeEnvironment: 'development', appOrigin: 'http://localhost:3018' }) };
  return { ...f, activation, accepted };
}

