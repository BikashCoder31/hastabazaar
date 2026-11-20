import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedLiveMakerFixture} from './helpers/ordered-live-maker-fixture';
import {cancelCustomerOrder} from '../lib/db/repositories/fulfillment';
import {readOwnedLiveManagedInvoices,issueLiveManagedInvoiceAdjustment} from '../lib/managed-commerce/live-billing';

void test('actual customer cancellation creates one source-bound original-series credit without rewriting invoice or allocating money',async()=>{
 const f=await orderedLiveMakerFixture();try{
 const [invoice]=await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:f.buyerId}),before=f.sqlite.prepare('SELECT * FROM managed_invoice_groups WHERE id=?').get(invoice.id)!;
 const ctx=f.ctx('actual-invoice-cancellation-credit'),input={invoiceGroupId:invoice.id,sourceKind:'cancellation' as const,sourceId:f.orderId,reason:'Record the remaining original commercial invoice credit after the actual customer cancellation.'};
 await assert.rejects(()=>issueLiveManagedInvoiceAdjustment(f.db,ctx,input),/actually be cancelled/);
 await cancelCustomerOrder(f.db,{orderNumber:f.order.orderNumber,receiptTokenHash:null,customerId:f.buyerId,note:'Cancel this actual fictional order before any company preparation or shipment.',requestId:'actual-customer-cancellation',now:Date.now()});
 const result=await issueLiveManagedInvoiceAdjustment(f.db,ctx,input);assert.deepEqual(await issueLiveManagedInvoiceAdjustment(f.db,ctx,input),result);
 const [after]=await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:f.buyerId});assert.equal(after.adjustments.length,1);
 assert.equal(after.adjustments[0].amountPaisa,invoice.snapshot.commercialValuePaisa);
 assert.equal(after.adjustments[0].kind,'credit_note');assert.doesNotMatch(String(after.adjustments[0].adjustmentNumber),/SIM/);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_invoice_groups WHERE id=?').get(invoice.id),before);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_invoice_numbers').get()!.n,2);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payouts').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,0);
 await assert.rejects(()=>issueLiveManagedInvoiceAdjustment(f.db,{...ctx,requestId:'cannot-credit-original-again'},input),/reconciliation/);
 await assert.rejects(()=>issueLiveManagedInvoiceAdjustment(f.db,{...ctx,actorId:f.ownerId,requestId:'self-invoice-credit'},input));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_invoice_numbers').get()!.n,2);
 }finally{f.dispose();}
});
