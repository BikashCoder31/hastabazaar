import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSellerPhone } from '../lib/sellers/contact-phone';

void test('seller phones default to Nepal and accept exactly ten digits without SMS proof', () => {
  assert.deepEqual(parseSellerPhone('0123456789'), { country: 'NP', phone: '+9770123456789' });
  assert.deepEqual(parseSellerPhone('9876543210', 'IN'), { country: 'IN', phone: '+919876543210' });
  for (const phone of ['123456789', '12345678901', 'abcdefghij', '+9779800000000', '98000 00000'])
    assert.throws(() => parseSellerPhone(phone, 'NP'), /10 digits/);
  assert.throws(() => parseSellerPhone('9800000000', 'XX'), /country/);
});

void test('supported international contacts retain their national lengths instead of inheriting Nepal ten-digit constraints', () => {
  assert.deepEqual(parseSellerPhone('17123456', 'BT'), { country: 'BT', phone: '+97517123456' });
  assert.deepEqual(parseSellerPhone('13812345678', 'CN'), { country: 'CN', phone: '+8613812345678' });
  assert.deepEqual(parseSellerPhone('412345678', 'AU'), { country: 'AU', phone: '+61412345678' });
  assert.throws(() => parseSellerPhone('12345678901234', 'CN'), /digits/);
  assert.throws(() => parseSellerPhone('1234', 'BT'), /digits/);
});
