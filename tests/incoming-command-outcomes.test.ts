import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {createStaffInvitation} from '../lib/db/repositories/staff';

const state={db:null as D1Database|null,actor:'reviewer',email:'reviewer@local.hastabazaar.test'};
(globalThis as typeof globalThis&{incomingOutcomeFixture:typeof state}).incomingOutcomeFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.incomingOutcomeFixture.db},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://incoming-outcome.test"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.incomingOutcomeFixture.actor,email:globalThis.incomingOutcomeFixture.email,fullName:"Fictional incoming reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
async function fixture(){const f=await manualOrderFixture();assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));f.sqlite.prepare("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'").run();state.db=f.db;state.actor='reviewer';state.email='reviewer@local.hastabazaar.test';return f;}
function read(reference:{action:string;sourceId:string;requestId:string},actor=state.actor){return new Request('https://incoming-outcome.test/api/admin/payments?'+new URLSearchParams({attempt:reference.requestId,action:reference.action,source:reference.sourceId}),{headers:{'X-Hastabazaar-Actor':actor}});}
function identitySnapshot(f:Awaited<ReturnType<typeof fixture>>){return Object.fromEntries(['users','user_roles','staff_invitations'].map(table=>[table,createHash('sha256').update(JSON.stringify(f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).digest('hex')]));}

void test('Incoming exposes only the original native recorded outcome and an authorized unrecorded result',async()=>{
 const f=await fixture();try{
  const api=await import('../lib/payments/payment-http'),reference={action:'record_bank',sourceId:f.accountVersionId,requestId:'incoming-original-bank'};
  const absent=await api.financePaymentsRead(read(reference));assert.equal(absent.status,200);const missing=await absent.json() as Record<string,unknown>;assert.equal(Object.hasOwn(missing,'outcome'),true,'Saved-attempt GET must not substitute the broad private workspace.');assert.equal(missing.outcome,null);
  const result=await recordBankReceipt(f.db,{actorId:'reviewer',requestId:reference.requestId,expectedRevision:null,now:Date.now()},{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-PRIVATE-BANK-ORIGINAL',bankAt:Date.now()-1000,amountMinor:50000,currency:'NPR',payerReference:'FICTIONAL-PRIVATE-PAYER',payerUserId:'customer',evidenceReference:'FICTIONAL-PRIVATE-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently confirmed fictional completed bank credit.'});
  const response=await api.financePaymentsRead(read(reference));assert.equal(response.status,200);const body=await response.text();const value=JSON.parse(body) as {outcome:{entity:{kind:string;id:string};recordedAt:number}};assert.equal(value.outcome.entity.kind,'receipt');assert.equal(value.outcome.entity.id,result.id);assert.ok(Number.isSafeInteger(value.outcome.recordedAt));assert.doesNotMatch(body,/FICTIONAL-PRIVATE|amount|evidence|payer|command_result_json/i);
  const wrong=await api.financePaymentsRead(read({...reference,sourceId:'wrong-account-source'}));assert.notEqual(wrong.status,200);
 }finally{state.db=null;f.dispose();}
});
void test('Incoming read and old actor POST never accept a pending invitation as a side effect',async()=>{
 const f=await fixture();try{
  state.email='incoming-invited@local.hastabazaar.test';await createStaffInvitation(f.db,{email:state.email,role:'super_admin',permissions:[],invitedBy:'reviewer',actorAuthSubject:'reviewer',now:Date.now(),requestId:'incoming-pending-invite'});state.actor='incoming-pending-subject';const before=identitySnapshot(f),api=await import('../lib/payments/payment-http');
  const response=await api.financePaymentsRead(new Request('https://incoming-outcome.test/api/admin/payments'));assert.equal(response.status,403);assert.deepEqual(identitySnapshot(f),before);
  const fileRead=await api.paymentFileRead(new Request('https://incoming-outcome.test/api/admin/payments/files/fictional-unknown'),'fictional-unknown','finance');assert.deepEqual(identitySnapshot(f),before,'Private evidence GET cannot accept a pending invitation or create identities.');assert.equal(fileRead.status,403);
  const post=await api.financePaymentCommand(new Request('https://incoming-outcome.test/api/admin/payments',{method:'POST',headers:{origin:'https://incoming-outcome.test','content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify({action:'record_bank',requestId:'incoming-old-actor',expectedRevision:null,input:{}})}));assert.equal(post.status,403);assert.deepEqual(identitySnapshot(f),before);
 }finally{state.db=null;f.dispose();}
});

void test('actual allocation and fulfillment release recover by original native facts, with nonce-only legacy proof',async()=>{
 const f=await fixture();try{
  const p=await import('../lib/payments/manual-receipts'),outcomes=await import('../lib/payments/incoming-command-outcomes');
  const context=(requestId:string,expectedRevision:string|null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
  const receipt=await p.recordBankReceipt(f.db,context('incoming-release-bank',null),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-RELEASE-BANK',bankAt:Date.now()-1000,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional exact buyer',payerUserId:'customer',evidenceReference:'FICTIONAL-RELEASE-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently confirmed fictional completed credit for exact order.'});
  // An existing paid order waits while its customer is temporarily unavailable; this isolated fixture later restores that availability.
  f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='customer'").run();
  const allocation=await p.allocateBankReceipt(f.db,context('incoming-release-allocation','0'),{receiptId:receipt.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Exact original buyer and bank receipt independently confirmed.',exceptionApproval:null});
  const waiting=f.sqlite.prepare("SELECT released_at FROM manual_payment_windows WHERE order_id=?").get(f.orderId);assert.ok(waiting);assert.equal(waiting.released_at,null);
  f.sqlite.prepare("UPDATE users SET status='active' WHERE id='customer'").run();
  const revision=String(f.sqlite.prepare('SELECT revision FROM manual_payment_windows WHERE order_id=?').get(f.orderId)!.revision);
  await p.releasePaidManualOrder(f.db,context('incoming-release-fulfillment',revision),{orderId:f.orderId,reason:'Independent eligible operator confirms actual paid-order release.'});
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const allocated=await outcomes.readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'allocate',sourceId:receipt.id,requestId:'incoming-release-allocation'});assert.deepEqual(allocated?.entity,{kind:'allocation',id:allocation.id});
  const released=await outcomes.readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'release',sourceId:f.orderId,requestId:'incoming-release-fulfillment'});assert.deepEqual(released?.entity,{kind:'order',id:f.orderId});
  const probed=await outcomes.probeIncomingCommandOutcome(f.db,'reviewer','incoming-release-fulfillment');assert.equal(probed?.reference.action,'release');assert.equal(probed?.reference.sourceId,f.orderId);assert.deepEqual(probed?.outcome,released);
  assert.equal(await outcomes.probeIncomingCommandOutcome(f.db,'reviewer','incoming-unproven-legacy'),null);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before,'All original outcome/probe reads must remain read-only.');
 }finally{state.db=null;f.dispose();}
});

void test('claim review, actual bank return, company cash and exception triage each recover their exact native outcome',async()=>{
 const f=await fixture();try{
  const p=await import('../lib/payments/manual-receipts'),o=await import('../lib/payments/incoming-command-outcomes'),context=(requestId:string,expectedRevision:string|null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
  const claim=await p.submitPaymentClaim(f.db,{...context('incoming-customer-claim',null),actorId:'customer'},{orderId:f.orderId,amountPaisa:50000,paymentDate:new Date().toISOString().slice(0,10),bankReference:null,note:'Fictional customer claim requiring independent review.',evidenceIds:[]});
  await p.reviewPaymentClaim(f.db,context('incoming-claim-review','0'),{orderId:f.orderId,action:'needs_information',reason:'Request independent clarification without asserting a completed bank credit.',expectedWindowRevision:1});
  const reviewed=await o.readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'review_claim',sourceId:f.orderId,requestId:'incoming-claim-review'});assert.deepEqual(reviewed?.entity,{kind:'claim',id:claim.id});
  const receipt=await p.recordBankReceipt(f.db,context('incoming-return-bank',null),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-RETURN-BANK',bankAt:Date.now()-1000,amountMinor:50000,currency:'NPR',payerReference:'Fictional independently checked payer',payerUserId:'customer',evidenceReference:'FICTIONAL-RETURN-CREDIT-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:[],reason:'Actual fictional completed credit independently verified before recording.'});
  const reversal=await (await import('../lib/payments/receipt-corrections')).recordReceiptReversal(f.db,context('incoming-return-recorded','0'),{receiptId:receipt.id,amountMinor:1000,transactionIdentity:'FICTIONAL-RETURN-REVERSAL',bankAt:Date.now(),evidenceReference:'FICTIONAL-ACTUAL-RETURN-EVIDENCE',reason:'Actual returned bank credit retained separately from its original receipt.'});
  assert.deepEqual((await o.readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'record_reversal',sourceId:receipt.id,requestId:'incoming-return-recorded'}))?.entity,{kind:'reversal',id:reversal.id});
  const cash=await (await import('../lib/payments/cash-receipts')).recordCompanyCashReceipt(f.db,context('incoming-actual-cash',null),{handoverIdentity:'FICTIONAL-PRIVATE-HANDOVER',collectorName:'Fictional independent collector',collectorUserId:null,custodyReference:'FICTIONAL-AUTHORIZED-CUSTODY',amountPaisa:2500,occurredAt:Date.now()-1000,evidenceReference:'FICTIONAL-CASH-EVIDENCE',actualHandoverConfirmed:true,reason:'Actual fictional company cash received under independently verified custody.'});
  const cashOutcome=await o.readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'record_cash',sourceId:'incoming-actual-cash',requestId:'incoming-actual-cash'});assert.deepEqual(cashOutcome?.entity,{kind:'receipt',id:cash.id});assert.doesNotMatch(JSON.stringify(cashOutcome),/PRIVATE-HANDOVER|collector|custody|amount|evidence/i);
  const row=f.sqlite.prepare("SELECT id,revision FROM manual_payment_exceptions WHERE receipt_id=? AND state<>'resolved' ORDER BY created_at,id LIMIT 1").get(receipt.id);assert.ok(row);const exceptionId=String(row.id);
  await (await import('../lib/payments/exception-review')).triagePaymentException(f.db,context('incoming-original-triage',String(row.revision)),{exceptionId,ownerId:'reviewer',backupId:null,waiting:true,nextUpdateAt:Date.now()+3600000,note:'Independent reviewer owns this original retained exception and next update.'});
  assert.deepEqual((await o.readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'triage_exception',sourceId:exceptionId,requestId:'incoming-original-triage'}))?.entity,{kind:'exception',id:exceptionId});
  assert.equal(await o.probeIncomingCommandOutcome(f.db,'reviewer','incoming-unproven-other-actor'),null);
 }finally{state.db=null;f.dispose();}
});

