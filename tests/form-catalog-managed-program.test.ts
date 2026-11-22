import { cataloguePayoutSources, cataloguePayoutPacket } from './helpers/catalogue-payout-execution';
import { recordPayoutTransferOutcome } from '../lib/payments/payout-transfers';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { registerTransitionFixture,submitRegisteredTransitionFixture as submitRegisteredSellerTransition } from './helpers/registered-transition-fixture';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

import { addFixedSupplyAdjustment, createFixedSupplyRecord, decideFixedSupplyRecord,
  prepareFixedSupplierPayment, transitionFixedSupplierPayment } from '../lib/managed-commerce/fixed-supply';
import { reviewRouteTransition } from '../lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';

declare global {
  var managedProgramDb: D1Database;
  var managedProgramActor: { id: string; role: 'admin' | 'super_admin' } | null;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.managedProgramDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3000"}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.managedProgramActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.managedProgramActor}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}
class Database {
  failAt: number | null = null;
  beforeBatch?: () => void;
  batchCalls = 0;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.batchCalls++;
    this.beforeBatch?.(); this.beforeBatch = undefined;
    this.sqlite.exec('BEGIN');
    try {
      const result = [];
      for (const [index, statement] of statements.entries()) {
        if (index === this.failAt) throw new Error('Simulated batch failure');
        result.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const environment = resolveRuntimeEnvironment({ runtimeEnvironment: 'local_staging', appOrigin: 'http://127.0.0.1:4173' });
const form = (formId: string, requestId: string) => ({ requestId, versionId: `${formId}-v1`, answers: { formId, version: 1, answers: [] } });
const count = (sqlite: DatabaseSync, table: string) => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const managedFormIds = ['staff.managed-supply-decision','staff.managed-adjustment',
  'staff.managed-payment-preparation','staff.managed-payment-action',
  'staff.managed-transition-decision'] as const;
const protectedManagedKeys = [
  ['action','recordId','decision','quantityAccepted','possessionStatus','qualityStatus','ownershipRecordStatus','riskRecordStatus','evidenceReference','reason','requestId','formVersion','customAnswers'],
  ['action','recordId','kind','amountNpr','amountPaisa','reason','requestId','formVersion','customAnswers'],
  ['action','recordId','destinationReference','requestId','formVersion','customAnswers'],
  ['action','paymentId','requestId','formVersion','customAnswers'],
  ['action','applicationId','decision','effectiveLocal','effectiveAt','reason','requestId','formVersion','customAnswers'],
] as const;

void test('five managed-program definitions allow safe context but lock protected built-ins and aliases', () => {
  const canonical = (key:string) => key.replace(/[^a-z0-9]/gi,'').toLowerCase();
  for (const [index,formId] of managedFormIds.entries()) {
    assert.equal(IMPLEMENTED_FORM_ADAPTERS[formId]?.route,'/api/admin/managed-program/:id');
    const definition = FORM_REGISTRY[formId];
    assert.ok(definition.capabilities.customFieldTypes.includes('short_text'));
    const protectedKeys = new Set(definition.baseFields.filter((field)=>field.capability==='protected')
      .map((field)=>canonical(field.key)));
    for (const key of protectedManagedKeys[index]) assert.ok(protectedKeys.has(canonical(key)),`${formId}:${key}`);
    assert.throws(()=>validateFormDraft(formId,{formId,fields:[{
      id:'request_id',key:'request_id',label:'Request ID',type:'short_text',required:true,order:0,status:'active',
    }]}));
  }
});

function publishRequiredContext(sqlite: DatabaseSync) {
  for (const formId of managedFormIds) sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?,2,2,'published',?,'Required context','reviewer',2,'reviewer',2,'reviewer',2,?)`)
    .run(`${formId}-v2`,formId,JSON.stringify({formId,fields:[{
      id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active',
    }]}),`required-${formId}`);
}

async function fixture() {
  const { sqlite } = await incentiveReportDatabase();
  // Explicit original fictional supplier terms; every current migration and guard remains installed.
  for (const id of ['maker','reviewer','finance','other']) sqlite.prepare(`INSERT INTO users
    (id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',1,1)`)
    .run(id,`${id}@local.hastabazaar.test`,id);
  sqlite.exec(`INSERT INTO user_roles(user_id,role,assigned_at) VALUES
    ('reviewer','super_admin',1),('finance','super_admin',1),('maker','seller',1),('other','admin',1);
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,
      tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,
      municipality,locality,status,applicant_type,created_at,updated_at)
    VALUES('seller','maker','Original Maker','Original Maker','','','NONE','','Original Maker','9800000000',
      'maker@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Original workshop','approved','individual',1,1);
    INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,
      commercial_model,payout_beneficiary_reference,managed_agreement_version,managed_agreement_language,
      managed_agreement_accepted_at,version,created_at,updated_at)
    VALUES('seller','managed_maker','active','Original Maker','Kathmandu','managed_fixed_supplier_price_v1',
      'SIM-MAKER-ACCOUNT','SIM-FIXED-V1','ne',1,1,1,1);
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
    VALUES('craft','craft','Craft',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
      producer,materials,status,created_at,updated_at)
    VALUES('product','seller','craft','original-product','ORIGINAL','Original product','Original accepted supply',50000,10,
      'Original Maker','Clay','draft',1,1);`);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  for (const id of ['staff.managed-supply-decision', 'staff.managed-adjustment',
    'staff.managed-payment-preparation', 'staff.managed-payment-action', 'staff.managed-transition-decision']) {
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?, 1, 1, 'published', ?, 'Test publication', 'reviewer', 1, 'reviewer', 1, 'reviewer', 1, ?)`)
      .run(`${id}-v1`, id, JSON.stringify({ formId: id, fields: [] }), `publish-${id}`);
  }
  const db = new Database(sqlite);
  registerTransitionFixture(db as unknown as D1Database,sqlite);
  globalThis.managedProgramDb = db as unknown as D1Database;
  globalThis.managedProgramActor = { id: 'reviewer', role: 'super_admin' };
  return { sqlite, db, database: db as unknown as D1Database };
}
async function proposed(database: D1Database, requestId = 'proposal', payoutBeneficiaryReference = 'SIM-MAKER-ACCOUNT') {
  return createFixedSupplyRecord(database, { sellerId: 'seller', productId: 'product', quantity: 2,
    agreedUnitPaisa: 50_000, createdBy: 'maker', agreementVersion: 'SIM-FIXED-V1',
    agreementLanguage: 'ne', payoutBeneficiaryReference,
    requestId, now: 100, environment });
}
function decision(recordId: string, requestId = 'decision') { return { recordId, actorId: 'reviewer', action: 'accept' as const,
  quantityAccepted: 2, possessionStatus: 'received' as const, qualityStatus: 'accepted' as const,
  ownershipRecordStatus: 'simulated_terms_recorded' as const, riskRecordStatus: 'simulated_terms_recorded' as const,
  evidenceReference: 'SIM-GRN-001', reason: 'SIMULATED quantity and quality acceptance',
  requestId, now: 200, environment, form: form('staff.managed-supply-decision', requestId) }; }

void test('supply decision binds one answer to its exact accepted record and rejects changed replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    const id = await proposed(database);
    const input = decision(id);
    await decideFixedSupplyRecord(database, input);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.deepEqual({ ...sqlite.prepare('SELECT form_id AS formId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() as object },
      { formId: 'staff.managed-supply-decision', subjectType: 'managed_supply', subjectId: id, actorId: 'reviewer' });
    await decideFixedSupplyRecord(database, input);
    await assert.rejects(decideFixedSupplyRecord(database, { ...input, quantityAccepted: 1 }));
    await assert.rejects(decideFixedSupplyRecord(database, { ...input, actorId: 'finance' }));
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('adjustment answer commits with protected amount and exact actor replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    const id = await proposed(database);
    await decideFixedSupplyRecord(database, decision(id));
    const requestId = 'adjust-one';
    const input = { recordId: id, actorId: 'reviewer', kind: 'defect' as const, amountPaisa: 10_000,
      reason: 'SIMULATED defect adjustment', requestId, now: 300, environment,
      form: form('staff.managed-adjustment', requestId) };
    await addFixedSupplyAdjustment(database, input);
    assert.deepEqual({ ...sqlite.prepare('SELECT subject_type AS subjectType,subject_id AS subjectId FROM form_answer_sets WHERE form_id=?').get('staff.managed-adjustment') as object },
      { subjectType: 'managed_supply', subjectId: id });
    await addFixedSupplyAdjustment(database, input);
    await assert.rejects(addFixedSupplyAdjustment(database, { ...input, amountPaisa: 20_000 }));
    assert.equal(count(sqlite, 'managed_supplier_adjustments'), 1);
  } finally { sqlite.close(); }
});

void test('payment preparation and both payment actions retain exact form and native execution receipts', async () => {
  const { sqlite, database } = await fixture();
  try {
    const sources=await cataloguePayoutSources({sqlite,db:database},'seller','reviewer');
    const id = await proposed(database,'proposal',sources.beneficiaryReference);
    await decideFixedSupplyRecord(database, decision(id));
    const prepareRequest = 'prepare-one';
    const prepare = { recordId: id, actorId: 'reviewer', destinationReference: sources.beneficiaryReference,
      requestId: prepareRequest, now: 300, environment, form: form('staff.managed-payment-preparation', prepareRequest) };
    const paymentId = await prepareFixedSupplierPayment(database, prepare);
    sqlite.prepare("UPDATE managed_supplier_payments SET status='prepared',approved_by=NULL WHERE id=?").run(paymentId);
    assert.equal(await prepareFixedSupplierPayment(database, prepare), paymentId);
    await assert.rejects(prepareFixedSupplierPayment(database, { ...prepare, destinationReference: 'OTHER-ACCOUNT' }));
    const approveRequest = 'approve-one';
    const approval = { paymentId, actorId: 'reviewer', action: 'approve' as const,
      requestId: approveRequest, now: 400, environment, form: form('staff.managed-payment-action', approveRequest) };
    await assert.rejects(transitionFixedSupplierPayment(database, { ...approval, actorId: 'other' }), /Super Admin|permission/i);
    await transitionFixedSupplierPayment(database, approval);
    await transitionFixedSupplierPayment(database, approval);
    await assert.rejects(transitionFixedSupplierPayment(database, { ...approval, action: 'mark_paid' }));
    const markRequest = 'mark-one';
    await assert.rejects(transitionFixedSupplierPayment(database, { ...approval, action: 'mark_paid', requestId: markRequest,
      form: form('staff.managed-payment-action', markRequest) }),/original verified execution packet/);
    const execution=await cataloguePayoutPacket({sqlite,db:database},{actorId:'reviewer',model:'fixed',payoutId:paymentId,
      accountVersionId:sources.accountVersionId,amountPaisa:100_000,environment});
    assert.equal(sqlite.prepare('SELECT status FROM managed_supplier_payments WHERE id=?').get(paymentId)?.status,'approved');
    const paid=await execution.complete();
    const retained=sqlite.prepare('SELECT * FROM payout_transfer_packets WHERE id=?').get(execution.packetId);
    assert.deepEqual(await execution.complete(),paid);
    assert.deepEqual(sqlite.prepare('SELECT * FROM payout_transfer_packets WHERE id=?').get(execution.packetId),retained);
    await assert.rejects(recordPayoutTransferOutcome(database,execution.completion,{...execution.outcome,transactionIdentity:'CHANGED-REFERENCE'}),/different command content/);
    assert.deepEqual({...sqlite.prepare('SELECT amount_paisa AS amount,status FROM managed_supplier_payments WHERE id=?').get(paymentId) as object},{amount:100_000,status:'paid'});
    assert.equal(count(sqlite,'company_outgoing_bank_identities'),1);
    // Native execution is a protected system form; configurable answers belong only to the three actual catalog decisions.
    assert.equal(count(sqlite, 'form_answer_sets'), 3);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE subject_type='managed_supplier_payment' AND subject_id=?").get(paymentId) as { n: number }).n, 2);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { sqlite.close(); }
});

void test('route transition decision binds the answer to the application and rejects mismatched replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    const id = await submitRegisteredSellerTransition(database, { sellerId: 'seller', actorId: 'maker',
      legalName: 'Registered Craft Firm', registrationAuthority: 'Cottage Office', registrationNumber: 'REG-001',
      taxMode: 'PAN', taxRegistrationNumber: 'PAN-001', evidenceReferences: ['private-doc-1'],
      agreementVersion: 'SIM-REGISTERED-V1', agreementLanguage: 'ne', agreementAcceptedAt: 100,
      requestId: 'submit-one', now: 100, environment });
    const requestId = 'transition-one';
    const input = { applicationId: id, actorId: 'reviewer', action: 'approve' as const,
      reason: 'SIMULATED registration and agreement review', effectiveAt: 500,
      requestId, now: 200, environment, form: form('staff.managed-transition-decision', requestId) };
    await reviewRouteTransition(database, input);
    assert.deepEqual({ ...sqlite.prepare('SELECT subject_type AS subjectType,subject_id AS subjectId FROM form_answer_sets').get() as object },
      { subjectType: 'seller_route_transition', subjectId: id });
    await reviewRouteTransition(database, input);
    await assert.rejects(reviewRouteTransition(database, { ...input, action: 'reject' }));
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('a completed form request cannot be replayed after the Super Admin loses active authority', async () => {
  const { sqlite, database } = await fixture();
  try {
    const id = await proposed(database);
    const input = decision(id);
    await decideFixedSupplyRecord(database, input);
    sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();
    await assert.rejects(decideFixedSupplyRecord(database, input), /current staff permission|Super Admin/i);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('a managed decision replay requires its committed parent record to remain present', async () => {
  const {sqlite,database}=await fixture();
  try {
    const recordId=await proposed(database);
    const input={...decision(recordId,'reject-parent'),action:'reject' as const,quantityAccepted:0,
      possessionStatus:'returned' as const,qualityStatus:'rejected' as const};
    await decideFixedSupplyRecord(database,input);
    sqlite.prepare('DELETE FROM managed_supply_records WHERE id=?').run(recordId);
    await assert.rejects(decideFixedSupplyRecord(database,input));
    assert.equal(count(sqlite,'form_answer_sets'),1);
  } finally {sqlite.close();}
});

void test('a rejected answer insert rolls back every decision branch without an audit or domain write', async () => {
  const { sqlite, database } = await fixture();
  try {
    const id = await proposed(database);
    const invalid = (formId: string, requestId: string) => ({ ...form(formId, requestId), versionId: 'missing-version' });
    await assert.rejects(decideFixedSupplyRecord(database, { ...decision(id, 'bad-decision'),
      form: invalid('staff.managed-supply-decision', 'bad-decision') }));
    assert.equal((sqlite.prepare('SELECT status FROM managed_supply_records WHERE id=?').get(id) as { status: string }).status, 'proposed');
    assert.equal(count(sqlite, 'managed_supplier_obligations'), 0);
    await decideFixedSupplyRecord(database, decision(id));
    await assert.rejects(addFixedSupplyAdjustment(database, { recordId: id, actorId: 'reviewer', kind: 'defect',
      amountPaisa: 10_000, reason: 'SIMULATED defect adjustment', requestId: 'bad-adjust', now: 300,
      environment, form: invalid('staff.managed-adjustment', 'bad-adjust') }));
    assert.equal(count(sqlite, 'managed_supplier_adjustments'), 0);
    await assert.rejects(prepareFixedSupplierPayment(database, { recordId: id, actorId: 'reviewer',
      destinationReference: 'SIM-MAKER-ACCOUNT', requestId: 'bad-prepare', now: 300, environment,
      form: invalid('staff.managed-payment-preparation', 'bad-prepare') }));
    assert.equal(count(sqlite, 'managed_supplier_payments'), 0);
    const paymentId = await prepareFixedSupplierPayment(database, { recordId: id, actorId: 'reviewer',
      destinationReference: 'SIM-MAKER-ACCOUNT', requestId: 'prepare', now: 300, environment,
      form: form('staff.managed-payment-preparation', 'prepare') });
    sqlite.prepare("UPDATE managed_supplier_payments SET status='prepared',approved_by=NULL WHERE id=?").run(paymentId);
    await assert.rejects(transitionFixedSupplierPayment(database, { paymentId, actorId: 'finance',
      action: 'approve', requestId: 'bad-approve', now: 400, environment,
      form: invalid('staff.managed-payment-action', 'bad-approve') }));
    assert.equal((sqlite.prepare('SELECT status FROM managed_supplier_payments WHERE id=?').get(paymentId) as { status: string }).status, 'prepared');
    const transition = await submitRegisteredSellerTransition(database, { sellerId: 'seller', actorId: 'maker',
      legalName: 'Registered Craft Firm', registrationAuthority: 'Cottage Office', registrationNumber: 'REG-003',
      taxMode: 'PAN', taxRegistrationNumber: 'PAN-003', evidenceReferences: ['private-doc-3'],
      agreementVersion: 'SIM-REGISTERED-V1', agreementLanguage: 'ne', agreementAcceptedAt: 100,
      requestId: 'submit-three', now: 100, environment });
    await assert.rejects(reviewRouteTransition(database, { applicationId: transition, actorId: 'finance',
      action: 'reject', reason: 'SIMULATED registration review failed', requestId: 'bad-review', now: 400,
      environment, form: invalid('staff.managed-transition-decision', 'bad-review') }));
    assert.equal((sqlite.prepare('SELECT status FROM seller_route_transition_applications WHERE id=?').get(transition) as { status: string }).status, 'submitted');
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id LIKE 'bad-%' OR request_id LIKE 'bad-%:audit'").get() as { n: number }).n, 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 2);
  } finally { sqlite.close(); }
});

void test('payment preparation rechecks the unpaid amount when an adjustment arrives before commit', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    const id = await proposed(database);
    await decideFixedSupplyRecord(database, decision(id));
    const batch = db.batch.bind(db);
    let raceReached=false;
    db.batch = async (statements: readonly Statement[]) => {
      raceReached=true;
      sqlite.prepare(`INSERT INTO managed_supplier_adjustments(id,obligation_id,kind,amount_paisa,reason,request_id,created_by,created_at)
        VALUES ('concurrent-adjust',?,'defect',10000,'SIMULATED concurrent adjustment','concurrent-adjust','reviewer',250)`).run(id);
      return batch(statements);
    };
    await assert.rejects(prepareFixedSupplierPayment(database, { recordId: id, actorId: 'reviewer',
      destinationReference: 'SIM-MAKER-ACCOUNT', requestId: 'stale-balance', now: 300, environment,
      form: form('staff.managed-payment-preparation', 'stale-balance') }));
    assert.equal(raceReached,true,'unpaid balance race reached the actual batch');
    assert.equal(count(sqlite, 'managed_supplier_payments'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('all five managed decisions roll back if current Super Admin authority changes before batch', async () => {
  for (let branch=0;branch<5;branch++) {
    const {sqlite,db,database}=await fixture();
    try {
      const requestId=`role-race-${branch}`;
      let actorId='reviewer';
      let run:()=>Promise<unknown>;
      if(branch===4) {
        const applicationId=await submitRegisteredSellerTransition(database,{sellerId:'seller',actorId:'maker',
          legalName:'Registered Craft Firm',registrationAuthority:'Cottage Office',registrationNumber:'ROLE-RACE',
          taxMode:'PAN',taxRegistrationNumber:'PAN-ROLE',evidenceReferences:['private-document'],
          agreementVersion:'SIM-REGISTERED-V1',agreementLanguage:'ne',agreementAcceptedAt:100,
          requestId:'role-submit',now:100,environment});
        run=()=>reviewRouteTransition(database,{applicationId,actorId,action:'reject',
          reason:'SIMULATED documented registration review',requestId,now:200,environment,
          form:form(managedFormIds[branch],requestId)});
      } else {
        const recordId=await proposed(database);
        if(branch>0)await decideFixedSupplyRecord(database,decision(recordId));
        if(branch===0)run=()=>decideFixedSupplyRecord(database,decision(recordId,requestId));
        else if(branch===1)run=()=>addFixedSupplyAdjustment(database,{recordId,actorId,kind:'defect',
          amountPaisa:1000,reason:'SIMULATED documented adjustment',requestId,now:300,environment,
          form:form(managedFormIds[branch],requestId)});
        else if(branch===2)run=()=>prepareFixedSupplierPayment(database,{recordId,actorId,
          destinationReference:'SIM-MAKER-ACCOUNT',requestId,now:300,environment,
          form:form(managedFormIds[branch],requestId)});
        else {
          const paymentId=await prepareFixedSupplierPayment(database,{recordId,actorId,
            destinationReference:'SIM-MAKER-ACCOUNT',requestId:'base-payment',now:300,environment});
          sqlite.prepare("UPDATE managed_supplier_payments SET status='prepared',approved_by=NULL WHERE id=?").run(paymentId);
          actorId='finance';
          run=()=>transitionFixedSupplierPayment(database,{paymentId,actorId,action:'approve',
            requestId,now:400,environment,form:form(managedFormIds[branch],requestId)});
        }
      }
      const before=Object.fromEntries(['audit_logs','form_answer_sets','managed_supplier_adjustments',
        'managed_supplier_payments'].map(table=>[table,count(sqlite,table)]));
      db.beforeBatch=()=>sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(actorId);
      const batchCalls=db.batchCalls;
      await assert.rejects(run!,`${managedFormIds[branch]} current grant`);
      assert.equal(db.batchCalls,batchCalls+1,'authority race reached the actual batch');
      for(const [table,n] of Object.entries(before))assert.equal(count(sqlite,table),n,`${managedFormIds[branch]}:${table}`);
    } finally {sqlite.close();}
  }
});

void test('a payment status race cannot commit an audit or answer for a failed transition', async () => {
  const {sqlite,db,database}=await fixture();
  try {
    const recordId=await proposed(database);await decideFixedSupplyRecord(database,decision(recordId));
    const paymentId=await prepareFixedSupplierPayment(database,{recordId,actorId:'reviewer',
      destinationReference:'SIM-MAKER-ACCOUNT',requestId:'base-payment',now:300,environment});
    sqlite.prepare("UPDATE managed_supplier_payments SET status='prepared',approved_by=NULL WHERE id=?").run(paymentId);
    const answers=count(sqlite,'form_answer_sets'),audits=count(sqlite,'audit_logs');
    db.beforeBatch=()=>sqlite.prepare("UPDATE managed_supplier_payments SET status='approved' WHERE id=?").run(paymentId);
    const batchCalls=db.batchCalls;
    await assert.rejects(transitionFixedSupplierPayment(database,{paymentId,actorId:'finance',action:'approve',
      requestId:'state-race',now:400,environment,form:form('staff.managed-payment-action','state-race')}));
    assert.equal(db.batchCalls,batchCalls+1,'payment status race reached the actual batch');
    assert.equal(count(sqlite,'form_answer_sets'),answers);
    assert.equal(count(sqlite,'audit_logs'),audits);
  } finally {sqlite.close();}
});

void test('supply acceptance cannot use a unit amount changed after preflight', async () => {
  const {sqlite,db,database}=await fixture();
  try {
    const recordId=await proposed(database);
    const auditCount=count(sqlite,'audit_logs');
    db.beforeBatch=()=>sqlite.prepare('UPDATE managed_supply_records SET agreed_unit_paisa=60000 WHERE id=?').run(recordId);
    const batchCalls=db.batchCalls;
    await assert.rejects(decideFixedSupplyRecord(database,decision(recordId,'unit-race')));
    assert.equal(db.batchCalls,batchCalls+1,'unit amount race reached the actual batch');
    assert.equal((sqlite.prepare('SELECT status FROM managed_supply_records WHERE id=?').get(recordId) as {status:string}).status,'proposed');
    assert.equal(count(sqlite,'managed_supplier_obligations'),0);
    assert.equal(count(sqlite,'form_answer_sets'),0);
    assert.equal(count(sqlite,'audit_logs'),auditCount);
  } finally {sqlite.close();}
});

void test('all five managed routes classify a publication racing commit as stale with no new answer or audit', async () => {
  const {POST}=await import('../app/api/admin/managed-program/[id]/route');
  for(let branch=0;branch<5;branch++) {
    const {sqlite,db,database}=await fixture();
    try {
      const requestId=`publication-race-${branch}`;
      let body:Record<string,unknown>;
      if(branch===4) {
        const applicationId=await submitRegisteredSellerTransition(database,{sellerId:'seller',actorId:'maker',
          legalName:'Registered Craft Firm',registrationAuthority:'Cottage Office',registrationNumber:'PUBLICATION-RACE',
          taxMode:'PAN',taxRegistrationNumber:'PAN-RACE',evidenceReferences:['private-document'],
          agreementVersion:'SIM-REGISTERED-V1',agreementLanguage:'ne',agreementAcceptedAt:100,
          requestId:'publication-submit',now:100,environment});
        body={action:'review_transition',applicationId,decision:'reject',reason:'SIMULATED documented review'};
      } else {
        const recordId=await proposed(database);
        if(branch>0)await decideFixedSupplyRecord(database,decision(recordId));
        if(branch===0)body={action:'decide_supply',recordId,decision:'accept',quantityAccepted:2,
          possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',
          riskRecordStatus:'simulated_terms_recorded',evidenceReference:'SIM-GRN-RACE',reason:'SIMULATED documented review'};
        else if(branch===1)body={action:'add_adjustment',recordId,kind:'defect',amountPaisa:1000,
          reason:'SIMULATED documented adjustment'};
        else if(branch===2)body={action:'prepare_payment',recordId,destinationReference:'SIM-MAKER-ACCOUNT'};
        else {
          const paymentId=await prepareFixedSupplierPayment(database,{recordId,actorId:'reviewer',
            destinationReference:'SIM-MAKER-ACCOUNT',requestId:'publication-payment',now:300,environment});
          sqlite.prepare("UPDATE managed_supplier_payments SET status='prepared',approved_by=NULL WHERE id=?").run(paymentId);
          globalThis.managedProgramActor={id:'finance',role:'super_admin'};
          body={action:'approve_payment',paymentId};
        }
      }
      publishRequiredContext(sqlite);
      const formId=managedFormIds[branch];
      db.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?,form_id,3,3,'published',config_json,'Later publication','reviewer',3,'reviewer',3,'reviewer',3,?
        FROM form_config_versions WHERE id=?`).run(`${formId}-v3`,`new-${formId}`,`${formId}-v2`);
      const before=Object.fromEntries(['audit_logs','form_answer_sets','managed_supplier_adjustments',
        'managed_supplier_payments'].map(table=>[table,count(sqlite,table)]));
      const batchCalls=db.batchCalls;
      const response=await POST(new Request('http://localhost:3000/api/admin/managed-program/seller',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},
        body:JSON.stringify({...body,requestId,formVersion:2,
          customAnswers:[{fieldId:'context_note',value:'Reviewed fictional managed-program evidence'}]}),
      }),{params:Promise.resolve({id:'seller'})});
      assert.equal(db.batchCalls,batchCalls+1,'publication race reached the actual batch');
      assert.equal(response.status,409,formId);
      assert.equal((await response.json() as {code?:string}).code,'stale_version',formId);
      for(const [table,n] of Object.entries(before))assert.equal(count(sqlite,table),n,`${formId}:${table}`);
    } finally {sqlite.close();}
  }
});

