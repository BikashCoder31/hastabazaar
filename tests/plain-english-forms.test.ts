import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as catalog from '../lib/forms/catalog-presentation';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { fieldDisplay } from '../components/forms/configured-fields';
import { FormCatalogPreview } from '../components/admin/form-catalog-preview';
import { isAutomaticFormField } from '../lib/forms/plain-language';

void test('catalog search combines purpose, audience, category and publishing state', () => {
  assert.ok('filterFormCatalog' in catalog, 'Catalog needs a combined search and filter');
  const filter = catalog.filterFormCatalog as (rows: unknown[], filters: object) => { form: { id: string } }[];
  const rows = [
    { form: FORM_REGISTRY['seller.application'], presentation: catalog.formCatalogPresentation(FORM_REGISTRY['seller.application']), publishedVersion: 1, draftVersion: 2 },
    { form: FORM_REGISTRY['rider.application'], presentation: catalog.formCatalogPresentation(FORM_REGISTRY['rider.application']), publishedVersion: 3, draftVersion: 2 },
    { form: FORM_REGISTRY['seller.inventory'], presentation: catalog.formCatalogPresentation(FORM_REGISTRY['seller.inventory']), publishedVersion: 0, draftVersion: 1 },
  ];
  assert.deepEqual(filter(rows, { query: '  SELL  ', audience: 'seller', category: 'Applications & business profiles', status: 'draft' }).map(row => row.form.id), ['seller.application']);
  assert.deepEqual(filter(rows, { status: 'draft' }).map(row => row.form.id), ['seller.application', 'seller.inventory']);
  assert.deepEqual(filter(rows, { status: 'published' }).map(row => row.form.id), ['seller.application', 'rider.application']);
  assert.deepEqual(filter(rows, { status: 'unpublished' }).map(row => row.form.id), ['seller.inventory']);
  assert.deepEqual(filter(rows, { query: 'stock' }).map(row => row.form.id), ['seller.inventory']);
  assert.deepEqual(filter(rows, { query: 'no matching form' }), []);
});

void test('live built-in fields get helpful defaults without replacing published custom wording', () => {
  const config = { formId: 'seller.application', version: 1, publishedAt: 1, fields: [] };
  const display = fieldDisplay(config, 'tradingName');
  assert.equal(display?.label, 'Shop or brand name');
  assert.ok(display?.helpText?.includes('customers'));
  assert.equal(display?.required, true);
  assert.equal(fieldDisplay(null, 'tradingName'), null);
  const custom = { ...config, fields: [{ id: 'tradingName', key: 'tradingName', type: 'short_text' as const, label: 'Your shop name', helpText: 'Use your chosen name.', required: true, order: 0, status: 'active' as const }] };
  assert.equal(fieldDisplay(custom, 'tradingName')?.label, 'Your shop name');
  assert.equal(fieldDisplay(custom, 'tradingName')?.helpText, 'Use your chosen name.');
});

void test('preview shows questions with guidance and keeps automatic metadata out of the questions', () => {
  const form = FORM_REGISTRY['seller.application'];
  const html = renderToStaticMarkup(React.createElement(FormCatalogPreview, { form, config: { formId: form.id, fields: [], version: 1, publishedAt: 1 }, mode: 'phone' }));
  assert.doesNotMatch(html, /id="[^"]*preview-base-(requestId|formVersion|customAnswers|sellerAgreementContext)"/);
  assert.doesNotMatch(html, /<input[^>]*id="[^"]*preview-base-legalName"/);
  assert.match(html, /Other questions in the live form/);
  assert.match(html, /Shop or brand name/);
  assert.match(html, /Before you start/);
  assert.doesNotMatch(html, /<input[^>]*id="[^"]*preview-base-businessDescription"/);
  assert.match(html, /<textarea[^>]*id="[^"]*preview-base-businessDescription"/);
});

void test('automatic details distinguish user-selected records and optional product text from internal identity', () => {
  assert.equal(isAutomaticFormField('nameNe', 'seller.product-submission'), false);
  assert.equal(isAutomaticFormField('descriptionNe', 'seller.product-submission'), false);
  assert.equal(isAutomaticFormField('productId', 'seller.managed-supply-proposal'), false);
  assert.equal(isAutomaticFormField('orderId', 'seller.shipping-request'), false);
  assert.equal(isAutomaticFormField('invoiceId', 'staff.invoice-adjustment'), false);
  assert.equal(isAutomaticFormField('orderItemId', 'commerce.complaint'), false);
  assert.equal(isAutomaticFormField('categoryId', 'seller.product-submission'), false);
  assert.equal(isAutomaticFormField('customerId', 'account.privacy-request'), true);
  assert.equal(isAutomaticFormField('userId', 'account.address'), true);
  assert.equal(isAutomaticFormField('sellerId', 'staff.payout-1'), true);
});
void test('preview and live display agree on legacy built-in labels saved as internal keys', () => {
  const form = FORM_REGISTRY['seller.application'];
  const config = { formId: form.id, version: 1, publishedAt: 1, fields: [{ id: 'tradingname', key: 'tradingname', label: 'tradingname', type: 'short_text' as const, required: true, status: 'active' as const, order: 0 }] };
  const html = renderToStaticMarkup(React.createElement(FormCatalogPreview, { form, config, mode: 'phone' }));
  assert.match(html, /Shop or brand name/);
  assert.doesNotMatch(html, />tradingname[ <]/);
  assert.equal(fieldDisplay(config, 'tradingName')?.label, 'Shop or brand name');
});
