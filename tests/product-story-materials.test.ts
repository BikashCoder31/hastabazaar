import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateBusinessSettingValue } from '../lib/configuration/definitions';
import { normalizeProductMaterials, parseProductSubmission } from '../lib/products/submission';
import { productSavings } from '../lib/products/discount';

void test('materials are optional, normalized case-insensitively, and retain first spelling', () => {
  assert.deepEqual(normalizeProductMaterials([' Jute ', 'cotton', 'jute', 'Wooden beads']), [
    'Jute', 'cotton', 'Wooden beads',
  ]);
  assert.deepEqual(normalizeProductMaterials([]), []);
  assert.throws(() => normalizeProductMaterials(['x'.repeat(81)]), /80 characters/);
  assert.throws(() => normalizeProductMaterials(Array.from({length:21},(_,i)=>`item ${i}`)), /20 materials/);
});

void test('product submission accepts blank optional materials/story and validates real values', () => {
  const form = new FormData();
  Object.entries({
    categoryId:'cat', nameEn:'Clay cup', descriptionEn:'Hand-shaped clay cup.',
    price:'1000', inventoryQuantity:'2', preparationDays:'2', returnEligible:'no',
    warrantyOffered:'no',
  }).forEach(([key,value])=>form.set(key,value));
  form.append('occasionIds','gift');
  const blank = parseProductSubmission(form);
  assert.ok(blank.input);
  assert.deepEqual(blank.input.materials, []);
  assert.equal(blank.input.originStory, null);

  form.append('materials','Jute');
  form.append('materials','jute');
  form.append('materials','Wooden beads');
  form.set('originStory','I began making this cup after learning the technique from my family workshop.');
  const complete = parseProductSubmission(form);
  assert.deepEqual(complete.input?.materials, ['Jute','Wooden beads']);
  assert.match(complete.input?.originStory ?? '', /family workshop/);
});

void test('material suggestions are controlled validated content', () => {
  assert.deepEqual(validateBusinessSettingValue('product_material_suggestions', ['jute','Wooden beads']), ['jute','Wooden beads']);
  assert.throws(()=>validateBusinessSettingValue('product_material_suggestions',['Jute','jute']),/duplicate/i);
  assert.throws(()=>validateBusinessSettingValue('product_material_suggestions',['<script>']),/invalid/i);
});

void test('NPR 200 to NPR 100 reports both 50% and NPR 100 saved', () => {
  assert.deepEqual(productSavings(10_000,20_000),{label:'50% off',savedPaisa:10_000});
  assert.equal(productSavings(10_000,10_000),null);
});

void test('additive product-story migration and public rendering keep blank sections hidden', async () => {
  const migration = await readFile(new URL('../drizzle/0047_product_story_materials.sql', import.meta.url),'utf8');
  const mariaMigration = await readFile(new URL('../deployment/babal/mariadb-product-story-materials.sql', import.meta.url),'utf8');
  const publicPage = await readFile(new URL('../components/catalog/storefront-product-detail.tsx', import.meta.url),'utf8');
  assert.match(migration,/materials_json/);
  assert.match(migration,/origin_story/);
  assert.match(mariaMigration,/materials_json/);
  assert.match(mariaMigration,/origin_story/);
  assert.match(publicPage,/The story behind this product/);
  assert.match(publicPage,/product\.originStory \?/);
});
