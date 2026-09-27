import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { build } from 'esbuild';

import { saveTaxonomy, classifyProduct } from '../lib/db/repositories/catalog-admin';
import { createExceptionWork, updateExceptionWork } from '../lib/operations/exception-work';
import { issueManagedInvoiceAdjustment } from '../lib/db/repositories/managed-documents';
import { SIMULATED_RECORD_LABEL } from '../lib/staging/environment';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { activateManagedMakerForSimulation } from '../lib/managed-commerce/activation';
import { operateParcel } from '../lib/operations/parcels';
import { processPayoutRequest } from '../lib/db/repositories/payouts';
import { operateDataRightsRequest } from '../lib/db/repositories/operations';
import { reviewRider, saveRiderPolicy, setRiderOpenBoxEligibility, rejectRiderReport } from '../lib/riders/repository';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';

test('all ten staff operations expose protected, configurable record adapters', () => {
  const ids = ['staff.catalog', 'staff.product-classification', 'staff.exception-work',
    'staff.invoice-adjustment', 'staff.managed-maker-activation', 'staff.parcel-control',
    'staff.payout-request-action', 'staff.privacy-action', 'staff.rider-control-1',
    'staff.rider-control-2'] as const;
  for (const id of ids) {
    const definition = FORM_REGISTRY[id];
    assert.equal(definition.adapterId, id);
    assert.equal(IMPLEMENTED_FORM_ADAPTERS[id]?.route, definition.route);
    assert.equal(definition.capabilities.answerBehavior, 'record');
    assert.ok(definition.capabilities.customFieldTypes.includes('short_text'));
    assert.ok(definition.baseFields.some((field) => field.key === 'requestId' && field.capability === 'protected'));
    assert.ok(definition.baseFields.some((field) => field.key === 'formVersion' && field.capability === 'protected'));
    assert.ok(definition.baseFields.every((field) => field.capability === 'protected'));
  }
});

test('staff drafts cannot publish any client built-in key under a canonical alias', () => {
  const clientKeys = {
    'staff.catalog': ['kind','id','slug','nameEn','nameNe','sortOrder','isActive','idempotencyKey'],
    'staff.product-classification': ['categoryId','occasionIds','idempotencyKey'],
    'staff.exception-work': ['action','id','version','job','kind','cash','owner','next','note','resolve','evidence','sourceReviewed','obligationsReviewed','followupComplete','requestId'],
    'staff.invoice-adjustment': ['invoiceId','kind','amount','amountPaisa','reasonCode','note','requestId'],
    'staff.managed-maker-activation': ['model','legalSellerReference','invoiceIssuerReference','payoutBeneficiaryReference','agreementVersion','agreementLanguage','agreementAcceptedAt','requestId'],
    'staff.parcel-control': ['jobId','version','action','note','method','riderEmail','courierName','trackingCode','trackingUrl','reference','amount','amountPaisa','cashRecordId','requestId'],
    'staff.payout-request-action': ['action','note','requestId'],
    'staff.privacy-action': ['action','note','requestId'],
    'staff.rider-control-1': ['action','status','note','userId','reportId','version','eligible','requestId'],
    'staff.rider-control-2': ['action','version','otpScope','requestId'],
  } as const;
  const canonical = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  for (const [formId, keys] of Object.entries(clientKeys)) {
    const protectedKeys = new Set(FORM_REGISTRY[formId].baseFields
      .filter((field) => field.capability === 'protected').map((field) => canonical(field.key)));
    for (const key of keys) assert.ok(protectedKeys.has(canonical(key)), `${formId}:${key}`);
  }
  const formId = 'staff.catalog';
  assert.throws(() => validateFormDraft(formId, { formId, fields: [{
    id: 'idempotency_key', key: 'idempotency_key', type: 'short_text', label: 'Reference',
    required: true, order: 0, status: 'active',
  }] }));
});

declare global {
  var staffCatalogDb: D1Database;
  var staffCatalogActor: { id: string; role: 'admin' | 'super_admin' } | null;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.staffCatalogDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"http://localhost:3000"}', shortCircuit: true };
  if (specifier === '@/lib/db/repositories/business-settings') return { url: 'data:text/javascript,export async function getEffectiveBusinessSetting(database,key){return {value:key==="managed_adjustment_reason_codes"?["correction"]:key==="managed_maker_active_model"?"managed_sale_linked_percentage_v1":"activation_enabled"}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.staffCatalogActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.staffCatalogActor}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly sql: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.sql.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.sql.all(...this.values) as T[] }; }
  async run() { return { meta: { changes: Number(this.sql.run(...this.values).changes) } }; }
}
class Database {
  beforeBatch?: () => void;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const beforeBatch = this.beforeBatch; this.beforeBatch = undefined; beforeBatch?.();
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function fixture(fields: unknown[] = [{ id: 'context_note', key: 'context_note', type: 'short_text', label: 'Staff context', required: true, order: 0, status: 'active' }]) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,display_name TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT);
    CREATE TABLE staff_permission_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE operation_transaction_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,currency TEXT);
    CREATE TABLE managed_invoice_groups(id TEXT PRIMARY KEY,order_id TEXT,issuer_reference TEXT,invoice_number TEXT,snapshot_json TEXT,simulation_label TEXT,status TEXT);
    CREATE TABLE managed_invoice_adjustments(id TEXT PRIMARY KEY,invoice_group_id TEXT,adjustment_number TEXT UNIQUE,kind TEXT,amount_paisa INTEGER,reason_code TEXT,note TEXT,snapshot_json TEXT,simulation_label TEXT,request_id TEXT UNIQUE,created_by TEXT,issued_at INTEGER);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT,seller_name_snapshot TEXT);
    CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY,cod_due_paisa INTEGER,collected_paisa INTEGER DEFAULT 0,remitted_paisa INTEGER DEFAULT 0,
      version INTEGER DEFAULT 0,method TEXT,rider_user_id TEXT,courier_name TEXT,tracking_url TEXT,delivered_at INTEGER,open_box_required INTEGER DEFAULT 0,
      open_box_snapshot_json TEXT,rider_finance_snapshot_json TEXT,latitude REAL,longitude REAL,accuracy REAL,position_at INTEGER,operation_request_id TEXT);
    CREATE TABLE parcel_courier_costs(id TEXT PRIMARY KEY,shipping_job_id TEXT,amount_paisa INTEGER,evidence_reference TEXT,created_by TEXT,note TEXT,created_at INTEGER);
    CREATE TABLE parcel_operation_events(id TEXT PRIMARY KEY,order_id TEXT,shipping_job_id TEXT,actor_id TEXT,action TEXT,payload_json TEXT,note TEXT,created_at INTEGER);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY,participation_route TEXT,application_stage TEXT,commercial_model TEXT,
      legal_seller_reference TEXT,invoice_issuer_reference TEXT,payout_beneficiary_reference TEXT,managed_agreement_version TEXT,
      managed_agreement_language TEXT,managed_agreement_accepted_at INTEGER,version INTEGER,updated_at INTEGER);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);
    CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,shipping_job_id TEXT,status TEXT);
    INSERT INTO shipping_jobs VALUES ('job-one','order-one','delivery_failed');
    INSERT INTO users VALUES ('admin','active','Administrator');
    INSERT INTO user_roles VALUES ('admin','super_admin');
    CREATE TABLE categories(id TEXT PRIMARY KEY,parent_id TEXT,slug TEXT UNIQUE,name_en TEXT,name_ne TEXT,is_active INTEGER,sort_order INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE occasions(id TEXT PRIMARY KEY,slug TEXT UNIQUE,name_en TEXT,name_ne TEXT,is_active INTEGER,sort_order INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE products(id TEXT PRIMARY KEY,category_id TEXT,updated_at INTEGER);
    CREATE TABLE product_occasions(product_id TEXT,occasion_id TEXT,created_at INTEGER);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
    INSERT INTO products VALUES ('product-one',NULL,1);
    INSERT INTO categories VALUES ('existing',NULL,'existing','Existing','Existing',1,1,1,1);
    INSERT INTO occasions VALUES ('festival','festival','Festival','Festival',1,1,1,1);`);
  sqlite.exec("ALTER TABLE products ADD COLUMN seller_id TEXT; ALTER TABLE products ADD COLUMN status TEXT;");
  sqlite.exec("ALTER TABLE orders ADD COLUMN status TEXT; ALTER TABLE orders ADD COLUMN updated_at INTEGER; ALTER TABLE orders ADD COLUMN payment_mode TEXT; ALTER TABLE shipping_jobs ADD COLUMN seller_id TEXT; ALTER TABLE shipping_jobs ADD COLUMN tracking_code TEXT;");
  sqlite.exec("INSERT INTO orders(id,order_number,currency,status,updated_at,payment_mode) VALUES ('order-one','ORD-PARCEL','NPR','confirmed',1,'cod'); UPDATE shipping_jobs SET seller_id='seller-one' WHERE id='job-one'; INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa) VALUES ('job-one',1000)");
  sqlite.exec("INSERT INTO seller_profiles VALUES ('seller-one','maker'); INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,version) VALUES ('seller-one','managed_maker','approved_for_activation',0); INSERT INTO products(id,seller_id,status) VALUES ('maker-product','seller-one','approved')");
  sqlite.prepare("INSERT INTO orders(id,order_number,currency) VALUES ('order-invoice','ORD-INV','NPR')").run();
  sqlite.prepare(`INSERT INTO managed_invoice_groups VALUES ('invoice-one','order-invoice','SIM-ISSUER','SIM-INV-1',?,?,'issued')`)
    .run(JSON.stringify({ productTotalPaisa: 2000 }), SIMULATED_RECORD_LABEL);
  sqlite.exec(readFileSync('drizzle/0044_business_configuration.sql', 'utf8'));
  for (const [key, value] of [['managed_maker_program_mode', 'activation_enabled'],
    ['managed_maker_active_model', 'managed_sale_linked_percentage_v1']] as const)
    sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES (?, ?,1,?,'published',1,'controlled',1,'Fixture setting','admin',1,?)`)
      .run(`${key}-v1`, key, JSON.stringify(value), `seed-${key}`);
  sqlite.exec(readFileSync('drizzle/0034_exception_work.sql', 'utf8'));
  for (const statement of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split('--> statement-breakpoint'))
    if (statement.trim()) sqlite.exec(statement);
  for (const formId of ['staff.catalog', 'staff.product-classification', 'staff.exception-work', 'staff.invoice-adjustment', 'staff.managed-maker-activation', 'staff.parcel-control'])
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields }), `seed-${formId}`);
  const database = new Database(sqlite) as unknown as D1Database;
  globalThis.staffCatalogDb = database;
  globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
  return { sqlite, database };
}
const answer = (formId: 'staff.catalog' | 'staff.product-classification' | 'staff.exception-work' | 'staff.invoice-adjustment' | 'staff.managed-maker-activation' | 'staff.parcel-control', requestId: string, value = 'Reviewed bilingual naming') => ({
  requestId, versionId: `${formId}-v1`, answers: { formId, version: 1, answers: [{ fieldId: 'context_note', label: 'Staff context', type: 'short_text' as const, value }] },
});

