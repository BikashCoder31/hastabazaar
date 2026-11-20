import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {productPublicationFixture} from './helpers/product-publication-fixture';

declare global{var productReadPageDb:D1Database;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.productReadPageDb}}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:"reviewer"}};export async function requireAuthenticatedUser(){return{userId:"reviewer"}};export function signInPath(path){return "/sign-in?returnTo="+encodeURIComponent(path)}',shortCircuit:true};
 if(specifier==='next/link')return{url:'data:text/javascript,export default function Link(){return null}',shortCircuit:true};
 if(specifier==='next/image')return{url:'data:text/javascript,export default function Image(){return null}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(path){throw new Error("Fixture redirect: "+path)};export function useRouter(){return{refresh(){}}};export function usePathname(){return "/admin/products/intakes"};export function useSearchParams(){return new URLSearchParams()}',shortCircuit:true};
 return next(specifier,context);
}});

void test('the actual assistance page must read private work after its last category and query awaits',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{let changed=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM categories')&&sql.includes('is_active')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!changed){changed=true;f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='reviewer'").run();}return result;})as D1PreparedStatement['all'];}return statement;};globalThis.productReadPageDb=db;
  const page=await import('../app/admin/products/intakes/[id]/page');
  await assert.rejects(page.default({params:Promise.resolve({id:f.sent.caseId}),searchParams:Promise.resolve({returnTo:'/admin/products/intakes'})}),/access|current|staff|permission|sign-in|reviewer/i);assert.equal(changed,true);
 }finally{f.dispose();}
});
