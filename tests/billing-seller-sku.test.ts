import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductSubmission } from '../lib/products/submission';
import { validateSellerMultipartStructure } from '../lib/forms/submission';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import type { FormAnswerSnapshot } from '../lib/forms/types';

function productForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ categoryId: 'cat', nameEn: 'Notebook',
    descriptionEn: 'Handmade notebook', price: '1000', inventoryQuantity: '2', preparationDays: '1' })) form.set(key, value);
  form.append('occasionIds', 'gift');
  return form;
}

void test('seller stock code is accepted separately without replacing the platform SKU', () => {
  const form = productForm();
  form.set('sellerSku', '  MCH-NB-A5-BL  ');
  assert.doesNotThrow(() => validateSellerMultipartStructure(form, 'seller.product-submission'));
  const result = parseProductSubmission(form);
  assert.ok(result.input);
  assert.equal((result.input as unknown as {sellerSku: string}).sellerSku, 'MCH-NB-A5-BL');
  assert.equal(result.input.sku, '');
});

void test('omitted seller code preserves a legacy value while an explicit blank clears it', () => {
  const form = productForm();
  assert.equal((parseProductSubmission(form).input as unknown as {sellerSku?: string}).sellerSku, undefined);
  form.set('sellerSku', '');
  assert.equal((parseProductSubmission(form).input as unknown as {sellerSku: string | null}).sellerSku, null);
});

void test('seller stock codes reject oversized, control and markup input before persistence', () => {
  for (const value of ['X'.repeat(81), 'SKU\nNEXT', '<script>bad</script>']) {
    const form = productForm(); form.set('sellerSku', value);
    const result = parseProductSubmission(form);
    assert.equal(result.input, undefined);
    assert.match(result.errors.join(' '), /seller.*SKU/i);
  }
  const form = productForm(); form.append('sellerSku', 'one'); form.append('sellerSku', 'two');
  assert.throws(() => validateSellerMultipartStructure(form, 'seller.product-submission'), /Duplicate/);
});

void test('product submission answer storage round-trips only its validated seller stock identity', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES ('owner','owner','owner@local.hastabazaar.test','Fictional Owner','active',1,1)").run();
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,
      created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('product-v1','seller.product-submission',1,1,'published',?,'Fixture','owner',1,'owner',1,'owner',1,'publish-product')`)
      .run(JSON.stringify({formId:'seller.product-submission',fields:[]}));
    const answers = {formId:'seller.product-submission',version:1,answers:[],productIdentity:{sellerSku:'MCH-NB-01'}} as FormAnswerSnapshot;
    const insert = () => buildFormAnswerInsert(f.db,{formId:answers.formId,requestId:'save-product',versionId:'product-v1',
      subjectType:'product',subjectId:'product-one',actorId:'owner',answers,now:10});
    assert.doesNotThrow(insert);
    await f.db.batch([insert()]);
    const history = await listFormAnswersForSubject(f.db,'product','product-one');
    assert.deepEqual(history[0]?.answers,answers);
    assert.throws(() => buildFormAnswerInsert(f.db,{formId:'account.profile',requestId:'wrong-form',versionId:'product-v1',
      subjectType:'user',subjectId:'owner',actorId:'owner',answers:{...answers,formId:'account.profile'},now:11}));
    assert.throws(() => buildFormAnswerInsert(f.db,{formId:answers.formId,requestId:'wrong-subject',versionId:'product-v1',
      subjectType:'user',subjectId:'owner',actorId:'owner',answers,now:11}));
  } finally { f.dispose(); }
});