function financeFixture(fields: unknown[] = [{id:'context_note',key:'context_note',type:'short_text',label:'Staff context',required:true,order:0,status:'active'}]) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort())
    for (const statement of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) sqlite.exec(statement);
  sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
    VALUES ('admin','admin@local.test','Administrator','active',1,1),('maker','maker@local.test','Maker','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('admin','admin',1),('maker','seller',1);
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,
      representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
      VALUES ('seller-one','maker','Maker Legal','Maker','Synthetic','SIM-1','none','NONE','Maker','9812345678','maker@local.test',
        'Bagmati','Kathmandu','Kathmandu','Local','SIM-PAYOUT','approved',1,1);
    INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
      VALUES ('ledger-one','seller-one','sale',5000,1,'Synthetic earned amount',1);
    INSERT INTO payout_requests(id,seller_id,status,seller_note,available_amount_snapshot_paisa,created_request_id,created_at,updated_at)
      VALUES ('request-one','seller-one','submitted','Seller requested payout',5000,'seller-request-one',1,1);`);
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('staff.payout-request-action-v1','staff.payout-request-action',1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,'payout-form-seed')`)
    .run(JSON.stringify({formId:'staff.payout-request-action',fields}));
  const database = new Database(sqlite) as unknown as D1Database;
  globalThis.staffCatalogDb = database;
  globalThis.staffCatalogActor = { id: 'admin', role: 'admin' };
  return { sqlite, database };
}
const payoutAnswer = (requestId:string,value='Reviewed destination and available ledger') => ({requestId,
  versionId:'staff.payout-request-action-v1',answers:{formId:'staff.payout-request-action' as const,version:1,
    answers:[{fieldId:'context_note',label:'Staff context',type:'short_text' as const,value}]}});

function privacyFixture(fields: unknown[] = [{id:'context_note',key:'context_note',
  type:'short_text',label:'Staff context',required:true,order:0,status:'active'}]) {
  const f=financeFixture();
  f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
    VALUES ('customer','customer@local.test','Customer','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('customer','customer',1);
    UPDATE user_roles SET role='super_admin' WHERE user_id='admin';
    INSERT INTO data_rights_requests(id,reference_number,customer_id,request_type,detail,status,
      created_request_id,created_at,updated_at)
      VALUES ('privacy-one','PRIV-1','customer','correction','Correct profile name','submitted','privacy-create',1,1);`);
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('staff.privacy-action-v1','staff.privacy-action',1,1,'published',?,'Fixture',
      'admin',1,'admin',1,'admin',1,'privacy-form-seed')`)
    .run(JSON.stringify({formId:'staff.privacy-action',fields}));
  globalThis.staffCatalogActor={id:'admin',role:'super_admin'};
  return f;
}
const privacyAnswer=(requestId:string,value='Identity evidence checked')=>({requestId,
  versionId:'staff.privacy-action-v1',answers:{formId:'staff.privacy-action' as const,
    version:1,answers:[{fieldId:'context_note',label:'Staff context',type:'short_text' as const,value}]}});

function riderFixture(fields:unknown[]=[{id:'context_note',key:'context_note',type:'short_text',
  label:'Staff context',required:true,order:0,status:'active'}]) {
  const f=financeFixture();
  f.sqlite.exec(`UPDATE user_roles SET role='super_admin' WHERE user_id='admin';
    INSERT INTO users(id,email,display_name,status,created_at,updated_at)
      VALUES ('rider-one','rider@local.test','Rider','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('rider-one','rider',1);
    INSERT INTO rider_profiles(user_id,status,application_id,version,updated_at)
      VALUES ('rider-one','submitted','application-one',0,1);`);
  for(const formId of ['staff.rider-control-1','staff.rider-control-2'])
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
      created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
      .run(`${formId}-v1`,formId,JSON.stringify({formId,fields}),`seed-${formId}`);
  globalThis.staffCatalogActor={id:'admin',role:'super_admin'};
  return f;
}
const riderAnswer=(formId:'staff.rider-control-1'|'staff.rider-control-2',requestId:string,
  value='Reviewed rider evidence')=>({requestId,versionId:`${formId}-v1`,answers:{formId,version:1,
    answers:[{fieldId:'context_note',label:'Staff context',type:'short_text' as const,value}]}});

void test('rider review attaches one answer to the reviewed rider and rejects changed replay', async()=>{
  const {sqlite,database}=riderFixture();
  try {
    const options={actorId:'admin',userId:'rider-one',version:0,status:'approved',
      note:'Verified identity evidence',now:100,requestId:'rider-review-one',
      form:riderAnswer('staff.rider-control-1','rider-review-one')};
    await reviewRider(database,options);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-1' AND subject_type='rider' AND subject_id='rider-one'").get() as {n:number}).n,1);
    await reviewRider(database,options);
    await assert.rejects(reviewRider(database,{...options,form:riderAnswer('staff.rider-control-1','rider-review-one','Changed evidence')}));
  } finally {sqlite.close();}
});

void test('rider eligibility and policy decisions each retain exact contextual answers',async()=>{
  const {sqlite,database}=riderFixture();
  try {
    sqlite.exec("UPDATE rider_profiles SET status='approved' WHERE user_id='rider-one'");
    const eligibility={actorId:'admin',userId:'rider-one',version:0,eligible:true,
      note:'Verified open box training and evidence',now:100,requestId:'rider-open-box-one',
      form:riderAnswer('staff.rider-control-1','rider-open-box-one')};
    await setRiderOpenBoxEligibility(database,eligibility);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-1' AND subject_id='rider-one'").get() as {n:number}).n,1);
    await setRiderOpenBoxEligibility(database,eligibility);
    await assert.rejects(setRiderOpenBoxEligibility(database,{...eligibility,eligible:false}));
    const policy={actorId:'admin',version:0,openBox:false,otpScope:'prepaid_only',now:110,
      requestId:'rider-policy-one',form:riderAnswer('staff.rider-control-2','rider-policy-one')};
    await saveRiderPolicy(database,policy);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-2' AND subject_type='rider_policy' AND subject_id='current'").get() as {n:number}).n,1);
    await saveRiderPolicy(database,policy);
    await assert.rejects(saveRiderPolicy(database,{...policy,form:riderAnswer('staff.rider-control-2','rider-policy-one','Changed policy context')}));
  } finally {sqlite.close();}
});

