import assert from 'node:assert/strict';
import test from 'node:test';
import { countPublishedProducts, listPublishedProducts } from '../lib/db/repositories/products';
import { productPublicationFixture } from './helpers/product-publication-fixture';
import { readyRegisteredSeller } from './helpers/ready-registered-seller';

async function catalogueFixture() {
  const fixture = await productPublicationFixture();
  await readyRegisteredSeller(fixture, true);
  fixture.sqlite.exec(`
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
      VALUES ('other-empty-cups','empty-cups','Empty Cup Collection',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,materials,
      status,preparation_days,made_to_order,created_at,updated_at,published_at)
    VALUES ('ready-ceramic','registered','cups','ready-ceramic','READY-CUP','Cup with a blue glaze','Handmade cup',40000,4,'Maker','Clay','published',0,0,1,1,1),
      ('custom-ceramic','registered','cups','custom-ceramic','CUSTOM-CUP','Made-to-order cup','Handmade cup',30000,4,'Maker','Clay','published',3,1,1,1,2),
      ('sold-out-ceramic','registered','cups','sold-out-ceramic','SOLD-CUP','Cup with flowers','Handmade cup',20000,0,'Maker','Clay','published',0,0,1,1,3),
      ('expensive-ceramic','registered','cups','expensive-ceramic','BIG-CUP','Large cup','Handmade cup',70000,4,'Maker','Clay','published',0,0,1,1,4);
  `);
  return fixture;
}

void test('search suggestions include published products, categories and makers and never draft details', async () => {
  const fixture = await catalogueFixture();
  try {
    const { readSearchSuggestions } = await import('../lib/catalog/search-suggestions');
    const suggestions = await readSearchSuggestions(fixture.db, 'cup');
    assert.ok(suggestions.some(item => item.kind === 'product' && item.href === '/products/ready-ceramic'));
    assert.ok(suggestions.some(item => item.kind === 'category' && item.href === '/shop?category=fictional-cups'));
    assert.ok(suggestions.some(item => item.kind === 'maker' && item.href === '/makers/registered'));
    assert.doesNotMatch(JSON.stringify(suggestions), /Fictional new cup|Private review note|Empty Cup Collection/);
    assert.deepEqual(await readSearchSuggestions(fixture.db, '%_'), []);
    assert.deepEqual(await readSearchSuggestions(fixture.db, 'c'), []);
  } finally {
    fixture.dispose();
  }
});

void test('ready and maximum price constraints agree between the shop count and paged results', async () => {
  const fixture = await catalogueFixture();
  try {
    const filters = { query: 'cup', readyToDispatch: true, maximumPricePaisa: 40000, categorySlugs: ['fictional-cups'] };
    assert.equal(await countPublishedProducts(fixture.db, filters), 1);
    assert.deepEqual((await listPublishedProducts(fixture.db, { ...filters, sort: 'relevance' })).map(item => item.id), ['ready-ceramic']);
  } finally {
    fixture.dispose();
  }
});
