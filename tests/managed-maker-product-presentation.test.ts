import assert from 'node:assert/strict';
import test from 'node:test';
import { productStructuredData } from '../lib/seo/discovery';

void test('a visible product awaiting commercial review is not advertised as in stock', () => {
  const product = { slug: 'fictional-item', nameEn: 'Fictional item', descriptionEn: 'Fictional.', pricePaisa: 10000, inventoryQuantity: 2, purchasable: false, media: [] };
  const data = productStructuredData(product, { count: 0, average: null });
  assert.equal(data.offers.availability, 'https://schema.org/OutOfStock');
});