void test('deduction-only actual COD outcome points to its real parcel, never a nonexistent cash allocation',async()=>{
 const f=await manualOrderFixture({method:'cod'});try{
  const now=Date.now(),jobId='incoming-cost-only-parcel',total=f.order.grandTotalPaisa,seller=f.sqlite.prepare('SELECT seller_id FROM order_items WHERE order_id=?').get(f.orderId);assert.ok(seller);
  f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid' WHERE id=?").run(f.orderId);
  f.sqlite.prepare("INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at) VALUES(?,?,?,'outbound','delivered','reviewer','incoming-cost-only-job',?,?)").run(jobId,f.orderId,seller.seller_id,now,now);
  f.sqlite.prepare("INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,method,courier_name,delivered_at,created_at) VALUES(?,?,?,0,'courier','Fictional courier',?,?)").run(jobId,total,total,now,now);
  f.sqlite.prepare("INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at) VALUES('incoming-original-collection',?,'collection',?,'FICTIONAL-COLLECTION-EVIDENCE','posted','reviewer',?)").run(jobId,total,now);
  f.sqlite.prepare("INSERT INTO parcel_courier_costs(id,shipping_job_id,amount_paisa,evidence_reference,created_by,note,created_at) VALUES('incoming-actual-company-cost',?,?,'FICTIONAL-ORIGINAL-CARRIER-INVOICE','reviewer','Actual company carrier cost under original terms',?)").run(jobId,total,now);
  await (await import('../lib/payments/cod-reconciliation')).reconcileCodReceipt(f.db,{actorId:'reviewer',requestId:'incoming-cost-only-recorded',expectedRevision:'0',now},{jobId,receiptId:null,expectedReceiptRevision:null,amountPaisa:0,cashRecordId:null,deductions:[{courierCostId:'incoming-actual-company-cost',amountPaisa:total,termsEvidence:'FICTIONAL-ORIGINAL-COMPANY-CARRIER-TERMS'}],evidenceReference:'FICTIONAL-APPROVED-COMPANY-COST',reason:'Actual company cost disposition without inventing a bank or cash receipt.'});
  const outcome=await (await import('../lib/payments/incoming-command-outcomes')).readIncomingCommandOutcome(f.db,'reviewer',{version:1,actorId:'reviewer',action:'reconcile_cod',sourceId:jobId,requestId:'incoming-cost-only-recorded'});assert.deepEqual(outcome?.entity,{kind:'parcel',id:jobId});
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM cod_company_receipt_allocations').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_money_receipts').get()!.n,0);
 }finally{f.dispose();}
});

