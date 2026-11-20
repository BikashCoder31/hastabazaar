import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {completeVersionFixture} from './helpers/complete-version-fixture';

declare global {var sellerPageDb:D1Database;var sellerPageUserId:string;var sellerPageElement:typeof createElement;}
globalThis.sellerPageElement=createElement;
registerHooks({resolve(specifier,context,next){
 if(specifier.endsWith('.css'))return{url:'data:text/javascript,export default {}',shortCircuit:true};
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.sellerPageDb}}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:globalThis.sellerPageUserId}};export async function requireAuthenticatedUser(){return{userId:globalThis.sellerPageUserId}};export function signInPath(path){return "/sign-in?returnTo="+encodeURIComponent(path)};export function signOutPath(path="/"){return "/sign-out?returnTo="+encodeURIComponent(path)}',shortCircuit:true};
 if(specifier==='next/link')return{url:'data:text/javascript,export default function Link({children,...props}){return globalThis.sellerPageElement("a",props,children)}',shortCircuit:true};
 if(specifier==='next/image')return{url:'data:text/javascript,export default function Image({fill,priority,unoptimized,...props}){return globalThis.sellerPageElement("img",props)}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(url){throw new Error("Fixture redirect: "+url)};export function useRouter(){return{refresh(){}}};export function usePathname(){return "/seller"};export function useSearchParams(){return new URLSearchParams()}',shortCircuit:true};
 return next(specifier,context);
}});

void test('actual Seller Home, Requests and Finance mount one original payout identity and truthful native destination',async()=>{
 const f=await completeVersionFixture(Date.now());try{globalThis.sellerPageDb=f.db;globalThis.sellerPageUserId='registered-owner';
  const home=await import('../app/seller/page'),requests=await import('../app/seller/requests/page'),finance=await import('../app/seller/finance/page');
  const homeHtml=renderToStaticMarkup(await home.default()),requestHtml=renderToStaticMarkup(await requests.default({searchParams:Promise.resolve({view:'all'})})),financeHtml=renderToStaticMarkup(await finance.default());
  for(const html of [homeHtml,requestHtml]){assert.match(html,/legacy-payout/);assert.match(html,/Waiting for Hastabazaar/);assert.match(html,/href="\/seller\/finance#payout-request-legacy-payout"/);assert.doesNotMatch(html,/private_reason|processingNote|evidence_reference/);}
  assert.match(homeHtml,/Your next tasks/);assert.match(requestHtml,/Current work/);assert.match(requestHtml,/All records/);assert.match(financeHtml,/id="payout-request-legacy-payout"/);
 }finally{f.dispose();}
});

void test('actual Home rejects an offboard during its last private product and earnings reads',async()=>{
 const f=await completeVersionFixture(Date.now());try{globalThis.sellerPageUserId='registered-owner';let changed=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{if(!changed&&sql.includes('SELECT COUNT(*) AS total,')){changed=true;f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();}return f.db.prepare(sql);};globalThis.sellerPageDb=db;
  const home=await import('../app/seller/page');await assert.rejects(home.default(),/access|changed|owner|viewer/i);assert.equal(changed,true);
 }finally{f.dispose();}
});