void test('rider report rejection retains one answer on the exact report',async()=>{
  const {sqlite,database}=riderFixture();
  try {
    sqlite.exec(`INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,
      policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,
      grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
      VALUES ('rider-order','RIDER-1','customer@local.test','9800000000','dispatched','en',
      'v1','{}',1000,0,1000,'cod','pending',1,1);
      INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
      VALUES ('rider-job','rider-order','seller-one','outbound','dispatched','admin','rider-job-create',1,1);
      INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,created_at,method,rider_user_id,version)
      VALUES ('rider-job',1000,1,'own_rider','rider-one',0);
      INSERT INTO rider_reports(id,shipping_job_id,rider_user_id,assignment_version,kind,note,
        cash_paisa,status,created_at,request_id,policy_version,open_box)
      VALUES ('report-one','rider-job','rider-one',0,'customer_unavailable',
        'Customer not present at handover',0,'pending',1,'rider-submit-one',0,0);`);
    const options={actorId:'admin',reportId:'report-one',note:'Proof does not match the delivery attempt',
      now:100,requestId:'rider-reject-one',form:riderAnswer('staff.rider-control-1','rider-reject-one')};
    await rejectRiderReport(database,options);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-1' AND subject_type='rider_report' AND subject_id='report-one'").get() as {n:number}).n,1);
    await rejectRiderReport(database,options);
    await assert.rejects(rejectRiderReport(database,{...options,reportId:'other-report'}));
  } finally {sqlite.close();}
});

void test('rider report confirmation links configured answer to its accepted report atomically',async()=>{
  const {sqlite,database}=riderFixture();
  try {
    sqlite.exec("UPDATE rider_profiles SET status='approved' WHERE user_id='rider-one'");
    sqlite.exec(`INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,
      policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,
      grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
      VALUES ('confirm-order','CONFIRM-1','customer@local.test','9800000000','dispatched','en',
      'v1','{}',1000,0,1000,'cod','pending',1,1);
      INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
      VALUES ('confirm-job','confirm-order','seller-one','outbound','dispatched','admin','confirm-job-create',1,1);
      INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,created_at,method,rider_user_id,version)
      VALUES ('confirm-job',1000,1,'own_rider','rider-one',0);
      INSERT INTO rider_reports(id,shipping_job_id,rider_user_id,assignment_version,kind,note,
        cash_paisa,status,created_at,request_id,policy_version,open_box)
      VALUES ('confirm-report','confirm-job','rider-one',0,'customer_unavailable',
        'Customer not present at handover',0,'pending',1,'rider-submit-confirm',0,0);`);
    const requestId='rider-confirm:confirm-report';
    const operation={jobId:'confirm-job',actorId:'admin',version:0,requestId,riderReportId:'confirm-report',
      action:'fail',note:'Staff reviewed rider evidence and reported COD amount.',now:100,
      form:{...riderAnswer('staff.rider-control-1',requestId),formId:'staff.rider-control-1' as const}};
    await operateParcel(database,operation);
    assert.equal((sqlite.prepare("SELECT status FROM rider_reports WHERE id='confirm-report'").get() as {status:string}).status,'accepted');
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-1' AND subject_type='rider_report' AND subject_id='confirm-report'").get() as {n:number}).n,1);
    await operateParcel(database,operation);
  } finally {sqlite.close();}
});

void test('rider route validates both published forms before guarded review and policy writes',async()=>{
  const {sqlite}=riderFixture();
  try {
    const {POST}=await import('../app/api/admin/riders/route');
    const request=(body:unknown)=>new Request('http://localhost:3000/api/admin/riders',{
      method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},
      body:JSON.stringify(body)});
    const review={action:'review',userId:'rider-one',version:0,status:'approved',
      note:'Verified identity evidence',requestId:'rider-route-review',formVersion:1,customAnswers:[{fieldId:'context_note',value:'Reviewed rider evidence'}]};
    globalThis.staffCatalogActor=null;
    assert.equal((await POST(request(review))).status,403);
    globalThis.staffCatalogActor={id:'admin',role:'super_admin'};
    assert.equal((await POST(request({...review,customAnswers:[{fieldId:'status',value:'rejected'}]}))).status,400);
    assert.equal((await POST(request(review))).status,200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-1' AND subject_id='rider-one'").get() as {n:number}).n,1);
    const policy={action:'policy',version:0,otpScope:'prepaid_only',requestId:'rider-route-policy',
      formVersion:1,customAnswers:[{fieldId:'context_note',value:'Reviewed OTP scope'}]};
    assert.equal((await POST(request(policy))).status,200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-2' AND subject_id='current'").get() as {n:number}).n,1);
  } finally {sqlite.close();}
});

void test('rider decision version and current staff role races leave no answer or rider event',async()=>{
  for(const race of ['version','role'] as const){
    const {sqlite,database}=riderFixture();
    try {
      (database as unknown as Database).beforeBatch=()=>sqlite.exec(race==='version'
        ? "UPDATE rider_profiles SET version=1 WHERE user_id='rider-one'"
        : "DELETE FROM user_roles WHERE user_id='admin'");
      await assert.rejects(reviewRider(database,{actorId:'admin',userId:'rider-one',version:0,
        status:'approved',note:'Verified identity evidence',now:100,requestId:`rider-race-${race}`,
        form:riderAnswer('staff.rider-control-1',`rider-race-${race}`)}));
      assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.rider-control-1'").get() as {n:number}).n,0);
      assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM rider_events WHERE user_id='rider-one'").get() as {n:number}).n,0);
    } finally {sqlite.close();}
  }
});

void test('privacy decision stores one answer with exact actor, record, action and answer replay', async()=>{
  const {sqlite,database}=privacyFixture();
  try {
    const base={id:'privacy-one',actorId:'admin',actorRole:'super_admin' as const,
      action:'assign' as const,note:'Investigate account evidence',requestId:'privacy-assign',now:100,
      form:privacyAnswer('privacy-assign')};
    await operateDataRightsRequest(database,base);
    await operateDataRightsRequest(database,base);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM data_rights_events WHERE data_rights_request_id='privacy-one'").get() as {n:number}).n,1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.privacy-action' AND subject_id='privacy-one'").get() as {n:number}).n,1);
    await assert.rejects(()=>operateDataRightsRequest(database,{...base,form:privacyAnswer('privacy-assign','Different context')}));
    await assert.rejects(()=>operateDataRightsRequest(database,{...base,action:'reject'}));
    await assert.rejects(()=>operateDataRightsRequest(database,{...base,id:'missing-privacy'}));
  } finally {sqlite.close();}
});

