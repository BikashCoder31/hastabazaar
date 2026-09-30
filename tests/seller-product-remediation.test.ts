import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';
import sharpImport from 'sharp';
import type {SharpConstructor} from '../node_modules/sharp/dist/index.d.mts';
const sharp=sharpImport as SharpConstructor;
declare global {var remediationDb:D1Database;var remediationBucket:R2Bucket;var remediationSeller:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.remediationDb},get MEDIA(){return globalThis.remediationBucket}}',shortCircuit:true};
 if(specifier==='@/lib/auth/seller')return {url:'data:text/javascript,export class SellerAuthorizationError extends Error{};export async function requireSellerApi(){return {sellerId:globalThis.remediationSeller,userId:"seller-user"}}',shortCircuit:true};
 if(specifier==='@/lib/auth/customer')return {url:'data:text/javascript,export class CustomerAuthorizationError extends Error{};export async function requireCustomerApi(){return {userId:"seller-user"}}',shortCircuit:true};
 return next(specifier,context);
}});
class Statement {
 private values:SQLInputValue[]=[];constructor(private sql:StatementSync){}
 bind(...values:SQLInputValue[]){this.values=values;return this;}
 async first<T>(){return this.sql.get(...this.values) as T??null;}
 async all<T>(){return {results:this.sql.all(...this.values) as T[]};}
 async run(){return {meta:{changes:Number(this.sql.run(...this.values).changes)}};}
}
class Database {
 constructor(readonly sqlite:DatabaseSync){}
 prepare(sql:string){return new Statement(this.sqlite.prepare(sql));}
 async batch(statements:readonly Statement[]){this.sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync('drizzle').filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort())for(const sql of readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())sqlite.exec(sql);
 sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('seller-user','seller@example.test','Fictional Seller','active',1,1);
 INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('seller-user','seller',1);
 INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES ('seller','seller-user','Fictional','Fictional','Local','REG','PAN','PAN','Fictional','9800000000','seller@example.test','Bagmati','Kathmandu','Kathmandu','Ward 1','approved',1,1);
 INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1);
 INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('occasion','gift','Gift',1,1,1,1);
 INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,name_ne,description_en,description_ne,price_paisa,inventory_quantity,producer,materials,return_eligible,status,review_request_id,created_at,updated_at) VALUES ('product','seller','cat','cup','CUP','Cup','Nepali name','Handmade cup','Nepali description',10000,2,'Maker','Cotton',0,'needs_changes','review',1,1);`);
 sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES ('version','seller.product-submission',1,1,'published',?,'Fixture','seller-user',1,'seller-user',1,'seller-user',1,'seed')`).run(JSON.stringify({formId:'seller.product-submission',fields:[]}));
 for(let i=0;i<4;i++)sqlite.prepare("INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES (?,'product',?,?,'image/png',100,'Cup',?,1)").run('photo'+i,'private/photo'+i,'photo'+i,i);
 const stored=new Map<string,Uint8Array>();let writes=0;
 globalThis.remediationDb=new Database(sqlite) as unknown as D1Database;globalThis.remediationSeller='seller';
 globalThis.remediationBucket={async put(key:string,stream:ReadableStream){writes++;stored.set(key,new Uint8Array(await new Response(stream).arrayBuffer()));},async delete(key:string){stored.delete(key);}} as unknown as R2Bucket;
 return {sqlite,stored,writes:()=>writes};
}
function form(requestId:string,review='review'){
 const f=new FormData();for(const [key,value] of Object.entries({requestId,reviewRequestId:review,formVersion:'1',categoryId:'cat',nameEn:'Updated cup',descriptionEn:'Handmade revised cup',price:'100',inventoryQuantity:'2',preparationDays:'1',occasionIds:'occasion'}))f.set(key,value);return f;
}
function request(body:FormData,method:'POST'|'PATCH'='PATCH'){return new Request('http://localhost/api/seller/products/product',{method,headers:{origin:'http://localhost'},body});}
void test('seller PATCH saves intentional materials additions/removals/empty and retains omitted translations through reload',async()=>{
 const f=fixture();try{
  const {PATCH}=await import('../app/api/seller/products/[id]/route');
  for(const [index,materials] of [['Cotton','Wood'],['Wood'],[]].entries()){
   const review=String(f.sqlite.prepare("SELECT review_request_id FROM products WHERE id='product'").get()?.review_request_id);
   f.sqlite.exec("UPDATE products SET status='needs_changes' WHERE id='product'");
   const body=form('materials-'+index,review);body.append('materials','');for(const material of materials)body.append('materials',material);
   const result=await PATCH(request(body),{params:Promise.resolve({id:'product'})});assert.equal(result.status,200,await result.text());
   const row=f.sqlite.prepare("SELECT materials,materials_json,name_ne,description_ne FROM products WHERE id='product'").get();
   assert.equal(row?.materials,materials.join(', '));assert.equal(row?.materials_json,JSON.stringify(materials));assert.equal(row?.name_ne,'Nepali name');assert.equal(row?.description_ne,'Nepali description');
   const audits=f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='product.resubmitted'").get()?.n;
   assert.equal((await PATCH(request(body),{params:Promise.resolve({id:'product'})})).status,200);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='product.resubmitted'").get()?.n,audits);
   globalThis.remediationSeller='outsider';assert.equal((await PATCH(request(body),{params:Promise.resolve({id:'product'})})).status,404);globalThis.remediationSeller='seller';
  }
 }finally{f.sqlite.close();}
});
void test('product upload rejects corrupt bytes before storage and saves/replays valid original bytes once',async()=>{
 const f=fixture();try{
  const {POST}=await import('../app/api/seller/products/route');const {PATCH}=await import('../app/api/seller/products/[id]/route');
  const corrupt=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'corrupt.png',{type:'image/png'});
  const invalid=form('invalid');for(let i=0;i<4;i++)invalid.append('images',corrupt);
  assert.equal((await POST(request(invalid,'POST'))).status,400);assert.equal(f.writes(),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,1);
  assert.equal((await PATCH(request(invalid),{params:Promise.resolve({id:'product'})})).status,400);assert.equal(f.writes(),0);
  const bytes=new Uint8Array(await sharp({create:{width:10,height:10,channels:3,background:'#aabbcc'}}).png().toBuffer());
  const valid=form('valid');for(let i=0;i<4;i++)valid.append('images',new File([bytes],'valid.png',{type:'image/png'}));
  const response=await POST(request(valid,'POST'));assert.equal(response.status,201,await response.clone().text());const saved=await response.json() as {id:string};
  assert.equal(f.writes(),4);assert.equal(f.stored.size,4);for(const stored of f.stored.values())assert.deepEqual(stored,bytes);
  const replay=await POST(request(valid,'POST'));assert.equal(replay.status,201);assert.equal((await replay.json() as {id:string}).id,saved.id);assert.equal(f.writes(),4);
  valid.set('nameEn','Different replay');assert.equal((await POST(request(valid,'POST'))).status,409);assert.equal(f.writes(),4);
 }finally{f.sqlite.close();}
});
