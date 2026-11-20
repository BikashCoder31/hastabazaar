import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {submitPaymentClaim} from '../lib/payments/manual-receipts';
const state={db:null as D1Database|null,bucket:null as R2Bucket|null,actor:'customer'};
(globalThis as typeof globalThis&{claimRecoveryFixture:typeof state}).claimRecoveryFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.claimRecoveryFixture.db},get MEDIA(){return globalThis.claimRecoveryFixture.bucket},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://claim-recovery.test"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.claimRecoveryFixture.actor;return{userId:id,email:id+"@local.hastabazaar.test",fullName:"Fictional actor",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;'
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
async function fixture(){const f=await manualOrderFixture();assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);f.sqlite.prepare("UPDATE users SET auth_subject=id WHERE id IN('customer','reviewer')").run();state.db=f.db;state.actor='customer';return f;}
const request=(orderId:string,requestId:string)=>new Request(`https://claim-recovery.test/api/account/payments/${orderId}/claim?attempt=${requestId}`,{headers:{'X-Hastabazaar-Actor':state.actor}});
void test('claim GET proves the original native revision after later clarification, without current-state writes or private fields',async()=>{
 const f=await fixture();try{const api=await import('../lib/payments/payment-http');
 const original={actorId:'customer',authSubject:'customer',requestId:crypto.randomUUID(),expectedRevision:null,now:Date.now()},input={orderId:f.orderId,amountPaisa:10000,paymentDate:new Date().toISOString().slice(0,10),bankReference:'PRIVATE-BANK-ORIGINAL',note:'PRIVATE-NOTE-ORIGINAL',evidenceIds:[]};
 const saved=await submitPaymentClaim(f.db,original,input);await submitPaymentClaim(f.db,{...original,requestId:crypto.randomUUID(),expectedRevision:'0'},{...input,note:'Later clarification',amountPaisa:20000});
 const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 const response=await api.customerPaymentClaim(request(f.orderId,original.requestId),f.orderId);assert.equal(response.status,200,'Historical recovery must be a supported read-only GET');const text=await response.text(),body=JSON.parse(text);assert.deepEqual(body.outcome.result,saved);assert.equal(body.outcome.reference.requestId,original.requestId);assert.doesNotMatch(text,/PRIVATE-|bankReference|note|amountPaisa/);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{state.db=null;f.dispose();}
});
void test('customer actor drift rejects private claim input before its body is read',async()=>{
 const f=await fixture();try{const api=await import('../lib/payments/payment-http'),req=new Request(`https://claim-recovery.test/api/account/payments/${f.orderId}/claim`,{method:'POST',headers:{origin:'https://claim-recovery.test','Content-Type':'application/json','X-Hastabazaar-Actor':'another-customer'},body:JSON.stringify({requestId:crypto.randomUUID(),expectedRevision:null,input:{amountPaisa:10000,paymentDate:new Date().toISOString().slice(0,10),bankReference:null,note:'Private wrong account',evidenceIds:[]}})});assert.equal((await api.customerPaymentClaim(req,f.orderId)).status,403);assert.equal(req.bodyUsed,false);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claims').get()!.n,0);
 }finally{state.db=null;f.dispose();}
});
void test('claim failures attest only a rejected current request; original nonce and historical provenance remain exact',async()=>{
 const f=await fixture();try{const api=await import('../lib/payments/payment-http');const requestId=crypto.randomUUID(),wire={requestId,expectedRevision:null,input:{amountPaisa:10000,paymentDate:'invalid',bankReference:null,note:'Fictional private note',evidenceIds:[]}};
 const post=(body:unknown)=>api.customerPaymentClaim(new Request(`https://claim-recovery.test/api/account/payments/${f.orderId}/claim`,{method:'POST',headers:{origin:'https://claim-recovery.test','Content-Type':'application/json','X-Hastabazaar-Actor':'customer'},body:JSON.stringify(body)}),f.orderId);
 const rejected=await post(wire);assert.equal(rejected.status,400);assert.equal((await rejected.json() as {notApplied:boolean}).notApplied,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claims').get()!.n,0);
 wire.input.paymentDate=new Date().toISOString().slice(0,10);const saved=await post(wire);assert.equal(saved.status,200);const first=await saved.json();const retry=await post(wire);assert.deepEqual(await retry.json(),first,'Exact retry returns the original receipt, including its recorded time');
 const collision=await post({...wire,input:{...wire.input,note:'Different private note'}});assert.equal(collision.status,409);assert.equal((await collision.json() as {notApplied?:boolean}).notApplied,undefined,'A reused nonce is not proof of an absent original command');
 f.sqlite.prepare("UPDATE audit_logs SET actor_id=NULL WHERE request_id=? AND action='manual.payment.claim.submitted'").run(requestId);assert.equal((await api.customerPaymentClaim(request(f.orderId,requestId),f.orderId)).status,409,'Missing historical provenance stays unconfirmed');
 }finally{state.db=null;f.dispose();}
});
void test('release GET retains original native outcome after current readiness changes, and denies revoked or different actors',async()=>{
 const f=await fixture();try{const p=await import('../lib/payments/manual-receipts'),api=await import('../lib/payments/claim-release-http');state.actor='reviewer';const context=(requestId:string,expectedRevision:string|null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
 const receipt=await p.recordBankReceipt(f.db,context('claim-release-bank',null),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CLAIM-RELEASE-BANK',bankAt:Date.now()-1000,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional exact buyer',payerUserId:'customer',evidenceReference:'FICTIONAL-RELEASE-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently confirmed fictional completed credit for exact order.'});
 f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='customer'").run();await p.allocateBankReceipt(f.db,context('claim-release-allocation','0'),{receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Exact original buyer and bank receipt independently confirmed.',exceptionApproval:null});assert.equal(f.sqlite.prepare('SELECT released_at FROM manual_payment_windows WHERE order_id=?').get(f.orderId)!.released_at,null);f.sqlite.prepare("UPDATE users SET status='active' WHERE id='customer'").run();
 const requestId=crypto.randomUUID(),wire={action:'release',requestId,expectedRevision:String(f.sqlite.prepare('SELECT revision FROM manual_payment_windows WHERE order_id=?').get(f.orderId)!.revision),input:{orderId:f.orderId,reason:'Independent eligible operator checks the actual original release.'}},url=`https://claim-recovery.test/api/admin/payments/orders/${f.orderId}/release`;
 const posted=await api.claimReleaseHttp(new Request(url,{method:'POST',headers:{origin:'https://claim-recovery.test','Content-Type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(wire)}),f.orderId,'release');assert.equal(posted.status,200);const saved=await posted.json() as {outcome:unknown};
 f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='customer'").run();const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 const get=()=>api.claimReleaseHttp(new Request(url+'?attempt='+requestId,{headers:{'X-Hastabazaar-Actor':'reviewer'}}),f.orderId,'release');const recovered=await get();assert.equal(recovered.status,200);assert.deepEqual((await recovered.json() as {outcome:unknown}).outcome,saved.outcome);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 assert.equal((await api.claimReleaseHttp(new Request(url+'?attempt='+requestId,{headers:{'X-Hastabazaar-Actor':'reviewer'}}),'wrong-original-source','release')).status,409);
 f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();assert.equal((await get()).status,403);
 }finally{state.db=null;f.dispose();}
});

void test('a committed claim with an unavailable recovery receipt is never attested as not applied',async()=>{
 const f=await fixture();try{
  const {fixtureWithOverrides}=await import('./helpers/fixture-delegation');
  state.db=fixtureWithOverrides(f.db,{prepare(sql:string){const statement=f.db.prepare(sql);if(!sql.startsWith('SELECT actor_id actorId,action,subject_type subjectType'))return statement;return fixtureWithOverrides(statement,{bind(...values:unknown[]){const bound=statement.bind(...values);return fixtureWithOverrides(bound,{async first<T>(){const row=await bound.first<Record<string,unknown>>();return row?{...row,actorId:null} as T:null;}});}});}});
  const api=await import('../lib/payments/payment-http'),response=await api.customerPaymentClaim(new Request(`https://claim-recovery.test/api/account/payments/${f.orderId}/claim`,{method:'POST',headers:{origin:'https://claim-recovery.test','Content-Type':'application/json','X-Hastabazaar-Actor':'customer'},body:JSON.stringify({requestId:crypto.randomUUID(),expectedRevision:null,input:{amountPaisa:10000,paymentDate:new Date().toISOString().slice(0,10),bankReference:null,note:'Fictional saved claim',evidenceIds:[]}})}),f.orderId);
  assert.equal(response.status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claims').get()!.n,1);assert.equal((await response.json() as {notApplied?:boolean}).notApplied,undefined,'An unavailable post-commit proof cannot retire a committed attempt');
 }finally{state.db=null;f.dispose();}
});
void test('optional upload recovery GET never completes a partial upload, and proves only its original saved file',async()=>{
 const f=await fixture();try{
  const {PDFDocument}=await import('pdf-lib'),document=await PDFDocument.create();document.addPage([200,200]).drawText('Fictional payment recovery evidence');const bytes=await document.save({useObjectStreams:false}),file=new File([new Uint8Array(bytes)],'PRIVATE-FICTIONAL-FILENAME.pdf',{type:'application/pdf'}),objects=new Map<string,ArrayBuffer>();let lost=true,puts=0;
  const bucket={async get(key:string){const value=objects.get(key);return value?{arrayBuffer:async()=>value.slice(0)}:null;},async put(key:string,value:ArrayBuffer){objects.set(key,value.slice(0));puts++;if(lost){lost=false;throw new Error('Object committed; acknowledgement unavailable.');}return{};}} as unknown as R2Bucket;
  state.bucket=bucket;const invalidForm=new FormData();invalidForm.set('requestId',crypto.randomUUID());invalidForm.set('file',new File(['invalid'],'invalid.txt',{type:'text/plain'}));const invalid=await (await import('../lib/payments/payment-http')).customerPaymentUpload(new Request(`https://claim-recovery.test/api/account/payments/${f.orderId}/files`,{method:'POST',headers:{origin:'https://claim-recovery.test','X-Hastabazaar-Actor':'customer'},body:invalidForm}),f.orderId);assert.equal(invalid.status,400);assert.equal((await invalid.json() as {notApplied?:boolean}).notApplied,true,'Invalid file rejection before writes must allow correcting the optional file');
  const {uploadPaymentClaimFile}=await import('../lib/payments/payment-claim-files'),{claimReleaseHttp}=await import('../lib/payments/claim-release-http'),context={actorId:'customer',authSubject:'customer',requestId:crypto.randomUUID(),expectedRevision:null,now:Date.now()};
  await assert.rejects(uploadPaymentClaimFile(f.db,bucket,context,f.orderId,file),/acknowledgement unavailable/);const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const read=()=>claimReleaseHttp(new Request(`https://claim-recovery.test/api/account/payments/${f.orderId}/files?attempt=${context.requestId}`,{headers:{'X-Hastabazaar-Actor':'customer'}}),f.orderId,'upload');assert.deepEqual(await (await read()).json(),{outcome:null});assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before,'Lookup must not reconstruct/upload bytes or create a file record');
  const saved=await uploadPaymentClaimFile(f.db,bucket,context,f.orderId,file),recorded=f.sqlite.prepare('SELECT total_changes() n').get()!.n,found=await read();assert.equal(found.status,200);assert.deepEqual((await found.json() as {outcome:{result:unknown}}).outcome.result,saved);assert.equal(puts,1);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,recorded);
 }finally{state.db=null;f.dispose();}
});