void test('managed-program route validates each branch and persists answers only for completed actions', async () => {
  const { sqlite, database } = await fixture();
  try {
    publishRequiredContext(sqlite);
    const { POST } = await import('../app/api/admin/managed-program/[id]/route');
    const send = (body: Record<string, unknown>) => POST(new Request('http://localhost:3000/api/admin/managed-program/seller', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ formVersion: 2,
        customAnswers: [{fieldId:'context_note',value:'Reviewed fictional managed-program evidence'}], ...body }),
    }), { params: Promise.resolve({ id: 'seller' }) });
    const supply = await proposed(database);
    globalThis.managedProgramActor = null;
    assert.equal((await send({ action: 'decide_supply', recordId: supply, requestId: 'unauthorized' })).status, 403);
    globalThis.managedProgramActor = { id: 'reviewer', role: 'super_admin' };
    assert.equal((await send({ action: 'decide_supply', recordId: supply, requestId: 'missing-version', formVersion: undefined })).status, 400);
    for(const action of ['decide_supply','add_adjustment','prepare_payment','approve_payment','review_transition']) {
      assert.equal((await send({action,requestId:`required-${action}`,customAnswers:[]})).status,400,action);
      assert.equal((await send({action,requestId:`protected-${action}`,
        customAnswers:[{fieldId:'request_id',value:'forged'}]})).status,400,action);
    }
    assert.equal((await send({ action:'decide_supply',recordId:supply,requestId:'missing-required',customAnswers:[] })).status,400);
    assert.equal((await send({ action:'decide_supply',recordId:supply,requestId:'forged-key',
      customAnswers:[{fieldId:'request_id',value:'forged'}] })).status,400);
    assert.equal((await send({ action: 'decide_supply', recordId: supply, requestId: 'bad-evidence', decision: 'accept',
      quantityAccepted: 2, possessionStatus: 'received', qualityStatus: 'accepted', ownershipRecordStatus: 'simulated_terms_recorded',
      riskRecordStatus: 'simulated_terms_recorded', evidenceReference: '', reason: 'SIMULATED quantity acceptance' })).status, 409);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    const decide = { action: 'decide_supply', recordId: supply, requestId: 'route-decide', decision: 'accept',
      quantityAccepted: 2, possessionStatus: 'received', qualityStatus: 'accepted', ownershipRecordStatus: 'simulated_terms_recorded',
      riskRecordStatus: 'simulated_terms_recorded', evidenceReference: 'SIM-GRN-ROUTE', reason: 'SIMULATED quantity acceptance' };
    assert.equal((await send(decide)).status, 200);
    assert.equal((await send(decide)).status, 200);
    assert.equal((await send({ ...decide, quantityAccepted: 1 })).status, 409);
    const adjust = { action: 'add_adjustment', recordId: supply, requestId: 'route-adjust', kind: 'defect',
      amountPaisa: 10_000, reason: 'SIMULATED defect adjustment' };
    assert.equal((await send(adjust)).status, 200);
    const prepared = await send({ action: 'prepare_payment', recordId: supply, requestId: 'route-prepare',
      destinationReference: 'SIM-MAKER-ACCOUNT' });
    assert.equal(prepared.status, 200);
    const { paymentId } = await prepared.json() as { paymentId: string };
    assert.ok(paymentId);
    assert.equal((sqlite.prepare('SELECT status FROM managed_supplier_payments WHERE id=?').get(paymentId) as {status:string}).status,'approved');
    assert.equal((await send({ action: 'approve_payment', paymentId, requestId: 'route-approve' })).status, 409);
    // Existing pre-amendment prepared records still have a lawful catalog approval action.
    sqlite.prepare("UPDATE managed_supplier_payments SET status='prepared',approved_by=NULL WHERE id=?").run(paymentId);
    assert.equal((await send({ action: 'approve_payment', paymentId, requestId: 'route-approve-historical' })).status, 200);
    assert.equal((await send({ action: 'mark_payment_paid', paymentId, requestId: 'route-paid' })).status, 409);
    const transition = await submitRegisteredSellerTransition(database, { sellerId: 'seller', actorId: 'maker',
      legalName: 'Registered Craft Firm', registrationAuthority: 'Cottage Office', registrationNumber: 'REG-002',
      taxMode: 'PAN', taxRegistrationNumber: 'PAN-002', evidenceReferences: ['private-doc-2'],
      agreementVersion: 'SIM-REGISTERED-V1', agreementLanguage: 'ne', agreementAcceptedAt: 100,
      requestId: 'route-submit', now: 100, environment });
    assert.equal((await send({ action: 'review_transition', applicationId: transition, requestId: 'route-review',
      decision: 'reject', reason: 'SIMULATED document review failed' })).status, 200);
    assert.equal(count(sqlite, 'form_answer_sets'), 5);
    for(const formId of managedFormIds)sqlite.prepare(`INSERT INTO form_config_versions
      (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,3,3,'published',?,'Archive context','reviewer',3,'reviewer',3,'reviewer',3,?)`)
      .run(`${formId}-v3`,formId,JSON.stringify({formId,fields:[]}),`archive-${formId}`);
    globalThis.managedProgramActor={id:'reviewer',role:'super_admin'};
    assert.equal((await send(decide)).status,200,'exact old-version replay after archival');
    const { authorizeFormAnswerRead } = await import('../lib/forms/access');
    const { availableStaffHistoryKinds, listStaffFormHistory } = await import('../lib/forms/staff-history');
    const viewer = {id:'reviewer',role:'super_admin' as const};
    const historyKinds = ['managed-supply-decision','managed-adjustment',
      'managed-payment-preparation','managed-payment-action','managed-transition-decision'];
    const available = await availableStaffHistoryKinds(database,viewer);
    for (const [index,formId] of managedFormIds.entries()) {
      assert.ok(available.some((entry)=>entry.kind===historyKinds[index]),`${formId} history link`);
      const answers = sqlite.prepare(`SELECT id,form_id AS formId,subject_type AS subjectType,
        subject_id AS subjectId,actor_id AS actorId,request_id AS requestId FROM form_answer_sets
        WHERE form_id=?`).all(formId) as Array<{id:string;formId:string;subjectType:string;
          subjectId:string;actorId:string;requestId:string}>;
      assert.ok(answers.length>0,formId);
      for (const answer of answers) {
        assert.equal(await authorizeFormAnswerRead(database,viewer,answer),true,formId);
        assert.equal(await authorizeFormAnswerRead(database,viewer,{...answer,requestId:'forged'}),false,
          `${formId} request must bind audit`);
        assert.equal(await authorizeFormAnswerRead(database,viewer,{...answer,subjectId:'forged'}),false,
          `${formId} subject must bind parent`);
        assert.equal(await authorizeFormAnswerRead(database,{id:'maker',role:'seller'},answer),false,
          `${formId} seller ownership cannot expose staff evidence`);
        assert.equal(await authorizeFormAnswerRead(database,{id:'other',role:'admin'},answer),false,
          `${formId} needs current Super Admin`);
      }
      assert.equal((await listStaffFormHistory(database,viewer,historyKinds[index],{})).items.length,
        answers.length,`${formId} archived index`);
    }
    sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();
    const firstAnswer = sqlite.prepare(`SELECT id,form_id AS formId,subject_type AS subjectType,
      subject_id AS subjectId,actor_id AS actorId,request_id AS requestId FROM form_answer_sets
      WHERE form_id=?`).get(managedFormIds[0]) as {id:string;formId:string;subjectType:string;
        subjectId:string;actorId:string;requestId:string};
    assert.equal(await authorizeFormAnswerRead(database,viewer,firstAnswer),false);
  } finally { sqlite.close(); }
});

