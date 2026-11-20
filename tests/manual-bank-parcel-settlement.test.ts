import assert from 'node:assert/strict';
import test from 'node:test';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
void test('a manually prepaid delivered order has no COD obligation and accrues original earnings without a fictitious remittance',async()=>{
 const f=await refundPacketFixture();try{
 const order=f.sqlite.prepare('SELECT payment_mode,payment_status FROM orders WHERE id=?').get(f.orderId)!;
 assert.equal(order.payment_mode,'prepaid');assert.equal(order.payment_status,'paid');
 const parcel=f.sqlite.prepare('SELECT p.cod_due_paisa,p.collected_paisa,p.remitted_paisa FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=?').get(f.orderId)!;
 assert.deepEqual({...parcel},{cod_due_paisa:0,collected_paisa:0,remitted_paisa:0});
 const earned=f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries e JOIN order_items i ON i.id=e.order_item_id WHERE i.order_id=? AND e.type='sale'").get(f.orderId)!;assert.equal(earned.n,1);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM company_money_receipts WHERE kind='bank_credit'").get()!.n,1);
 }finally{f.dispose();}
});
