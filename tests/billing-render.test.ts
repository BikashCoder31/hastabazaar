import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApprovedBillingDocument } from '../components/commerce/approved-billing-document';
import { billingPreviewSnapshot } from '../lib/staging/billing-preview';

void test('one approved invoice renders every shop, dual SKU columns, compact barcode and no receipt stamp',()=>{
  const snapshot=billingPreviewSnapshot('mixed',Date.parse('2026-10-21T10:34:00Z'));
  const html=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'order_statement',documentNumber:'confirmation-01'}));
  for(const expected of ['ORDER INVOICE','Order confirmation no.','Platform SKU','Seller SKU','S.N.','Supplied by Mithila Craft House',
    'Sold by Bamboo Home Nepal','Supplier ref:','Seller ref:','billing@hastabazaar.com','www.hastabazaar.com','Payment mode:']) assert.ok(html.includes(expected),expected);
  for(const forbidden of ['Order barcode','Prepared by','Amount received','Balance due','Fiscal year','Date (AD)','Date (BS)','VAT','Company registration']) assert.ok(!html.includes(forbidden),forbidden);
  assert.match(html,/data-order-barcode/);assert.doesNotMatch(html,/company-stamp/);
});

void test('receipt has the recorded issuer and company stamp only for an eligible company group',()=>{
  const snapshot=billingPreviewSnapshot('mixed',1000);
  const company=snapshot.billing!.receiptGroups!.find(group=>group.issuer.kind==='company')!;
  const seller=snapshot.billing!.receiptGroups!.find(group=>group.issuer.kind==='registered')!;
  const stamp='/private/company-stamp.png';
  const html=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'payment_receipt',documentNumber:'receipt',group:company,stampSource:stamp}));
  assert.ok(html.includes('RECEIPT'));assert.ok(html.includes(stamp));assert.doesNotMatch(html,/data-order-barcode/);
  const independent=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'payment_receipt',documentNumber:'receipt',group:seller,stampSource:stamp}));
  assert.ok(independent.includes('Bamboo Home Enterprises'));assert.ok(!independent.includes(stamp));
});
