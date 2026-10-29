import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { createBusinessSettingDraft, publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { loadSellerApplicationTerms } from '../lib/sellers/application-terms';
import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';

const now = 1_800_000_000_000;
const day = 86_400_000;
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const f = await incentiveReportDatabase();
  f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
    VALUES('terms-admin','terms-admin@local.hastabazaar.test','Fictional terms administrator','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('terms-admin','super_admin',1);`);
  return f;
}
async function publish(f: Fixture, key: 'independent_seller_commission_bps' | 'managed_sale_linked_platform_retention_bps', value = 1200) {
  const draft = await createBusinessSettingDraft(f.db, {key,value,actorId:'terms-admin',reason:'SIMULATED Task 6 disposable terms',requestId:`draft-${key}`,now:now-16*day});
  await publishBusinessSettingDraft(f.db, {id:draft.id,actorId:'terms-admin',expectedRevision:1,effectiveFrom:now-100,
    reason:'SIMULATED Task 6 disposable publication',requestId:`publish-${key}`,now:now-16*day});
  return draft.id;
}

// Bundle in memory. Only provider/authentication boundaries are substituted; the page,
// application form, effective settings and terms producers run as shipped.
async function page(db: D1Database) {
  const state = {db};
  const compiled = await build({entryPoints:['app/sell/apply/page.tsx'],bundle:true,write:false,platform:'node',format:'cjs',
    external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'application-provider-boundaries',setup(b) {
      b.onResolve({filter:/^(cloudflare:workers|next\/(link|navigation)|@\/lib\/auth\/seller-commercial-access|@\/components\/layout\/(site-header|site-footer))$/}, args=>({path:args.path,namespace:'application-fixture'}));
      b.onLoad({filter:/.*/,namespace:'application-fixture'},args=>({loader:'js',contents:({
        'cloudflare:workers':'exports.env={get DB(){return __fixture.db}};',
        'next/link':"module.exports=function Link(props){return require('react').createElement('a',props)};",
        'next/navigation':'exports.useRouter=()=>({refresh(){}});',
        '@/lib/auth/seller-commercial-access':"exports.requireSellerTermsPage=async()=>({userId:'applicant',identity:{email:'applicant@local.hastabazaar.test'}});",
        '@/components/layout/site-header':'exports.SiteHeader=()=>null;',
        '@/components/layout/site-footer':'exports.SiteFooter=()=>null;',
      } as Record<string,string>)[args.path]}));
    }}]});
  const output = {exports:{} as {default:()=>Promise<ReactElement>}};
  const clockDb = {prepare(sql:string) {return sql === "SELECT unixepoch('now') * 1000 AS now" ? {first:async()=>({now})} : db.prepare(sql);},batch:db.batch.bind(db)} as D1Database;
  state.db=clockDb;
  runInNewContext(compiled.outputFiles[0].text,{module:output,exports:output.exports,require:createRequire(import.meta.url),process,
    crypto:globalThis.crypto,TextEncoder,Response,Request,Headers,URL,__fixture:state});
  return renderToStaticMarkup(await output.exports.default());
}

for (const [registered,managed] of [[true,false],[false,true],[true,true],[false,false]] as const) {
  void test(`private application page renders independent availability: registered=${registered}, managed=${managed}`,async()=>{
    const f=await fixture();
    try {
      if(registered)await publish(f,'independent_seller_commission_bps');
      if(managed)await publish(f,'managed_sale_linked_platform_retention_bps');
      const html=await page(f.db);
      assert.match(html,/Seller registration/);
      assert.match(html,/All registration fields are optional at this stage/);
      const terms = await loadSellerApplicationTerms(f.db, now);
      assert.equal(terms.registered.status, registered ? 'ready' : 'unavailable');
      assert.equal(terms.managed.status, managed ? 'ready' : 'unavailable');
      assert.match(html,/<option[^>]*value="no" selected="">/);
      if(managed) {
        assert.match(html,/12%/);
        assert.match(html,/name="managedAgreementContext" value="[a-f0-9]{64}"/);
      } else assert.doesNotMatch(html,/name="managedAgreementContext"/);
      assert.doesNotMatch(html,/name="acceptedTerms"[^>]*required/);
      assert.doesNotMatch(html,/independent-seller % commission/);
    } finally {f.dispose();}
  });
}

void test('application terms propagate storage, corrupt published values and invalid clocks as operational errors',async()=>{
  const f=await fixture();
  try {
    await publish(f,'independent_seller_commission_bps');
    await publish(f,'managed_sale_linked_platform_retention_bps');
    await assert.rejects(()=>loadSellerApplicationTerms(f.db,0),/time|timestamp/i);
    const operational=new RangeError('Authorization/configuration lookup failed');
    await assert.rejects(()=>loadSellerApplicationTerms({prepare(){throw operational;}} as unknown as D1Database,now),error=>error===operational);
    f.sqlite.exec("UPDATE business_setting_versions SET value_json='not-json' WHERE setting_key='managed_sale_linked_platform_retention_bps'");
    await assert.rejects(()=>page(f.db),/JSON|Unexpected|invalid/i);
    f.sqlite.exec('DROP TABLE business_setting_versions');
    await assert.rejects(()=>page(f.db),/no such table/i);
  } finally {f.dispose();}
});

