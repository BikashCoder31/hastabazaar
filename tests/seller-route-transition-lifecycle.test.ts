import { passivePdfFixture } from './helpers/passive-pdf';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { earnedMaker,refund } from './helpers/company-store-financial-fixture';
import {issueManagedInvoiceGroups} from '../lib/db/repositories/managed-documents';
import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';
import { submitRegisteredSellerTransition, resubmitRegisteredSellerTransition, reviewRouteTransition, applyDueRouteTransitions,applyReviewedRouteTransition } from '../lib/managed-commerce/route-transition';
import { createBusinessSettingDraft,publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import {addCartItem} from '../lib/db/repositories/cart';
import {createCodOrder} from '../lib/db/repositories/orders';
import {prepareManagedPayout} from '../lib/managed-commerce/payout-operations';
import {cataloguePayoutPacket} from './helpers/catalogue-payout-execution';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';
import {recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {payoutRegistrationBlocker} from '../lib/payments/payout-registration-readiness';
import {setTimeout as delay} from 'node:timers/promises';
import {listStaffFormHistory} from '../lib/forms/staff-history';
import {accrueExistingDeliveredEarnings,prepareSellerPayout} from '../lib/db/repositories/payouts';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

declare global { var transitionLifecycleDb:D1Database; var transitionLifecycleIdentity:{userId:string;email:string}|null;var transitionLifecycleMedia:unknown;var transitionLifecycleReact:typeof createElement }
globalThis.transitionLifecycleReact=createElement;
registerHooks({resolve(specifier,context,next){
  const source=specifier==='cloudflare:workers'?`export const env={get DB(){return globalThis.transitionLifecycleDb},get MEDIA(){return globalThis.transitionLifecycleMedia},HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:3018'}`:
    specifier==='@/app/auth'?'export async function getAuthenticatedUser(){return globalThis.transitionLifecycleIdentity};export async function requireAuthenticatedUser(){return globalThis.transitionLifecycleIdentity}':
    specifier==='next/navigation'?'export function redirect(path){throw new Error(path)};export function notFound(){throw new Error("Not found")}' :
    specifier==='next/link'?'export default function Link(props){return globalThis.transitionLifecycleReact("a",props,props.children)}':null;
  return source?{url:`data:text/javascript,${source}`,shortCircuit:true}:next(specifier,context);
}});
async function fixture(baseNow?:number){
  const f=await earnedMaker(true,baseNow);
  for(const [id,kind] of [['transition-registration','business_registration'],['transition-pan','pan_certificate'],['transition-bank','bank_verification']]) f.sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
    VALUES(?,?,?,?,?,'application/pdf',100,'pending',?)`).run(id,f.sellerId,kind,`private/seller-documents/${f.sellerId}/${id}`,'SIMULATED.pdf',f.financialNow);
  const terms=await getRegisteredSellerTerms(f.db,f.financialNow);
  f.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run('transition-auth',f.actorId);
  globalThis.transitionLifecycleDb=f.db;globalThis.transitionLifecycleIdentity={userId:'transition-auth',email:'maker@local.hastabazaar.test'};
  const input={sellerId:f.sellerId,actorId:f.actorId,legalName:'Fictional registered craft company',registrationAuthority:'Fictional company office',registrationNumber:'SIM-REG-001',
    taxMode:'PAN' as const,taxRegistrationNumber:'SIM-PAN-001',payoutAccountReference:'SIM-REGISTERED-RECEIVING',evidenceReferences:['transition-registration','transition-pan','transition-bank'],agreementVersion:terms.agreementVersion,
    agreementLanguage:'en' as const,agreementAcceptedAt:f.financialNow,registeredTermsContext:terms.context,requestId:'transition-fictional-submit',now:f.financialNow,environment:f.context.environment};
  return {...f,input,terms};
}
// Capture real fixture database time strictly beyond a persisted boundary, even on the same clock tick.
async function databaseTimeAfter(db:D1Database,boundary:number){
  const deadline=performance.now()+2000;
  do {
    const clock=await db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`).first<{now:number}>();
    assert.ok(clock&&Number.isSafeInteger(clock.now),'Expected a valid SQLite clock');
    if(clock.now>boundary)return clock.now;
    await delay(1);
  } while(performance.now()<deadline);
  assert.fail(`The fixture database clock did not advance past ${boundary}`);
}

void test('an applied Registered transition retains the Managed intake as read-only history', async () => {
  const f = await fixture();
  try {
    const { readRegistrationPageEvidence } = await import('../lib/sellers/registration-page');
    const viewer = {userId:f.actorId,email:'maker@local.hastabazaar.test',sellerId:f.sellerId};
    const answers = JSON.stringify({hasBusinessTaxRegistration:['no']});
    f.sqlite.prepare(`INSERT INTO seller_registration_intakes(seller_id,user_id,version,answers_json,documents_json,review_ready,updated_at)
      VALUES (?,?,1,?,'{}',0,?)`).run(f.sellerId,f.actorId,answers,f.financialNow);
    const intake = () => f.sqlite.prepare('SELECT * FROM seller_registration_intakes WHERE seller_id=?').get(f.sellerId);
    const original = intake();
    const applicationId = await submitRegisteredSellerTransition(f.db,f.input);
    const reviewAt = await databaseTimeAfter(f.db,f.financialNow);
    await reviewRouteTransition(f.db,{applicationId,actorId:'reviewer',action:'approve',reason:'Reviewed fictional registered evidence',
      effectiveAt:reviewAt+1,requestId:'transition-retention-review',now:reviewAt,environment:f.context.environment});
    assert.equal((await readRegistrationPageEvidence(f.db,viewer,reviewAt)).initial?.editable,true);
    const appliedAt = await databaseTimeAfter(f.db,reviewAt);
    assert.equal(await applyDueRouteTransitions(f.db,appliedAt,f.context.environment),1);
    const after = await readRegistrationPageEvidence(f.db,viewer,appliedAt);
    assert.equal(after.initial?.editable,false);
    assert.deepEqual(after.initial?.missing,[]);
    assert.deepEqual(after.record?.answers,JSON.parse(answers));
    assert.deepEqual(intake(),original);
    assert.match((await payoutRegistrationBlocker(f.db,f.sellerId,'registered',appliedAt)) ?? '',/remaining seller registration/);
  } finally {
    f.sqlite.close();
  }
});

