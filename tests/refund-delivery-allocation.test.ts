import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
void test('new checkout retains a complete immutable fair original delivery allocation for partial and no-fault refunds',async()=>{const f=await manualOrderFixture({secondOffer:true});try{
 const rows=f.sqlite.prepare('SELECT a.order_item_id,a.amount_paisa,a.original_quantity,i.line_total_paisa FROM order_delivery_allocations a JOIN order_items i ON i.id=a.order_item_id WHERE a.order_id=? ORDER BY i.line_total_paisa').all(f.orderId);
 assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+Number(r.amount_paisa),0),15000);assert.deepEqual(rows.map(r=>Number(r.amount_paisa)),[6667,8333]);
 assert.throws(()=>f.sqlite.prepare('UPDATE order_delivery_allocations SET amount_paisa=0 WHERE order_id=?').run(f.orderId),/immutable/i);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM order_delivery_allocations WHERE order_id=?').run(f.orderId),/immutable/i);
 }finally{f.dispose();}});

void test('an eligible no-fault refund automatically retains its attributable original delivery rather than defaulting to zero',async()=>{
 const {refundFundingFixture}=await import('./helpers/refund-funding-fixture');const f=await refundFundingFixture(0,{freeDelivery:false,reason:'change_of_mind'});try{
 const refund=f.sqlite.prepare('SELECT item_amount_paisa,delivery_amount_paisa,amount_paisa FROM refunds WHERE id=?').get(f.refundId)!;
 assert.equal(refund.delivery_amount_paisa,15000);assert.equal(refund.amount_paisa,95000);
 }finally{f.dispose();}
});

void test('no-fault original delivery remains company cost when original merchandise is seller-funded',async()=>{
 const {refundPacketFixture}=await import('./helpers/refund-funding-fixture');const f=await refundPacketFixture({freeDelivery:false,reason:'change_of_mind',responsibility:'seller'});try{
 const allocations=f.sqlite.prepare('SELECT component,party,amount_paisa FROM refund_cost_allocations WHERE refund_id=? ORDER BY component').all(f.refundId);
 assert.deepEqual(allocations.map(row=>({...row})),[{component:'merchandise',party:'seller',amount_paisa:80000},{component:'original_delivery',party:'platform',amount_paisa:15000}]);
 const {m}=f,packet=await m.prepareRefundPacket(f.db,f.ctx('no-fault-packet','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:f.fundingId,reason:'Prepare original cash and wallet refund with separate company delivery cost.'});
 await m.approveRefundPacket(f.db,f.ctx('no-fault-funds','0'),{packetId:packet.id,reason:'Approve actual free company funds for the original refund.'});await m.startRefundPacket(f.db,f.ctx('no-fault-start','1'),{packetId:packet.id,reason:'Record the original manual refund instruction for exact reconciliation.'});
 await m.recordRefundPacketOutcome(f.db,f.ctx('no-fault-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:75000,bankAt:Date.now(),transactionIdentity:'FICTIONAL-NO-FAULT-REFUND',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-ACTUAL-NO-FAULT-TRANSFER',reason:'Reconcile the actual original refund without assigning company delivery to the seller.'});
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE refund_id=? AND type='refund'").get(f.refundId)!.n,-80000);
 }finally{f.dispose();}
});
