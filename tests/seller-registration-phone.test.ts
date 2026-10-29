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
