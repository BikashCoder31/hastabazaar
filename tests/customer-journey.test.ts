import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCheckoutInput,getDeliveryEstimate} from '../lib/checkout/validation';
const input=()=>({customerEmail:'buyer@example.test',customerPhone:'9800000000',termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Local buyer',phone:'9800000000',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Local fixture',ward:'1'}});
void test('new checkout rejects unknown districts, province mismatch and zero wards',()=>{
 const x=input();x.address.district='Not a district';assert.equal(parseCheckoutInput(x).value,undefined);assert.equal(getDeliveryEstimate(x.address.district,[0]),null);
 x.address.district='Kathmandu';x.address.province='Madhesh';assert.equal(parseCheckoutInput(x).value,undefined);
 x.address.province='Bagmati';for(const ward of ['0','00','-1','1.5','100']){x.address.ward=ward;assert.equal(parseCheckoutInput(x).value,undefined,ward);}
});
void test('known spelling aliases keep the tariff and normalize only new input',()=>{
 const x=input();x.address.province='madhesh';x.address.district=' Dhanusa ';x.address.ward='01';const result=parseCheckoutInput(x);assert.equal(result.value?.address.district,'Dhanusha');assert.equal(result.value?.address.province,'Madhesh');assert.equal(result.value?.address.ward,'1');assert.equal(x.address.district,' Dhanusa ');
 assert.equal(getDeliveryEstimate('Dhanusa',[2])?.chargePaisa,18000);assert.equal(getDeliveryEstimate('Nawalpur',[0])?.chargePaisa,18000);assert.equal(getDeliveryEstimate('Nawalparasi',[0]),null);
});
void test('all configured districts have one province and preserve existing tariff zones',async()=>{
 const {DISTRICTS_BY_PROVINCE,districtBelongsToProvince}=await import('../lib/checkout/nepal-address');
 const districts=Object.values(DISTRICTS_BY_PROVINCE).flat();assert.equal(districts.length,77);assert.equal(new Set(districts).size,77);
 for(const [province,names] of Object.entries(DISTRICTS_BY_PROVINCE))for(const district of names){assert.equal(districtBelongsToProvince(district,province),true);assert.ok(getDeliveryEstimate(district,[1]));}
 assert.equal(getDeliveryEstimate('Chitawan',[0])?.chargePaisa,18000);assert.equal(getDeliveryEstimate('Kapilbastu',[0])?.chargePaisa,18000);
});
void test('unrecognized district names cannot resolve inherited object properties',()=>{
 for(const district of ['__proto__','constructor','prototype','toString']){assert.equal(getDeliveryEstimate(district,[0]),null);const x=input();x.address.district=district;assert.equal(parseCheckoutInput(x).value,undefined);}
});