type TransitionFixture=Awaited<ReturnType<typeof fixture>>;
type CatalogueExecution=Awaited<ReturnType<typeof cataloguePayoutPacket>>;

async function completeManagedInstruction(f:TransitionFixture,execution:CatalogueExecution,payoutId:string,after:number){
  const bankAt=await databaseTimeAfter(f.db,after);
  const completion={...execution.completion,now:bankAt};
  const outcome={...execution.outcome,bankAt};
  const source=f.sqlite.prepare(`SELECT managed_payout_id,account_version_id,funding_statement_id,amount_paisa,
    source_snapshot_json,beneficiary_version_id,identity_revision,bank_revision,prepared_at,approved_at,started_at
    FROM payout_transfer_packets WHERE id=?`);
  const original=source.get(execution.packetId);
  assert.ok(original);
  assert.equal(original.managed_payout_id,payoutId);
  assert.ok(Number(original.prepared_at)<=Number(original.approved_at));
  assert.ok(Number(original.approved_at)<=Number(original.started_at));
  assert.ok(Number(original.started_at)<bankAt);
  assert.equal(JSON.parse(String(original.source_snapshot_json)).destination,f.payoutSources.beneficiaryReference);
  assert.equal((await recordPayoutTransferOutcome(f.db,completion,outcome)).state,'paid');
  assert.deepEqual(source.get(execution.packetId),original);
  const packet=f.sqlite.prepare(`SELECT state,prepared_by,approved_by,started_by,recorded_by,recorded_at,
    evidence_reference,transaction_identity_hash FROM payout_transfer_packets WHERE id=?`).get(execution.packetId);
  assert.ok(packet);
  assert.deepEqual([packet.state,packet.prepared_by,packet.approved_by,packet.started_by,packet.recorded_by],
    ['paid','reviewer','reviewer','reviewer','reviewer']);
  assert.equal(packet.evidence_reference,outcome.evidenceReference);
  const recordedAt=Number(packet.recorded_at);
  assert.ok(recordedAt>=bankAt);
  const bankRows=f.sqlite.prepare(`SELECT account_version_id,amount_paisa,bank_at,transaction_identity,identity_hash,recorded_at
    FROM company_outgoing_bank_identities WHERE packet_id=? AND packet_kind='payout'`).all(execution.packetId);
  assert.equal(bankRows.length,1);
  const {recorded_at:bankRecordedAt,...bank}=bankRows[0]!;
  assert.ok(typeof bankRecordedAt==='number'&&bankAt<=bankRecordedAt&&bankRecordedAt<=recordedAt);
  assert.deepEqual(bank,{account_version_id:f.payoutSources.accountVersionId,amount_paisa:outcome.amountPaisa,bank_at:bankAt,
    transaction_identity:outcome.transactionIdentity,identity_hash:packet.transaction_identity_hash});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND action LIKE 'payout.transfer.%'").get()?.n,4);
  assert.equal(f.sqlite.prepare('SELECT paid_at FROM managed_payouts WHERE id=?').get(payoutId)?.paid_at,bankAt);
  assert.equal(f.sqlite.prepare('SELECT terminal_at FROM managed_payout_allocations WHERE payout_id=? AND entitlement_id=?').get(payoutId,f.entitlementId)?.terminal_at,bankAt);
  return recordedAt;
}