void test('privacy route rejects protected answers and attaches a published decision version', async()=>{
  const {sqlite}=privacyFixture();
  try {
    const {POST}=await import('../app/api/admin/privacy/[id]/route');
    const request=(body:unknown)=>new Request('http://localhost:3000/api/admin/privacy/privacy-one',{
      method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(body)});
    const body={action:'assign',note:'Investigate account evidence',requestId:'privacy-route',formVersion:1,
      customAnswers:[{fieldId:'context_note',value:'Reviewed privacy decision'}]};
    globalThis.staffCatalogActor=null;
    assert.equal((await POST(request(body),{params:Promise.resolve({id:'privacy-one'})})).status,403);
    globalThis.staffCatalogActor={id:'admin',role:'super_admin'};
    assert.equal((await POST(request({...body,customAnswers:[{fieldId:'note',value:'Override'}]}),
      {params:Promise.resolve({id:'privacy-one'})})).status,400);
    assert.equal((await POST(request(body),{params:Promise.resolve({id:'privacy-one'})})).status,200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.privacy-action' AND subject_id='privacy-one'").get() as {n:number}).n,1);
  } finally {sqlite.close();}
});

void test('privacy decision state and current role races leave no event, audit or answer',async()=>{
  for(const race of ['state','role'] as const){
    const {sqlite,database}=privacyFixture();
    try {
      (database as unknown as Database).beforeBatch=()=>sqlite.exec(race==='state'
        ? "UPDATE data_rights_requests SET status='approved' WHERE id='privacy-one'"
        : "DELETE FROM user_roles WHERE user_id='admin'");
      await assert.rejects(operateDataRightsRequest(database,{id:'privacy-one',actorId:'admin',
        actorRole:'super_admin',action:'assign',note:'Investigate account evidence',now:100,
        requestId:`privacy-race-${race}`,form:privacyAnswer(`privacy-race-${race}`)}));
      assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM data_rights_events WHERE data_rights_request_id='privacy-one'").get() as {n:number}).n,0);
      assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE subject_id='privacy-one'").get() as {n:number}).n,0);
      assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.privacy-action'").get() as {n:number}).n,0);
    } finally {sqlite.close();}
  }
});

void test('payout request rejection atomically records one answer and exact actor/domain replay', async () => {
  const { sqlite, database } = financeFixture();
  try {
    const options = { id:'request-one',actorId:'admin',actorRole:'admin' as const,action:'reject' as const,
      note:'Verified seller request is not eligible.',requestId:'staff-payout-reject',now:200,
      form:payoutAnswer('staff-payout-reject') };
    await processPayoutRequest(database,options);
    const stored=sqlite.prepare('SELECT subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() as Record<string,unknown>;
    assert.deepEqual({...stored},{subjectType:'payout_request',subjectId:'request-one',actorId:'admin'});
    await processPayoutRequest(database,options);
    await assert.rejects(processPayoutRequest(database,{...options,note:'Changed decision reason after success.'}));
    await assert.rejects(processPayoutRequest(database,{...options,form:payoutAnswer(options.requestId,'Changed answer after success')}));
    await assert.rejects(processPayoutRequest(database,{...options,actorId:'other'}));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as {count:number}).count,1);
  } finally { sqlite.close(); }
});

void test('payout preparation creates payout, request decision, and answer together or none', async () => {
  const { sqlite, database } = financeFixture();
  try {
    const options = { id:'request-one',actorId:'admin',actorRole:'admin' as const,action:'prepare' as const,
      note:'Verified destination and available ledger for preparation.',requestId:'staff-payout-prepare',now:200,
      form:payoutAnswer('staff-payout-prepare') };
    await processPayoutRequest(database,options);
    assert.equal((sqlite.prepare("SELECT status FROM payout_requests WHERE id='request-one'").get() as {status:string}).status,'prepared');
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM payouts').get() as {count:number}).count,1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM payout_entries').get() as {count:number}).count,1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as {count:number}).count,1);
    await processPayoutRequest(database,options);
    await assert.rejects(processPayoutRequest(database,{...options,form:payoutAnswer(options.requestId,'Changed preparation answer')}));
  } finally { sqlite.close(); }
});

void test('payout preparation rolls back financial records when answer publication fails', async () => {
  const { sqlite, database } = financeFixture();
  try {
    const options = { id:'request-one',actorId:'admin',actorRole:'admin' as const,action:'prepare' as const,
      note:'Verified destination and available ledger for preparation.',requestId:'staff-payout-fail',now:200,
      form:{...payoutAnswer('staff-payout-fail'),versionId:'missing-version'} };
    await assert.rejects(processPayoutRequest(database,options));
    assert.equal((sqlite.prepare("SELECT status FROM payout_requests WHERE id='request-one'").get() as {status:string}).status,'submitted');
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM payouts').get() as {count:number}).count,0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM payout_entries').get() as {count:number}).count,0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as {count:number}).count,0);
  } finally { sqlite.close(); }
});

void test('payout request state race leaves no prepared payout, ledger link, audit, or answer', async () => {
  const { sqlite, database } = financeFixture();
  try {
    const options={id:'request-one',actorId:'admin',actorRole:'admin' as const,action:'prepare' as const,
      note:'Verified destination and available ledger for preparation.',requestId:'staff-payout-race',now:200,
      form:payoutAnswer('staff-payout-race')};
    (database as unknown as Database).beforeBatch=()=>sqlite.exec("UPDATE payout_requests SET status='rejected' WHERE id='request-one'");
    await assert.rejects(processPayoutRequest(database,options));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM payouts').get() as {count:number}).count,0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM payout_entries').get() as {count:number}).count,0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id LIKE 'staff-payout-race%'").get() as {count:number}).count,0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as {count:number}).count,0);
  } finally { sqlite.close(); }
});

void test('payout request route validates published decision context and protected action', async () => {
  const { sqlite } = financeFixture();
  try {
    // The shared registry handoff has not yet made staff custom fields publishable.
    const { POST } = await import('../app/api/admin/payout-requests/[id]/route');
    const target={params:Promise.resolve({id:'request-one'})};
    const body={action:'reject',note:'Verified seller request is not eligible.',requestId:'staff-payout-route',
      formVersion:1,customAnswers:[{fieldId:'context_note',value:'Reviewed payout decision'}]};
    const request=(value:unknown)=>new Request('http://localhost:3000/api/admin/payout-requests/request-one',{
      method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(value)});
    globalThis.staffCatalogActor=null;
    assert.equal((await POST(request(body),target)).status,403);
    globalThis.staffCatalogActor={id:'admin',role:'admin'};
    const protectedResponse=await POST(request({...body,customAnswers:[{fieldId:'action',value:'prepare'}]}),target);
    assert.equal(protectedResponse.status,400,JSON.stringify(await protectedResponse.json()));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as {count:number}).count,0);
    assert.equal((await POST(request(body),target)).status,200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.payout-request-action'").get() as {count:number}).count,1);
  } finally { sqlite.close(); }
});

