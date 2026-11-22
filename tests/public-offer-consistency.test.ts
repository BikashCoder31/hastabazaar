import {recordRecentlyViewedProduct,listRecentlyViewedProducts,resolveRecentlyViewedProducts} from '../lib/db/repositories/recently-viewed';
import {publishedOfferFixture as published} from './helpers/public-offer-fixture';
import {listPublishedProductsByMaker,listWishlist,setWishlistItem} from '../lib/db/repositories/customers';
import {productStructuredData} from '../lib/seo/discovery';
import {publicCatalogueQuery} from '../lib/products/public-catalogue-query';
import assert from 'node:assert/strict';
import test from 'node:test';
import { productPublicationFixture } from './helpers/product-publication-fixture';


import { pauseOfferStock, getOfferStock } from '../lib/products/offer-inventory';
import {getPublishedProductBySlug,getProductMediaObject,listPublishedProducts,countPublishedProducts,listHomepageLatestProducts} from '../lib/db/repositories/products';
import {inspectLegacyProduct,openLegacyProductWorkspace} from '../lib/products/legacy-workspace';
async function publicApi(){const path='../lib/products/public-offers',m=await import(path).catch(()=>null);assert.equal(typeof m?.getPublicOfferSet,'function','Public consumers need one source-bound offer projection.');return m!;}
void test('public display uses exact published offers and available prices; all-unavailable fallback retains real choices',async()=>{
 const m=await publicApi(),f=await published();try{let view=await m.getPublicOfferSet(f.db,f.productId,f.now+10);assert.ok(view);assert.equal(view.display.pricePaisa,80000);assert.equal(view.display.maximumPricePaisa,100000);assert.equal(view.display.from,true);assert.equal(view.display.compareAtPricePaisa,null);assert.equal(view.offers.find((row:{id:string})=>row.id==='small').orderable,false);assert.equal(view.offers.find((row:{id:string})=>row.id==='medium').selection[0].value,'Medium');assert.equal(view.orderable,true);assert.doesNotMatch(JSON.stringify(view),/Private licence|Private review|object_key|content_digest|stockIntent|sellerSku/);
 for(const id of ['medium','large']){const stock=await getOfferStock(f.db,id);await pauseOfferStock(f.db,{actorId:'registered-owner',requestId:'public-pause-'+id,expectedRevision:String(stock!.revision),now:f.now+11},{offerId:id,paused:true,reason:'Temporarily pause this exact size while preserving its quantity and history.'});}view=await m.getPublicOfferSet(f.db,f.productId,f.now+12);assert.equal(view.display.pricePaisa,60000);assert.equal(view.display.maximumPricePaisa,100000);assert.equal(view.orderable,false);assert.equal(view.offers.length,3);
 }finally{f.dispose();}
});
void test('public product responses exclude private licence evidence and internal seller stock codes',async()=>{const f=await published();try{const product=await getPublishedProductBySlug(f.db,f.slug);assert.ok(product);assert.equal(Object.hasOwn(product,'licenceReference'),false);assert.equal(Object.hasOwn(product,'originEvidenceReference'),false);assert.equal(Object.hasOwn(product,'sellerSku'),false);}finally{f.dispose();}});
void test('opening an unreconciled legacy workspace cannot expose its unknown approval baseline or retained media',async()=>{const f=await productPublicationFixture('',Date.now()-60_000);try{f.sqlite.exec("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,materials,status,created_at,updated_at) VALUES('unknown-baseline','registered','cups','unknown-baseline','OLD-UNKNOWN','Unreconciled old source','An observed row is not proof of a whole approved version.',50000,3,'Fictional maker','Clay','published',1,1);INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES('unknown-photo','unknown-baseline','private/unknown.png','old.png','image/png',100,'Unreconciled original',0,1)");const source=await inspectLegacyProduct(f.db,'registered-owner','unknown-baseline');await openLegacyProductWorkspace(f.db,{...f.ctx,requestId:'unreconciled-public-check'},{productId:'unknown-baseline',sourceFingerprint:source.sourceFingerprint,retainObserved:true});assert.equal(await getPublishedProductBySlug(f.db,'unknown-baseline'),null);assert.equal((await getProductMediaObject(f.db,'unknown-photo'))?.productStatus,'archived');assert.equal(f.sqlite.prepare("SELECT status FROM products WHERE id='unknown-baseline'").get()!.status,'published');}finally{f.dispose();}});