void test('equally eligible actor switch rejects original Incoming intent before reading private input or changing identities',async()=>{
 const f=await fixture();try{
  const now=Date.now();f.sqlite.prepare("INSERT INTO users(id,auth_subject,display_name,email,status,created_at,updated_at) VALUES('incoming-known-b','incoming-known-b','Fictional already eligible B','incoming-known-b@local.hastabazaar.test','active',?,?)").run(now,now);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('incoming-known-b','super_admin',?)").run(now);
  state.actor='incoming-known-b';state.email='incoming-known-b@local.hastabazaar.test';const before=identitySnapshot(f),auditBefore=f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n,api=await import('../lib/payments/payment-http');
  const oldRequest=new Request('https://incoming-outcome.test/api/admin/payments',{method:'POST',headers:{origin:'https://incoming-outcome.test','content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify({action:'record_bank',requestId:'incoming-old-known-actor',expectedRevision:null,input:{payerReference:'FICTIONAL-PRIVATE-OLD-A'}})});
  assert.equal((await api.financePaymentCommand(oldRequest)).status,403);assert.equal(oldRequest.bodyUsed,false,'Actor intent must reject before private input is consumed.');
  assert.equal((await api.financePaymentsRead(new Request('https://incoming-outcome.test/api/admin/payments',{headers:{'X-Hastabazaar-Actor':'reviewer'}}))).status,403);
  assert.deepEqual(identitySnapshot(f),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n,auditBefore);
 }finally{state.db=null;f.dispose();}
});