void test('managed-program receiver bounds streamed JSON and rejects malformed or invalid UTF-8 input', async () => {
  const {POST}=await import('../app/api/admin/managed-program/[id]/route');
  const receive=(body:BodyInit)=>POST(new Request('http://localhost:3000/api/admin/managed-program/seller',{
    method:'POST',headers:{origin:'http://localhost:3000'},body,duplex:'half',
  } as RequestInit & {duplex:'half'}),{params:Promise.resolve({id:'seller'})});
  assert.equal((await receive('{')).status,400);
  assert.equal((await receive(new Uint8Array([0xff,0xfe]))).status,400);
  const stream=new ReadableStream<Uint8Array>({start(controller){
    controller.enqueue(new Uint8Array(262145));controller.close();
  }});
  assert.equal((await receive(stream)).status,413);
});

void test('mounted managed-program forms send their own published answer context', async () => {
  type TestRoute = { request(): { url(): string; postData(): string | null };
    fulfill(options: { status: number; contentType: string; body: string }): Promise<void> };
  type TestLocator = { count(): Promise<number>; first(): TestLocator;
    locator(selector: string): TestLocator; getByLabel(label: string): TestLocator;
    fill(value: string): Promise<void>; click(): Promise<void> };
  type TestPage = { route(pattern: string, handler: (route: TestRoute) => Promise<void>): Promise<void>;
    goto(url: string): Promise<unknown>; addScriptTag(options: { content: string }): Promise<unknown>;
    locator(selector: string): TestLocator; waitForTimeout(ms: number): Promise<void>; close(): Promise<void> };
  type TestBrowser = { newPage(): Promise<TestPage>; close(): Promise<void> };
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<TestBrowser> } };
  const supplies = [
    { id: 'proposed', status: 'proposed', paymentId: null, paymentStatus: null },
    { id: 'accepted', status: 'accepted', paymentId: null, paymentStatus: null },
    { id: 'prepared', status: 'accepted', paymentId: 'pay-prepared', paymentStatus: 'prepared' },
    { id: 'approved', status: 'accepted', paymentId: 'pay-approved', paymentStatus: 'approved' },
  ].map((item) => ({ productName: item.id, quantityProposed: 2, quantityAccepted: item.status === 'accepted' ? 2 : null,
    agreedUnitPaisa: 50000, acceptedTotalPaisa: item.status === 'accepted' ? 100000 : null,
    possessionStatus: 'received', qualityStatus: 'accepted', evidenceReference: null,
    originalOwedPaisa: item.status === 'accepted' ? 100000 : null, adjustedPaisa: 0, paidPaisa: 0,
    createdAt: 100, ...item }));
  const workspace = { participationRoute: 'managed_maker', applicationStage: 'active',
    commercialModel: 'managed_fixed_supplier_price_v1', products: [], supplies,
    transitions: [{ id: 'application', status: 'submitted', legalName: 'Registered Maker', taxMode: 'PAN',
      effectiveAt: null, reviewReason: null, createdAt: 100 }] };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'managed-program-client-fixture.tsx',
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {ManagedProgramReview} from './components/admin/managed-program-review';
      createRoot(document.getElementById('root')!).render(<ManagedProgramReview sellerId="seller" workspace={${JSON.stringify(workspace)}}/>);`, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'managed-program-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'managed-stub' }));
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'managed-stub' }));
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'managed-stub' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'managed-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
      bundler.onLoad({ filter: /^link$/, namespace: 'managed-stub' }, () => ({ resolveDir:process.cwd(),
        contents:'import React from "react";export default function Link(props){return <a {...props}/>}',loader:'tsx' }));
      bundler.onLoad({ filter: /^config$/, namespace: 'managed-stub' }, () => ({ contents: `export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',type:'short_text',label:'Staff context',required:true,order:0,status:'active'}]},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){return true}}}`, loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: Record<string, unknown>[] = [];
  try {
    await page.route('https://managed-program.test/**', async (route: TestRoute) => {
      if (new URL(route.request().url()).pathname.startsWith('/api/admin/managed-program/')) {
        bodies.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"paymentId":"new-payment"}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://managed-program.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for(let attempt=0;attempt<20&&await page.locator('nav[aria-label="Managed program form history"] a').count()===0;attempt++)
      await page.waitForTimeout(50);
    assert.equal(await page.locator('nav[aria-label="Managed program form history"] a').count(),5);
    for (const [id, action] of [
      ['staff.managed-supply-decision', 'decide_supply'],
      ['staff.managed-adjustment', 'add_adjustment'],
      ['staff.managed-payment-preparation', 'prepare_payment'],
      ['staff.managed-payment-action', 'approve_payment'],
      ['staff.managed-transition-decision', 'review_transition'],
    ]) {
      const form = page.locator(`form[data-form-id="${id}"]`).first();
      assert.equal(await form.count(), 1, id);
      assert.equal(await form.locator('[data-configured-field="context_note"]').count(), 1, id);
      await form.getByLabel('Staff context').fill('Reviewed staging evidence');
      if (action === 'decide_supply') { await form.getByLabel('Supporting document or reference').fill('SIM-GRN'); await form.getByLabel('Decision reason').fill('SIMULATED approval'); }
      if (action === 'add_adjustment') { await form.locator('[name="amountNpr"]').fill('100.00'); await form.locator('[name="reason"]').fill('SIMULATED adjustment'); }
      if (action === 'review_transition') await form.getByLabel('Review reason').fill('SIMULATED review');
      const before = bodies.length;
      await form.locator('button[type="submit"],button:not([type])').first().click();
      for (let attempt = 0; attempt < 20 && bodies.length === before; attempt++) await page.waitForTimeout(50);
      assert.equal(bodies.length, before + 1);
      assert.equal(bodies.at(-1)?.action, action);
      assert.equal(bodies.at(-1)?.formVersion, 1);
      assert.deepEqual(bodies.at(-1)?.customAnswers, [{ fieldId: 'context_note', value: 'Reviewed staging evidence' }]);
    }
  } finally { await page.close(); await browser.close(); }
});

