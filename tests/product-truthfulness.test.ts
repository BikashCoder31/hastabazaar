import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryMediaDb } from './helpers/category-media-db';
import { createProductSubmission, getPublishedProductBySlug, listPublishedProducts } from '../lib/db/repositories/products';
import { parseProductSubmission } from '../lib/products/submission';
import { productReturnDisclosure } from '../lib/returns/presentation';
import { phaseOneMarketplacePolicy } from '../lib/marketplace/policy';

const staleReturns = 'Returns or exchanges are accepted within 10 days of delivery under the standard Hastabazaar return policy.';
function submission() {
  const form = new FormData();
  for (const [key, value] of Object.entries({categoryId:'cat', nameEn:'Decorative hanging', descriptionEn:'A decorative hanging for an entrance.', price:'824', compareAtPrice:'1648', inventoryQuantity:'10', preparationDays:'3', returnEligible:'no'})) form.set(key,value);
  form.set('occasionIds','hastabazaar-occasion-others');
  return form;
}
async function fixture() {
  const f = await categoryMediaDb();
  f.sqlite.exec("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES('seller-user','seller-user','seller@example.invalid','Seller','en-NP','active',1,1)");
  f.sqlite.exec("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,approved_at,created_at,updated_at) VALUES('seller','seller-user','Seller','Seller','Local','REG-1','PAN','PAN-1','Seller','0000000000','seller@example.invalid','Province','District','Town','Ward','ACCOUNT','approved',1,1,1)");
  f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cat','truthfulness','Decor',1,1,1,1)");
  return f;
}
async function create(f: Awaited<ReturnType<typeof fixture>>, form = submission()) {
  const parsed = parseProductSubmission(form);
  assert.deepEqual(parsed.errors, []);
  await createProductSubmission(f.db,{productId:'product',sellerId:'seller',actorId:'seller-user',slug:'decor',input:parsed.input!,images:[],now:2});
  return parsed.input!;
}
void test('missing origin is saved as unknown without assuming Nepal',async()=>{
  const f=await fixture();
  try {
    const input=await create(f);
    assert.equal((input as typeof input & {countryOfOrigin?:string}).countryOfOrigin,'');
    const raw=f.sqlite.prepare('SELECT country_of_origin FROM products WHERE id=?').get('product');
    assert.equal(raw?.country_of_origin,'');
  } finally {f.dispose();}
});
void test('seller origin declarations never become verified through submitted status',()=>{
  const form=submission();
  form.set('countryOfOrigin','India');
  form.set('originEvidenceReference','Supplier declaration dated 2026-09-18');
  form.set('originEvidenceStatus','verified');
  const result=parseProductSubmission(form);
  assert.deepEqual(result.errors,[]);
  const input=result.input as typeof result.input & {countryOfOrigin:string;originEvidenceStatus:string;originEvidenceReference:string};
  assert.equal(input?.countryOfOrigin,'India');
  assert.equal(input?.originEvidenceStatus,'seller_declared');
  assert.equal(input?.originEvidenceReference,'Supplier declaration dated 2026-09-18');
});
void test('legacy default Nepal remains internal and is unknown in public product queries',async()=>{
  const f=await fixture();
  try {
    await create(f);
    f.sqlite.prepare("UPDATE products SET status='published',country_of_origin='NP' WHERE id='product'").run();
    const product=await getPublishedProductBySlug(f.db,'decor');
    assert.ok(product);
    assert.equal((product as typeof product & {originDisclosure?:string}).originDisclosure,'Not yet confirmed');
    assert.equal(product.countryOfOrigin,'');
    const list=await listPublishedProducts(f.db,{});
    assert.equal((list[0] as typeof list[0] & {originDisclosure?:string}).originDisclosure,'Not yet confirmed');
    assert.equal(f.sqlite.prepare("SELECT country_of_origin FROM products WHERE id='product'").get()?.country_of_origin,'NP');
    assert.equal(product.pricePaisa,82400);
    assert.equal(product.compareAtPricePaisa,164800);
  } finally {f.dispose();}
});
void test('known imported listing removes internal source notes without inventing product facts',async()=>{
  const f=await fixture();
  try {
    await create(f);
    const original='Pair of handmade peacock side-door hangings. Safety: Not stated on the source page.';
    const specifications='Colour: Multicolour\nDimensions: Approximately 16 × 6 in each\nModel or identifier: ASIN B0F5X3751B\nCountry of origin: Not stated on the source page.';
    f.sqlite.prepare("UPDATE products SET status='published',name_en=?,description_en=?,specifications=?,care_instructions=?,safety_information=?,return_conditions=? WHERE id='product'").run('Divyakosh Handmade Peacock Decorative Hangings',original,specifications,'Not stated on the source page.','Not stated on the source page.',staleReturns);
    const product=await getPublishedProductBySlug(f.db,'decor');
    assert.ok(product);
    assert.doesNotMatch(product.nameEn,/handmade/i);
    assert.doesNotMatch(product.descriptionEn,/handmade|source page/i);
    assert.doesNotMatch(product.specifications??'',/ASIN|source page|country of origin/i);
    assert.match(product.specifications??'',/Approximately 16 × 6 in each/);
    assert.equal(product.careInstructions,null);
    assert.equal(product.safetyInformation,null);
    assert.equal((product as typeof product & {originDisclosure?:string}).originDisclosure,'Not yet confirmed');
    assert.equal(f.sqlite.prepare("SELECT description_en FROM products WHERE id='product'").get()?.description_en,original);
  } finally {f.dispose();}
});
void test('recorded imported origin is qualified as a declaration and overrides old implicit Nepal',async()=>{
  const f=await fixture();
  try {
    await create(f);
    f.sqlite.prepare("UPDATE products SET status='published',specifications='Model: ASIN B0GSKYMM3L',country_of_origin='NP' WHERE id='product'").run();
    const product=await getPublishedProductBySlug(f.db,'decor');
    assert.ok(product);
    assert.match((product as typeof product & {originDisclosure?:string}).originDisclosure??'',/^India \(source listing; unverified\)/i);
    assert.doesNotMatch((product as typeof product & {originDisclosure?:string}).originDisclosure??'',/Nepal|independently verified/i);
  } finally {f.dispose();}
});
void test('current returns omit known stale standard-policy sentence and disclose intact sealed goods',()=>{
  const policy=phaseOneMarketplacePolicy.value.returns;
  const disclosure=productReturnDisclosure(true,staleReturns,policy);
  assert.doesNotMatch(disclosure.conditions,/10 days|exchanges are accepted/i);
  assert.match(disclosure.eligibility,/7 days/);
  assert.match(disclosure.eligibility,/15 days.*seal.*intact/i);
  const custom='Custom workmanship guarantee: repairs within 10 days. Return unused in the original packaging.';
  assert.equal(productReturnDisclosure(true,custom,policy).conditions,custom);
  assert.equal(productReturnDisclosure(true,staleReturns+'\nUnused in original packaging.',policy).conditions,'Unused in original packaging.');
  assert.match(productReturnDisclosure(true,null,{...policy,generalRequestWindowDays:14}).eligibility,/14 days/);
});


