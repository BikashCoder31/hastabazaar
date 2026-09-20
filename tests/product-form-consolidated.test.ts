import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductSubmission } from '../lib/products/submission';
function form() { const f = new FormData(); for (const [key,value] of Object.entries({categoryId:'cat',occasionIds:'occasion',sku:'EXISTING-1',nameEn:'Handmade bowl',descriptionEn:'Handmade bowl description',price:'1000',inventoryQuantity:'2',preparationDays:'2'})) f.set(key,value); return f; }
void test('new product form accepts omitted producer and materials without fabricated values', () => {
 const result = parseProductSubmission(form()); assert.deepEqual(result.errors, []); assert.equal(result.input?.producer, ''); assert.deepEqual(result.input?.materials, []); assert.equal(result.input?.originStory, null);
});
void test('warranty Yes accepts months alone, rejects missing/negative/fractional duration', () => {
 const f=form(); f.set('warrantyOffered','yes'); f.set('warrantyMonths','6');
 assert.equal(parseProductSubmission(f).input?.warranty,'6 months');
 for (const value of ['', '-1', '1.5']) { f.set('warrantyMonths',value); assert.ok(parseProductSubmission(f).errors.some(e=>/duration/i.test(e))); }
});
void test('warranty No clears new duration while legacy free text remains supported', () => {
 const f=form(); f.set('warranty','Existing workmanship terms');
 assert.equal(parseProductSubmission(f).input?.warranty,'Existing workmanship terms');
 f.set('warrantyOffered','no'); f.set('warrantyMonths','6');
 assert.equal(parseProductSubmission(f).input?.warranty,null);
});
