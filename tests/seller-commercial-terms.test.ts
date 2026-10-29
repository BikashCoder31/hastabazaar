import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import * as settings from '../lib/db/repositories/marketplace-settings';
import { getLegalPolicyDocument, publicLegalPolicyNavigation } from '../lib/content/legal-policies';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

class Statement {
  values: SQLInputValue[] = [];
  constructor(readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return this.statement.get(...this.values) as T | undefined ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { return { success: true, results: [], meta: { changes: Number(this.statement.run(...this.values).changes) } }; }
}
class Database {
  beforeBatch: (() => void) | null = null;
  rateReads = 0;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { if (/FROM business_setting_versions/i.test(sql)) this.rateReads++; return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: Statement[]) {
    this.beforeBatch?.(); this.beforeBatch = null;
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, auth_subject TEXT, display_name TEXT, status TEXT);
    CREATE TABLE user_roles (user_id TEXT, role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT,version INTEGER,updated_by TEXT,updated_at INTEGER);
    CREATE TABLE seller_profiles (id TEXT PRIMARY KEY, user_id TEXT, status TEXT,seller_agreement_version TEXT,seller_agreement_accepted_at INTEGER,updated_at INTEGER);
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE business_setting_versions (id TEXT PRIMARY KEY,setting_key TEXT,version INTEGER,value_json TEXT,status TEXT,revision INTEGER,change_control TEXT,effective_from INTEGER,effective_until INTEGER,reason TEXT,created_by TEXT,created_at INTEGER,submitted_by TEXT,submitted_at INTEGER,approved_by TEXT,approved_at INTEGER,published_by TEXT,published_at INTEGER,decision_note TEXT,supersedes_id TEXT,last_request_id TEXT);
    CREATE TABLE operation_transaction_guards (id TEXT PRIMARY KEY, valid INTEGER CHECK(valid=1));
    CREATE TABLE seller_agreement_acceptance_history (id TEXT PRIMARY KEY,seller_id TEXT,agreement_version TEXT,language_presented TEXT,commission_setting_version_id TEXT,commission_bps INTEGER,acceptance_request_id TEXT,accepted_by TEXT,accepted_at INTEGER,simulation_label TEXT,UNIQUE(acceptance_request_id),UNIQUE(seller_id,agreement_version,language_presented,commission_setting_version_id));
    CREATE TABLE order_items(id TEXT PRIMARY KEY,commission_bps INTEGER,commission_paisa INTEGER);
    INSERT INTO users VALUES ('customer','customer-subject','Fictional Customer','active'),('other','other-subject','Other Customer','active'),('seller','seller-subject','Fictional Seller','active'),('super','super-subject','Super Admin','active'),('disabled','disabled-subject','Disabled','suspended');
    INSERT INTO user_roles VALUES ('customer','customer'),('other','customer'),('seller','seller'),('super','super_admin'),('disabled','customer');
    INSERT INTO seller_profiles(id,user_id,status) VALUES ('store','seller','approved');
    INSERT INTO order_items VALUES ('past',900,9000);
  `);
  function publish(id: string, version: number, bps: number, from: number) {
    sqlite.prepare(`INSERT INTO business_setting_versions VALUES (?,?,?,?,'published',3,'controlled',?,NULL,'SIMULATED approved rate','super',1,'super',1,'super',1,'super',1,'Approved',NULL,?)`)
      .run(id,'independent_seller_commission_bps',version,JSON.stringify(bps),from,id+'-request');
  }
  // Explicit fictional managed terms; application code has no default rate.
  sqlite.prepare(`INSERT INTO business_setting_versions VALUES (?,?,1,'900','published',3,'controlled',1,NULL,'Isolated historical terms','super',1,'super',1,'super',1,'super',1,'Approved',NULL,?)`)
    .run('managed-fixture','managed_sale_linked_platform_retention_bps','managed-fixture-request');
  return { sqlite, database: new Database(sqlite), publish };
}

void test('current seller agreement and examples follow the effective 10% setting without rewriting 9% history', async () => {
  const f = fixture();
  try {
    f.publish('nine',1,900,1); f.publish('ten',2,1000,100);
    assert.equal(typeof settings.getRegisteredSellerTerms, 'function', 'A configured seller terms reader is required');
    const terms = await settings.getRegisteredSellerTerms(f.database as unknown as D1Database,101);
    assert.equal(terms.percent,10); assert.equal(terms.versionId,'ten');
    assert.match(terms.document,/10% commission/); assert.match(terms.document,/commission is NPR 100/); assert.match(terms.document,/proceeds are NPR 900/);
    assert.doesNotMatch(terms.document,/9% commission|NPR 90\./);
    assert.equal(f.sqlite.prepare("SELECT commission_bps FROM order_items WHERE id='past'").get()!.commission_bps,900);
  } finally { f.sqlite.close(); }
});

void test('seller acceptance rejects stale displayed terms and a setting change inside the transaction', async () => {
  const f = fixture();
  try {
    f.publish('nine',1,900,1);
    assert.equal(typeof settings.getRegisteredSellerTerms,'function');
    assert.equal(typeof settings.buildSellerCommissionAcceptanceStatements,'function');
    const db=f.database as unknown as D1Database;
    const shown=await settings.getRegisteredSellerTerms(db,101);
    const statements=await settings.buildSellerCommissionAcceptanceStatements(db,{sellerId:'store',actorId:'seller',context:shown.context,requestId:'accept',now:101});
    f.database.beforeBatch=()=>f.publish('ten',2,1000,100);
    await assert.rejects(f.database.batch(statements as unknown as Statement[]));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history').get()!.n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM operation_transaction_guards').get()!.n,0);
    await assert.rejects(settings.buildSellerCommissionAcceptanceStatements(db,{sellerId:'store',actorId:'seller',context:shown.context,requestId:'retry',now:101}),/changed/i);
    const current=await settings.getRegisteredSellerTerms(db,101);
    await f.database.batch(await settings.buildSellerCommissionAcceptanceStatements(db,{sellerId:'store',actorId:'seller',context:current.context,requestId:'accept-current',now:101}) as unknown as Statement[]);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM seller_agreement_acceptance_history').get()!.commission_bps,1000);
  } finally { f.sqlite.close(); }
});

void test('customers see seller terms only after their own explicit onboarding start; inactive accounts cannot opt in', async () => {
  const f=fixture();
  try {
    const access=await import('../lib/db/repositories/seller-commercial-access').catch(()=>null);
    assert.ok(access,'Server-side seller commercial access is required');
    const db=f.database as unknown as D1Database;
    assert.equal(await access.getSellerCommercialAccess(db,'customer-subject'),null);
    assert.equal(await access.getSellerCommercialAccess(db,'unknown-subject'),null);
    assert.equal((await access.getSellerCommercialAccess(db,'seller-subject'))?.audience,'seller');
    assert.equal((await access.getSellerCommercialAccess(db,'super-subject'))?.audience,'staff');
    await access.startSellerRegistration(db,{userId:'customer',requestId:'start',now:101});
    await access.startSellerRegistration(db,{userId:'customer',requestId:'start-again',now:102});
    assert.equal((await access.getSellerCommercialAccess(db,'customer-subject'))?.audience,'applicant');
    assert.equal(await access.getSellerCommercialAccess(db,'other-subject'),null);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='seller.registration.started'").get()!.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='customer'").get()!.n,1);
    await assert.rejects(access.startSellerRegistration(db,{userId:'disabled',requestId:'disabled',now:101}));
  } finally { f.sqlite.close(); }
});

void test('customer policy navigation excludes commercial terms and rate-less agreement rendering is refused', () => {
  assert.ok(!publicLegalPolicyNavigation.some(policy=>policy.key==='seller-agreement'));
  assert.throws(()=>getLegalPolicyDocument('seller-agreement'),/configured|commission|seller/i);
});

void test('financial acceptance rolls back if the accepting account is suspended before commit', async () => {
  const f=fixture();
  try {
    f.publish('ten',1,1000,1);
    const db=f.database as unknown as D1Database;
    const shown=await settings.getRegisteredSellerTerms(db,101);
    const prepared=await settings.prepareSellerCommissionAcceptance(db,{sellerId:'store',actorId:'seller',context:shown.context,requestId:'suspended',now:101});
    assert.equal(prepared.terms.context,shown.context);
    f.database.beforeBatch=()=>{f.sqlite.exec("UPDATE users SET status='suspended' WHERE id='seller'");};
    await assert.rejects(f.database.batch(prepared.statements as unknown as Statement[]));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history').get()!.n,0);
  } finally { f.sqlite.close(); }
});

async function loadBoundary(entry: string, state: { database: Database; identity: {userId:string;email:string;displayName:string;fullName:null} | null; customer: {userId:string;email:string} | null }) {
  const compiled=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'seller-terms-provider-boundaries',setup(b){
    b.onResolve({filter:/^(cloudflare:workers|@\/app\/auth|@\/lib\/auth\/customer|@\/lib\/auth\/seller|next\/navigation|next\/link)$/},args=>({path:args.path,namespace:'seller-terms-fixture'}));
    b.onResolve({filter:/(?:^@\/components\/layout\/|^\.\/)(site-header|site-footer)$/},args=>({path:args.path.includes('header')?'header':'footer',namespace:'seller-terms-fixture'}));
    b.onLoad({filter:/.*/,namespace:'seller-terms-fixture'},args=>{
      const source: Record<string,string>={
        'cloudflare:workers':'exports.env={get DB(){return __fixture.database}};',
        '@/app/auth':`exports.getAuthenticatedUser=async()=>__fixture.identity;exports.requireAuthenticatedUser=async(path)=>{if(!__fixture.identity)throw new Error('REDIRECT:/login');return __fixture.identity};`,
        '@/lib/auth/customer':`exports.CustomerAuthorizationError=class extends Error{};exports.getCustomerUser=async()=>__fixture.customer;`,
        '@/lib/auth/seller':`exports.SellerAuthorizationError=class extends Error{constructor(message,status){super(message);this.status=status}};exports.requireSellerApi=async()=>{const row=await __fixture.database.prepare("SELECT u.id AS userId,s.id AS sellerId,s.seller_agreement_version AS sellerAgreementVersion FROM users u JOIN seller_profiles s ON s.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND s.status='approved' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller')").bind(__fixture.identity?.userId??'').first();if(!row)throw new exports.SellerAuthorizationError('Active seller required.',403);return row};`,
        'next/navigation':`exports.redirect=(path)=>{throw new Error('REDIRECT:'+path)};exports.useRouter=()=>({push(){},refresh(){}});`,
        'next/link':`module.exports=function Link(props){return require('react').createElement('a',props)};`,
        header:`exports.SiteHeader=()=>null;`,footer:`exports.SiteFooter=()=>null;`,
      };
      return {contents:source[args.path],loader:'js'};
    });
  }}]});
  const compiledModule={exports:{} as Record<string,unknown>};
  runInNewContext(compiled.outputFiles[0].text,{module:compiledModule,exports:compiledModule.exports,require:createRequire(import.meta.url),process,crypto:globalThis.crypto,Response,Request,Headers,URL,TextEncoder,Intl,__fixture:state});
  return compiledModule.exports;
}

void test('real commercial terms API requires sign-in and explicit start before reading rates and never promotes a customer', async () => {
  const f=fixture();
  try {
    const state={database:f.database,identity:null as {userId:string;email:string;displayName:string;fullName:null}|null,customer:null as {userId:string;email:string}|null};
    const api=await loadBoundary('app/api/seller-applications/managed-terms/route.ts',state);
    const get=api.GET as ()=>Promise<Response>;
    assert.equal((await get()).status,401);assert.equal(f.database.rateReads,0);
    state.identity={userId:'customer-subject',email:'customer@example.test',displayName:'Fictional Customer',fullName:null};
    state.customer={userId:'customer',email:'customer@example.test'};
    const denied=await get();assert.equal(denied.status,403);assert.equal(f.database.rateReads,0);assert.doesNotMatch(await denied.text(),/platformRetentionBps/);
    const start=await loadBoundary('app/api/seller-applications/start/route.ts',state);
    const post=start.POST as (r:Request)=>Promise<Response>;
    assert.equal((await post(new Request('https://shop.example.test/api/seller-applications/start',{method:'POST',headers:{origin:'https://evil.example.test','sec-fetch-site':'cross-site'}}))).status,403);
    assert.equal((await post(new Request('https://shop.example.test/api/seller-applications/start',{method:'POST',headers:{origin:'https://shop.example.test'},body:JSON.stringify({userId:'other'})}))).status,200);
    const allowed=await get();assert.equal(allowed.status,200);assert.equal(allowed.headers.get('cache-control'),'private, no-store');assert.equal(allowed.headers.get('vary'),'Cookie');
    assert.equal((await allowed.json() as {platformRetentionBps:number}).platformRetentionBps,900);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='customer'").get()!.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE actor_id='other'").get()!.n,0);
  } finally { f.sqlite.close(); }
});

void test('public seller landing reads no rates; private form and agreement are gated and show the effective 10% after start', async () => {
  const f=fixture();
  try {
    f.publish('ten',1,1000,1);
    const state={database:f.database,identity:null as {userId:string;email:string;displayName:string;fullName:null}|null,customer:null as {userId:string;email:string}|null};
    const landing=await loadBoundary('app/sell/page.tsx',state);
    const apply=await loadBoundary('app/sell/apply/page.tsx',state);
    const agreement=await loadBoundary('app/seller-agreement/page.tsx',state);
    const render=async(page:Record<string,unknown>)=>renderToStaticMarkup(await (page.default as ()=>Promise<ReactElement>)());
    const anonymous=await render(landing);assert.match(anonymous,/Sign in to start seller registration/);assert.doesNotMatch(anonymous,/9%|10%|sellerAgreementContext/);assert.equal(f.database.rateReads,0);
    await assert.rejects(render(apply),/REDIRECT:\/login/);await assert.rejects(render(agreement),/REDIRECT:\/login/);assert.equal(f.database.rateReads,0);
    state.identity={userId:'customer-subject',email:'customer@example.test',displayName:'Fictional Customer',fullName:null};state.customer={userId:'customer',email:'customer@example.test'};
    const buyer=await render(landing);assert.match(buyer,/Start seller registration/);assert.doesNotMatch(buyer,/9%|10%|sellerAgreementContext/);
    await assert.rejects(render(apply),/REDIRECT:\/sell/);await assert.rejects(render(agreement),/REDIRECT:\/sell/);assert.equal(f.database.rateReads,0);
    const access=await import('../lib/db/repositories/seller-commercial-access');
    await access.startSellerRegistration(f.database as unknown as D1Database,{userId:'customer',requestId:'page-start',now:101});
    const application=await render(apply);assert.match(application,/Seller registration/);assert.match(application,/All registration fields are optional/);
    const terms=await settings.getRegisteredSellerTerms(f.database as unknown as D1Database,101);assert.equal(terms.percent,10);assert.ok(terms.context);
    assert.match(application,/name="managedAgreementContext"/);
    const document=await render(agreement);assert.match(document,/10% commission/);assert.match(document,/commission is NPR 100/);assert.doesNotMatch(document,/9% commission/);
  } finally { f.sqlite.close(); }
});

void test('renewal acceptance refuses suspended profiles or revoked seller roles even when customer role remains', async()=>{
  for(const revoke of ["UPDATE seller_profiles SET status='suspended' WHERE id='store'","DELETE FROM user_roles WHERE user_id='seller' AND role='seller'"]){
    const f=fixture();try{
      f.publish('ten',1,1000,1);f.sqlite.exec("INSERT INTO user_roles VALUES ('seller','customer')");
      const db=f.database as unknown as D1Database;const terms=await settings.getRegisteredSellerTerms(db,101);
      const prepared=await settings.prepareSellerCommissionAcceptance(db,{sellerId:'store',actorId:'seller',context:terms.context,requestId:'revoke',now:101});
      f.database.beforeBatch=()=>f.sqlite.exec(revoke);
      await assert.rejects(f.database.batch(prepared.statements as unknown as Statement[]));
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history').get()!.n,0);
    }finally{f.sqlite.close();}
  }
});

void test('application acceptance requires the own submitted profile, customer role and explicit start',async()=>{
  const f=fixture();try{
    f.publish('ten',1,1000,1);f.sqlite.exec("INSERT INTO seller_profiles(id,user_id,status) VALUES ('pending-store','customer','submitted')");
    const db=f.database as unknown as D1Database;const terms=await settings.getRegisteredSellerTerms(db,101);
    const options={sellerId:'pending-store',actorId:'customer',context:terms.context,requestId:'application',now:101,mode:'application' as const};
    const before=await settings.prepareSellerCommissionAcceptance(db,options);
    await assert.rejects(f.database.batch(before.statements as unknown as Statement[]));
    const access=await import('../lib/db/repositories/seller-commercial-access');
    await access.startSellerRegistration(db,{userId:'customer',requestId:'start-application',now:101});
    await f.database.batch((await settings.prepareSellerCommissionAcceptance(db,options)).statements as unknown as Statement[]);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM seller_agreement_acceptance_history').get()!.commission_bps,1000);
  }finally{f.sqlite.close();}
});

void test('concurrent identical renewal returns its matching recorded acceptance without duplicate history',async()=>{
  const f=fixture();try{
    f.publish('ten',1,1000,1);const db=f.database as unknown as D1Database;
    const terms=await settings.getRegisteredSellerTerms(db);
    const state={database:f.database,identity:{userId:'seller-subject',email:'seller@example.test',displayName:'Seller',fullName:null},customer:null};
    const api=await loadBoundary('app/api/seller/agreements/route.ts',state);
    f.database.beforeBatch=()=>{
      f.sqlite.prepare('INSERT INTO seller_agreement_acceptance_history VALUES (?,?,?,?,?,?,?,?,?,NULL)').run('winner','store',terms.agreementVersion,'en',terms.versionId,1000,'winner-request','seller',Date.now());
      f.sqlite.prepare("UPDATE seller_profiles SET seller_agreement_version=? WHERE id='store'").run(terms.agreementVersion);
    };
    const response=await (api.POST as (r:Request)=>Promise<Response>)(new Request('https://shop.example.test/api/seller/agreements',{method:'POST',headers:{origin:'https://shop.example.test','content-type':'application/json','x-request-id':'loser-request'},body:JSON.stringify({accepted:true,language:'en',termsContext:terms.context})}));
    assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json() as {status:string}).status,'already_accepted');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history').get()!.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='seller.agreement.accepted'").get()!.n,0);
  }finally{f.sqlite.close();}
});
