import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { createProductSubmission, getSellerProductForRevision, reviseAndResubmitProduct, reviewProduct } from '../lib/db/repositories/products';
import { parseProductSubmission } from '../lib/products/submission';

async function productFixture() {
  const f = await companyStoreMakerFixture();
  f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('maker-category','maker-craft','Craft',1,1,1,1);
    INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('maker-occasion','maker-gift','Gift',1,1,1,1);`);
  const form = new FormData();
  for (const [key, value] of Object.entries({ categoryId: 'maker-category', nameEn: 'Fictional handmade cup',
    descriptionEn: 'A fictional cup for isolated testing.', price: '1000', inventoryQuantity: '2', preparationDays: '1',
    occasionIds: 'maker-occasion' })) form.set(key, value);
  const parsed = parseProductSubmission(form);
  assert.ok(parsed.input, parsed.errors.join('\n'));
  const images = Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index}`, objectKey: `private/product-media/maker/maker-product/photo-${index}`,
    originalName: `SIMULATED-${index}.png`, mimeType: 'image/png', sizeBytes: 100, altEn: 'Fictional cup', altNe: null, sortOrder: index }));
  const options = { productId: 'maker-product', sellerId: f.sellerId, actorId: f.actorId, slug: 'fictional-maker-cup',
    input: parsed.input, images, intent: 'draft' as const, workspaceMode: 'maker' as const, now: f.now };
  return { ...f, options };
}

test('maker product writes recheck owner stage and restrictions at commit', async () => {
  const f = await productFixture();
  try {
    await assert.rejects(createProductSubmission(f.db, { ...f.options, actorId: 'reviewer' }), /maker|owner|authority/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM products').get()?.n, 0);
    f.setBeforeBatch(() => { f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='suspended' WHERE seller_id=?").run(f.sellerId); });
    await assert.rejects(createProductSubmission(f.db, f.options));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM products').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE subject_type='product'").get()?.n, 0);
  } finally { f.dispose(); }
});

test('maker can submit draft and resubmit requested product corrections', async () => {
  const f = await productFixture();
  try {
    await createProductSubmission(f.db, f.options);
    const draft = await getSellerProductForRevision(f.db, f.sellerId, f.options.productId);
    assert.equal(draft?.status, 'draft');
    const revision = { ...f.options, images: [], previousInventory: 2, expectedStatus: 'draft' as const, now: f.now + 1 };
    await reviseAndResubmitProduct(f.db, revision);
    assert.equal((await getSellerProductForRevision(f.db, f.sellerId, f.options.productId))?.status, 'submitted');
    await reviewProduct(f.db, { productId: f.options.productId, actorId: 'reviewer', action: 'start_review',
      requestId: 'fictional-review-start', reason: 'Begin fictional listing review.', now: f.now + 2 });
    await reviewProduct(f.db, { productId: f.options.productId, actorId: 'reviewer', action: 'request_changes',
      requestId: 'fictional-review-corrections', reason: 'Please clarify the care instructions.', now: f.now + 2 });
    assert.equal((await getSellerProductForRevision(f.db, f.sellerId, f.options.productId))?.status, 'needs_changes');
    await reviseAndResubmitProduct(f.db, { ...revision, expectedStatus: 'needs_changes', now: f.now + 3 });
    assert.equal((await getSellerProductForRevision(f.db, f.sellerId, f.options.productId))?.status, 'submitted');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id=? AND role='seller'").get(f.actorId)?.n, 0);
    assert.equal(await getSellerProductForRevision(f.db, 'another-maker', f.options.productId), null);
  } finally { f.dispose(); }
});

test('maker revision rejects a new restriction or inactive catalogue without partial changes', async () => {
  const f = await productFixture();
  try {
    await createProductSubmission(f.db, f.options);
    const before = f.sqlite.prepare('SELECT * FROM products').all();
    const revision = { ...f.options, images: [], previousInventory: 2, expectedStatus: 'draft' as const, now: f.now + 1 };
    f.setBeforeBatch(() => { f.sqlite.prepare("UPDATE categories SET is_active=0 WHERE id='maker-category'").run(); });
    await assert.rejects(reviseAndResubmitProduct(f.db, revision));
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM products').all(), before);
    f.sqlite.prepare("UPDATE categories SET is_active=1 WHERE id='maker-category'").run();
    f.setBeforeBatch(() => { f.sqlite.prepare(`INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,
      private_reason,applied_by,applied_at,updated_at) VALUES(?,'disabled','admin_review','test','Fictional test hold','reviewer',1,1)`).run(f.sellerId); });
    await assert.rejects(reviseAndResubmitProduct(f.db, revision));
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM products').all(), before);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='product.resubmitted'").get()?.n, 0);
  } finally { f.dispose(); }
});
