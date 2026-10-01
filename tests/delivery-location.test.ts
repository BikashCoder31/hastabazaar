import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLocation, safeCourierUrl} from '../lib/delivery/validation';
void test('delivery coordinates require a complete finite pair and valid accuracy',()=>{
 assert.deepEqual(parseLocation({latitude:27.7,longitude:85.3}),{latitude:27.7,longitude:85.3});
 for(const input of [{latitude:null,longitude:85},{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:'',longitude:''},{latitude:0,longitude:0,accuracy:-1}])assert.throws(()=>parseLocation(input));
 assert.equal(parseLocation(undefined),undefined);
});
void test('courier links allow HTTPS without credentials and reject unsafe schemes',()=>{
 assert.equal(safeCourierUrl('https://courier.example/track?code=123'),'https://courier.example/track?code=123');
 for(const value of ['javascript:alert(1)','http://example.com','https://name:password@example.com','https://localhost/test'])assert.throws(()=>safeCourierUrl(value));
});

void test('checkout preserves an optional pin without changing district shipping prices',async()=>{
 const {parseCheckoutInput,getDeliveryEstimate}=await import('../lib/checkout/validation');
 const base={customerEmail:'test@example.test',customerPhone:'9812345678',locale:'en-NP',termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Test customer',phone:'9812345678',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Test tole'}};
 const plain=parseCheckoutInput(base);const pinned=parseCheckoutInput({...base,address:{...base.address,location:{latitude:27.7,longitude:85.3}}});
 assert.ok(plain.value);assert.ok(pinned.value);assert.deepEqual(pinned.value.address.location,{latitude:27.7,longitude:85.3});
 assert.deepEqual(getDeliveryEstimate(plain.value.address.district,[2,4]),getDeliveryEstimate(pinned.value.address.district,[2,4]));
 assert.equal(parseCheckoutInput({...base,address:{...base.address,location:{latitude:'bad',longitude:85}}}).value,undefined);
});