void test('invoice adjustment commits its contextual answer once and rejects changed or cross-actor replay', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { invoiceGroupId: 'invoice-one', kind: 'credit_note' as const, amountPaisa: 500,
      reasonCode: 'correction', note: 'Simulated correction after review.', actorId: 'admin',
      requestId: 'invoice-adjust-one', now: 200, approvedReasonCodes: ['correction'],
      form: answer('staff.invoice-adjustment', 'invoice-adjust-one') };
    const first = await issueManagedInvoiceAdjustment(database, options);
    assert.equal(first.created, true);
    const stored = sqlite.prepare('SELECT form_id AS formId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() as Record<string, unknown>;
    assert.deepEqual({ ...stored }, { formId: 'staff.invoice-adjustment', subjectType: 'managed_invoice_adjustment', subjectId: first.id, actorId: 'admin' });
    assert.deepEqual(await issueManagedInvoiceAdjustment(database, options), { ...first, created: false });
    await assert.rejects(issueManagedInvoiceAdjustment(database, { ...options, amountPaisa: 600 }));
    await assert.rejects(issueManagedInvoiceAdjustment(database, { ...options, form: answer('staff.invoice-adjustment', 'invoice-adjust-one', 'Changed explanation') }));
    await assert.rejects(issueManagedInvoiceAdjustment(database, { ...options, actorId: 'other' }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM managed_invoice_adjustments').get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('failed invoice adjustment and revoked staff role leave no document or answer', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { invoiceGroupId: 'invoice-one', kind: 'credit_note' as const, amountPaisa: 500,
      reasonCode: 'correction', note: 'Simulated correction after review.', actorId: 'admin',
      requestId: 'invoice-adjust-fail', now: 200, approvedReasonCodes: ['correction'],
      form: answer('staff.invoice-adjustment', 'invoice-adjust-fail') };
    await assert.rejects(issueManagedInvoiceAdjustment(database, { ...options, amountPaisa: 0 }));
    sqlite.exec("DELETE FROM user_roles WHERE user_id='admin'");
    await assert.rejects(issueManagedInvoiceAdjustment(database, options));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM managed_invoice_adjustments').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('invoice adjustment route validates published answers and protected amounts before issuing', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/invoices/[id]/adjustments/route');
    const target = { params: Promise.resolve({ id: 'invoice-one' }) };
    const body = { kind: 'credit_note', amountPaisa: 500, reasonCode: 'correction',
      note: 'Simulated correction after review.', requestId: 'invoice-route-one',
      formVersion: 1, customAnswers: [{fieldId:'context_note',value:'Reviewed invoice adjustment'}] };
    const request = (value: unknown) => new Request('http://localhost:3000/api/admin/invoices/invoice-one/adjustments', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    globalThis.staffCatalogActor = null;
    assert.equal((await POST(request(body), target)).status, 403);
    globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
    assert.equal((await POST(request({ ...body, customAnswers: [{ fieldId: 'amountPaisa', value: 999 }] }), target)).status, 400);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM managed_invoice_adjustments').get() as { count: number }).count, 0);
    assert.equal((await POST(request(body), target)).status, 201);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.invoice-adjustment'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('managed-maker activation stores one contextual answer only for a successful current approval', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { sellerId: 'seller-one', actorId: 'admin', model: 'managed_sale_linked_percentage_v1' as const,
      legalSellerReference: 'SIM-LEGAL', invoiceIssuerReference: 'SIM-ISSUER',
      payoutBeneficiaryReference: 'SIM-PAYOUT', agreementVersion: 'SIM-AGREEMENT', agreementLanguage: 'en' as const,
      agreementAcceptedAt: 100, requestId: 'maker-activation-one', now: 200,
      environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'test' }),
      form: answer('staff.managed-maker-activation', 'maker-activation-one') };
    await activateManagedMakerForSimulation(database, options);
    assert.deepEqual({ ...sqlite.prepare('SELECT form_id AS formId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() },
      { formId: 'staff.managed-maker-activation', subjectType: 'seller', subjectId: 'seller-one', actorId: 'admin' });
    await activateManagedMakerForSimulation(database, options);
    await assert.rejects(activateManagedMakerForSimulation(database, { ...options, agreementVersion: 'SIM-CHANGED' }));
    await assert.rejects(activateManagedMakerForSimulation(database, { ...options, form: answer('staff.managed-maker-activation', 'maker-activation-one', 'Changed answer') }));
    await assert.rejects(activateManagedMakerForSimulation(database, { ...options, actorId: 'other' }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('managed-maker stage race rolls back activation audit and answer', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { sellerId: 'seller-one', actorId: 'admin', model: 'managed_sale_linked_percentage_v1' as const,
      legalSellerReference: 'SIM-LEGAL', invoiceIssuerReference: 'SIM-ISSUER',
      payoutBeneficiaryReference: 'SIM-PAYOUT', agreementVersion: 'SIM-AGREEMENT', agreementLanguage: 'en' as const,
      agreementAcceptedAt: 100, requestId: 'maker-activation-race', now: 200,
      environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'test' }),
      form: answer('staff.managed-maker-activation', 'maker-activation-race') };
    (database as unknown as Database).beforeBatch = () => sqlite.exec("UPDATE seller_participation_profiles SET application_stage='rejected' WHERE seller_id='seller-one'");
    await assert.rejects(activateManagedMakerForSimulation(database, options));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('managed-maker route validates published context without accepting protected model answers', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/managed-makers/[id]/activate/route');
    const target = { params: Promise.resolve({ id: 'seller-one' }) };
    const body = { model: 'managed_sale_linked_percentage_v1', legalSellerReference: 'SIM-LEGAL',
      invoiceIssuerReference: 'SIM-ISSUER', payoutBeneficiaryReference: 'SIM-PAYOUT',
      agreementVersion: 'SIM-AGREEMENT', agreementLanguage: 'en', agreementAcceptedAt: 100,
      requestId: 'maker-route-one', formVersion: 1, customAnswers: [{fieldId:'context_note',value:'Reviewed activation terms'}] };
    const request = (value: unknown) => new Request('http://localhost:3000/api/admin/managed-makers/seller-one/activate', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    globalThis.staffCatalogActor = null;
    assert.equal((await POST(request(body), target)).status, 403);
    globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
    assert.equal((await POST(request({ ...body, customAnswers: [{ fieldId: 'model', value: 'managed_fixed_supplier_price_v1' }] }), target)).status, 400);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal((await POST(request(body), target)).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.managed-maker-activation'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('parcel cost operation batches its contextual answer and rejects changed replay', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { jobId: 'job-one', actorId: 'admin', requestId: 'parcel-cost-one', version: 0,
      action: 'record_cost', note: 'Actual courier expense recorded after receipt review.', now: 200,
      amountPaisa: 500, reference: 'COURIER-RECEIPT-1', form: answer('staff.parcel-control', 'parcel-cost-one') };
    await operateParcel(database, options);
    assert.deepEqual({ ...sqlite.prepare('SELECT form_id AS formId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() },
      { formId: 'staff.parcel-control', subjectType: 'shipping_job', subjectId: 'job-one', actorId: 'admin' });
    await operateParcel(database, options);
    await assert.rejects(operateParcel(database, { ...options, amountPaisa: 600 }));
    await assert.rejects(operateParcel(database, { ...options, form: answer('staff.parcel-control', 'parcel-cost-one', 'Changed answer') }));
    await assert.rejects(operateParcel(database, { ...options, actorId: 'other' }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM parcel_courier_costs').get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('failed parcel cost and revoked staff role leave no contextual answer', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { jobId: 'job-one', actorId: 'admin', requestId: 'parcel-cost-fail', version: 0,
      action: 'record_cost', note: 'Actual courier expense recorded after receipt review.', now: 200,
      amountPaisa: 500, reference: 'COURIER-RECEIPT-1', form: answer('staff.parcel-control', 'parcel-cost-fail') };
    await assert.rejects(operateParcel(database, { ...options, amountPaisa: 0 }));
    sqlite.exec("DELETE FROM user_roles WHERE user_id='admin'");
    await assert.rejects(operateParcel(database, options));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM parcel_courier_costs').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('parcel route validates published fields without accepting protected cash or action answers', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/orders/[id]/parcels/route');
    const target = { params: Promise.resolve({ id: 'order-one' }) };
    const body = { jobId: 'job-one', version: 0, action: 'record_cost',
      note: 'Actual courier expense recorded after receipt review.', amountPaisa: 500,
      reference: 'COURIER-RECEIPT-1', requestId: 'parcel-route-one', formVersion: 1, customAnswers: [{fieldId:'context_note',value:'Reviewed courier receipt'}] };
    const request = (value: unknown) => new Request('http://localhost:3000/api/admin/orders/order-one/parcels', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    globalThis.staffCatalogActor = null;
    assert.equal((await POST(request(body), target)).status, 403);
    globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
    assert.equal((await POST(request({ ...body, customAnswers: [{ fieldId: 'amountPaisa', value: 999 }] }), target)).status, 400);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM parcel_courier_costs').get() as { count: number }).count, 0);
    assert.equal((await POST(request(body), target)).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.parcel-control'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('taxonomy saves one contextual answer on the exact new entry and exact replay', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { kind: 'category' as const, actorId: 'admin', input: { slug: 'new-category', nameEn: 'New Category', nameNe: 'New Category', isActive: true, sortOrder: 10 }, requestId: 'catalog-one', now: 100, form: answer('staff.catalog', 'catalog-one') };
    const id = await saveTaxonomy(database, options);
    const row = sqlite.prepare(`SELECT form_id AS formId,request_id AS requestId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets`).get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { formId: 'staff.catalog', requestId: 'catalog-one', subjectType: 'category', subjectId: id, actorId: 'admin' });
    assert.equal(await saveTaxonomy(database, options), id);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
    await assert.rejects(saveTaxonomy(database, { ...options, input: { ...options.input, nameEn: 'Changed' } }));
    await assert.rejects(saveTaxonomy(database, { ...options, actorId: 'different' }));
  } finally { sqlite.close(); }
});

void test('failed classification leaves neither product change nor contextual answer', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { productId: 'product-one', categoryId: 'missing', occasionIds: ['festival'], actorId: 'admin', requestId: 'classify-one', now: 100, form: answer('staff.product-classification', 'classify-one') };
    await assert.rejects(classifyProduct(database, options));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT category_id AS categoryId FROM products WHERE id='product-one'").get() as { categoryId: string | null }).categoryId, null);
    await classifyProduct(database, { ...options, categoryId: 'existing' });
    const row = sqlite.prepare('SELECT subject_type AS subjectType,subject_id AS subjectId FROM form_answer_sets').get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { subjectType: 'product', subjectId: 'product-one' });
  } finally { sqlite.close(); }
});

void test('catalogue update and classification reject parent or active-choice changes at batch time', async () => {
  for (const race of ['taxonomy-missing','category-inactive','occasion-inactive'] as const) {
    const { sqlite, database } = fixture();
    try {
      (database as unknown as Database).beforeBatch = () => sqlite.exec(race === 'taxonomy-missing'
        ? "DELETE FROM categories WHERE id='existing'"
        : race === 'category-inactive'
          ? "UPDATE categories SET is_active=0 WHERE id='existing'"
          : "UPDATE occasions SET is_active=0 WHERE id='festival'");
      if (race === 'taxonomy-missing') await assert.rejects(saveTaxonomy(database, {
        kind: 'category', id: 'existing', actorId: 'admin', requestId: 'catalog-update-race', now: 100,
        input: { slug: 'existing-updated', nameEn: 'Updated Category', nameNe: 'Updated Category',
          isActive: true, sortOrder: 2 }, form: answer('staff.catalog','catalog-update-race'),
      }));
      else await assert.rejects(classifyProduct(database, { productId: 'product-one',
        categoryId: 'existing', occasionIds: ['festival'], actorId: 'admin',
        requestId: `classification-${race}`, now: 100,
        form: answer('staff.product-classification',`classification-${race}`),
      }));
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get() as { n: number }).n, 0, race);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get() as { n: number }).n, 0, race);
      assert.equal((sqlite.prepare("SELECT category_id AS categoryId FROM products WHERE id='product-one'").get() as { categoryId: string | null }).categoryId, null, race);
      assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM product_occasions WHERE product_id='product-one'").get() as { n: number }).n, 0, race);
    } finally { sqlite.close(); }
  }
});