void test('public origin disclosure excludes private references while stored declarations remain available',async()=>{
  const f=await fixture();
  try {
    const form=submission();form.set('countryOfOrigin','IN');form.set('originEvidenceReference','Private supplier contract REF-42');
    await create(f,form);
    f.sqlite.prepare("UPDATE products SET status='published' WHERE id='product'").run();
    const product=await getPublishedProductBySlug(f.db,'decor');
    assert.ok(product);
    assert.equal(product.originEvidenceReference,undefined);
    assert.match(product.originDisclosure??'',/^India .*seller declared/);
    assert.equal(f.sqlite.prepare("SELECT origin_evidence_reference FROM products WHERE id='product'").get()?.origin_evidence_reference,'Private supplier contract REF-42');
  } finally {f.dispose();}
});
void test('revised origin saves the new declaration and invalidates previous verification',async()=>{
  const f=await fixture();
  try {
    await create(f);
    f.sqlite.prepare("UPDATE products SET status='needs_changes',country_of_origin='IN',origin_evidence_status='verified',origin_evidence_reference='Old evidence' WHERE id='product'").run();
    for(let n=0;n<4;n++)f.sqlite.prepare("INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES(?,'product',?,?,'image/jpeg',1,'Decorative hanging',?,2)").run('photo-'+n,'photo-'+n,'photo-'+n,n);
    const form=submission();form.set('countryOfOrigin','China');form.set('originEvidenceReference','New supplier statement');
    const {reviseAndResubmitProduct}=await import('../lib/db/repositories/products');
    await reviseAndResubmitProduct(f.db,{productId:'product',sellerId:'seller',actorId:'seller-user',input:parseProductSubmission(form).input!,images:[],previousInventory:10,now:3});
    const row=f.sqlite.prepare("SELECT country_of_origin,origin_evidence_status,origin_evidence_reference FROM products WHERE id='product'").get();
    assert.equal(row?.country_of_origin,'China');
    assert.equal(row?.origin_evidence_status,'seller_declared');
    assert.equal(row?.origin_evidence_reference,'New supplier statement');
  } finally {f.dispose();}
});