void test('PAN transition changes only new transactions at the reviewed effective time',async(context)=>{
  const f=await fixture();
  try {
    const old=JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots ORDER BY id').all());
    const entitlements=JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_entitlements ORDER BY id').all());
    const {requireSellerApi,requireSellerPage}=await import('../lib/auth/seller');
    await assert.rejects(requireSellerApi(),/Approved seller/);
    const applicationId=await submitRegisteredSellerTransition(f.db,f.input);
    // Start while the original verified maker destination is still current.
    const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'pay-historical-managed-balance'});
    const execution=await cataloguePayoutPacket(f,{actorId:'reviewer',model:'managed',payoutId,
      accountVersionId:f.payoutSources.accountVersionId,amountPaisa:91000,environment:f.context.environment});
    const packet=f.sqlite.prepare('SELECT * FROM payout_transfer_packets WHERE id=?');
    const allocation=f.sqlite.prepare('SELECT * FROM managed_payout_allocations WHERE payout_id=? AND entitlement_id=?');
    const processing=packet.get(execution.packetId);
    const reserved=allocation.get(payoutId,f.entitlementId);
    assert.ok(processing&&processing.state==='processing'&&typeof processing.started_at==='number');
    assert.equal(reserved?.disposition,'reserved');
    const reviewAt=await databaseTimeAfter(f.db,processing.started_at);
    const effectiveAt=reviewAt+1;
    await reviewRouteTransition(f.db,{applicationId,actorId:'reviewer',action:'approve',reason:'Fictional private registration and tax documents reviewed',effectiveAt,requestId:'transition-fictional-review',now:reviewAt,environment:f.context.environment});
    assert.equal(await applyDueRouteTransitions(f.db,effectiveAt-1,f.context.environment),0);
    await assert.rejects(requireSellerApi(),/Approved seller/);
    await databaseTimeAfter(f.db,effectiveAt-1);
    assert.equal(await applyDueRouteTransitions(f.db,effectiveAt,f.context.environment),1);
    const transition=f.sqlite.prepare('SELECT effective_at,applied_at FROM seller_route_transition_applications WHERE id=?').get(applicationId);
    assert.deepEqual({...transition},{effective_at:effectiveAt,applied_at:effectiveAt});
    assert.ok(processing.started_at<Number(transition?.applied_at));
    assert.deepEqual(packet.get(execution.packetId),processing);
    assert.deepEqual(allocation.get(payoutId,f.entitlementId),reserved);
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(payoutId)?.status,'processing');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities WHERE packet_id=?').get(execution.packetId)?.n,0);
    assert.equal((await requireSellerApi()).sellerId,f.sellerId);
    assert.equal((await requireSellerPage('/seller')).sellerId,f.sellerId);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_profiles WHERE id=?').get(f.sellerId)?.status,'approved');
    assert.equal(f.sqlite.prepare('SELECT payout_account_reference FROM seller_profiles WHERE id=?').get(f.sellerId)?.payout_account_reference,f.input.payoutAccountReference);
    assert.equal(f.sqlite.prepare('SELECT settlement_terms_reference FROM seller_profiles WHERE id=?').get(f.sellerId)?.settlement_terms_reference,`registered-seller-agreement:${f.terms.context}`);
    assert.equal(f.sqlite.prepare("SELECT status FROM seller_documents WHERE id='transition-bank'").get()?.status,'verified');
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM seller_agreement_acceptance_history WHERE seller_id=?').get(f.sellerId)?.commission_bps,f.terms.basisPoints);
    assert.equal(await applyDueRouteTransitions(f.db,effectiveAt,f.context.environment),0);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots ORDER BY id').all()),old);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_entitlements ORDER BY id').all()),entitlements);
    const recordedAt=await completeManagedInstruction(f,execution,payoutId,Number(transition?.applied_at));
    assert.deepEqual({...f.sqlite.prepare('SELECT amount_paisa,status,destination_reference FROM managed_payouts WHERE id=?').get(payoutId)},
      {amount_paisa:91000,status:'paid',destination_reference:f.payoutSources.beneficiaryReference});
    assert.equal(f.sqlite.prepare('SELECT disposition FROM managed_payout_allocations WHERE payout_id=? AND entitlement_id=?').get(payoutId,f.entitlementId)?.disposition,'paid');
    const orderAt=await databaseTimeAfter(f.db,recordedAt);
    await addCartItem(f.db,'registered-route-cart','cup',1,orderAt);
    context.mock.method(Date,'now',()=>orderAt);
    assert.ok(Date.now()>=effectiveAt,'The new order placement clock must reach the reviewed effective instant');
    assert.ok(Date.now()>=f.input.agreementAcceptedAt,'The new order placement clock must reach the preserved acceptance instant');
    await createCodOrder(f.db,'registered-route-cart','registered-route-receipt',{customerEmail:'buyer@local.hastabazaar.test',customerPhone:'9811111111',customerAuthSubject:'buyer',locale:'en-NP',termsAccepted:true,idempotencyKey:'registered-route-order',
      address:{recipientName:'Fictional buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional street'}},orderAt,'buyer');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_entitlements').get()?.n,1,'The new independent order must not create another managed earning');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_commercial_snapshots').get()?.n,1);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM order_items WHERE order_id<>?').get(f.orderId)?.commission_bps,f.terms.basisPoints);
    const independentOrder=String(f.sqlite.prepare('SELECT id FROM orders WHERE id<>?').get(f.orderId)?.id);
    const placedAt=Number(f.sqlite.prepare('SELECT placed_at FROM orders WHERE id=?').get(independentOrder)?.placed_at);
    const acceptedAt=Number(f.sqlite.prepare('SELECT accepted_at FROM seller_agreement_acceptance_history WHERE seller_id=?').get(f.sellerId)?.accepted_at);
    assert.equal(acceptedAt,f.input.agreementAcceptedAt,'The transition must preserve the original acceptance instant');
    assert.ok(placedAt>=effectiveAt,'Recorded new-order placement must reach the reviewed effective instant');
    assert.ok(placedAt>=acceptedAt,'Recorded new-order placement must reach the preserved acceptance instant');
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?").run(placedAt+1,independentOrder);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=?").run(independentOrder);
    const maturity=placedAt+100*86400000;
    await accrueExistingDeliveredEarnings(f.db,{actorId:'reviewer',requestId:'registered-delivery-accrual',now:maturity});
    const independentPayout=await prepareSellerPayout(f.db,{sellerId:f.sellerId,actorId:'reviewer',actorRole:'super_admin',requestId:'registered-payment-preparation',note:'Verify the new registered seller receiving destination.',now:maturity});
    assert.equal(f.sqlite.prepare('SELECT destination_reference FROM payouts WHERE id=?').get(independentPayout.id)?.destination_reference,f.input.payoutAccountReference);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE order_item_id=?').get(f.itemId)?.n,0,'Managed sale must not enter independent seller payouts');
  } finally {f.dispose();}
});
void test('registered seller transition requires private receiving evidence before submission',async()=>{
 const f=await fixture();
 try {
  await assert.rejects(submitRegisteredSellerTransition(f.db,{...f.input,evidenceReferences:['transition-registration','transition-pan']}),/bank|receiving/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_route_transition_applications').get()?.n,0);
 }finally{f.dispose();}
});
void test('a PAN transition preserves populated invoices refunds settlement entries and paid allocation histories',async()=>{
 const f=await fixture();
 try {
  // The explicit historical order predates approved billing and has no order statement.
  assert.equal(await issueManagedInvoiceGroups(f.db,{orderId:f.orderId,requestId:'history-invoice',now:f.financialNow}),1);
  await refund(f);
  const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'history-prepare'});
  const execution=await cataloguePayoutPacket(f,{actorId:'reviewer',model:'managed',payoutId,
    accountVersionId:f.payoutSources.accountVersionId,amountPaisa:63700,environment:f.context.environment});
  const startedAt=f.sqlite.prepare('SELECT started_at FROM payout_transfer_packets WHERE id=?').get(execution.packetId)?.started_at;
  assert.equal(typeof startedAt,'number');
  const recordedAt=await completeManagedInstruction(f,execution,payoutId,Number(startedAt));
  assert.deepEqual({...f.sqlite.prepare('SELECT amount_paisa,disposition FROM managed_payout_allocations WHERE payout_id=? AND entitlement_id=?').get(payoutId,f.entitlementId)},
    {amount_paisa:63700,disposition:'paid'});
  const tables=['managed_commercial_snapshots','managed_entitlements','managed_settlement_entries','managed_invoice_groups','return_requests','refunds','managed_payouts','managed_payout_allocations','payout_transfer_packets','company_outgoing_bank_identities'];
  const before=new Map(tables.map(table=>[table,JSON.stringify(f.sqlite.prepare(`SELECT * FROM ${table}`).all())]));
  for(const table of tables)assert.ok(Number(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n)>0,`${table} must be populated`);
  const submittedAt=await databaseTimeAfter(f.db,recordedAt);
  const applicationId=await submitRegisteredSellerTransition(f.db,{...f.input,now:submittedAt,agreementAcceptedAt:submittedAt});
  const reviewAt=await databaseTimeAfter(f.db,submittedAt);
  const effectiveAt=reviewAt+1;
  await reviewRouteTransition(f.db,{applicationId,actorId:'reviewer',action:'approve',reason:'Review complete bank registration and tax evidence',effectiveAt,requestId:'history-transition-review',now:reviewAt,environment:f.context.environment});
  await databaseTimeAfter(f.db,effectiveAt-1);
  assert.equal(await applyDueRouteTransitions(f.db,effectiveAt,f.context.environment),1);
  const transition=f.sqlite.prepare('SELECT effective_at,applied_at FROM seller_route_transition_applications WHERE id=?').get(applicationId);
  assert.deepEqual({...transition},{effective_at:effectiveAt,applied_at:effectiveAt});
  assert.ok(recordedAt<Number(transition?.effective_at),'The paid packet and outgoing bank evidence must predate cutover');
  for(const table of tables)assert.equal(JSON.stringify(f.sqlite.prepare(`SELECT * FROM ${table}`).all()),before.get(table),table);
 }finally{f.dispose();}
});
void test('owned multipart transition validates private uploads, authorization, replay and form-publication races',async()=>{
  const f=await fixture(Date.now()-10*86400000);
  const uploads=new Map<string,Uint8Array>();
  globalThis.transitionLifecycleMedia={async put(key:string,stream:ReadableStream){uploads.set(key,new Uint8Array(await new Response(stream).arrayBuffer()));return {};}};
  try {
    const formId='seller.managed-transition-request';
    const publish=(version:number)=>f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES(?,?,?,1,'published',?,'Fictional form publication','reviewer',1,'reviewer',1,'reviewer',1,?)`).run(`transition-http-v${version}`,formId,version,JSON.stringify({formId,fields:[]}),`transition-http-publication-${version}`);
    publish(1);
    const {GET,POST}=await import('../app/api/seller-applications/transition/route');
    function data(requestId='transition-http-submit',fileBody=passivePdfFixture('SIMULATED private certificate')) {
      const body=new FormData();
      for(const [key,value] of Object.entries({requestId,formVersion:'1',action:'submit',legalName:f.input.legalName,registrationAuthority:f.input.registrationAuthority,
        registrationNumber:f.input.registrationNumber,taxMode:'PAN',taxRegistrationNumber:f.input.taxRegistrationNumber,payoutAccountReference:f.input.payoutAccountReference,registeredTermsContext:f.terms.context,agreementVersion:f.terms.agreementVersion,agreementLanguage:'en',acceptedTerms:'yes'}))body.set(key,value);
      body.set('businessRegistration',new File([fileBody],'SIMULATED-company-registration.pdf',{type:'application/pdf'}));
      body.set('panCertificate',new File([fileBody],'SIMULATED-business-PAN.pdf',{type:'application/pdf'}));body.set('bankVerification',new File([fileBody],'SIMULATED-receiving-account.pdf',{type:'application/pdf'}));return body;
    }
    const send=(body:FormData,origin='http://localhost:3018')=>POST(new Request('http://localhost:3018/api/seller-applications/transition',{method:'POST',headers:{origin},body}));
    const profile=JSON.stringify(f.sqlite.prepare('SELECT * FROM seller_profiles WHERE id=?').get(f.sellerId));
    assert.equal((await GET()).status,200);assert.equal(uploads.size,0);
    assert.equal((await send(data(),'https://foreign.test')).status,403);
    globalThis.transitionLifecycleIdentity=null;assert.equal((await send(data())).status,401);
    globalThis.transitionLifecycleIdentity={userId:'transition-auth',email:'maker@local.hastabazaar.test'};
    const duplicate=data();duplicate.append('taxMode','VAT');assert.equal((await send(duplicate)).status,400);
    assert.equal((await send(data('invalid-file-attempt','not a PDF'))).status,400);assert.equal(uploads.size,0);
    assert.equal((await send(data('header-only-file-attempt','%PDF-1.4\nnot a real certificate\n%%EOF'))).status,400);assert.equal(uploads.size,0);
    const mismatch=data('mismatched-file-attempt');
    mismatch.set('panCertificate',new File([passivePdfFixture()],'fake.png',{type:'image/png'}));
    assert.equal((await send(mismatch)).status,400);assert.equal(uploads.size,0);
    const huge=new Request('http://localhost:3018/api/seller-applications/transition',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'multipart/form-data; boundary=fake','content-length':String(17*1024*1024)},body:'x'});
    assert.equal((await POST(huge)).status,413);
    f.setBeforeBatch(()=>{publish(2);});
    const raced=await send(data('racing-publication'));
    assert.equal(raced.status,409,await raced.text());
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_route_transition_applications').get()?.n,0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_documents WHERE id LIKE 'transition-%' AND id NOT IN ('transition-pan','transition-registration','transition-bank')").get()?.n,0);
    // The retained request uses its original publication. A new reviewed request uses v2.
    const fresh=data();fresh.set('formVersion','2');
    const response=await send(fresh);assert.equal(response.status,201,await response.text());
    const originalUploads=uploads.size;assert.equal((await send(fresh)).status,200);assert.equal(uploads.size,originalUploads);
    const changed=data();changed.set('formVersion','2');changed.set('legalName','Changed registered name');assert.equal((await send(changed)).status,409);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_route_transition_applications').get()?.n,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?').get(formId)?.n,1);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM seller_profiles WHERE id=?').get(f.sellerId)),profile);
    const applicationId=String(f.sqlite.prepare('SELECT id FROM seller_route_transition_applications').get()?.id);
    const History=(await import('../app/sell/application/transitions/[id]/page')).default;
    const html=renderToStaticMarkup(await History({params:Promise.resolve({id:applicationId})}));
    assert.match(html,/Your registration request history/);assert.match(html,/9% commission/);
    f.sqlite.exec("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('foreign-owner','foreign-auth','foreign@local.hastabazaar.test','Fictional other owner','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign-owner','customer',1)");
    globalThis.transitionLifecycleIdentity={userId:'foreign-auth',email:'foreign@local.hastabazaar.test'};
    await assert.rejects(History({params:Promise.resolve({id:applicationId})}),/Not found/);
  }finally{f.dispose();}
});
void test('transition rejects invented evidence and a substituted seller agreement',async()=>{
  const f=await fixture();
  try {
    await assert.rejects(submitRegisteredSellerTransition(f.db,{...f.input,evidenceReferences:['invented-private-document']}),/private|document|evidence/i);
    await assert.rejects(submitRegisteredSellerTransition(f.db,{...f.input,agreementVersion:'invented-version'}),/terms|agreement/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_route_transition_applications').get()?.n,0);
  } finally {f.dispose();}
});
void test('transition corrections and stale terms require resubmission and renewed acceptance',async()=>{
  const f=await fixture();
  const effective=f.financialNow+16*86400000;
  try {
    const id=await submitRegisteredSellerTransition(f.db,f.input);
    const decision={applicationId:id,actorId:'reviewer',action:'approve' as const,reason:'Fictional registration evidence reviewed independently',effectiveAt:effective,requestId:'review-before-commission-change',now:f.financialNow,environment:f.context.environment};
    await reviewRouteTransition(f.db,decision);
    const reviewedEvidence=()=>f.sqlite.prepare("SELECT * FROM seller_documents WHERE id IN ('transition-registration','transition-pan','transition-bank') ORDER BY id").all();
    const originalEvidence=reviewedEvidence();
    assert.equal(originalEvidence.length,3);
    for(const document of originalEvidence)assert.equal(document.status,'verified');
    assert.throws(()=>f.sqlite.prepare("UPDATE seller_documents SET status='rejected' WHERE id='transition-pan'").run(),/seller_document_version_immutable/);
    assert.deepEqual(reviewedEvidence(),originalEvidence);
    const draft=await createBusinessSettingDraft(f.db,{key:'independent_seller_commission_bps',value:1100,actorId:'reviewer',reason:'Fictional prospective commission change',requestId:'transition-commission-draft',now:f.financialNow+1});
    await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,reason:'Fictional future commission publication',requestId:'transition-commission-publish',effectiveFrom:effective,now:f.financialNow+2,simulationAllowed:true});
    assert.equal(await applyDueRouteTransitions(f.db,effective,f.context.environment),0);
    const row=f.sqlite.prepare('SELECT status,version,review_reason FROM seller_route_transition_applications WHERE id=?').get(id)!;
    assert.equal(row.status,'changes_requested');assert.match(String(row.review_reason),/renew acceptance/);
    assert.equal(f.sqlite.prepare('SELECT participation_route FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)?.participation_route,'managed_maker');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id=? AND role='seller'").get(f.actorId)?.n,0);
    const terms=await getRegisteredSellerTerms(f.db,effective+1);
    const corrected={...f.input,applicationId:id,expectedVersion:Number(row.version),registeredTermsContext:terms.context,agreementVersion:terms.agreementVersion,
      agreementAcceptedAt:effective+1,now:effective+1,requestId:'transition-corrected-acceptance'};
    await resubmitRegisteredSellerTransition(f.db,corrected);
    await resubmitRegisteredSellerTransition(f.db,corrected);
    const originalAcceptance=JSON.parse(String(f.sqlite.prepare('SELECT next_json FROM audit_logs WHERE request_id=?').get(f.input.requestId)?.next_json));
    assert.equal(originalAcceptance.registeredTerms.commissionBps,900,'A correction must keep the original accepted seller terms in history');
    await assert.rejects(resubmitRegisteredSellerTransition(f.db,{...corrected,requestId:'stale-correction-attempt'}));
    await reviewRouteTransition(f.db,{...decision,requestId:'review-renewed-transition',effectiveAt:effective+2,now:effective+2});
    assert.deepEqual(reviewedEvidence(),originalEvidence);
    assert.equal(await applyDueRouteTransitions(f.db,effective+2,f.context.environment),1);
    assert.deepEqual(reviewedEvidence(),originalEvidence);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM seller_agreement_acceptance_history WHERE seller_id=?').get(f.sellerId)?.commission_bps,1100);
    assert.equal(f.sqlite.prepare('SELECT platform_retention_bps FROM managed_commercial_snapshots').get()?.platform_retention_bps,900);
  } finally {f.dispose();}
});
void test('a pending evidence rejection before the approval batch rolls back transition review',async()=>{
  const f=await fixture();
  try {
    const id=await submitRegisteredSellerTransition(f.db,f.input);
    const application=()=>f.sqlite.prepare('SELECT * FROM seller_route_transition_applications WHERE id=?').get(id);
    const participation=()=>f.sqlite.prepare('SELECT * FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId);
    const profile=()=>f.sqlite.prepare('SELECT * FROM seller_profiles WHERE id=?').get(f.sellerId);
    const roles=()=>f.sqlite.prepare('SELECT * FROM user_roles WHERE user_id=? ORDER BY role').all(f.actorId);
    const acceptances=()=>f.sqlite.prepare('SELECT * FROM seller_agreement_acceptance_history WHERE seller_id=? ORDER BY id').all(f.sellerId);
    const documents=()=>f.sqlite.prepare("SELECT * FROM seller_documents WHERE id IN ('transition-registration','transition-pan','transition-bank') ORDER BY id").all().map(document=>({...document}));
    const before={application:application(),participation:participation(),profile:profile(),roles:roles(),acceptances:acceptances(),documents:documents()};
    assert.equal(before.application?.status,'submitted');
    assert.equal(before.participation?.participation_route,'managed_maker');
    assert.equal(before.roles.some(role=>role.role==='seller'),false);
    assert.equal(before.documents.length,3);
    assert.ok(before.documents.every(document=>document.status==='pending'));

    let rejectionCommitted=false;
    f.setBeforeBatch(()=>{
      const result=f.sqlite.prepare("UPDATE seller_documents SET status='rejected',reviewed_by=?,reviewed_at=?,review_request_id=? WHERE id='transition-pan' AND seller_id=? AND status='pending'")
        .run('reviewer',f.financialNow,'concurrent-pan-rejection',f.sellerId);
      assert.equal(Number(result.changes),1);
      rejectionCommitted=true;
    });
    const requestId='transition-approval-raced-with-document-rejection';
    await assert.rejects(reviewRouteTransition(f.db,{applicationId:id,actorId:'reviewer',action:'approve',reason:'Fictional private evidence reviewed',effectiveAt:f.financialNow,requestId,now:f.financialNow,environment:f.context.environment}),/CHECK constraint failed: valid\s*=\s*1/i);
    assert.equal(rejectionCommitted,true,'The concurrent document rejection must finish before the approval batch');
    assert.deepEqual(application(),before.application);
    assert.deepEqual(participation(),before.participation);
    assert.deepEqual(profile(),before.profile);
    assert.deepEqual(roles(),before.roles);
    assert.deepEqual(acceptances(),before.acceptances);
    assert.deepEqual(documents(),before.documents.map(document=>document.id==='transition-pan'
      ? {...document,status:'rejected',reviewed_by:'reviewer',reviewed_at:f.financialNow,review_request_id:'concurrent-pan-rejection'}
      : document));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE request_id=?').get(requestId)?.n,0);
  } finally {f.dispose();}
});
void test('reviewer authority and maker stage races during application never grant seller access',async()=>{
  for(const race of ['reviewer','stage'] as const){
    const f=await fixture();
    try {
      const id=await submitRegisteredSellerTransition(f.db,f.input);
      await reviewRouteTransition(f.db,{applicationId:id,actorId:'reviewer',action:'approve',reason:'Fictional private evidence verified',effectiveAt:f.financialNow,requestId:'race-review',now:f.financialNow,environment:f.context.environment});
      let mutationCommitted=false;
      f.setBeforeBatch(()=>{
        const result=race==='reviewer'
          ? f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run()
          : f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='under_review' WHERE seller_id=?").run(f.sellerId);
        assert.equal(Number(result.changes),1,race);
        mutationCommitted=true;
      });
      assert.equal(await applyDueRouteTransitions(f.db,f.financialNow,f.context.environment),0,race);
      assert.equal(mutationCommitted,true,race);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id=? AND role='seller'").get(f.actorId)?.n,0,race);
      assert.equal(f.sqlite.prepare('SELECT participation_route FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)?.participation_route,'managed_maker',race);
    } finally {f.dispose();}
  }
});
void test('scheduled transition requires unexpired reviewed evidence at application and database execution',async()=>{
  for(const scenario of ['still valid','exact expiry','expires before batch'] as const){
    const f=await fixture();
    try {
      const clock=f.sqlite.prepare('SELECT '+checkoutCommitClock(f.db)+' AS now');
      const expiresAt=Number(clock.get()?.now)+(scenario==='expires before batch'?3000:60000);
      assert.equal(Number(f.sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE id='transition-pan' AND status='pending'").run(expiresAt).changes),1);
      const id=await submitRegisteredSellerTransition(f.db,f.input);
      const effectiveAt=scenario==='expires before batch'?f.financialNow:expiresAt-1;
      await reviewRouteTransition(f.db,{applicationId:id,actorId:'reviewer',action:'approve',reason:'Fictional private evidence reviewed before expiry',effectiveAt,requestId:'review-before-evidence-expiry',now:f.financialNow,environment:f.context.environment});
      const application=()=>f.sqlite.prepare('SELECT status,review_reason,applied_at FROM seller_route_transition_applications WHERE id=?').get(id);
      const evidence=()=>f.sqlite.prepare("SELECT * FROM seller_documents WHERE id IN ('transition-registration','transition-pan','transition-bank') ORDER BY id").all();
      const before=evidence();
      assert.equal(application()?.status,'scheduled');
      assert.deepEqual(before.map(document=>[document.id,document.status,document.valid_until]),[
        ['transition-bank','verified',null],['transition-pan','verified',expiresAt],['transition-registration','verified',null],
      ]);
      let crossedAtBatch=false;
      if(scenario==='expires before batch'){
        f.setBeforeBatch(async()=>{
          const enteredAt=Number(clock.get()?.now);
          assert.ok(enteredAt<expiresAt,'The apply batch must be prepared while evidence is still valid');
          await delay(expiresAt-enteredAt);
          assert.ok(await databaseTimeAfter(f.db,expiresAt-1)>=expiresAt);
          crossedAtBatch=true;
        });
      }

      const now=scenario==='exact expiry'?expiresAt:effectiveAt;
      const applied=await applyDueRouteTransitions(f.db,now,f.context.environment,id);
      if(scenario==='expires before batch')assert.equal(crossedAtBatch,true,'The apply hook must reach expiry before executing the transaction');
      assert.equal(applied,scenario==='still valid'?1:0,scenario);
      assert.deepEqual(evidence(),before,scenario);
      const role=f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id=? AND role='seller'").get(f.actorId)?.n;
      const route=f.sqlite.prepare('SELECT participation_route FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)?.participation_route;
      const acceptance=f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history WHERE acceptance_request_id=?').get('route-transition-apply:'+id)?.n;
      if(scenario==='still valid'){
        assert.equal(application()?.status,'applied');
        assert.equal(application()?.applied_at,now);
        assert.equal(role,1);
        assert.equal(route,'registered_seller');
        assert.equal(acceptance,1);
      } else {
        assert.equal(application()?.status,'changes_requested',scenario);
        assert.equal(application()?.applied_at,null,scenario);
        assert.match(String(application()?.review_reason),scenario==='exact expiry'?/expired/i:/review private documents/i);
        assert.equal(role,0,scenario);
        assert.equal(route,'managed_maker',scenario);
        assert.equal(acceptance,0,scenario);
        assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id=? AND action='seller_route_transition.applied'").get('route-transition-apply:'+id)?.n,0,scenario);
      }
    } finally {f.dispose();}
  }
});
void test('expiry after apply form insertion rolls back the seller transition',async()=>{
  const f=await fixture();
  try {
    const formId='staff.managed-transition-decision';
    const versionId='transition-review-v1';
    const requestId='transition-apply-expiring-during-transaction';
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES(?,?,1,1,'published',?,'Fictional review form','reviewer',1,'reviewer',1,'reviewer',1,'transition-review-publish')`).run(versionId,formId,JSON.stringify({formId,fields:[]}));

    const nativeClock=checkoutCommitClock(f.db);
    const clock=f.sqlite.prepare(`SELECT ${nativeClock} AS now`);
    let databaseNow=Number(clock.get()?.now);
    const expiresAt=databaseNow+1;
    f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'
      ? String(Math.floor(databaseNow/1000)) : (databaseNow%60000/1000).toFixed(3).padStart(6,'0'));
    assert.equal(Number(f.sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE id='transition-pan' AND status='pending'").run(expiresAt).changes),1);
    const id=await submitRegisteredSellerTransition(f.db,f.input);
    const now=f.financialNow;
    await reviewRouteTransition(f.db,{applicationId:id,actorId:'reviewer',action:'approve',reason:'Fictional private evidence reviewed before expiry',effectiveAt:now,requestId:'review-before-evidence-expiry',now,environment:f.context.environment});

    const application=()=>f.sqlite.prepare('SELECT * FROM seller_route_transition_applications WHERE id=?').get(id);
    const retainedRows=()=>({
      profile:f.sqlite.prepare('SELECT * FROM seller_profiles WHERE id=?').get(f.sellerId),
      participation:f.sqlite.prepare('SELECT * FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId),
      roles:f.sqlite.prepare('SELECT * FROM user_roles WHERE user_id=? ORDER BY role').all(f.actorId),
      acceptance:f.sqlite.prepare('SELECT * FROM seller_agreement_acceptance_history WHERE seller_id=? ORDER BY id').all(f.sellerId),
      evidence:f.sqlite.prepare('SELECT * FROM seller_documents WHERE seller_id=? ORDER BY id').all(f.sellerId),
      otherReceipts:f.sqlite.prepare('SELECT * FROM form_answer_sets WHERE subject_id=? AND request_id<>? ORDER BY id').all(id,requestId),
      applyAudits:f.sqlite.prepare('SELECT * FROM audit_logs WHERE request_id=? ORDER BY id').all('route-transition-apply:'+id),
    });
    const scheduled=application();
    assert.equal(scheduled?.status,'scheduled');
    const before=retainedRows();

    let formWrittenAt:number|undefined;
    f.sqlite.function('advance_transition_evidence_clock',(value)=>{
      formWrittenAt=Number(value);
      databaseNow=expiresAt;
      return 0;
    });
    f.sqlite.exec(`CREATE TEMP TRIGGER transition_expiry_after_form
      AFTER INSERT ON form_answer_sets WHEN NEW.request_id='${requestId}'
        AND EXISTS(SELECT 1 FROM seller_route_transition_applications WHERE id=NEW.subject_id AND status='applied')
      BEGIN SELECT advance_transition_evidence_clock(${nativeClock}); END`);

    await applyReviewedRouteTransition(f.db,{applicationId:id,actorId:'reviewer',reason:'Check the due registered seller transition in local simulation',
      requestId,now,environment:f.context.environment,form:{requestId,versionId,answers:{formId,version:1,answers:[]}}});
    assert.equal(formWrittenAt,expiresAt-1,'The form insert must run inside the apply transaction before expiry');
    assert.equal(Number(clock.get()?.now),expiresAt,'The trigger must cross the database expiry boundary');
    assert.equal(application()?.status,'changes_requested');
    assert.equal(application()?.applied_at,null);
    assert.equal(application()?.version,Number(scheduled?.version)+1);
    assert.match(String(application()?.review_reason),/review private documents/i);
    assert.deepEqual(retainedRows(),before);
    assert.deepEqual(f.sqlite.prepare('SELECT form_id,config_version_id,actor_id FROM form_answer_sets WHERE subject_id=? AND request_id=?')
      .all(id,requestId).map(row=>({...row})),[{form_id:formId,config_version_id:versionId,actor_id:'reviewer'}]);
    assert.deepEqual(f.sqlite.prepare("SELECT json_extract(next_json,'$.status') AS status FROM audit_logs WHERE request_id=? AND action='seller_route_transition.apply_requested'")
      .all(requestId).map(row=>row.status),['changes_requested']);
  } finally {f.dispose();}
});
void test('explicit application uses one guarded form receipt and preserves earlier correction history',async()=>{
  const f=await fixture();
  try {
    const formId='staff.managed-transition-decision';
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('transition-review-v1',?,1,1,'published',?,'Fictional review form','reviewer',1,'reviewer',1,'reviewer',1,'transition-review-publish')`).run(formId,JSON.stringify({formId,fields:[]}));
    const form=(requestId:string)=>({requestId,versionId:'transition-review-v1',answers:{formId,version:1,answers:[]}});
    const applicationId=await submitRegisteredSellerTransition(f.db,f.input);
    const correction={applicationId,actorId:'reviewer',action:'request_changes' as const,reason:'Please correct the fictional registered business name',requestId:'transition-request-correction',now:f.financialNow,environment:f.context.environment,form:form('transition-request-correction')};
    await reviewRouteTransition(f.db,correction);
    await resubmitRegisteredSellerTransition(f.db,{...f.input,applicationId,expectedVersion:2,legalName:'Corrected fictional registered company',requestId:'correction-submitted',now:f.financialNow+1,agreementAcceptedAt:f.financialNow+1});
    assert.equal((await listStaffFormHistory(f.db,{id:'reviewer',role:'super_admin'},'managed-transition-decision',{subjectId:applicationId})).items.length,1);
    await reviewRouteTransition(f.db,{...correction,action:'approve',reason:'Corrected business certificates and seller terms reviewed',effectiveAt:f.financialNow+2,now:f.financialNow+2,requestId:'transition-final-review',form:form('transition-final-review')});
    const operation={applicationId,actorId:'reviewer',reason:'Check the due registered seller transition in local simulation',requestId:'transition-explicit-apply',now:f.financialNow+2,environment:f.context.environment,form:form('transition-explicit-apply')};
    await applyReviewedRouteTransition(f.db,operation);await applyReviewedRouteTransition(f.db,operation);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_route_transition_applications WHERE id=?').get(applicationId)?.status,'applied');
    assert.equal((await listStaffFormHistory(f.db,{id:'reviewer',role:'super_admin'},'managed-transition-decision',{subjectId:applicationId})).items.length,3);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='transition-explicit-apply'").get()?.n,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history WHERE seller_id=?').get(f.sellerId)?.n,1);
  }finally{f.dispose();}
});