void test('catalogue action refuses a staff member whose current role was removed', async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.exec("DELETE FROM user_roles WHERE user_id='admin'");
    await assert.rejects(saveTaxonomy(database, { kind: 'category', actorId: 'admin',
      input: { slug: 'unauthorized', nameEn: 'Unauthorized', nameNe: 'Unauthorized', isActive: true, sortOrder: 2 },
      requestId: 'unauthorized-one', now: 100, form: answer('staff.catalog', 'unauthorized-one') }));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM categories WHERE slug='unauthorized'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('legacy catalogue retries without configured answers retain their prior idempotent result', async () => {
  const { sqlite, database } = fixture();
  try {
    const taxonomy = { kind: 'category' as const, actorId: 'admin', input: { slug: 'legacy', nameEn: 'Legacy', nameNe: 'Legacy', isActive: true, sortOrder: 2 }, requestId: 'legacy-one', now: 100 };
    const id = await saveTaxonomy(database, taxonomy);
    assert.equal(await saveTaxonomy(database, taxonomy), id);
    const classification = { productId: 'product-one', categoryId: 'existing', occasionIds: ['festival'], actorId: 'admin', requestId: 'legacy-classify', now: 100 };
    await classifyProduct(database, classification);
    await classifyProduct(database, classification);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('exception create and update attach one answer each to the same work item', async () => {
  const { sqlite, database } = fixture();
  try {
    const created = { actorId: 'admin', jobId: 'job-one', kind: 'failed_delivery', ownerId: null,
      nextAction: 'Contact buyer and confirm next step', note: 'Parcel failed delivery with a documented attempt',
      requestId: 'exception-create', now: 100,
      form: answer('staff.exception-work', 'exception-create') };
    const id = await createExceptionWork(database, created);
    const first = sqlite.prepare("SELECT subject_type AS subjectType,subject_id AS subjectId FROM form_answer_sets WHERE request_id='exception-create'").get() as Record<string, unknown> | undefined;
    assert.deepEqual({ ...first }, { subjectType: 'exception_work', subjectId: id });
    assert.equal(await createExceptionWork(database, created), id);
    const updated = { id, actorId: 'admin', version: 0, ownerId: null,
      nextAction: 'Contact buyer and document agreed retry', note: 'Customer asked for a later retry tomorrow',
      requestId: 'exception-update', now: 110,
      form: answer('staff.exception-work', 'exception-update') };
    await updateExceptionWork(database, updated);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.exception-work'").get() as { count: number }).count, 2);
    await updateExceptionWork(database, updated);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.exception-work'").get() as { count: number }).count, 2);
    await assert.rejects(updateExceptionWork(database, { ...updated,
      form: answer('staff.exception-work', 'exception-update', 'Different answer') }));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM exception_work_events WHERE work_id=?").get(id) as { count: number }).count, 2);
  } finally { sqlite.close(); }
});

void test('staff catalogue routes validate published context and protect domain fields', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/catalog/route');
    const { PUT } = await import('../app/api/admin/products/[id]/classification/route');
    const request = (path: string, body: unknown, method = 'POST') => new Request(`http://localhost:3000${path}`, {
      method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const catalogBody = { kind: 'category', slug: 'route-entry', nameEn: 'Route Entry', sortOrder: 3,
      isActive: true, idempotencyKey: 'catalog-route-one', formVersion: 1,
      customAnswers: [{fieldId:'context_note',value:'Reviewed catalog entry'}] };
    globalThis.staffCatalogActor = null;
    assert.equal((await POST(request('/api/admin/catalog', catalogBody))).status, 403);
    globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
    assert.equal((await POST(request('/api/admin/catalog', { ...catalogBody,
      customAnswers: [{ fieldId: 'sortOrder', value: 999 }] }))).status, 400);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    const created = await POST(request('/api/admin/catalog', catalogBody));
    assert.equal(created.status, 201);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.catalog'").get() as { count: number }).count, 1);
    const classification = await PUT(request('/api/admin/products/product-one/classification', {
      categoryId: 'existing', occasionIds: ['festival'], idempotencyKey: 'class-route-one',
      formVersion: 1, customAnswers: [{fieldId:'context_note',value:'Reviewed product classification'}],
    }, 'PUT'), { params: Promise.resolve({ id: 'product-one' }) });
    assert.equal(classification.status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.product-classification'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('catalogue publication between route validation and batch commit returns stale 409 and rolls back action', async () => {
  const { sqlite, database } = fixture();
  try {
    const { POST } = await import('../app/api/admin/catalog/route');
    globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
    (database as unknown as Database).beforeBatch = () => sqlite.prepare(`INSERT INTO form_config_versions
      (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      SELECT 'staff.catalog-v2',form_id,2,1,'published',config_json,'Race','admin',2,'admin',2,'admin',2,'race'
      FROM form_config_versions WHERE id='staff.catalog-v1'`).run();
    const response = await POST(new Request('http://localhost:3000/api/admin/catalog', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'category', slug: 'race-entry', nameEn: 'Race Entry',
        sortOrder: 3, isActive: true, idempotencyKey: 'catalog-race-one', formVersion: 1,
        customAnswers: [{ fieldId: 'context_note', value: 'Reviewed race' }] }),
    }));
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { code?: string }).code, 'stale_version');
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM categories WHERE slug='race-entry'").get() as { n: number }).n, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE request_id='catalog-race-one'").get() as { n: number }).n, 0);
  } finally { sqlite.close(); }
});

