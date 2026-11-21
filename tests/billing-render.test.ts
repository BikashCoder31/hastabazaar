import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApprovedBillingDocument } from '../components/commerce/approved-billing-document';
import { billingPreviewSnapshot } from '../lib/staging/billing-preview';
import { buildReceiptGroups } from '../lib/documents/billing';

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

void test('future billing displays original customer waiver only on invoice and company receipt; legacy stays recorded',()=>{
  const snapshot=billingPreviewSnapshot('mixed',1000);
  const legacy=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'order_statement',documentNumber:'legacy'}));
  assert.match(legacy,/Recorded customer service fee/);
  assert.doesNotMatch(legacy,/Standard customer service fee|Full customer fee waiver/);
  snapshot.customerServiceFee={orderId:'saved-order',source:'customer_v2',standardPaisa:1000,waivedPaisa:1000,netPaisa:0,campaign:{id:'launch',revision:2,name:'Original launch'},policyVersionId:null};
  snapshot.buyerPlatformFeePaisa=0;snapshot.grandTotalPaisa-=1000;
  const groups=buildReceiptGroups(snapshot);
  for (const group of [undefined,...groups]) {
    const html=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:group?'payment_receipt':'order_statement',documentNumber:'saved',group}));
    if(!group||group.issuer.kind==='company') {
      assert.match(html,/Standard customer service fee/);assert.match(html,/Full customer fee waiver/);assert.match(html,/Original launch/);
    } else assert.doesNotMatch(html,/Original launch|Standard customer service fee|Full customer fee waiver/);
  }
  snapshot.customerServiceFee={...snapshot.customerServiceFee,waivedPaisa:0,netPaisa:1000,campaign:null};
  const cancelled=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'order_statement',documentNumber:'cancelled'}));
  assert.match(cancelled,/Original net customer service fee/);
  assert.match(cancelled,/Customer service fee after cancellations/);
  assert.doesNotMatch(cancelled,/Full customer fee waiver/);
});

void test('orders placed with the customer marketplace fee off have no fee line on invoices or receipts', () => {
  const snapshot = billingPreviewSnapshot('mixed', 1000);
  snapshot.grandTotalPaisa -= snapshot.buyerPlatformFeePaisa;
  snapshot.buyerPlatformFeePaisa = 0;
  snapshot.customerServiceFee = {
    orderId: 'saved-order', source: 'customer_v2', standardPaisa: 0, waivedPaisa: 0,
    netPaisa: 0, campaign: null, policyVersionId: 'disabled-policy',
  };
  for (const group of [undefined, ...buildReceiptGroups(snapshot)]) {
    const html = renderToStaticMarkup(createElement(ApprovedBillingDocument, {
      snapshot, kind: group ? 'payment_receipt' : 'order_statement', documentNumber: 'saved', group,
    }));
    assert.doesNotMatch(html, /customer service fee/i);
  }
});
