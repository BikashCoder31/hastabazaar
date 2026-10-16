import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import sharpModule from 'sharp';
import type {SharpConstructor} from '../node_modules/sharp/dist/index.d.mts';
import {companyStoreMakerFixture} from './helpers/company-store-maker-fixture';
import {reviewProduct} from '../lib/db/repositories/products';
declare global {var makerRouteDb:D1Database;var makerRouteIdentity:unknown;var makerRouteMedia:unknown}
registerHooks({resolve(specifier,context,next){
 const code=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.makerRouteDb},get MEDIA(){return globalThis.makerRouteMedia}}':specifier==='@/app/auth'?'export async function getAuthenticatedUser(){return globalThis.makerRouteIdentity};export async function requireAuthenticatedUser(){return globalThis.makerRouteIdentity}':specifier==='next/navigation'?'export function redirect(path){throw new Error(path)};export function notFound(){throw new Error("Not found")}':null;
 return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(specifier,context);
}});
const sharp=sharpModule as SharpConstructor;
void test('maker multipart HTTP draft submit and corrections preserve ownership and block direct seller access',async()=>{
 const f=await companyStoreMakerFixture();const uploads=new Map<string,Uint8Array>();
 try {
  f.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run('maker-route-auth',f.actorId);
  f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('route-category','route-craft','Craft',1,1,1,1);
   INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('route-occasion','route-gift','Gift',1,1,1,1);`);
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('route-product-form','seller.product-submission',1,'published',?,'Fictional published form','reviewer',1,'reviewer',1,'reviewer',1,'route-product-form')`).run(JSON.stringify({formId:'seller.product-submission',fields:[]}));
  globalThis.makerRouteDb=f.db;globalThis.makerRouteIdentity={userId:'maker-route-auth',email:'maker@local.hastabazaar.test'};
  globalThis.makerRouteMedia={async put(key:string,body:ReadableStream){uploads.set(key,new Uint8Array(await new Response(body).arrayBuffer()));return {};},async delete(key:string){uploads.delete(key);}};
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#775533'}}).png().toBuffer();
  function form(requestId:string,photos=true){const data=new FormData();for(const [key,value] of Object.entries({requestId,formVersion:'1',categoryId:'route-category',nameEn:'Fictional HTTP cup',descriptionEn:'A real isolated multipart maker draft.',price:'1000',inventoryQuantity:'3',preparationDays:'1',occasionIds:'route-occasion'}))data.set(key,value);
   if(photos)for(let i=1;i<=4;i++)data.set(`image${i}`,new File([new Uint8Array(bytes)],`SIMULATED-${i}.png`,{type:'image/png'}));return data;}
  const {POST}=await import('../app/api/seller/products/route');const {PATCH}=await import('../app/api/seller/products/[id]/route');
  const send=(data:FormData,url='http://localhost:3018/api/seller/products?intent=draft&workspace=maker',origin='http://localhost:3018')=>POST(new Request(url,{method:'POST',headers:{origin},body:data}));
  assert.equal((await send(form('foreign-origin'),undefined,'https://foreign.test')).status,403);
  globalThis.makerRouteIdentity=null;assert.equal((await send(form('anonymous-maker'))).status,401);
  globalThis.makerRouteIdentity={userId:'maker-route-auth',email:'maker@local.hastabazaar.test'};
  assert.equal((await send(form('blocked-independent'),'http://localhost:3018/api/seller/products')).status,403);
  const original=form('owned-maker-draft');const created=await send(original);assert.equal(created.status,201,await created.text());
  const product=f.sqlite.prepare('SELECT id,status FROM products').get();assert.equal(product?.status,'draft');assert.equal(uploads.size,4);
  assert.equal((await send(original)).status,201);assert.equal(uploads.size,4);
  const id=String(product?.id);const submit=form('owned-maker-submit',false);submit.set('reviewRequestId','');
  const revision=(body:FormData)=>PATCH(new Request(`http://localhost:3018/api/seller/products/${id}?workspace=maker`,{method:'PATCH',headers:{origin:'http://localhost:3018'},body}),{params:Promise.resolve({id})});
  assert.equal((await revision(submit)).status,200);assert.equal(f.sqlite.prepare('SELECT status FROM products WHERE id=?').get(id)?.status,'submitted');
  await reviewProduct(f.db,{productId:id,actorId:'reviewer',action:'start_review',reason:'Fictional HTTP product review',requestId:'http-review-start',now:Date.now()});
  await reviewProduct(f.db,{productId:id,actorId:'reviewer',action:'request_changes',reason:'Improve the fictional product description',requestId:'http-request-correction',now:Date.now()});
  const correction=form('owned-maker-correction',false);correction.set('descriptionEn','Corrected fictional HTTP product description.');correction.set('reviewRequestId','http-request-correction');
  assert.equal((await revision(correction)).status,200);
  const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM products').all());
  f.sqlite.exec(`INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,private_reason,applied_by,applied_at,updated_at) VALUES('maker','disabled','admin_review','test','Fictional access restriction','reviewer',1,1)`);
  assert.equal((await revision(correction)).status,403);assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM products').all()),before);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM products').get()?.n,1);
 }finally{f.dispose();}
});
