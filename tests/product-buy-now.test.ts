import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

void test('product purchase actions expose Add to cart and Buy now with one quantity selector', async () => {
  const source = await readFile(
    new URL('../components/commerce/add-to-cart.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /'Add to cart'/);
  assert.match(source, /'Buy now'/);
  assert.equal((source.match(/id="product-quantity"/g) ?? []).length, 1);
});

void test('Buy now validates through the cart endpoint before opening checkout', async () => {
  const source = await readFile(
    new URL('../components/commerce/add-to-cart.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /fetch\('\/api\/cart'/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(\{ productId, quantity \}\)/);
  assert.match(source, /if \(!response\.ok\)/);
  assert.match(source, /router\.push\('\/checkout'\)/);
  assert.match(source, /addedQuantity === quantity/);
  assert.match(source, /openingCheckout/);
});
