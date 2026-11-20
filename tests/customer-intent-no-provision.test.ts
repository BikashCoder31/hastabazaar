import './helpers/care-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {publicCheckoutFixture} from './helpers/public-checkout-fixture';
import {CART_COOKIE,RECEIPT_COOKIE} from '../lib/cart/session';

// Keep actual transactions/outbox, never invoke a provider from these native receiver tests.
registerHooks({resolve(specifier,context,next){if(specifier==='@/lib/email/send-order-updates')return{url:'data:text/javascript,export async function sendPendingOrderUpdates(){}',shortCircuit:true};return next(specifier,context);}});
const origin='https://care-scope.test';

void test('wrong-intent fresh authentication cannot provision users or customer roles through any native checkout/care receiver',async()=>{
 const f=await publicCheckoutFixture();try{
  globalThis.careBrowserDb=f.db;
  const ordersBefore=f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n;
  const checkout=await import('../app/api/checkout/route'),returns=await import('../app/orders/[orderNumber]/returns/route'),complaints=await import('../app/orders/[orderNumber]/complaints/route'),returnReply=await import('../app/orders/[orderNumber]/returns/[id]/reply/route'),complaintReply=await import('../app/orders/[orderNumber]/complaints/[id]/reply/route'),cancel=await import('../app/orders/[orderNumber]/cancel/route'),context={params:Promise.resolve({orderNumber:'FICTIONAL-ORIGINAL-ORDER',id:'FICTIONAL-ORIGINAL-CASE'})};
  const targets=[['checkout',(request:Request)=>checkout.POST(request)],['return',(request:Request)=>returns.POST(request,context)],['complaint',(request:Request)=>complaints.POST(request,context)],['return-reply',(request:Request)=>returnReply.POST(request,context)],['complaint-reply',(request:Request)=>complaintReply.POST(request,context)],['cancellation',(request:Request)=>cancel.POST(request,context)]]as const,failures:string[]=[];
  for(const[name,call]of targets){
   globalThis.careBrowserIdentity={userId:'fresh-subject-'+name,email:'fresh-'+name+'@local.hastabazaar.test'};
   const before=f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,roles=f.sqlite.prepare('SELECT COUNT(*) n FROM user_roles').get()!.n;
   const response=await call(new Request(origin+'/api/'+name,{method:'POST',headers:{origin,'content-type':'application/json',cookie:CART_COOKIE+'='+f.token,'X-Hastabazaar-Actor':'customer'},body:JSON.stringify(name==='checkout'?f.body:{})}));
   assert.equal(response.status,403,name+': '+await response.text());
   if(f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n!==before||f.sqlite.prepare('SELECT COUNT(*) n FROM user_roles').get()!.n!==roles)failures.push(name+' provisioned a new identity or role before rejecting old actor intent');
  }
  assert.deepEqual(failures,[]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,ordersBefore);
 }finally{globalThis.careBrowserIdentity=undefined;f.dispose();}
});

void test('explicit empty receipt intent permits a genuine guest without provisioning a newly authenticated principal',async()=>{
 const f=await publicCheckoutFixture();try{
  globalThis.careBrowserDb=f.db;globalThis.careBrowserIdentity={userId:'customer',email:'customer@local.hastabazaar.test'};
  const checkout=await import('../app/api/checkout/route'),placed=await checkout.POST(new Request(origin+'/api/checkout',{method:'POST',headers:{origin,'content-type':'application/json',cookie:CART_COOKIE+'='+f.token,'X-Hastabazaar-Actor':'customer'},body:JSON.stringify(f.body)}));assert.equal(placed.status,201,await placed.clone().text());const orderNumber=(await placed.json()as{orderNumber:string}).orderNumber;
  const cancel=await import('../app/orders/[orderNumber]/cancel/route'),request=()=>new Request(origin+'/orders/'+orderNumber+'/cancel',{headers:{cookie:RECEIPT_COOKIE+'='+f.body.idempotencyKey,'X-Hastabazaar-Actor':''}}),context={params:Promise.resolve({orderNumber})};
  globalThis.careBrowserIdentity=null;const guest=await cancel.GET(request(),context);assert.equal(guest.status,200,await guest.text());
  const users=f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,roles=f.sqlite.prepare('SELECT COUNT(*) n FROM user_roles').get()!.n;
  globalThis.careBrowserIdentity={userId:'new-authenticated-subject',email:'new-authenticated@local.hastabazaar.test'};
  const denied=await cancel.GET(request(),context);assert.equal(denied.status,403,await denied.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,users);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM user_roles').get()!.n,roles);
 }finally{globalThis.careBrowserIdentity=undefined;f.dispose();}
});
