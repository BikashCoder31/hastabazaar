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
import {prepareManagedPayout,transitionManagedPayout} from '../lib/managed-commerce/payout-operations';
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
void test('PAN transition changes only new transactions at the reviewed effective time',async()=>{
  const f=await fixture();
  try {
    const old=JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots ORDER BY id').all());
    const entitlements=JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_entitlements ORDER BY id').all());
    const {requireSellerApi,requireSellerPage}=await import('../lib/auth/seller');
    await assert.rejects(requireSellerApi(),/Approved seller/);
    const applicationId=await submitRegisteredSellerTransition(f.db,f.input);
    await reviewRouteTransition(f.db,{applicationId,actorId:'reviewer',action:'approve',reason:'Fictional private registration and tax documents reviewed',effectiveAt:f.financialNow+60000,requestId:'transition-fictional-review',now:f.financialNow,environment:f.context.environment});
    assert.equal(await applyDueRouteTransitions(f.db,f.financialNow+59999,f.context.environment),0);
    await assert.rejects(requireSellerApi(),/Approved seller/);
    assert.equal(await applyDueRouteTransitions(f.db,f.financialNow+60000,f.context.environment),1);
    assert.equal((await requireSellerApi()).sellerId,f.sellerId);
    assert.equal((await requireSellerPage('/seller')).sellerId,f.sellerId);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_profiles WHERE id=?').get(f.sellerId)?.status,'approved');
    assert.equal(f.sqlite.prepare('SELECT payout_account_reference FROM seller_profiles WHERE id=?').get(f.sellerId)?.payout_account_reference,f.input.payoutAccountReference);
    assert.equal(f.sqlite.prepare('SELECT settlement_terms_reference FROM seller_profiles WHERE id=?').get(f.sellerId)?.settlement_terms_reference,`registered-seller-agreement:${f.terms.context}`);
    assert.equal(f.sqlite.prepare("SELECT status FROM seller_documents WHERE id='transition-bank'").get()?.status,'verified');
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM seller_agreement_acceptance_history WHERE seller_id=?').get(f.sellerId)?.commission_bps,f.terms.basisPoints);
    assert.equal(await applyDueRouteTransitions(f.db,f.financialNow+60001,f.context.environment),0);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots ORDER BY id').all()),old);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_entitlements ORDER BY id').all()),entitlements);
    const payoutId=await prepareManagedPayout(f.db,{...f.context,now:f.financialNow+60001,requestId:'pay-historical-managed-balance'});
    await transitionManagedPayout(f.db,{...f.context,payoutId,action:'mark_paid',providerReference:'SIM-HISTORICAL-MANAGED-PAID',now:f.financialNow+60002,requestId:'record-historical-managed-payment'});
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(payoutId)?.amount_paisa,91000);
    await addCartItem(f.db,'registered-route-cart','cup',1,f.financialNow+60003);
    await createCodOrder(f.db,'registered-route-cart','registered-route-receipt',{customerEmail:'buyer@local.hastabazaar.test',customerPhone:'9811111111',customerAuthSubject:'buyer',locale:'en-NP',termsAccepted:true,idempotencyKey:'registered-route-order',
      address:{recipientName:'Fictional buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional street'}},f.financialNow+60003,'buyer');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_entitlements').get()?.n,1,'The new independent order must not create another managed earning');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_commercial_snapshots').get()?.n,1);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM order_items WHERE order_id<>?').get(f.orderId)?.commission_bps,f.terms.basisPoints);
    const independentOrder=String(f.sqlite.prepare('SELECT id FROM orders WHERE id<>?').get(f.orderId)?.id);
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?").run(f.financialNow+60004,independentOrder);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=?").run(independentOrder);
    const maturity=f.financialNow+100*86400000;
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
  await issueManagedInvoiceGroups(f.db,{orderId:f.orderId,requestId:'history-invoice',now:f.financialNow});
  await refund(f);
  const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'history-prepare'});
  await transitionManagedPayout(f.db,{...f.context,payoutId,action:'mark_paid',requestId:'history-paid',providerReference:'SIM-POPULATED-HISTORY'});
  const tables=['managed_commercial_snapshots','managed_entitlements','managed_settlement_entries','managed_invoice_groups','return_requests','refunds','managed_payouts','managed_payout_allocations'];
  const before=new Map(tables.map(table=>[table,JSON.stringify(f.sqlite.prepare(`SELECT * FROM ${table}`).all())]));
  for(const table of tables)assert.ok(Number(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n)>0,`${table} must be populated`);
  const applicationId=await submitRegisteredSellerTransition(f.db,f.input);
  await reviewRouteTransition(f.db,{applicationId,actorId:'reviewer',action:'approve',reason:'Review complete bank registration and tax evidence',effectiveAt:f.financialNow+1,requestId:'history-transition-review',now:f.financialNow,environment:f.context.environment});
  assert.equal(await applyDueRouteTransitions(f.db,f.financialNow+1,f.context.environment),1);
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
    function data(requestId='transition-http-submit',fileBody='%PDF-1.4\nSIMULATED private certificate\n%%EOF') {
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
    assert.equal(await applyDueRouteTransitions(f.db,effective+2,f.context.environment),1);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM seller_agreement_acceptance_history WHERE seller_id=?').get(f.sellerId)?.commission_bps,1100);
    assert.equal(f.sqlite.prepare('SELECT platform_retention_bps FROM managed_commercial_snapshots').get()?.platform_retention_bps,900);
  } finally {f.dispose();}
});
void test('evidence and reviewer authority races never grant seller access',async()=>{
  for(const race of ['document','reviewer','stage'] as const){
    const f=await fixture();
    try {
      const id=await submitRegisteredSellerTransition(f.db,f.input);
      await reviewRouteTransition(f.db,{applicationId:id,actorId:'reviewer',action:'approve',reason:'Fictional private evidence verified',effectiveAt:f.financialNow,requestId:'race-review',now:f.financialNow,environment:f.context.environment});
      f.setBeforeBatch(()=>{
        if(race==='document')f.sqlite.exec("UPDATE seller_documents SET status='rejected' WHERE id='transition-pan'");
        if(race==='reviewer')f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
        if(race==='stage')f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='under_review' WHERE seller_id=?").run(f.sellerId);
      });
      assert.equal(await applyDueRouteTransitions(f.db,f.financialNow,f.context.environment),0,race);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id=? AND role='seller'").get(f.actorId)?.n,0,race);
      assert.equal(f.sqlite.prepare('SELECT participation_route FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)?.participation_route,'managed_maker',race);
    } finally {f.dispose();}
  }
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
