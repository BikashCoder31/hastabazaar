import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {createManualBankOrder,CheckoutUnavailableError} from '../lib/db/repositories/orders';
void test('a disabled payment method recovers its exact committed order but refuses a new checkout',async()=>{
 const f=await manualOrderFixture();try{const originalCount=f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n;
  assert.deepEqual(await createManualBankOrder(f.db,'manual-bank-cart','manual-bank-receipt',f.input,Date.now(),'customer',undefined,undefined,false),f.order);
  await assert.rejects(createManualBankOrder(f.db,'manual-bank-cart','manual-bank-receipt',{...f.input,idempotencyKey:crypto.randomUUID()},Date.now(),'customer',undefined,undefined,false),CheckoutUnavailableError);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,originalCount);assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,1);
 }finally{f.dispose();}
});
