import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesSavedDeliveryAddress } from '../lib/checkout/saved-address';
import type { CustomerAddressRow } from '../lib/db/repositories/customers';
import type { NepalAddress } from '../lib/shipping/provider';

const saved: CustomerAddressRow = { id:'saved',label:'Home',recipientName:'Buyer',phone:'9811111111',province:'Madhesh',district:'Dhanusha',municipality:'Janakpur',ward:'1',locality:'Sample Tole',landmark:null,postalCode:null,isDefault:1 };
const address: NepalAddress = { recipientName:'Buyer',phone:'9811111111',province:'Madhesh',district:'Dhanusha',municipality:'Janakpur',ward:'1',locality:'Sample Tole' };
void test('saved address matching never collapses a mobile beginning 977 into a different recipient number', () => {
  const mobile = { ...saved, phone:'9771234567' };
  assert.equal(matchesSavedDeliveryAddress({...address,phone:'1234567'},mobile),false);
  assert.equal(matchesSavedDeliveryAddress({...address,phone:'+9779771234567'},mobile),true);
});
void test('saved address matching recognizes phone formatting and address aliases without changing values', () => {
  assert.equal(matchesSavedDeliveryAddress({...address,phone:'+977 981-111-1111',district:'Dhanusa',ward:'01'},saved),true);
  assert.equal(matchesSavedDeliveryAddress({...address,phone:'+9771234567'},{...saved,phone:'1234567'}),true);
  assert.equal(saved.phone,'9811111111');
});
void test('saved address reuse distinguishes unchanged, moved, removed and newly added pins', () => {
  const pinned = {...saved,latitude:27.7,longitude:85.3};
  const cases = [
    {input:address, stored:saved, matches:true},
    {input:{...address,location:{latitude:27.7,longitude:85.3}},stored:pinned,matches:true},
    {input:{...address,location:{latitude:27.8,longitude:85.3}},stored:pinned,matches:false},
    {input:address,stored:pinned,matches:false},
    {input:{...address,location:{latitude:27.7,longitude:85.3}},stored:saved,matches:false},
  ];
  for(const item of cases)assert.equal(matchesSavedDeliveryAddress(item.input,item.stored),item.matches);
});