void test('import marketing claims are removed from public titles and homepage card names only',async()=>{
  const f=await fixture();
  try {
    await create(f);
    const original='Beige & Brown Handmade Crochet Bow Wallet';
    f.sqlite.prepare("UPDATE products SET status='published',name_en=?,published_at=2 WHERE id='product'").run(original);
    f.sqlite.prepare("INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES('photo','product','photo','photo','image/jpeg',1,'Wallet',0,2)").run();
    f.sqlite.prepare("UPDATE product_media SET alt_en=? WHERE product_id='product'").run(original);
    const product=await getPublishedProductBySlug(f.db,'decor');
    assert.ok(product);assert.equal(product.nameEn,'Beige & Brown Crochet Bow Wallet');
    assert.equal(product.media[0]?.altEn,'Beige & Brown Crochet Bow Wallet');
    const {listHomepageLatestProducts}=await import('../lib/db/repositories/products');
    const cards=await listHomepageLatestProducts(f.db,8);
    assert.equal(cards[0]?.name,'Beige & Brown Crochet Bow Wallet');
    assert.equal(cards[0]?.imageAlt,'Beige & Brown Crochet Bow Wallet');
    assert.equal(f.sqlite.prepare("SELECT name_en FROM products WHERE id='product'").get()?.name_en,original);
  } finally {f.dispose();}
});


