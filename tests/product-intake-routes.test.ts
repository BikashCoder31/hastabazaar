import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import type {getProductWorkspace} from '../lib/products/intake-workspace';
declare global{var intakeHttpDb:D1Database;var intakeHttpActor:string|null;}
registerHooks({resolve(specifier,context,next){const source=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.intakeHttpDb}}':specifier==='@/lib/auth/seller-center'?"export class SellerCenterAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireSellerCenterApi(){if(!globalThis.intakeHttpActor)throw new SellerCenterAuthorizationError('Sign in',401);return {userId:globalThis.intakeHttpActor,sellerId:'registered'}}":null;return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);}});
void test('optional workspace HTTP saves and sends an empty candidate with closed fields, trusted origin and exact ownership',async()=>{
 const f=await completeVersionFixture();globalThis.intakeHttpDb=f.db;try{
  const path='../app/api/seller/product-intakes/workspace/route',route=await import(path).catch(()=>null);assert.equal(typeof route?.POST,'function','The actual optional editor needs a native owner API.');
  const url='http://localhost:3018/api/seller/product-intakes/workspace',input={action:'save',draftId:null,categoryId:null,answers:{},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{},requestId:'http-empty-workspace',expectedRevision:null},post=(body:unknown,origin='http://localhost:3018')=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  globalThis.intakeHttpActor=null;assert.equal((await route.POST(post(input))).status,401);globalThis.intakeHttpActor='registered-owner';assert.equal((await route.POST(post(input,'https://untrusted.example'))).status,403);assert.equal((await route.POST(post({...input,actorId:'reviewer'}))).status,400);
  const savedResponse=await route.POST(post(input));assert.equal(savedResponse.status,200);const saved=await savedResponse.json();assert.deepEqual(await(await route.POST(post(input))).json(),saved);assert.equal(savedResponse.headers.get('cache-control'),'no-store');
  const get=()=>new Request(url+'?draftId='+saved.id);assert.equal((await route.GET(new Request(get().url+'&draftId=another'))).status,400);globalThis.intakeHttpActor='foreign';assert.equal((await route.GET(get())).status,403);globalThis.intakeHttpActor='registered-owner';
  const history=await import('../app/api/seller/product-intakes/history/route');assert.equal((await history.GET(new Request('http://localhost:3018/api/seller/product-intakes/history?draftId='+saved.id))).status,200);assert.equal((await history.GET(new Request('http://localhost:3018/api/seller/product-intakes/history?draftId='+saved.id+'&versionId='+saved.versionId))).status,200);globalThis.intakeHttpActor='foreign';assert.equal((await history.GET(new Request('http://localhost:3018/api/seller/product-intakes/history?draftId='+saved.id))).status,403);globalThis.intakeHttpActor='registered-owner';
  const send=await route.POST(post({action:'send',draftId:saved.id,versionId:saved.versionId,intent:'help',note:'',requestId:'http-empty-send',expectedRevision:String(saved.revision)}));assert.equal(send.status,200);assert.equal((await send.json()).state,'details_needed');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,0);
 }finally{f.dispose();}
});

