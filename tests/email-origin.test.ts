import assert from 'node:assert/strict';
import test from 'node:test';
import {buildBusinessEmail} from '../lib/operations/business-notifications';
import {buildOrderEmail} from '../lib/email/order-updates';
void test('only explicit capture can build approved local HTTP links; provider origin checks remain strict',()=>{
 const business={email:'staff@local.hastabazaar.test',subject:'Fictional update',body:'Open the current record.',audience:'staff',relatedType:'product',relatedId:'fictional-product'};
 const order={orderNumber:'FICTIONAL',eventStatus:'placed',currentStatus:'placed',email:'customer@local.hastabazaar.test',cashPaisa:100,walletPaisa:0,discountPaisa:0,promoPaisa:0,trackingCode:null,occurredAt:100};
 for(const build of [(origin:string,transport?:'capture'|'provider')=>buildBusinessEmail(business,origin,{transport}),(origin:string,transport?:'capture'|'provider')=>buildOrderEmail(order,origin,{transport})]){
  assert.match(build('http://localhost:3018','capture').text,/http:\/\/localhost:3018/);
  assert.throws(()=>build('http://localhost:3018','provider'));
  assert.throws(()=>build('http://localhost:3018'));
  for(const origin of ['http://example.test:3018','http://localhost:3000','http://localhost:3018/path','http://user:secret@localhost:3018','http://localhost:3018?redirect=elsewhere'])assert.throws(()=>build(origin,'capture'));
 }
});
