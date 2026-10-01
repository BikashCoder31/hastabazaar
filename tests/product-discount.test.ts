import assert from 'node:assert/strict';
import test from 'node:test';
import { productDiscountLabel } from '../lib/products/discount';
void test('discount uses stored paisa and never rounds positive prices to 100 percent off', () => {
 assert.equal(productDiscountLabel(80000,100000),'20% off');
 assert.equal(productDiscountLabel(66600,100000),'33.4% off');
 assert.equal(productDiscountLabel(1,100000),'99.9% off');
 assert.equal(productDiscountLabel(99999,100000),'<0.1% off');
 for(const [price,original] of [[100,100],[100,0],[100,90],[0,100],[-1,100],[100,NaN],[1.5,100]]) assert.equal(productDiscountLabel(price,original),null);
 assert.equal(productDiscountLabel(100,null),null);
});
