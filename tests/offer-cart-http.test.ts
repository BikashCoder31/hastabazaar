import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {publishedOfferFixture} from './helpers/public-offer-fixture';
import {CART_COOKIE} from '../lib/cart/session';
import {getPublicOfferSet} from '../lib/products/public-offers';
declare global {var offerCartHttpDb:D1Database;}
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.offerCartHttpDb}}',shortCircuit:true};return next(specifier,context);}});
void test('actual cart handlers enforce exact choices, origin, closed fields, cookie recovery and foreign-cart boundaries',async()=>{
 const f=await publishedOfferFixture(),old=process.env.APP_ORIGIN;try{process.env.APP_ORIGIN='http://localhost:3018';globalThis.offerCartHttpDb=f.db;const api=await import('../app/api/cart/route'),origin='http://localhost:3018',set=await getPublicOfferSet(f.db,f.productId);assert.ok(set);
 const identity=await api.GET(new Request(origin+'/api/cart',{headers:{cookie:CART_COOKIE+'=x'}})),cookie=identity.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);const input={productId:f.productId,offerId:'medium',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:80000,quantity:1,requestId:'http-cart-medium-request'};
 const request=(method:string,body:unknown,token=cookie)=>new Request(origin+'/api/cart',{method,headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin',cookie:token},body:JSON.stringify(body)});
 for(const bad of [{...input,sellerId:'registered'},{...input,photo:'private/file'},{...input,discount:100},[]])assert.equal((await api.POST(request('POST',bad))).status,400);
 for(const bad of [{...input,pricePaisa:1},{...input,offerId:'small',pricePaisa:60000},{...input,versionId:'stale-version'},{productId:f.productId,quantity:1}])assert.equal((await api.POST(request('POST',bad))).status,409);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cart_offer_lines').get()!.n,0);
 const accepted=await api.POST(request('POST',input));assert.equal(accepted.status,200);const cart=await accepted.json() as {items:{id:string;revision:number}[];itemCount:number};assert.equal(cart.itemCount,1);assert.equal((await api.POST(request('POST',input))).status,200);assert.equal((await api.POST(request('POST',{...input,quantity:2}))).status,409);
 const other=await api.GET(new Request(origin+'/api/cart')),foreign=other.headers.get('set-cookie')!.split(';')[0],line=cart.items[0],update={itemId:line.id,quantity:2,revision:line.revision,requestId:'http-cart-update-request'};
 assert.equal((await api.PATCH(request('PATCH',update,foreign))).status,409);assert.equal((await api.PATCH(request('PATCH',{...update,pricePaisa:1}))).status,400);assert.equal((await api.PATCH(request('PATCH',update))).status,200);assert.equal((await api.PATCH(request('PATCH',update))).status,200);assert.equal(f.sqlite.prepare('SELECT quantity FROM cart_offer_lines').get()!.quantity,2);
 assert.equal((await api.DELETE(request('DELETE',{itemId:line.id},foreign))).status,200);assert.equal(f.sqlite.prepare('SELECT quantity FROM cart_offer_lines').get()!.quantity,2);
 const cross=new Request(origin+'/api/cart',{method:'POST',headers:{origin:'https://foreign.invalid','sec-fetch-site':'cross-site','content-type':'application/json',cookie},body:JSON.stringify({...input,requestId:'cross-origin-cart-request'})});assert.equal((await api.POST(cross)).status,403);assert.equal(f.sqlite.prepare('SELECT quantity FROM cart_offer_lines').get()!.quantity,2);
 }finally{f.dispose();if(old===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=old;}
});
