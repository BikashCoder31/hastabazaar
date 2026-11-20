import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {requestSellerPayout} from '../lib/db/repositories/payouts';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {hasActorIntentMismatch} from '../lib/http/actor-intent';
declare global{var financeIntentDb:D1Database;var financeIntentActor:string;var financeIntentAuthority:(permission:string)=>Promise<{id:string;role:string}>;}
registerHooks({resolve(specifier,context,next){
 // This staff-only actor-intent fixture must reject before invoking a customer/provider identity path.
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){throw Error("Unexpected provider identity read in staff-only intent fixture")}',shortCircuit:true};
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.financeIntentDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://finance-intent.test"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff'||specifier==='../auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}}export async function requireStaffApi(permission){try{return await globalThis.financeIntentAuthority(permission)}catch{throw new StaffAuthorizationError("Current staff permission is required.")}}',shortCircuit:true};
 if(specifier==='../auth/customer')return{url:'data:text/javascript,export class CustomerAuthorizationError extends Error{};export async function requireExistingCustomerApi(){throw new CustomerAuthorizationError("No customer session in staff-only fixture.")}',shortCircuit:true};
 return next(specifier,context);
}});
void test('all Finance command/recovery routes reject old actor intent before private input is attributed to a new authenticated actor',async()=>{
 const f=await payoutTransferFixture();try{
  f.sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('finance-intent-b','finance-intent-b@local.hastabazaar.test','Fictional Finance B','active',?,?)").run(f.now,f.now);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('finance-intent-b','super_admin',?)").run(f.now);
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('intent-extra-earned',?,'sale',5000,1,'Independent fictional original earnings',1)").run(f.sellerId);
  const payoutRequest=await requestSellerPayout(f.db,{sellerId:f.sellerId,actorId:'payout-owner',note:'Original fictional intent request.',requestId:'intent-original-request',now:Date.now()});
  f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('intent-payout-form','staff.payout-request-action',1,'published',?,'Fictional compatible form','reviewer',?,'reviewer',?,'reviewer',?,'intent-payout-form-publish')").run(JSON.stringify({formId:'staff.payout-request-action',fields:[]}),f.now,f.now,f.now);
  globalThis.financeIntentDb=f.db;globalThis.financeIntentActor='finance-intent-b';globalThis.financeIntentAuthority=async permission=>{const proof=await staffMutationGuard(f.db,globalThis.financeIntentActor,permission as never,Error);return{id:globalThis.financeIntentActor,role:proof.role};};
  const payment=await import('../lib/payments/payment-http'),refund=await import('../app/api/admin/refunds/route'),payout=await import('../app/api/admin/payout-transfers/route'),requests=await import('../app/api/admin/payout-requests/[id]/route'),origin='https://finance-intent.test',failures:string[]=[];
  const post=(path:string,body:unknown,intent:string|null)=>new Request(origin+path,{method:'POST',headers:{origin,'Content-Type':'application/json',...(intent===null?{}:{'X-Hastabazaar-Actor':intent})},body:JSON.stringify(body)}),get=(path:string,intent:string)=>new Request(origin+path,{headers:{'X-Hastabazaar-Actor':intent}});
  const recovery=await import('../app/api/admin/recoveries/route'),evidence=await import('../lib/payments/refund-evidence-http');assert.equal((await recovery.POST(post('/api/admin/recoveries',{privateReason:'Retained original actor input'},'reviewer'))).status,403);assert.equal((await recovery.GET(get('/api/admin/recoveries?attempt=original-attempt','reviewer'))).status,403);const multipart=new Request(origin+'/api/admin/finance-evidence',{method:'POST',headers:{origin,'X-Hastabazaar-Actor':'reviewer'},body:new FormData()});let parsed=false;multipart.formData=async()=>{parsed=true;throw new Error('Must reject before private multipart parsing.');};assert.equal((await evidence.financeEvidenceUpload(multipart,'staff')).status,403);assert.equal(parsed,false);assert.equal((await evidence.financeEvidenceRead(get('/api/admin/finance-evidence?file=original-private-reference','reviewer'),'staff')).status,403);
  const bank={action:'record_bank',requestId:'intent-original-credit',expectedRevision:null,input:{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-INTENT-CREDIT',bankAt:f.now,amountMinor:100,currency:'NPR',payerReference:'Original fictional payer verified independently.',payerUserId:'customer',evidenceReference:'FICTIONAL-INTENT-BANK',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently verify this actual fictional unused credit.'}};
  if((await payment.financePaymentCommand(post('/api/admin/payments',bank,'reviewer'))).status!==403)failures.push('manual credit accepted stale actor intent');
  if((await payment.financePaymentsRead(get('/api/admin/payments','reviewer'))).status!==403)failures.push('Finance read refreshed an old view as a different actor');
  const credited=await payment.financePaymentCommand(post('/api/admin/payments',bank,'finance-intent-b'));assert.equal(credited.status,200);const receipt=await credited.json() as {id:string};
  const opening={sourceFormId:'system.refund-finance',action:'open',requestId:'intent-original-refund',expectedRevision:null,input:{kind:'receipt_return',sourceId:receipt.id,reason:'Return only this independently verified original unused payer credit.'}};
  if((await refund.POST(post('/api/admin/refunds',opening,'reviewer'))).status!==403)failures.push('refund accepted stale actor intent');
  const opened=await refund.POST(post('/api/admin/refunds',opening,'finance-intent-b'));assert.equal(opened.status,200);
  const obligation=await opened.json() as {id:string};
  const delay={sourceFormId:'system.refund-finance',action:'record_delay',requestId:'intent-refund-delay',expectedRevision:'0',input:{obligationId:obligation.id,reasonCode:'payment_details_needed',nextUpdateAt:Date.now()+3600000,reason:'The original verified destination is still missing.'}};
  assert.equal((await refund.POST(post('/api/admin/refunds',delay,'reviewer'))).status,403);
  assert.equal((await refund.POST(post('/api/admin/refunds',delay,'finance-intent-b'))).status,200);
  const delayReceipt=await(await refund.GET(get('/api/admin/refunds?attempt='+delay.requestId,'finance-intent-b'))).json() as {outcome:{id:string;revision:number}};
  assert.deepEqual(delayReceipt.outcome,{id:obligation.id,revision:1});
  if((await refund.GET(get('/api/admin/refunds?attempt='+opening.requestId,'reviewer'))).status!==403)failures.push('refund recovery treated a different actor as the original actor');
  assert.equal((await refund.GET(get('/api/admin/refunds?attempt='+opening.requestId,'finance-intent-b'))).status,200);
  const preparation={sourceFormId:'system.payout-finance',action:'prepare',requestId:'intent-original-payout',expectedRevision:null,input:{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Bind the actual original eligible earnings and verified source.'}};
  if((await payout.POST(post('/api/admin/payout-transfers',preparation,'reviewer'))).status!==403)failures.push('payout accepted stale actor intent');
  assert.equal((await payout.POST(post('/api/admin/payout-transfers',preparation,'finance-intent-b'))).status,200);
  if((await payout.GET(get('/api/admin/payout-transfers?attempt='+preparation.requestId,'reviewer'))).status!==403)failures.push('payout recovery accepted stale actor intent');
  const decision={action:'reject',note:'Independent review rejects only this original fictional request.',requestId:'intent-request-decision',formVersion:1,customAnswers:[]};
  if((await requests.POST(post('/api/admin/payout-requests/'+payoutRequest,decision,'reviewer'),{params:Promise.resolve({id:payoutRequest})})).status!==403)failures.push('payout request decision accepted stale actor intent');
  assert.equal((await requests.POST(post('/api/admin/payout-requests/'+payoutRequest,decision,'finance-intent-b'),{params:Promise.resolve({id:payoutRequest})})).status,200);
  assert.equal((await requests.GET(get('/api/admin/payout-requests/'+payoutRequest+'?attempt='+decision.requestId,'reviewer'),{params:Promise.resolve({id:payoutRequest})})).status,403);
  const recovered=await requests.GET(get('/api/admin/payout-requests/'+payoutRequest+'?attempt='+decision.requestId,'finance-intent-b'),{params:Promise.resolve({id:payoutRequest})});assert.equal(recovered.status,200);assert.equal((await recovered.json() as {outcome:{id:string}}).outcome.id,payoutRequest);
  globalThis.financeIntentActor='customer';assert.equal((await payment.financePaymentCommand(post('/api/admin/payments',bank,'customer'))).status,403);
  assert.deepEqual(failures,[]);
 }finally{f.dispose();}
});

void test('actor intent is exact, absent-compatible and distinguishes a retained guest view',()=>{
 const request=(intent?:string)=>new Request('https://finance-intent.test',{headers:intent===undefined?{}:{'X-Hastabazaar-Actor':intent}});
 assert.equal(hasActorIntentMismatch(request(),'operator'),false);assert.equal(hasActorIntentMismatch(request('operator'),'operator'),false);assert.equal(hasActorIntentMismatch(request('OPERATOR'),'operator'),true);assert.equal(hasActorIntentMismatch(request(''),null),false);assert.equal(hasActorIntentMismatch(request(''),'new-account'),true);assert.equal(hasActorIntentMismatch(request('operator'),null),true);
});
