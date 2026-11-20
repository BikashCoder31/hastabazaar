import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LiveManagedInvoiceDocumentView} from '../components/commerce/live-managed-invoice-document';
import {orderedLiveMakerFixture} from './helpers/ordered-live-maker-fixture';
import {createCodOrder,getOrderReceipt} from '../lib/db/repositories/orders';
import {readOwnedLiveManagedInvoices} from '../lib/managed-commerce/live-billing';
import {getLiveManagedInvoiceDocument} from '../lib/db/repositories/live-managed-documents';
import {readOrderItemPricingSnapshots} from '../lib/db/repositories/order-item-pricing-snapshots';
import {withReceiptGroups} from '../lib/documents/billing';
import {withLiveInvoiceReferences,receiptNumberStatements} from '../lib/db/repositories/billing-documents';
import {VARIANT_PRICING_RULE_VERSION} from '../lib/products/variant-pricing';

void test('actual offer checkout retains live proof and one original company invoice without simulation facts',async()=>{
 const f=await orderedLiveMakerFixture();try{
  const snapshot=f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots WHERE order_item_id=?').get(f.orderItemId)!;
  assert.equal(snapshot.record_kind,'live');assert.equal(snapshot.simulation_label,null);
  assert.equal(snapshot.live_activation_decision_id,f.activation.id);
  assert.equal(snapshot.live_clearance_id,f.clearance.clearanceId);
  assert.equal(snapshot.platform_retention_bps,1375);
  const invoices=await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:f.buyerId});
  assert.equal(invoices.length,1);assert.equal(invoices[0].snapshot.recordKind,'live');assert.equal(invoices[0].snapshot.taxDocument,false);
  assert.doesNotMatch(JSON.stringify(invoices),/SIMULATED|SIM-INV|governmentId|identityDocument/);
  assert.equal(invoices[0].snapshot.items[0].orderItemId,f.orderItemId);
  assert.equal(invoices[0].snapshot.totalPaisa,f.order.grandTotalPaisa);
  assert.deepEqual(await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:'unrelated-customer'}),[]);
  const receipt=await getOrderReceipt(f.db,f.order.orderNumber,null,f.buyerId);
  const documents=receipt!.documents.filter(document=>document.kind==='commercial_invoice');
  assert.equal(documents.length,1,'The actual invoice must remain visible beside the operational order statement.');
  assert.equal(documents[0].id,invoices[0].id);assert.equal(documents[0].documentNumber,invoices[0].invoiceNumber);
  const request={orderNumber:f.order.orderNumber,invoiceId:invoices[0].id,receiptTokenHash:null,customerId:f.buyerId};
  const document=await getLiveManagedInvoiceDocument(f.db,request);assert.ok(document);
  assert.equal(document.group.canonicalInvoiceId,invoices[0].id);assert.equal(document.group.billNumber,invoices[0].invoiceNumber);
  assert.equal(await getLiveManagedInvoiceDocument(f.db,{...request,customerId:'foreign-customer'}),null);
  assert.ok(await getLiveManagedInvoiceDocument(f.db,{...request,customerId:null,receiptTokenHash:'actual-live-receipt-token'}));
  assert.equal(await getLiveManagedInvoiceDocument(f.db,{...request,customerId:null,receiptTokenHash:'foreign-receipt-token'}),null);
  const html=renderToStaticMarkup(createElement(LiveManagedInvoiceDocumentView,{document}));
  assert.match(html,/COMMERCIAL INVOICE/);assert.ok(html.includes(invoices[0].invoiceNumber));assert.match(html,/not a tax invoice/);
  assert.doesNotMatch(html,/SIMULATED|SIM-INV|NaN|live-financial-scope|governmentId|identityDocument/);
  const linked=await withLiveInvoiceReferences(f.db,f.orderId,withReceiptGroups(document.snapshot));
  assert.equal(linked.billing!.receiptGroups![0].canonicalInvoiceId,document.id);
  assert.deepEqual(await receiptNumberStatements(f.db,{snapshot:{...linked,billing:{...linked.billing!,receiptIssuance:'simulation'}},requestId:'must-not-reserve-second-invoice',now:Date.now()}),[],'A receipt cannot reserve another number for an existing actual invoice.');
  assert.deepEqual(await createCodOrder(f.db,f.cartToken,'actual-live-receipt-token',f.checkoutInput,Date.now(),f.buyerId),f.order);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups WHERE order_id=?').get(f.orderId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM offer_stock_reservations r JOIN order_items i ON i.offer_reservation_id=r.id WHERE i.order_id=?').get(f.orderId)!.n,1);
 }finally{f.dispose();}
});