void test('direct supplier payment preparation approves without recording payment', async () => {
  for (const configured of [false,true]) {
    const {sqlite,database}=await fixture();
    try {
      const recordId=await proposed(database);await decideFixedSupplyRecord(database,decision(recordId));
      const requestId=`direct-supplier-${configured}`;
      const input={recordId,actorId:'reviewer',destinationReference:'SIM-MAKER-ACCOUNT',requestId,now:300,environment,
        ...(configured?{form:form('staff.managed-payment-preparation',requestId)}:{})};
      const id=await prepareFixedSupplierPayment(database,input);
      assert.deepEqual({...sqlite.prepare('SELECT status,prepared_by AS preparer,approved_by AS approver,paid_at AS paidAt FROM managed_supplier_payments WHERE id=?').get(id) as object},
        {status:'approved',preparer:'reviewer',approver:'reviewer',paidAt:null});
      assert.equal(await prepareFixedSupplierPayment(database,input),id);
      sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
      await assert.rejects(prepareFixedSupplierPayment(database,input),/permission|Super Admin/i);
      assert.equal(count(sqlite,'managed_supplier_payments'),1);
    } finally {sqlite.close();}
  }
});

void test('supplier direct preparation rolls back on current authority races with and without configured answers',async()=>{
  for(const configured of [false,true]){
    const {sqlite,db,database}=await fixture();try{
      const recordId=await proposed(database);await decideFixedSupplyRecord(database,decision(recordId));
      const prior=count(sqlite,'audit_logs'),priorAnswers=count(sqlite,'form_answer_sets');const requestId=`supplier-authority-${configured}`;
      db.beforeBatch=()=>sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
      const batchCalls=db.batchCalls;
      await assert.rejects(prepareFixedSupplierPayment(database,{recordId,actorId:'reviewer',destinationReference:'SIM-MAKER-ACCOUNT',requestId,now:300,environment,...(configured?{form:form('staff.managed-payment-preparation',requestId)}:{})}));
      assert.equal(db.batchCalls,batchCalls+1,'direct authority race reached the actual batch');
      assert.equal(count(sqlite,'managed_supplier_payments'),0);assert.equal(count(sqlite,'audit_logs'),prior);assert.equal(count(sqlite,'form_answer_sets'),priorAnswers);
    }finally{sqlite.close();}
  }
});