void test('every staff operation route reports a commit-time publication race as stale without an answer', async () => {
  const request = (path: string, body: unknown, method = 'POST') => new Request(`http://localhost:3000${path}`, {
    method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const customAnswers = [{ fieldId: 'context_note', value: 'Reviewed before publication changed' }];
  const scenarios = [
    { id: 'staff.product-classification', setup: fixture,
      run: async () => (await import('../app/api/admin/products/[id]/classification/route')).PUT(
        request('/api/admin/products/product-one/classification', { categoryId: 'existing', occasionIds: ['festival'],
          idempotencyKey: 'race-classification', formVersion: 1, customAnswers }, 'PUT'),
        { params: Promise.resolve({ id: 'product-one' }) }) },
    { id: 'staff.exception-work', setup: fixture,
      run: async () => (await import('../app/api/admin/exception-work/route')).POST(
        request('/api/admin/exception-work', { action: 'create', jobId: 'job-one', kind: 'failed_delivery',
          ownerId: null, nextAction: 'Contact buyer and confirm next step', note: 'Documented failed delivery',
          requestId: 'race-exception', formVersion: 1, customAnswers })) },
    { id: 'staff.invoice-adjustment', setup: fixture,
      run: async () => (await import('../app/api/admin/invoices/[id]/adjustments/route')).POST(
        request('/api/admin/invoices/invoice-one/adjustments', { kind: 'credit_note', amountPaisa: 500,
          reasonCode: 'correction', note: 'Documented correction', requestId: 'race-invoice',
          formVersion: 1, customAnswers }), { params: Promise.resolve({ id: 'invoice-one' }) }) },
    { id: 'staff.managed-maker-activation', setup: fixture,
      run: async () => (await import('../app/api/admin/managed-makers/[id]/activate/route')).POST(
        request('/api/admin/managed-makers/seller-one/activate', { model: 'managed_sale_linked_percentage_v1',
          legalSellerReference: 'SIM-LEGAL', invoiceIssuerReference: 'SIM-ISSUER', payoutBeneficiaryReference: 'SIM-PAYOUT',
          agreementVersion: 'SIM-AGREEMENT', agreementLanguage: 'en', requestId: 'race-maker',
          formVersion: 1, customAnswers }), { params: Promise.resolve({ id: 'seller-one' }) }) },
    { id: 'staff.parcel-control', setup: fixture,
      run: async () => (await import('../app/api/admin/orders/[id]/parcels/route')).POST(
        request('/api/admin/orders/order-one/parcels', { jobId: 'job-one', version: 0, action: 'record_cost',
          note: 'Documented courier cost', amountPaisa: 500, reference: 'COURIER-RECEIPT-1',
          requestId: 'race-parcel', formVersion: 1, customAnswers }), { params: Promise.resolve({ id: 'order-one' }) }) },
    { id: 'staff.payout-request-action', setup: financeFixture,
      run: async () => (await import('../app/api/admin/payout-requests/[id]/route')).POST(
        request('/api/admin/payout-requests/request-one', { action: 'reject', note: 'Documented rejection',
          requestId: 'race-payout', formVersion: 1, customAnswers }),
        { params: Promise.resolve({ id: 'request-one' }) }) },
    { id: 'staff.privacy-action', setup: privacyFixture,
      run: async () => (await import('../app/api/admin/privacy/[id]/route')).POST(
        request('/api/admin/privacy/privacy-one', { action: 'assign', note: 'Documented assignment',
          requestId: 'race-privacy', formVersion: 1, customAnswers }),
        { params: Promise.resolve({ id: 'privacy-one' }) }) },
    { id: 'staff.rider-control-1', setup: riderFixture,
      run: async () => (await import('../app/api/admin/riders/route')).POST(
        request('/api/admin/riders', { action: 'review', userId: 'rider-one', version: 0, status: 'approved',
          note: 'Reviewed identity evidence', requestId: 'race-rider-review', formVersion: 1, customAnswers })) },
    { id: 'staff.rider-control-2', setup: riderFixture,
      run: async () => (await import('../app/api/admin/riders/route')).POST(
        request('/api/admin/riders', { action: 'policy', version: 0, otpScope: 'prepaid_only',
          requestId: 'race-rider-policy', formVersion: 1, customAnswers })) },
  ] as const;
  for (const scenario of scenarios) {
    const { sqlite, database } = scenario.setup();
    try {
      globalThis.staffCatalogActor = { id: 'admin', role: scenario.id === 'staff.payout-request-action' ? 'admin' : 'super_admin' };
      (database as unknown as Database).beforeBatch = () => sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?,form_id,2,1,'published',config_json,'Race','admin',2,'admin',2,'admin',2,?
        FROM form_config_versions WHERE id=?`).run(`${scenario.id}-v2`, `race-${scenario.id}`, `${scenario.id}-v1`);
      const response = await scenario.run();
      assert.equal(response.status, 409, `${scenario.id}: ${await response.clone().text()}`);
      assert.equal((await response.json() as { code?: string }).code, 'stale_version', scenario.id);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?').get(scenario.id) as { n: number }).n, 0, scenario.id);
    } finally { sqlite.close(); }
  }
});

void test('exception route rejects unauthorized staff and persists only successful contextual work', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/exception-work/route');
    const body = { action: 'create', jobId: 'job-one', kind: 'failed_delivery', ownerId: null,
      nextAction: 'Contact buyer and confirm next step', note: 'Parcel failed delivery with a documented attempt',
      requestId: 'exception-route-one', formVersion: 1, customAnswers: [{fieldId:'context_note',value:'Reviewed exception evidence'}] };
    const request = (value: unknown) => new Request('http://localhost:3000/api/admin/exception-work', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    globalThis.staffCatalogActor = null;
    assert.equal((await POST(request(body))).status, 403);
    globalThis.staffCatalogActor = { id: 'admin', role: 'super_admin' };
    assert.equal((await POST(request({ ...body, customAnswers: [{ fieldId: 'cashRecordId', value: 'spoof' }] }))).status, 400);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    const response = await POST(request(body));
    assert.equal(response.status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.exception-work'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('mounted staff marketplace, parcel, and payout forms send published context', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'staff-catalog-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { CatalogManager } from './components/admin/catalog-manager';
      import { ProductClassificationForm } from './components/admin/product-classification-form';
      import { ExceptionWorkForm } from './components/admin/exception-work-form';
      import { InvoiceAdjustmentForm } from './components/admin/invoice-adjustment-form';
      import { ManagedMakerActivationForm } from './components/admin/managed-maker-activation-form';
      import { ParcelControls } from './components/admin/parcel-controls';
      import { PayoutRequestActions } from './components/admin/payout-request-actions';
      import { PrivacyActions } from './components/admin/privacy-actions';
      import { RiderAdminAction, RiderPolicyForm } from './components/admin/rider-controls';
      createRoot(document.getElementById('root')!).render(<><CatalogManager categories={[]} occasions={[]} />
        <ProductClassificationForm productId="product-one" categoryId="existing" occasionIds={['festival']}
          categories={[{id:'existing',nameEn:'Existing',slug:'existing',isActive:1,sortOrder:1}]}
          occasions={[{id:'festival',nameEn:'Festival',slug:'festival',isActive:1,sortOrder:1}]} />
        <ExceptionWorkForm jobs={[{id:'job-one',status:'delivery_failed'}]} owners={[]} finance={false} />
        <InvoiceAdjustmentForm invoices={[{id:'invoice-one',invoiceNumber:'SIM-INV-1',issuerReference:'SIM-ISSUER',adjustmentCount:0}]}
          reasonCodes={['correction']} />
        <ManagedMakerActivationForm sellerId="seller-one" />
        <ParcelControls orderId="order-one" actorId="admin" canPrepare={false} records={[]} compensation={[]}
          parcels={[{id:'job-one',orderId:'order-one',sellerId:'seller-one',sellerName:'Maker',status:'pickup_requested',
            codDuePaisa:1000,collectedPaisa:0,remittedPaisa:0,version:0,method:'courier',riderUserId:null,
            courierName:null,trackingCode:null,trackingUrl:null,deliveredAt:null,paymentMode:'cod',openBoxRequired:0,
            openBoxSnapshotJson:null,riderFinanceSnapshotJson:null,latitude:null,longitude:null,accuracy:null,
            positionAt:null,courierCostPaisa:0}]} />
        <PayoutRequestActions id="request-one" />
        <PrivacyActions id="privacy-one" canDecide={true} status="submitted" requestType="correction"
          assignedToCurrentStaff={false} />
        <RiderAdminAction action="review" fields={{userId:'rider-one',version:0}} label="Record Super Admin decision" />
        <RiderAdminAction action="confirm" fields={{reportId:'report-one',version:0}} label="Confirm reviewed report" />
        <RiderPolicyForm policy={{version:0,openBox:0,otpScope:'off'}} /></>);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'staff-catalog-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^@\/components\/admin\/use-admin-mutation$/ }, () => ({ path: 'admin-mutation', namespace: 'staff-stub' }));
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'staff-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'staff-stub' }));
      bundler.onLoad({ filter: /^admin-mutation$/, namespace: 'staff-stub' }, () => ({
        contents: 'export function useAdminMutation(){return {pending:false,error:"",async send(url,body,key,method){globalThis.sentStaff=(globalThis.sentStaff||[]).concat([{url,body,key,method}]);return true}}}', loader: 'js',
      }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'staff-stub' }, () => ({
        contents: 'export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[{id:"context_note",key:"context_note",label:"Staff context",type:"short_text",required:true,order:0,status:"active"}]},status:"ready",canSubmit:true,message:"",refresh(){},handleSubmissionResponse(){return true}}}', loader: 'js',
      }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'staff-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const exceptionBodies: Record<string, unknown>[] = [];
  const invoiceBodies: Record<string, unknown>[] = [];
  const activationBodies: Record<string, unknown>[] = [];
  const parcelBodies: Record<string, unknown>[] = [];
  const riderBodies: Record<string, unknown>[] = [];
  const sentStaff: {url:string;body:Record<string,unknown>}[]=[];
  try {
    await page.route('https://staff-catalog.test/**', async (route: any) => {
      const path=new URL(route.request().url()).pathname;
      if (['/api/admin/catalog','/api/admin/products/product-one/classification',
        '/api/admin/payout-requests/request-one','/api/admin/privacy/privacy-one'].includes(path)) {
        sentStaff.push({url:path,body:JSON.parse(route.request().postData()??'{}')});
        return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      if (new URL(route.request().url()).pathname === '/api/admin/riders') {
        riderBodies.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      if (new URL(route.request().url()).pathname === '/api/admin/orders/order-one/parcels') {
        parcelBodies.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Parcel fixture response"}' });
      }
      if (new URL(route.request().url()).pathname === '/api/admin/managed-makers/seller-one/activate') {
        activationBodies.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Activation fixture response"}' });
      }
      if (new URL(route.request().url()).pathname === '/api/admin/invoices/invoice-one/adjustments') {
        invoiceBodies.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Fixture response"}' });
      }
      if (new URL(route.request().url()).pathname === '/api/admin/exception-work') {
        exceptionBodies.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"work-one"}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://staff-catalog.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Add category' }).click();
    const taxonomy = page.locator('form[data-form-id="staff.catalog"]');
    assert.equal(await taxonomy.count(), 1);
    await taxonomy.getByLabel('Display name').fill('New Category');
    await taxonomy.getByLabel('URL slug').fill('new-category');
    await taxonomy.getByLabel('Staff context').fill('Reviewed bilingual naming');
    const catalogResponse=page.waitForResponse('https://staff-catalog.test/api/admin/catalog');
    await taxonomy.getByRole('button', { name: 'Save entry' }).click();
    await catalogResponse;
    const classification = page.locator('form[data-form-id="staff.product-classification"]');
    assert.equal(await classification.count(), 1);
    await classification.getByLabel('Staff context').fill('Reviewed product occasions');
    const classificationResponse=page.waitForResponse('https://staff-catalog.test/api/admin/products/product-one/classification');
    await classification.getByRole('button', { name: 'Save classification' }).click();
    await classificationResponse;
    const submissions = sentStaff;
    assert.equal(submissions[0].body.formVersion, 1);
    assert.deepEqual(submissions[0].body.customAnswers, [{ fieldId: 'context_note', value: 'Reviewed bilingual naming' }]);
    assert.equal(submissions[1].body.formVersion, 1);
    assert.deepEqual(submissions[1].body.customAnswers, [{ fieldId: 'context_note', value: 'Reviewed product occasions' }]);
    const exception = page.locator('form[data-form-id="staff.exception-work"]');
    assert.equal(await exception.count(), 1);
    assert.equal(await exception.locator('[data-configured-field="context_note"]').count(), 1);
    await exception.getByLabel('Next action *').fill('Contact buyer and confirm next step');
    await exception.getByLabel('Report details and evidence references *').fill('Parcel failed delivery with a documented attempt');
    await exception.getByLabel('Staff context').fill('Buyer requested a later call');
    await exception.getByRole('button', { name: 'Report exception follow-up' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Report exception follow-up') && document.body.textContent?.includes('Staff context'));
    assert.equal(exceptionBodies.length, 1);
    assert.equal(exceptionBodies[0].formVersion, 1);
    assert.deepEqual(exceptionBodies[0].customAnswers, [{ fieldId: 'context_note', value: 'Buyer requested a later call' }]);
    const invoice = page.locator('form[data-form-id="staff.invoice-adjustment"]');
    assert.equal(await invoice.count(), 1);
    await invoice.getByLabel('Amount (NPR)').fill('5.00');
    await invoice.getByLabel('Review note').fill('Simulated correction after review.');
    await invoice.getByLabel('Staff context').fill('Reviewed financial evidence');
    await invoice.getByRole('button', { name: 'Issue simulated document' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Fixture response'));
    assert.equal(invoiceBodies.length, 1);
    assert.equal(invoiceBodies[0].amountPaisa, 500);
    assert.equal(invoiceBodies[0].formVersion, 1);
    assert.deepEqual(invoiceBodies[0].customAnswers, [{ fieldId: 'context_note', value: 'Reviewed financial evidence' }]);
    const activation = page.locator('form[data-form-id="staff.managed-maker-activation"]');
    assert.equal(await activation.count(), 1);
    await activation.getByLabel('Staff context').fill('Reviewed fictional agreement');
    await activation.getByRole('button', { name: 'Activate simulated route' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Activation fixture response'));
    assert.equal(activationBodies.length, 1);
    assert.equal(activationBodies[0].model, 'managed_sale_linked_percentage_v1');
    assert.equal(activationBodies[0].formVersion, 1);
    assert.deepEqual(activationBodies[0].customAnswers, [{ fieldId: 'context_note', value: 'Reviewed fictional agreement' }]);
    const parcel = page.locator('form[data-form-id="staff.parcel-control"]');
    assert.equal(await parcel.count(), 1);
    await parcel.getByLabel('Action').selectOption('record_cost');
    await parcel.getByLabel('Amount in NPR *').fill('5.00');
    await parcel.getByLabel('Evidence reference *').fill('COURIER-RECEIPT-1');
    await parcel.getByLabel('Operational note *').fill('Actual courier expense recorded after receipt review.');
    await parcel.getByLabel('Staff context').fill('Reviewed courier receipt');
    await parcel.getByRole('button', { name: 'Save parcel action' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Parcel fixture response'));
    assert.equal(parcelBodies.length, 1);
    assert.equal(parcelBodies[0].action, 'record_cost');
    assert.equal(parcelBodies[0].formVersion, 1);
    assert.deepEqual(parcelBodies[0].customAnswers, [{ fieldId: 'context_note', value: 'Reviewed courier receipt' }]);
    const payout = page.locator('form[data-form-id="staff.payout-request-action"]');
    assert.equal(await payout.count(), 1);
    await payout.getByLabel('Review note').fill('Verified seller request is not eligible.');
    await payout.getByLabel('Staff context').fill('Reviewed payout request evidence');
    const payoutResponse=page.waitForResponse('https://staff-catalog.test/api/admin/payout-requests/request-one');
    await payout.getByRole('button', { name: 'Save decision' }).click();
    await payoutResponse;
    const payoutSubmission = sentStaff[2];
    assert.equal(payoutSubmission.url, '/api/admin/payout-requests/request-one');
    assert.equal(payoutSubmission.body.formVersion, 1);
    assert.deepEqual(payoutSubmission.body.customAnswers, [{ fieldId: 'context_note', value: 'Reviewed payout request evidence' }]);
    const privacy=page.locator('form[data-form-id="staff.privacy-action"]');
    assert.equal(await privacy.count(),1);
    await privacy.getByLabel('Investigation or decision note').fill('Investigate account evidence');
    await privacy.getByLabel('Staff context').fill('Verified account request');
    const privacyResponse=page.waitForResponse('https://staff-catalog.test/api/admin/privacy/privacy-one');
    await privacy.getByRole('button',{name:'Save decision'}).click();
    await privacyResponse;
    const privacySubmission=sentStaff[3];
    assert.equal(privacySubmission.url,'/api/admin/privacy/privacy-one');
    assert.equal(privacySubmission.body.formVersion,1);
    assert.deepEqual(privacySubmission.body.customAnswers,[{fieldId:'context_note',value:'Verified account request'}]);
    const riderReview=page.locator('form[data-form-id="staff.rider-control-1"]').first();
    assert.equal(await riderReview.count(),1);
    await riderReview.getByLabel('Reason / next action *').fill('Verified identity evidence');
    await riderReview.getByLabel('Staff context').fill('Reviewed application evidence');
    await riderReview.getByRole('button',{name:'Record Super Admin decision'}).click();
    const riderPolicy=page.locator('form[data-form-id="staff.rider-control-2"]');
    assert.equal(await riderPolicy.count(),1);
    await riderPolicy.getByLabel('Staff context').fill('Reviewed policy impact');
    await riderPolicy.getByRole('button',{name:'Save settings'}).click();
    const riderConfirm=page.locator('form[data-form-id="staff.rider-control-1"]').nth(1);
    await riderConfirm.getByLabel('Staff context').fill('Reviewed rider report proof');
    await riderConfirm.getByRole('button',{name:'Confirm reviewed report'}).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Rider record updated.') &&
      document.body.textContent?.includes('Rider settings saved.'));
    assert.equal(riderBodies.length,3);
    for(const body of riderBodies){assert.equal(body.formVersion,1);
      assert.equal((body.customAnswers as unknown[]).length,1);}
  } finally { await page.close(); await browser.close(); }
});