void test('future-only published 12% offers remain unavailable until their effective boundary',async()=>{
  const f=await fixture();
  try {
    const registeredId=await publish(f,'independent_seller_commission_bps');
    const retentionId=await publish(f,'managed_sale_linked_platform_retention_bps');
    const before=await loadSellerApplicationTerms(f.db,now-101);
    assert.deepEqual(before,{registered:{status:'unavailable'},managed:{status:'unavailable'}});
    const effective=await loadSellerApplicationTerms(f.db,now-100);
    assert.equal(effective.registered.status,'ready');assert.equal(effective.managed.status,'ready');
    if(effective.registered.status!=='ready'||effective.managed.status!=='ready')throw new Error('Expected current offers');
    assert.equal(effective.registered.terms.versionId,registeredId);
    assert.equal(effective.registered.terms.basisPoints,1200);
    assert.equal(effective.managed.terms.platformRetentionBps,1200);
    assert.equal(effective.managed.terms.version,'managed-supplier-maker-2026-10-20-v2');
    assert.equal(f.sqlite.prepare('SELECT id FROM business_setting_versions WHERE id=?').get(retentionId)?.id,retentionId);
  }finally{f.dispose();}
});

async function applicationApi(db:D1Database,at=Date.now()) {
  const bundle=await build({entryPoints:['app/api/seller-applications/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',
    plugins:[{name:'api-provider-boundaries',setup(b){
      b.onResolve({filter:/^(cloudflare:workers|@\/lib\/auth\/seller-commercial-access|@\/lib\/auth\/customer)$/},args=>({path:args.path,namespace:'api-fixture'}));
      b.onLoad({filter:/.*/,namespace:'api-fixture'},args=>({loader:'js',contents:({
        'cloudflare:workers':'exports.env={get DB(){return __fixture.db}};',
        '@/lib/auth/seller-commercial-access':"exports.SellerTermsAuthorizationError=class extends Error{};exports.requireSellerTermsApi=async()=>({userId:'applicant'});",
        '@/lib/auth/customer':"exports.CustomerAuthorizationError=class extends Error{};exports.getCustomerUser=async()=>({userId:'applicant',authSubject:'applicant',email:'applicant@local.hastabazaar.test'});",
      } as Record<string,string>)[args.path]}));
    }}]});
  const output={exports:{} as {POST:(request:Request)=>Promise<Response>}};
  class Clock extends Date { static now(){return at;} }
  runInNewContext(bundle.outputFiles[0].text,{module:output,exports:output.exports,require:createRequire(import.meta.url),process,
    crypto:globalThis.crypto,TextEncoder,Response,Request,Headers,FormData,File,URL,Date:Clock,__fixture:{db}});
  return output.exports.POST;
}
for(const [registered,stale] of [[true,false],[false,false],[true,true]]) {
  void test(stale?'application API rejects a saved 9% form when published 12% becomes effective':`application API explains missing effective ${registered?'registered':'managed'} terms before uploads`,async()=>{
    const f=await fixture();
    try {
      f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,phone,display_name,status,created_at,updated_at)
        VALUES('applicant','applicant','applicant@local.hastabazaar.test','9800000000','Fictional applicant','active',1,1);
        INSERT INTO user_roles(user_id,role,assigned_at) VALUES('applicant','customer',1);
        INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES('applicant','applicant@local.hastabazaar.test',1);
        INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES('applicant','+9779800000000',1);`);
      const data=new FormData();
      for(const [key,value] of Object.entries({hasBusinessTaxRegistration:registered?'yes':'no',applicantType:'individual',legalName:'Fictional applicant',
        representativeName:'Fictional applicant',tradingName:'Fictional studio',email:'applicant@local.hastabazaar.test',phone:'9800000000',
        province:'Madhesh',district:'Parsa',municipality:'Birgunj',locality:'Fictional workshop',businessDescription:'Handmade clay products',productCategories:'Clay work',
        applicationAcknowledgement:'yes',acceptedTerms:'yes',governmentIdType:'citizenship',governmentIdDescription:'Fictional citizenship',personalPan:'123456789',
        managedAgreementAccepted:'yes',managedAgreementVersion:'managed-supplier-maker-2026-10-20-v2',managedAgreementContext:'a'.repeat(64),sellerAgreementContext:'a'.repeat(64),
        payoutBeneficiary:'Fictional applicant',bankName:'Fictional Bank',bankBranch:'Birgunj',bankAccountNumber:'123456789012',
        pickupAddress:'Fictional pickup workshop Birgunj',returnAddress:'Fictional return workshop Birgunj',registrationAuthority:registered?'Private firm registration office':'',
        registrationNumber:registered?'FIRM-123':'',taxStatus:registered?'business_pan_only':'',taxRegistrationNumber:registered?'987654321':'',requestId:'missing-terms-request'}))data.set(key,value);
      let at=now;
      if(stale){
        await publish(f,'independent_seller_commission_bps',900);
        const shown=await getRegisteredSellerTerms(f.db,now);assert.equal(shown.basisPoints,900);
        const draft=await createBusinessSettingDraft(f.db,{key:'independent_seller_commission_bps',value:1200,actorId:'terms-admin',
          reason:'SIMULATED API twelve percent terms',requestId:'api-twelve-draft',now});
        at=now+15*day;
        await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'terms-admin',expectedRevision:1,effectiveFrom:at,
          reason:'SIMULATED API full notice publication',requestId:'api-twelve-publish',now});
        data.set('sellerAgreementContext',shown.context);
      }
      const post=await applicationApi(f.db,at);
      const response=await post(new Request('https://shop.example.test/api/seller-applications',{method:'POST',headers:{origin:'https://shop.example.test'},body:data}));
      assert.equal(response.status,stale?409:503,await response.clone().text());
      assert.match((await response.json() as {error:string}).error,stale?/terms have changed/i:/terms.*unavailable/i);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_profiles WHERE user_id='applicant'").get()?.n,0);
    }finally{f.dispose();}
  });
}
