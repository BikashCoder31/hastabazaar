import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {publishedOfferFixture} from './helpers/public-offer-fixture';
import {getProductPublicationReview} from '../lib/products/publication';
declare global {var historyHttpDb:D1Database;var historyHttpActor:string|null;var historyHttpPermissions:string[];}
registerHooks({resolve(specifier,context,next){const source=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.historyHttpDb}}':specifier==='@/lib/auth/staff'?"export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){if(!globalThis.historyHttpActor)throw new StaffAuthorizationError('Sign in',401);if(!globalThis.historyHttpPermissions.includes(permission))throw new StaffAuthorizationError('Permission unavailable',403);return {id:globalThis.historyHttpActor}}":null;return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);}});
void test('review workspace HTTP captures an actual public orderable price, rejects injected authority and recovers its exact observation',async()=>{
 const f=await publishedOfferFixture();globalThis.historyHttpDb=f.db;globalThis.historyHttpActor='reviewer';globalThis.historyHttpPermissions=['product.review'];try{
  const route=await import('../app/api/admin/product-publications/route'),url='http://localhost:3018/api/admin/product-publications',view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),input={action:'observe_price',requestId:'http-native-price-observation',expectedRevision:String(view.offerRevision),caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),publicVersionId:f.approved.versionId,offerId:'medium',reason:'Record the genuine current orderable selling offer for later independent review.'};
  const post=(body:unknown,origin='http://localhost:3018')=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await route.POST(post(input,'https://foreign.example'))).status,403);assert.equal((await route.POST(post({...input,sellerId:'registered'}))).status,400);assert.equal((await route.POST(post({...input,observedAt:f.now}))).status,400);
  globalThis.historyHttpActor='registered-owner';assert.equal((await route.POST(post(input))).status,403);globalThis.historyHttpActor='reviewer';
  const response=await route.POST(post(input));assert.equal(response.status,200,await response.clone().text());const recorded=await response.json() as {id:string};assert.deepEqual(await(await route.POST(post(input))).json(),recorded);
  const read=await route.GET(new Request(url+'?caseId='+f.sent.caseId));assert.equal(read.status,200);const after=await read.json() as Awaited<ReturnType<typeof getProductPublicationReview>>;assert.equal(after.priceHistory.length,1);assert.equal(after.priceHistory[0].id,recorded.id);assert.equal(after.priceHistory[0].sellingPaisa,80000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_price_reference_reviews').get()!.n,0,'Capturing history never approves a comparison.');
 }finally{f.dispose();}
});