void test('opt-in managed checkout invoices the adjusted buyer price and preserves contracted retention on replay', async () => {
 const f = await orderedLiveMakerFixture({variantPricing: true});
 try {
  const quote = f.checkoutInput.reviewedQuote;
  assert.ok(quote);
  assert.equal(quote.lines[0].pricePaisa, 88000);
  assert.equal(f.order.grandTotalPaisa, quote.payablePaisa);

  const receipt = await getOrderReceipt(f.db, f.order.orderNumber, null, f.buyerId);
  assert.ok(receipt);
  assert.equal(receipt.itemSubtotalPaisa, 88000);
  assert.equal(receipt.items[0].unitPricePaisa, 88000);
  assert.equal(receipt.items[0].lineTotalPaisa, 88000);

  const invoices = await readOwnedLiveManagedInvoices(f.db, {orderId: f.orderId, customerId: f.buyerId});
  assert.equal(invoices.length, 1);
  const [invoice] = invoices;
  assert.equal(invoice.snapshot.items[0].orderItemId, f.orderItemId);
  assert.equal(invoice.snapshot.items[0].unitPricePaisa, 88000);
  assert.equal(invoice.snapshot.goodsPaisa, 88000);
  assert.equal(invoice.snapshot.totalPaisa, f.order.grandTotalPaisa);

  const managed = f.sqlite.prepare(`SELECT platform_retention_bps AS bps, eligible_base_paisa AS basePaisa,
    platform_retained_paisa AS amountPaisa, maker_entitlement_paisa AS entitlementPaisa,
    terms_setting_version_id AS settingVersionId, agreement_version AS agreementVersion
    FROM managed_commercial_snapshots WHERE order_item_id=?`).get(f.orderItemId);
  assert.ok(managed);
  assert.equal(managed.bps, 1375);
  assert.equal(managed.basePaisa, 80000);
  assert.equal(managed.amountPaisa, 11000);
  assert.equal(managed.entitlementPaisa, 69000);

  const snapshots = await readOrderItemPricingSnapshots(f.db, f.orderId);
  assert.equal(snapshots.length, 1);
  const [{orderItemId, snapshot}] = snapshots;
  assert.equal(orderItemId, f.orderItemId);
  assert.equal(snapshot.ruleVersion, VARIANT_PRICING_RULE_VERSION);
  assert.equal(snapshot.offerId, f.offerId);
  assert.equal(snapshot.offerVersionId, quote.lines[0].offerVersionId);
  assert.equal(snapshot.publicVersionId, quote.lines[0].publicVersionId);
  assert.equal(snapshot.sellerBasePaisa, 80000);
  assert.equal(snapshot.additionPaisa, 8000);
  assert.equal(snapshot.customerSubtotalPaisa, 88000);
  assert.deepEqual(snapshot.commission, {
   kind: 'managed_sale_linked', ruleVersion: 'managed-managed_sale_linked_percentage_v1',
   settingVersionId: managed.settingVersionId, agreementVersion: managed.agreementVersion,
   acceptanceId: f.liveProof.acceptedManagedDetailId, bps: 1375, basePaisa: 80000, amountPaisa: 11000,
  });
  assert.throws(() => f.sqlite.prepare(`UPDATE order_item_pricing_snapshots
    SET snapshot_json=json_set(snapshot_json,'$.customerUnitPaisa',88001) WHERE order_item_id=?`).run(f.orderItemId),
  /order_item_pricing_immutable/);

  assert.deepEqual(await createCodOrder(f.db, f.cartToken, 'actual-live-receipt-token', f.checkoutInput, Date.now(), f.buyerId), f.order);
  assert.deepEqual(await readOwnedLiveManagedInvoices(f.db, {orderId: f.orderId, customerId: f.buyerId}), invoices);
  assert.deepEqual(await readOrderItemPricingSnapshots(f.db, f.orderId), snapshots);
 } finally {
  f.dispose();
 }
});