void test('native catalogue price and ordering predicates share the public display set, including a lost terms acceptance',async()=>{
 const m=await publicApi(),f=await published();try{
  for(const accepted of [true,false]){if(!accepted)f.sqlite.exec("UPDATE seller_profiles SET seller_agreement_version='unaccepted-current-terms' WHERE id='registered'");const context=await publicCatalogueQuery(f.db,f.now+20),row=await f.db.prepare(`${context.withClause} SELECT ${context.price()} AS price,${context.purchasable()} AS orderable FROM products WHERE products.id=?`).bind(f.productId).first<{price:number;orderable:number}>(),view=await m.getPublicOfferSet(f.db,f.productId,f.now+20);assert.ok(view);assert.equal(row?.price,view.display.pricePaisa);assert.equal(Boolean(row?.orderable),view.orderable);assert.equal(view.display.pricePaisa,accepted?80000:60000);assert.equal(view.orderable,accepted);}
 }finally{f.dispose();}
});

void test('detail, filtered discovery, homepage, maker, wishlist and structured data agree on the available offer range',async()=>{
 const f=await published();try{
  const detail=await getPublishedProductBySlug(f.db,f.slug);assert.ok(detail);assert.equal(detail.pricePaisa,80000);assert.equal(detail.priceFrom,true);assert.equal(detail.compareAtPricePaisa,null);
  const listed=await listPublishedProducts(f.db,{minimumPricePaisa:70000,sort:'price-low'});assert.equal(listed.length,1);assert.equal(listed[0].pricePaisa,80000);assert.equal(await countPublishedProducts(f.db,{minimumPricePaisa:70000}),1);assert.equal(await countPublishedProducts(f.db,{minimumPricePaisa:90000}),0);
  const homepage=await listHomepageLatestProducts(f.db);assert.equal(homepage.length,1);assert.equal(homepage[0].pricePaisa,80000);assert.equal(homepage[0].priceFrom,true);
  const maker=await listPublishedProductsByMaker(f.db,'registered');assert.equal(maker[0].pricePaisa,80000);assert.equal(maker[0].priceFrom,true);await setWishlistItem(f.db,{userId:'customer',productId:f.productId,saved:true,now:f.now+20});const wishlist=await listWishlist(f.db,'customer');assert.equal(wishlist[0].pricePaisa,80000);assert.equal(wishlist[0].priceFrom,true);
  const policy={maxItems:8,retentionDays:30};await recordRecentlyViewedProduct(f.db,{userId:'customer',productId:f.productId,now:f.now+20,policy});const recent=await listRecentlyViewedProducts(f.db,{userId:'customer',now:f.now+21,policy}),anonymousRecent=await resolveRecentlyViewedProducts(f.db,{productIds:[f.productId],now:f.now+21,policy});assert.equal(recent[0].pricePaisa,80000);assert.equal(recent[0].priceFrom,true);assert.equal(anonymousRecent[0].pricePaisa,80000);
  const structured=productStructuredData(detail,{count:0,average:null});assert.equal(structured.offers?.['@type'],'AggregateOffer');assert.equal(structured.offers?.lowPrice,'800.00');assert.equal(structured.offers?.highPrice,'1000.00');assert.doesNotMatch(JSON.stringify([listed,homepage,maker,wishlist,structured]),/Private licence|Private review|object_key|stockIntent|sellerSku/);
 }finally{f.dispose();}
});