void test('copy creates one private draft containing only the allowed facts from a current owned product', async () => {
 const f = await completeVersionFixture();
 globalThis.intakeHttpDb = f.db;
 try {
  globalThis.intakeHttpActor = 'registered-owner';
  f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
   VALUES('copy-category','copy-category','Clay work',1,0,1,1);
   INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,name_ne,description_en,description_ne,price_paisa,
    compare_at_price_paisa,inventory_quantity,producer,country_of_origin,materials,materials_json,size,dimensions,
    care_instructions,preparation_days,status,review_note,created_at,updated_at)
   VALUES('source-cup','registered','copy-category','copy-source','ORIGINAL-SKU','Original cup','Original Nepali name',
    'One clay cup.','Original Nepali description',43215,50000,17,'Unrelated producer','Nepal','Clay, Glaze','["Clay","Glaze"]',
    'Medium','Item dimensions only','Hand wash',5,'published','Do not carry over this review note',1,1),
    ('foreign-cup','maker','copy-category','foreign-source','FOREIGN-SKU','Foreign cup',NULL,
    'Other shop.',NULL,10000,NULL,1,'Producer','Nepal','Clay','[]',NULL,NULL,NULL,1,'published',NULL,1,1);`);
  if (!f.sqlite.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'packed_weight_grams')) {
   f.sqlite.exec('ALTER TABLE products ADD COLUMN packed_weight_grams INTEGER');
  }
  f.sqlite.exec(`CREATE TABLE IF NOT EXISTS seller_parcel_weights (order_id TEXT, seller_id TEXT, weight_grams INTEGER, item_count INTEGER,
    recorded_by TEXT, request_id TEXT, recorded_at INTEGER);
   UPDATE products SET packed_weight_grams=520 WHERE id='source-cup';`);
  const url = 'http://localhost:3018/api/seller/product-intakes/workspace';
  const route = await import('../app/api/seller/product-intakes/workspace/route');
  const input = { action: 'copy', requestId: 'copy-published-cup', expectedRevision: null, productId: 'source-cup' };
  const post = (body: unknown, origin = 'http://localhost:3018') => new Request(url, {
   method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await route.GET(new Request(url + '?productId=source-cup'))).status, 400);
  assert.equal((await route.POST(post(input, 'https://untrusted.example'))).status, 403);
  assert.equal((await route.POST(post({ ...input, answers: { nameEn: 'Injected' } }))).status, 400);
  assert.equal((await route.POST(post({ ...input, productId: 'foreign-cup' }))).status, 403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()?.n, 0);

  const response = await route.POST(post(input));
  assert.equal(response.status, 200, await response.clone().text());
  const copied = await response.json() as { id: string; revision: number; versionId: string };
  assert.equal(copied.revision, 0);
  const work = await (await route.GET(new Request(url + '?draftId=' + copied.id))).json() as Awaited<ReturnType<typeof getProductWorkspace>>;
  assert.equal(work.sellerId, 'registered');
  assert.equal(work.categoryId, 'copy-category');
  assert.deepEqual(work.answers, {
   descriptionEn: 'One clay cup.', descriptionNe: 'Original Nepali description', materials: ['Clay', 'Glaze'],
   size: 'Medium', careInstructions: 'Hand wash', countryOfOrigin: 'Nepal', preparationDays: '5',
  });
  assert.equal(work.packedWeightGrams, 520);
  assert.deepEqual(work.mediaIds, []);
  assert.deepEqual(work.uploads, []);
  assert.deepEqual(work.privateReview, {});
  assert.deepEqual(work.activity, []);
  assert.equal(work.formContext, null);
  assert.equal(work.case, null);
  assert.equal(work.publication, null);
  assert.equal(work.legacy, null);
  assert.deepEqual(work.offers.axes, []);
  assert.equal(work.offers.offers.length, 1);
  const offer = work.offers.offers[0];
  assert.notEqual(offer.id, 'source-cup');
  assert.equal(offer.price, '432.15');
  assert.equal(offer.compareAt, '');
  assert.equal(offer.stockIntent, '');
  assert.equal(offer.sku, '');
  assert.equal(offer.mediaId, null);

  f.sqlite.exec("UPDATE products SET price_paisa=99999,updated_at=2 WHERE id='source-cup'");
  assert.deepEqual(await (await route.POST(post(input))).json(), copied);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()?.n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n, 2);

  f.setBeforeBatch(() => { f.sqlite.exec("UPDATE products SET seller_id='maker' WHERE id='source-cup'"); });
  const race = await route.POST(post({ ...input, requestId: 'copy-during-transfer' }));
  assert.equal(race.status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()?.n, 1);
  assert.equal((await route.POST(post(input))).status, 403);
 } finally { f.dispose(); }
});
