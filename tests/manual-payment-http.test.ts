import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {PDFDocument} from 'pdf-lib';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
declare global{var paymentHttpDb:D1Database;var paymentHttpBucket:R2Bucket;var paymentHttpActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(url){throw Error(url)}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){const id=globalThis.paymentHttpActor;return{userId:id,email:id+"@local.hastabazaar.test",fullName:"Fictional payment actor",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',shortCircuit:true};
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.paymentHttpDb},get MEDIA(){return globalThis.paymentHttpBucket}}',shortCircuit:true};
 return next(specifier,context);
}});
const origin='https://manual-payment.test';
const request=(body:unknown,from=origin)=>new Request(origin+'/api/payment',{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
void test('protected payment HTTP uses the real owner/Finance authority, optional claims, unchanged retries and recoverable private evidence',async()=>{
 const f=await manualOrderFixture();try{
  globalThis.paymentHttpDb=f.db;globalThis.paymentHttpActor='customer';f.sqlite.prepare("UPDATE users SET auth_subject=id WHERE id IN('customer','foreign','delegate','reviewer')").run();
  const objects=new Map<string,ArrayBuffer>();let lost=true,puts=0;
  globalThis.paymentHttpBucket={async get(key:string){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.slice(0),body:new Response(bytes.slice(0)).body}:null;},async put(key:string,value:ArrayBuffer){objects.set(key,value.slice(0));puts++;if(lost){lost=false;throw new Error('Fictional object saved before acknowledgement was lost.');}return{};}} as unknown as R2Bucket;
  const api=await import('../lib/payments/payment-http'),read=()=>api.customerPaymentRead(new Request(origin),f.orderId);
  assert.equal((await read()).status,200);globalThis.paymentHttpActor='foreign';assert.equal((await read()).status,403);globalThis.paymentHttpActor='customer';
  const date=new Date(f.now).toISOString().slice(0,10),command={requestId:'http-optional-claim',expectedRevision:null,input:{amountPaisa:f.order.grandTotalPaisa,paymentDate:date}};
  assert.equal((await api.customerPaymentClaim(request(command,'https://untrusted.test'),f.orderId)).status,403);
  assert.equal((await api.customerPaymentClaim(request({...command,actorId:'reviewer'}),f.orderId)).status,400);
  assert.equal((await api.customerPaymentClaim(request({...command,input:{...command.input,paymentDate:'2026-99-99'}}),f.orderId)).status,400);
  const first=await api.customerPaymentClaim(request(command),f.orderId);assert.equal(first.status,200);const original=await first.json();assert.deepEqual(await (await api.customerPaymentClaim(request(command),f.orderId)).json(),original);
  assert.equal((await api.customerPaymentClaim(request({...command,input:{...command.input,amountPaisa:1}}),f.orderId)).status,409);
  assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)!.payment_status,'unpaid');
  const document=await PDFDocument.create();document.addPage([200,200]).drawText('Fictional isolated payment evidence');const bytes=await document.save({useObjectStreams:false}),upload=()=>{const body=new FormData();body.set('requestId','http-private-file-attempt');body.set('file',new File([new Uint8Array(bytes)],'fictional-proof.pdf',{type:'application/pdf'}));return new Request(origin+'/api/payment/files',{method:'POST',headers:{origin},body});};
  assert.equal((await api.customerPaymentUpload(upload(),f.orderId)).status,503);assert.equal(objects.size,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claim_files').get()!.n,0);
  const recovery=new FormData();recovery.set('requestId','http-private-file-attempt');const recovered=await api.customerPaymentUpload(new Request(origin+'/api/payment/files',{method:'POST',headers:{origin},body:recovery}),f.orderId);assert.equal(recovered.status,200);const file=await recovered.json() as {id:string};assert.equal(puts,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claim_files').get()!.n,1);
  const proof=await api.paymentFileRead(new Request(origin),file.id,'customer');assert.equal(proof.status,200);assert.match(proof.headers.get('Cache-Control')! ,/no-store/);assert.match(proof.headers.get('Content-Security-Policy')!,/sandbox/);assert.deepEqual(new Uint8Array(await proof.arrayBuffer()),bytes);
  globalThis.paymentHttpActor='foreign';assert.equal((await api.paymentFileRead(new Request(origin),file.id,'customer')).status,404);globalThis.paymentHttpActor='delegate';assert.equal((await api.paymentFileRead(new Request(origin),file.id,'finance')).status,403);assert.equal((await api.financePaymentsRead(new Request(origin))).status,403);
  globalThis.paymentHttpActor='reviewer';assert.equal((await api.paymentFileRead(new Request(origin),file.id,'finance')).status,200);const finance=await api.financePaymentsRead(new Request(origin));assert.equal(finance.status,200);const workspace=await finance.json() as {claims:Array<{id:string}>;tasks:Array<{sourceType:string}>};assert.equal(workspace.claims.length,1);assert.ok(workspace.tasks.some(task=>task.sourceType==='payment_claim'));
 }finally{f.dispose();}
});