void test('cart public title removes recorded import claims without changing its quantity or money',async()=>{
  const f=await fixture();
  try {
    await create(f);f.sqlite.prepare("UPDATE products SET status='published',name_en='Beige & Brown Handmade Crochet Bow Wallet' WHERE id='product'").run();
    f.sqlite.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES('cart','token','NPR',9999999999999,2,2)").run();
    f.sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line','cart','product',2,2,2)").run();
    const {getCart}=await import('../lib/db/repositories/cart');const cart=await getCart(f.db,'token');
    assert.equal(cart.items[0]?.nameEn,'Beige & Brown Crochet Bow Wallet');
    assert.equal(cart.items[0]?.quantity,2);assert.equal(cart.items[0]?.pricePaisa,82400);assert.equal(cart.itemSubtotalPaisa,164800);
    assert.equal(f.sqlite.prepare("SELECT name_en FROM products WHERE id='product'").get()?.name_en,'Beige & Brown Handmade Crochet Bow Wallet');
  } finally {f.dispose();}
});
void test('maker, saved and recently viewed public listings use the same truthful title and current price',async()=>{
  const f=await fixture();
  try {
    await create(f);f.sqlite.prepare("UPDATE products SET status='published',name_en='Beige & Brown Handmade Crochet Bow Wallet',published_at=2 WHERE id='product'").run();
    f.sqlite.prepare("INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES('photo','product','photo','photo','image/jpeg',1,'Wallet',0,2)").run();
    f.sqlite.prepare("INSERT INTO wishlist_items(user_id,product_id,created_at) VALUES('seller-user','product',2)").run();
    const {listPublishedProductsByMaker,listWishlist}=await import('../lib/db/repositories/customers');
    const {resolveRecentlyViewedProducts}=await import('../lib/db/repositories/recently-viewed');
    const maker=await listPublishedProductsByMaker(f.db,'seller');const saved=await listWishlist(f.db,'seller-user');
    const recent=await resolveRecentlyViewedProducts(f.db,{productIds:['product'],now:3,policy:{maxItems:12,retentionDays:90}});
    assert.equal(maker[0]?.nameEn,'Beige & Brown Crochet Bow Wallet');assert.equal(maker[0]?.pricePaisa,82400);
    assert.equal(saved[0]?.nameEn,'Beige & Brown Crochet Bow Wallet');assert.equal(saved[0]?.pricePaisa,82400);
    assert.equal(recent[0]?.name,'Beige & Brown Crochet Bow Wallet');assert.equal(recent[0]?.imageAlt,'Beige & Brown Crochet Bow Wallet');assert.equal(recent[0]?.pricePaisa,82400);
  } finally {f.dispose();}
});

void test('older imported JSON shapes receive truthful product and cart titles without losing source origin evidence',async()=>{
  const {readFile}=await import('node:fs/promises');
  for(const [number,wantName,wantOrigin,price,reference] of [
    [3,'AAKRITI ART CREATIONS Tribal Terracotta Dangle Earrings - Multicolor','India (source listing; unverified)',104600,209200],
    [18,'KHOJ.CITY Pink Boho Drop Earrings','Not yet confirmed',67800,135600],
  ] as const){
    const raw=JSON.parse(await readFile(new URL('../products/product/_uploaded/HATHKRITI/'+number+'/product-data.json',import.meta.url),'utf8'));
    const name=raw.listing?.title??raw.rewrittenMarketingCopy.storefrontTitle;
    const description=raw.listing?.description??raw.rewrittenMarketingCopy.description;
    const f=await fixture();
    try{
      await create(f);
      f.sqlite.prepare("UPDATE products SET status='published',name_en=?,description_en=?,specifications=?,country_of_origin='NP',price_paisa=?,compare_at_price_paisa=? WHERE id='product'").run(name,description,'Model: ASIN '+raw.source.asin,price,reference);
      const product=await getPublishedProductBySlug(f.db,'decor');assert.ok(product);
      assert.equal(product.nameEn,wantName);assert.doesNotMatch(product.descriptionEn,/handmade|handcrafted/i);assert.doesNotMatch(product.specifications??'',/ASIN/i);
      assert.equal(product.originDisclosure,wantOrigin);assert.equal(product.pricePaisa,price);assert.equal(product.compareAtPricePaisa,reference);
      f.sqlite.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES('cart','old-import','NPR',9999999999999,2,2)").run();
      f.sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line','cart','product',1,2,2)").run();
      const {getCart}=await import('../lib/db/repositories/cart');const cart=await getCart(f.db,'old-import');
      assert.equal(cart.items[0]?.nameEn,wantName);assert.equal(cart.itemSubtotalPaisa,price);
      assert.equal(f.sqlite.prepare("SELECT name_en FROM products WHERE id='product'").get()?.name_en,name);
    }finally{f.dispose();}
  }
});

