import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedForm } from '../lib/http/bounded-body';
import { validateSellerMultipartStructure } from '../lib/forms/submission';
import { productImageFiles, productPhotoCountError, validateProductImage } from '../lib/products/submission';

function browserProductForm() {
  const form = new FormData();
  form.set('requestId', 'fictional-empty-file-regression');
  form.set('formVersion', '1');
  for (let index = 1; index <= 4; index++) {
    form.set(`image${index}`, new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, index])], `angle-${index}.png`, { type: 'image/png' }));
  }
  // Native HTML file inputs contribute this sentinel when no file is selected.
  for (const key of ['image5', 'video']) form.set(key, new File([], '', { type: 'application/octet-stream' }));
  return form;
}
async function roundTrip(form: FormData) {
  return readBoundedForm(new Request('http://localhost/seller/products', { method: 'POST', body: form }), 1024 * 1024);
}

void test('actual bounded multipart parsing accepts unselected file controls and preserves four selected photos', async () => {
  const form = await roundTrip(browserProductForm());
  assert.equal(form.get('video'), '', 'native multipart parser represents filename="" as empty text');
  assert.equal(form.get('image5'), '');
  assert.doesNotThrow(() => validateSellerMultipartStructure(form, 'seller.product-submission'));
  const images = productImageFiles(form);
  assert.equal(images.length, 4);
  assert.equal(productPhotoCountError(images.length), null);
  assert.ok(images.every(image => validateProductImage(image) === null));
});

void test('empty file sentinels do not satisfy required photo count or make selected empty files valid', async () => {
  const form = browserProductForm();
  form.set('image4', new File([], '', { type: 'application/octet-stream' }));
  const parsed = await roundTrip(form);
  assert.doesNotThrow(() => validateSellerMultipartStructure(parsed, 'seller.product-submission'));
  assert.equal(productImageFiles(parsed).length, 3);
  assert.match(productPhotoCountError(productImageFiles(parsed).length)!, /4|four/i);
  assert.match(validateProductImage(new File([], 'selected-empty.png', { type: 'image/png' }))!, /empty/i);
});

void test('known empty file sentinels retain unknown, duplicate, scalar-file and nonempty fake-file rejection', async () => {
  for (const mutate of [
    (form: FormData) => form.set('video', 'fake-file'),
    (form: FormData) => form.set('unexpected-file', ''),
    (form: FormData) => form.append('video', ''),
    (form: FormData) => form.set('price', new File(['100'], 'price.txt', { type: 'text/plain' })),
    (form: FormData) => form.set('replaceImage:known-photo', 'fake-file'),
  ]) {
    const form = browserProductForm(); mutate(form);
    const parsed = await roundTrip(form);
    assert.throws(() => validateSellerMultipartStructure(parsed, 'seller.product-submission'), /Unknown|Duplicate|Unsupported/);
  }
});
