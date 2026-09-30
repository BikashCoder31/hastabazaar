import assert from 'node:assert/strict';
import test from 'node:test';
import {isDiscoverablePath,productStructuredData,safeJsonLd,xmlEscape} from '../lib/seo/discovery';
void test('the absent maker directory is not discoverable and mixed media emits raster images only',()=>{
 assert.equal(isDiscoverablePath('/makers'),false);
 assert.equal(isDiscoverablePath('/makers/maker-one'),true);
 const base={slug:'cup',nameEn:'Cup',descriptionEn:'Handmade cup',pricePaisa:1000,inventoryQuantity:1};
 const data=productStructuredData({...base,media:[{id:'photo',mimeType:'image/png'},{id:'clip',mimeType:'video/mp4'}]},{count:0,average:null});
 assert.deepEqual(data.image,['https://hastabazaar.com/api/product-media/photo']);
 assert.equal('image' in productStructuredData({...base,media:[{id:'clip',mimeType:'video/mp4'}]},{count:0,average:null}),false);
});
void test('only explicitly public pages are discoverable',()=>{for(const path of ['/','/shop','/products/handmade','/about'])assert.equal(isDiscoverablePath(path),true);for(const path of ['/account','/orders/private','/admin','/rider','/api/review-photos/id','/login','/checkout'])assert.equal(isDiscoverablePath(path),false);});
void test('product data uses actual prices/availability and escapes injected script text',()=>{const product={slug:'a & b',nameEn:'</script><script>alert(1)</script>',descriptionEn:'Local description',pricePaisa:123456,inventoryQuantity:0,media:[{id:'public-image'}]};const data=productStructuredData(product,{count:2,average:4.5});assert.equal(data.offers.price,'1234.56');assert.match(data.offers.availability,/OutOfStock$/);assert.equal(data.aggregateRating?.reviewCount,2);assert.ok(!safeJsonLd(data).includes('<'));assert.deepEqual(JSON.parse(safeJsonLd(data)),data);assert.equal(xmlEscape('a&<"'), 'a&amp;&lt;&quot;');});
