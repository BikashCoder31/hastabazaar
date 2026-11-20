import assert from 'node:assert/strict';
import {commerceOrderFixture} from './commerce-order-fixture';
import {cancellationPreview} from '../../lib/cancellation/repository';

/** Native paid/custody facts, captured read-only for response-schema UI tests. */
export async function paidCancellationPreview(){
 const f=await commerceOrderFixture();try{
  await f.deliver();
  const due=Number(f.sqlite.prepare('SELECT p.cod_due_paisa AS amount FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=?').get(f.orderId)!.amount);
  await f.operate('collect',{amountPaisa:due,reference:'FICTIONAL-ACTUAL-CUSTOMER-COLLECTION'});
  await f.confirmRemittance({amountPaisa:due,reference:'FICTIONAL-INDEPENDENT-COMPANY-RECEIPT'});
  const before=f.sqlite.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(f.orderId)!;
  const preview=await cancellationPreview(f.database,f.access,['seller-a']),collected=preview.parcels.reduce((sum,row)=>sum+row.collected,0);
  assert.equal(preview.reviewRequired,true);assert.ok(collected>preview.next.total);
  assert.deepEqual(f.sqlite.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(f.orderId),before);
  return{fingerprint:preview.fingerprint,reviewRequired:preview.reviewRequired,total:preview.next.total,collected,walletRestored:preview.walletRestored,discountRemoved:preview.discountRemoved,delivery:preview.next.delivery,deliveryPricingPolicy:preview.deliveryPricingPolicy};
 }finally{await f.dispose();}
}
