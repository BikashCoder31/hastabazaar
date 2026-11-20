import { cataloguePayoutSources, cataloguePayoutPacket } from './helpers/catalogue-payout-execution';
import { recordPayoutTransferOutcome } from '../lib/payments/payout-transfers';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

import { operatePayout, prepareSellerPayout } from '../lib/db/repositories/payouts';
import { prepareManagedPayout, transitionManagedPayout } from '../lib/db/repositories/managed-settlements';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import { getFormAnswerById } from '../lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { listStaffFormHistory, readStaffFormHistoryAnswer } from '../lib/forms/staff-history';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';
import { validateFormDraft } from '../lib/forms/validation';

declare global {
  var payoutCatalogDb: D1Database;
  var payoutCatalogActor: { id: string; role: 'admin' | 'super_admin' } | null;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.payoutCatalogDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.payoutCatalogActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.payoutCatalogActor}`, shortCircuit: true };
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
  batchCalls = 0;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.batchCalls++;
    this.beforeBatch?.(); this.beforeBatch = undefined;
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const now = 1_800_000_000_000;
function fixture(includeApprovalUpgrade = true, fixtureNow = now, initialReference: string | null = 'SIMULATED-ACCOUNT') {
  const now = fixtureNow;
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync('drizzle').filter((item) => /^\d{4}_.+\.sql$/.test(item) && (includeApprovalUpgrade || item < '0062')).sort()) {
    for (const statement of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) sqlite.exec(statement);
  }
  for (const id of ['sa1', 'sa2', 'admin1', 'seller-user']) {
    sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES (?,?,?,?,'en-NP','active',?,?)`).run(id, id, `${id}@example.test`, id, now, now);
  }
  for (const [id, role] of [['sa1','super_admin'],['sa2','super_admin'],['admin1','admin'],['seller-user','seller']])
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)').run(id, role, now);
  sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
    registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
    support_email,province,district,municipality,locality,payout_account_reference,status,
    approved_at,created_at,updated_at,applicant_type) VALUES
    ('seller-one','seller-user','Fictional Seller','Fictional Shop','Local','REG','PAN','PAN',
    'Representative','9800000000','seller@example.test','Madhesh','Dhanusha','Janakpur',
    'Ward 1',?,'approved',?,?,?,'individual')`).run(initialReference, now - 1000, now, now);
  sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
    VALUES ('earning-one','seller-one','sale',5000,?,'SIMULATED available earning',?)`).run(now - 100, now - 100);
  for (const formId of ['staff.payout-1','staff.payout-2']) {
    const fields = [{ id:'context_note', key:'context_note', label:'Review context',
      type:'short_text', required:true, order:0, status:'active' }];
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
      reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','sa1',1,'sa1',1,'sa1',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields }), `seed-${formId}`);
  }
  const database = new Database(sqlite);
  return { sqlite, database, db: database as unknown as D1Database };
}
function form<T extends 'staff.payout-1' | 'staff.payout-2'>(formId: T, requestId: string,
  value = 'Reviewed fictional payout evidence'): { formId: T; requestId: string;
  versionId: string; answers: { formId: T; version: number; answers: Array<{
    fieldId: string; label: string; type: 'short_text'; value: string }> } } {
  return { formId, requestId, versionId: `${formId}-v1`, answers: {
    formId, version: 1, answers: [{ fieldId:'context_note', label:'Review context',
      type:'short_text' as const, value }],
  } };
}
function count(sqlite: DatabaseSync, table: string) {
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

void test('approval schema upgrade preserves rows, dependent entries, indexes and domain triggers', async () => {
  const { sqlite } = fixture(false);
  try {
    // Historical schema preservation must use historical records, not today's domain against pre-0062 tables.
    const payout={id:'legacy-payout-before-upgrade'};
    sqlite.prepare(`INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,scheduled_for,created_at,updated_at,created_request_id)
      VALUES(?,'seller-one','LEGACY-PAYOUT','prepared',5000,'SIMULATED-ACCOUNT','admin1',?,?,?,'before-upgrade')`).run(payout.id,now,now,now);
    sqlite.prepare("INSERT INTO payout_entries(payout_id,ledger_entry_id) VALUES(?,'earning-one')").run(payout.id);
    sqlite.prepare(`INSERT INTO payout_events(id,payout_id,to_status,action,actor_id,actor_type,note,request_id,created_at)
      VALUES('legacy-prepare-event',?,'prepared','prepare','admin1','admin','Reviewed original eligible balance','before-upgrade',?)`).run(payout.id,now);
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
      VALUES('legacy-prepare-audit','admin1','payout.prepared','payout',?,'Reviewed original eligible balance','{"status":"prepared"}','before-upgrade',?)`).run(payout.id,now);
    sqlite.exec(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,scheduled_for,request_id,created_at,updated_at)
      VALUES('managed-upgrade','seller-one','SIM-UPGRADE',5000,'prepared','SIM-ACCOUNT','SIMULATED','sa1',1,'managed-upgrade',1,1);
      INSERT INTO promotions(id,name_en,name_ne,placement,starts_at,ends_at,created_by,note,created_request_id,created_at,updated_at)
      VALUES('promotion-upgrade','Sample','Sample','homepage',1,2,'sa1','Original note','promotion-upgrade',1,1);
      INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at)
      VALUES('permission-upgrade','admin1','[]',0,'Original permission review','sa1',1);`);
    const tables = ['payouts','payout_entries','seller_ledger_entries','payout_events','audit_logs','managed_payouts','promotions','staff_permission_requests','refunds','managed_supplier_payments','parcel_cash_records'];
    const snapshots = tables.map(table => sqlite.prepare(`SELECT * FROM ${table}`).all());
    const objects = sqlite.prepare("SELECT name FROM sqlite_master WHERE type IN ('index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[];
    for (const statement of readFileSync('drizzle/0062_single_super_admin_approvals.sql','utf8').split('--> statement-breakpoint')) if(statement.trim()) sqlite.exec(statement);
    tables.forEach((table,index) => assert.deepEqual(sqlite.prepare(`SELECT * FROM ${table}`).all(),snapshots[index],table));
    for(const {name} of objects) assert.ok(sqlite.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name),name);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal((sqlite.prepare('PRAGMA foreign_keys').get() as {foreign_keys:number}).foreign_keys,1);
    sqlite.prepare("UPDATE payouts SET prepared_by='sa1' WHERE id=?").run(payout.id);
    for(const table of ['payouts','managed_payouts','promotions']) {
      sqlite.prepare(`UPDATE ${table} SET approved_by='sa1',status='approved' WHERE id=?`).run(table==='payouts'?payout.id:table==='managed_payouts'?'managed-upgrade':'promotion-upgrade');
    }
    sqlite.exec("UPDATE staff_permission_requests SET decided_by='sa1',status='approved' WHERE id='permission-upgrade'");
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='sa1'");
    sqlite.exec("UPDATE payouts SET status='processing' WHERE id='"+payout.id+"'");
    assert.throws(()=>sqlite.exec("UPDATE promotions SET approved_by='admin1',created_by='admin1' WHERE id='promotion-upgrade'"),/active_super_admin/);
    sqlite.exec("UPDATE promotions SET approved_by='admin1',created_by='sa2' WHERE id='promotion-upgrade'");
    assert.throws(()=>sqlite.exec("UPDATE promotions SET created_by='admin1' WHERE id='promotion-upgrade'"),/active_super_admin/);
  } finally {sqlite.close();}
});

void test('managed payout approvals accept their active Super Admin preparer and deny ordinary or suspended actors', async () => {
  const f=await earnedMaker();
  const {sqlite,db}=f;
  try {
    for (const [id,role] of [['sa1','super_admin'],['sa2','super_admin'],['admin1','admin']]) {
      sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',1,1)").run(id, `${id}@local.hastabazaar.test`, id);
      sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,1)').run(id,role);
    }
    sqlite.prepare(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,scheduled_for,request_id,created_at,updated_at)
      VALUES('managed-one','maker','SIM-MANAGED-ONE',91000,'prepared',?,'SIMULATED','sa1',1,'managed-one',1,1)`).run(f.context.destinationReference);
    sqlite.prepare("INSERT INTO managed_payout_entries(payout_id,settlement_entry_id) SELECT 'managed-one',id FROM managed_settlement_entries WHERE entitlement_id=?").run(f.entitlementId);
    const approval={payoutId:'managed-one',actorId:'sa1',action:'approve' as const,requestId:'managed-approved',now,environment:f.context.environment};
    await assert.rejects(transitionManagedPayout(db,{...approval,actorId:'admin1'}),/permission|Super Admin/i);
    await transitionManagedPayout(db,approval);
    assert.deepEqual({...sqlite.prepare("SELECT status,approved_by AS approvedBy FROM managed_payouts WHERE id='managed-one'").get() as object},{status:'approved',approvedBy:'sa1'});
    await transitionManagedPayout(db,approval);
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='sa1'");
    await assert.rejects(transitionManagedPayout(db,approval),/permission|Super Admin/i);
    await assert.rejects(transitionManagedPayout(db,{...approval,actorId:'sa2',action:'mark_paid',requestId:'managed-paid',providerReference:'SIM-MANAGED-PAID'}),/original verified|execution packet/i);
    const execution=await cataloguePayoutPacket(f,{actorId:'sa2',model:'managed',payoutId:'managed-one',
      accountVersionId:f.payoutSources.accountVersionId,amountPaisa:91000,environment:f.context.environment});
    assert.equal(sqlite.prepare("SELECT status FROM managed_payouts WHERE id='managed-one'").get()?.status,'processing');
    const paid=await execution.complete();
    assert.deepEqual(await execution.complete(),paid);
    await assert.rejects(recordPayoutTransferOutcome(db,{...execution.completion,actorId:'sa1'},execution.outcome),/permission|Super Admin/i);
    assert.equal(sqlite.prepare("SELECT status FROM managed_payouts WHERE id='managed-one'").get()?.status,'paid');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE subject_type='managed_payout' AND subject_id='managed-one'").get()?.n,3,'one approval, one processing, one paid source event');
    assert.equal(count(sqlite,'company_outgoing_bank_identities'),1);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {sqlite.close();}
});

void test('direct payout preparation binds one answer to the immutable financial batch and exact replay', async () => {
  const { sqlite, db } = fixture();
  const options = { sellerId:'seller-one', actorId:'sa1', actorRole:'super_admin' as const,
    note:'Verified eligible balance and destination', requestId:'direct-prepare', now,
    form:form('staff.payout-1','direct-prepare') };
  try {
    const first = await prepareSellerPayout(db, options);
    assert.equal(first.duplicate, false);
    assert.deepEqual(await prepareSellerPayout(db, options), { id:first.id, duplicate:true });
    assert.equal(count(sqlite,'payouts'),1);
    assert.equal(count(sqlite,'payout_entries'),1);
    assert.equal(count(sqlite,'form_answer_sets'),1);
    const answer = sqlite.prepare('SELECT form_id AS formId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() as Record<string,unknown>;
    assert.deepEqual({ ...answer }, { formId:'staff.payout-1', subjectType:'payout', subjectId:first.id, actorId:'sa1' });
    await assert.rejects(prepareSellerPayout(db,{...options,sellerId:'missing'}));
    await assert.rejects(prepareSellerPayout(db,{...options,actorId:'sa2'}));
    await assert.rejects(prepareSellerPayout(db,{...options,note:'Changed evidence after preparation'}));
    await assert.rejects(prepareSellerPayout(db,{...options,form:form('staff.payout-1','direct-prepare','Changed answer')}));
    sqlite.exec("DELETE FROM user_roles WHERE user_id='sa1'");
    await assert.rejects(prepareSellerPayout(db,options));
    assert.equal(count(sqlite,'form_answer_sets'),1);
  } finally { sqlite.close(); }
});

void test('direct preparation rolls back financial rows when answer or current seller state fails', async () => {
  for (const race of ['answer','seller','destination','balance','publication'] as const) {
    const { sqlite, database, db } = fixture();
    const options = { sellerId:'seller-one', actorId:'sa1', actorRole:'super_admin' as const,
      note:'Verified eligible balance and destination', requestId:`prepare-${race}`, now,
      form:race==='answer' ? { ...form('staff.payout-1',`prepare-${race}`), versionId:'missing' }
        : form('staff.payout-1',`prepare-${race}`) };
    try {
      const prior = Object.fromEntries(['payouts','payout_entries','payout_events','audit_logs','form_answer_sets']
        .map((table) => [table,count(sqlite,table)]));
      if (race === 'seller') database.beforeBatch = () => sqlite.exec("UPDATE seller_profiles SET status='suspended' WHERE id='seller-one'");
      if (race === 'destination') database.beforeBatch = () => sqlite.exec("UPDATE seller_profiles SET payout_account_reference='CHANGED-DESTINATION' WHERE id='seller-one'");
      if (race === 'balance') database.beforeBatch = () => sqlite.exec("UPDATE seller_ledger_entries SET available_at=9999999999999 WHERE id='earning-one'");
      if (race === 'publication') database.beforeBatch = () => sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT 'staff.payout-1-v2',form_id,2,2,'published',config_json,'New version','sa1',2,'sa1',2,'sa1',2,'new-version'
        FROM form_config_versions WHERE id='staff.payout-1-v1'`).run();
      const batchCalls=database.batchCalls;
      await assert.rejects(prepareSellerPayout(db,options),race);
      assert.equal(database.batchCalls,batchCalls+1,`${race}: reaches actual batch`);
      for (const [table,n] of Object.entries(prior))
        assert.equal(count(sqlite,table),n,`${race}:${table}`);
    } finally { sqlite.close(); }
  }
});

void test('payout actions replay exact actor/action/note/reference and never double debit or release', async () => {
  const now=Date.now()-1000;
  const { sqlite, db } = fixture(true,now,null);
  try {
    const sources=await cataloguePayoutSources({sqlite,db},'seller-one','sa1');
    const payout = await prepareSellerPayout(db,{sellerId:'seller-one',actorId:'admin1',actorRole:'admin',
      note:'Verified eligible balance and destination',requestId:'prepare-base',now});
    const approve = {payoutId:payout.id,actorId:'sa1',actorRole:'super_admin' as const,
      action:'approve' as const,note:'Independent payout evidence verified',requestId:'approve-one',now:now+1,
      form:form('staff.payout-2','approve-one')};
    await assert.rejects(operatePayout(db,{...approve,actorId:'admin1',actorRole:'admin',requestId:'admin-approve',
      form:form('staff.payout-2','admin-approve')}));
    assert.equal(count(sqlite,'form_answer_sets'),0);
    await operatePayout(db,approve);
    await operatePayout(db,approve);
    await assert.rejects(operatePayout(db,{...approve,actorId:'sa2'}));
    await assert.rejects(operatePayout(db,{...approve,action:'reject'}));
    await assert.rejects(operatePayout(db,{...approve,note:'Different review evidence'}));
    await assert.rejects(operatePayout(db,{...approve,form:form('staff.payout-2','approve-one','Different answer')}));
    const processing = {...approve,action:'start_processing' as const,requestId:'processing-one',
      note:'Start simulated processing after approval',form:form('staff.payout-2','processing-one')};
    await assert.rejects(operatePayout(db,processing),/original verified payout execution packet/);
    const paid = {...approve,action:'mark_paid' as const,requestId:'paid-one',
      providerReference:'SIMULATED-REFERENCE',note:'Verified simulated provider confirmation',
      form:form('staff.payout-2','paid-one')};
    await assert.rejects(operatePayout(db,paid),/original verified payout execution packet/);
    assert.equal(count(sqlite,'form_answer_sets'),1,'refused legacy execution creates no configurable answer');
    const execution=await cataloguePayoutPacket({sqlite,db},{actorId:'sa1',model:'registered',payoutId:payout.id,
      accountVersionId:sources.accountVersionId,amountPaisa:5000});
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='payout'").get()?.n,0);
    const result=await execution.complete();
    const retained=sqlite.prepare('SELECT * FROM payout_transfer_packets WHERE id=?').get(execution.packetId);
    const identity=sqlite.prepare('SELECT * FROM company_outgoing_bank_identities WHERE packet_id=?').get(execution.packetId);
    assert.deepEqual(await execution.complete(),result);
    for(const changed of [{...execution.outcome,transactionIdentity:'DIFFERENT-REFERENCE'},
      {...execution.outcome,reason:'Different independently supplied bank evidence'}])
      await assert.rejects(recordPayoutTransferOutcome(db,execution.completion,changed),/different command content/);
    await assert.rejects(recordPayoutTransferOutcome(db,{...execution.completion,actorId:'sa2'},execution.outcome));
    assert.deepEqual(sqlite.prepare('SELECT * FROM payout_transfer_packets WHERE id=?').get(execution.packetId),retained);
    assert.deepEqual(sqlite.prepare('SELECT * FROM company_outgoing_bank_identities WHERE packet_id=?').get(execution.packetId),identity);
    assert.equal(count(sqlite,'company_outgoing_bank_identities'),1);
    assert.equal(count(sqlite,'form_answer_sets'),1,'system execution retains native receipts, not configurable evidence');
    assert.equal(count(sqlite,'payout_events'),4);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE type='payout'").get() as {n:number}).n,1);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { sqlite.close(); }
});

void test('payout action status or permission race and answer failure leave zero new effects', async () => {
  for (const race of ['state','permission','answer','publication'] as const) {
    const { sqlite, database, db } = fixture();
    try {
      const payout = await prepareSellerPayout(db,{sellerId:'seller-one',actorId:'admin1',actorRole:'admin',
        note:'Verified eligible balance and destination',requestId:'prepare-base',now});
      const prior = Object.fromEntries(['payout_events','audit_logs','notification_messages','form_answer_sets']
        .map((table) => [table,count(sqlite,table)]));
      const options = {payoutId:payout.id,actorId:'sa2',actorRole:'super_admin' as const,
        action:'approve' as const,note:'Independent payout evidence verified',requestId:`approve-${race}`,
        now:now+1,form:race==='answer' ? {...form('staff.payout-2',`approve-${race}`),versionId:'missing'}
          :form('staff.payout-2',`approve-${race}`)};
      if(race==='state')database.beforeBatch=()=>sqlite.prepare("UPDATE payouts SET status='rejected' WHERE id=?").run(payout.id);
      if(race==='permission')database.beforeBatch=()=>sqlite.exec("DELETE FROM user_roles WHERE user_id='sa2'");
      if(race==='publication')database.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT 'staff.payout-2-v2',form_id,2,2,'published',config_json,'New version','sa1',2,'sa1',2,'sa1',2,'new-version'
        FROM form_config_versions WHERE id='staff.payout-2-v1'`).run();
      const batchCalls=database.batchCalls;
      await assert.rejects(operatePayout(db,options),race);
      assert.equal(database.batchCalls,batchCalls+1,`${race}: reaches actual batch`);
      for(const [table,n] of Object.entries(prior))assert.equal(count(sqlite,table),n,`${race}:${table}`);
      assert.equal((sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(payout.id) as {status:string}).status,
        race==='state'?'rejected':'prepared');
    } finally { sqlite.close(); }
  }
});

void test('rejected payout releases its reservation once and preserves exact form-backed replay', async () => {
  const { sqlite, db } = fixture();
  try {
    const payout = await prepareSellerPayout(db,{sellerId:'seller-one',actorId:'admin1',actorRole:'admin',
      note:'Verified eligible balance and destination',requestId:'prepare-rejected',now});
    const reject = {payoutId:payout.id,actorId:'sa2',actorRole:'super_admin' as const,
      action:'reject' as const,note:'Independent rejection for fictional evidence',
      requestId:'reject-one',now:now+1,form:form('staff.payout-2','reject-one')};
    await operatePayout(db,reject);
    await operatePayout(db,reject);
    assert.equal((sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(payout.id) as {status:string}).status,'rejected');
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM payout_entries WHERE payout_id=? AND released_at IS NOT NULL')
      .get(payout.id) as {n:number}).n,1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE type='payout'").get() as {n:number}).n,0);
    assert.equal(count(sqlite,'form_answer_sets'),1);
    assert.equal(count(sqlite,'payout_events'),2);
  } finally { sqlite.close(); }
});

void test('both live payout receivers enforce required context and commit exact financial/history snapshots', async () => {
  const { sqlite, db } = fixture();
  globalThis.payoutCatalogDb = db;
  globalThis.payoutCatalogActor = { id:'admin1', role:'admin' };
  const request = (path:string, value:unknown) => new Request(`http://localhost:3000${path}`, {
    method:'POST', headers:{ origin:'http://localhost:3000', 'content-type':'application/json' },
    body:JSON.stringify(value),
  });
  try {
    sqlite.exec('UPDATE seller_ledger_entries SET available_at=0');
    const prepareRoute = await import('../app/api/admin/payouts/route');
    const preparation = {sellerId:'seller-one',note:'Verified eligible balance and destination',
      idempotencyKey:'route-prepare',formVersion:1,
      customAnswers:[{fieldId:'context_note',value:'Reviewed fictional payout evidence'}]};
    assert.equal((await prepareRoute.POST(request('/api/admin/payouts',{...preparation,customAnswers:[]}))).status,400);
    assert.equal((await prepareRoute.POST(new Request('http://localhost:3000/api/admin/payouts',{
      method:'POST',headers:{origin:'http://localhost:3000'},body:'{' }))).status,400);
    assert.equal((await prepareRoute.POST(request('/api/admin/payouts',{
      ...preparation,customAnswers:[{fieldId:'context_note',value:'x'.repeat(262_145)}],
    }))).status,413);
    assert.equal(count(sqlite,'payouts'),0);
    const first = await prepareRoute.POST(request('/api/admin/payouts',preparation));
    assert.equal(first.status,201);
    const payout = await first.json() as {id:string};
    assert.equal((await prepareRoute.POST(request('/api/admin/payouts',preparation))).status,200);
    assert.equal((await prepareRoute.POST(request('/api/admin/payouts',{...preparation,note:'Changed evidence for the same request'}))).status,409);
    globalThis.payoutCatalogActor = { id:'sa2', role:'super_admin' };
    const actionRoute = await import('../app/api/admin/payouts/[id]/route');
    const action = {action:'approve',note:'Independent payout evidence verified',
      idempotencyKey:'route-approve',formVersion:1,
      customAnswers:[{fieldId:'context_note',value:'Reviewed fictional payout evidence'}]};
    assert.equal((await actionRoute.POST(request(`/api/admin/payouts/${payout.id}`,{...action,customAnswers:[]}),
      {params:Promise.resolve({id:payout.id})})).status,400);
    const second = await actionRoute.POST(request(`/api/admin/payouts/${payout.id}`,action),
      {params:Promise.resolve({id:payout.id})});
    assert.equal(second.status,200);
    assert.equal((await actionRoute.POST(request(`/api/admin/payouts/${payout.id}`,action),{params:Promise.resolve({id:payout.id})})).status,200);
    assert.equal((await actionRoute.POST(request(`/api/admin/payouts/${payout.id}`,{...action,action:'reject'}),{params:Promise.resolve({id:payout.id})})).status,409);
    assert.equal((await actionRoute.POST(new Request(`http://localhost:3000/api/admin/payouts/${payout.id}`,{
      method:'POST',headers:{origin:'http://localhost:3000'},body:'{' }),
      {params:Promise.resolve({id:payout.id})})).status,400);
    assert.equal((await actionRoute.POST(request(`/api/admin/payouts/${payout.id}`,{
      ...action,customAnswers:[{fieldId:'context_note',value:'x'.repeat(262_145)}],
    }),{params:Promise.resolve({id:payout.id})})).status,413);
    assert.equal((sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(payout.id) as {status:string}).status,'approved');
    assert.equal(count(sqlite,'form_answer_sets'),2);
    assert.equal(count(sqlite,'payout_events'),2);
    for (const [formId,kind] of [['staff.payout-1','payout-preparation'],['staff.payout-2','payout-action']] as const) {
      const row=sqlite.prepare('SELECT id FROM form_answer_sets WHERE form_id=?').get(formId) as {id:string};
      const answer=await getFormAnswerById(db,row.id);assert.ok(answer);
      assert.equal(await authorizeFormAnswerRead(db,{id:'sa2',role:'super_admin'},answer),true,formId);
      assert.equal(await authorizeFormAnswerRead(db,{id:'admin1',role:'admin'},answer),formId==='staff.payout-1');
      assert.equal(await authorizeFormAnswerRead(db,{id:'seller-user',role:'seller'},answer),false);
      assert.equal(await authorizeFormAnswerRead(db,{id:'sa2',role:'super_admin'},{...answer,actorId:'seller-user'}),false);
      assert.equal(await authorizeFormAnswerRead(db,{id:'sa2',role:'super_admin'},{...answer,requestId:'foreign-request'}),false);
      assert.equal((await listStaffFormHistory(db,{id:'sa2',role:'super_admin'},kind,{subjectId:payout.id})).items.length,1);
      sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?, ?,2,2,'published',?,'Archive','sa1',2,'sa1',2,'sa1',2,?)`).run(`${formId}-v2`,formId,
          JSON.stringify({formId,fields:[{id:'context_note',key:'context_note',label:'Review context',type:'short_text',required:true,order:0,status:'archived'}]}),`${formId}-archive`);
      assert.ok(await readStaffFormHistoryAnswer(db,{id:'sa2',role:'super_admin'},kind,payout.id,row.id));
    }
    globalThis.payoutCatalogActor = { id:'admin1', role:'admin' };
    assert.equal((await prepareRoute.POST(request('/api/admin/payouts',preparation))).status,200,'old exact preparation after archive');
    globalThis.payoutCatalogActor = { id:'sa2', role:'super_admin' };
    assert.equal((await actionRoute.POST(request(`/api/admin/payouts/${payout.id}`,action),{params:Promise.resolve({id:payout.id})})).status,200,'old exact action after archive');
    assert.equal((await collectFormAnswersForPrivacy(db,'seller-user')).some(answer=>answer.formId.startsWith('staff.')),false,'seller privacy export excludes internal payout context');
    sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin1','[]',1,'sa1',1)").run();
    const preparationAnswer=await getFormAnswerById(db,(sqlite.prepare("SELECT id FROM form_answer_sets WHERE form_id='staff.payout-1'").get() as {id:string}).id);assert.ok(preparationAnswer);
    assert.equal(await authorizeFormAnswerRead(db,{id:'admin1',role:'admin'},preparationAnswer),false,'revoked preparation grant');
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='sa2'");
    assert.equal((await listStaffFormHistory(db,{id:'sa2',role:'super_admin'},'payout-action')).items.length,0);
  } finally { sqlite.close(); globalThis.payoutCatalogActor=null; }
});

void test('both payout routes reject invalid UTF-8 and classify transaction-time publication changes without new effects', async () => {
  for (const formId of ['staff.payout-1','staff.payout-2'] as const) {
    for (const mode of ['utf8','publication'] as const) {
      const {sqlite,db,database}=fixture();
      globalThis.payoutCatalogDb=db;
      try {
        sqlite.exec('UPDATE seller_ledger_entries SET available_at=0');
        let payoutId='';
        if(formId==='staff.payout-2')payoutId=(await prepareSellerPayout(db,{sellerId:'seller-one',actorId:'admin1',actorRole:'admin',note:'Fictional eligible balance review',requestId:'prerequisite-preparation',now})).id;
        globalThis.payoutCatalogActor={id:formId==='staff.payout-1'?'sa1':'sa2',role:'super_admin'};
        const payload=formId==='staff.payout-1'
          ? {sellerId:'seller-one',note:'Fictional eligible balance review',idempotencyKey:'bounded-preparation',formVersion:1,customAnswers:[{fieldId:'context_note',value:'INVALID_BYTE'}]}
          : {action:'approve',note:'Independent fictional balance review',idempotencyKey:'bounded-action',formVersion:1,customAnswers:[{fieldId:'context_note',value:'INVALID_BYTE'}]};
        const path=formId==='staff.payout-1'?'/api/admin/payouts':`/api/admin/payouts/${payoutId}`;
        const encoded=JSON.stringify(payload);
        const [prefix,suffix]=encoded.split('INVALID_BYTE');
        const body=mode==='utf8'?Buffer.concat([Buffer.from(prefix),Buffer.from([0xc0]),Buffer.from(suffix)]):encoded;
        if(mode==='publication')database.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
          SELECT ?||'-v2',form_id,2,2,'published',config_json,'New publication','sa1',2,'sa1',2,'sa1',2,?||'-pub-v2' FROM form_config_versions WHERE id=?||'-v1'`).run(formId,formId,formId);
        const request=new Request(`http://localhost:3000${path}`,{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body});
        const before=Object.fromEntries(['form_answer_sets','payouts','payout_events','payout_entries','seller_ledger_entries','audit_logs'].map(table=>[table,count(sqlite,table)]));
        const response=formId==='staff.payout-1'?(await import('../app/api/admin/payouts/route')).POST(request)
          :(await import('../app/api/admin/payouts/[id]/route')).POST(request,{params:Promise.resolve({id:payoutId})});
        const result=await response;
        assert.equal(result.status,mode==='utf8'?400:409,`${formId}:${mode}`);
        if(mode==='publication')assert.equal((await result.json() as {code:string}).code,'stale_version');
        for(const [table,n] of Object.entries(before))assert.equal(count(sqlite,table),n,`${formId}:${mode}:${table}`);
      }finally{sqlite.close();globalThis.payoutCatalogActor=null;}
    }
  }
});

void test('both payout receivers accept published large context and preserve bounded financial input', async () => {
  for (const formId of ['staff.payout-1','staff.payout-2'] as const) {
    const {sqlite,db}=fixture();
    globalThis.payoutCatalogDb=db;
    globalThis.payoutCatalogActor={id:formId==='staff.payout-1'?'sa1':'sa2',role:'super_admin'};
    try {
      sqlite.exec('UPDATE seller_ledger_entries SET available_at=0');
      let payoutId='';
      if(formId==='staff.payout-2')payoutId=(await prepareSellerPayout(db,{sellerId:'seller-one',actorId:'admin1',actorRole:'admin',note:'Fictional eligible balance review',requestId:'large-prerequisite',now})).id;
      const fields=Array.from({length:5},(_,order)=>({id:`context_note_${order}`,key:`context_note_${order}`,label:`Review context ${order}`,type:'long_text',required:true,order,status:'active'}));
      const config=validateFormDraft(formId,{formId,fields});
      sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?||'-v2',form_id,2,2,'published',?,'Large context fixture','sa1',2,'sa1',2,'sa1',2,?||'-large-publication' FROM form_config_versions WHERE id=?||'-v1'`).run(formId,JSON.stringify(config),formId,formId);
      const path=formId==='staff.payout-1'?'/api/admin/payouts':`/api/admin/payouts/${payoutId}`;
      const payload={...(formId==='staff.payout-1'?{sellerId:'seller-one'}:{action:'approve'}),note:'Reviewed fictional financial context',idempotencyKey:`large-${formId}`,formVersion:2,customAnswers:fields.map((field)=>({fieldId:field.id,value:'x'.repeat(4000)}))};
      assert.ok(Buffer.byteLength(JSON.stringify(payload))>16384);
      const receive=async(body:string,declared?:string)=>{
        const request=new Request(`http://localhost:3000${path}`,{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',...(declared?{'content-length':declared}:{})},body});
        return formId==='staff.payout-1'?(await import('../app/api/admin/payouts/route')).POST(request):(await import('../app/api/admin/payouts/[id]/route')).POST(request,{params:Promise.resolve({id:payoutId})});
      };
      const beforeEvents=count(sqlite,'payout_events');const beforeAudit=count(sqlite,'audit_logs');
      assert.equal((await receive(' ','262145')).status,413,`${formId}: declared overflow`);
      assert.equal((await receive(' '.repeat(262145))).status,413,`${formId}: streamed overflow`);
      assert.equal((await receive('{')).status,400,`${formId}: malformed JSON`);
      assert.equal(count(sqlite,'payout_events'),beforeEvents);assert.equal(count(sqlite,'audit_logs'),beforeAudit);assert.equal(count(sqlite,'form_answer_sets'),0);
      assert.equal((await receive(JSON.stringify(payload))).status,formId==='staff.payout-1'?201:200,`${formId}: published large context accepted`);
      assert.ok((await receive(JSON.stringify(payload))).ok,`${formId}: exact replay`);
      const answerId=String(sqlite.prepare('SELECT id FROM form_answer_sets WHERE form_id=?').get(formId)?.id);
      const answer=await getFormAnswerById(db,answerId);assert.ok(answer);
      assert.equal(answer.answers.answers.length,5);assert.ok(Buffer.byteLength(JSON.stringify(answer.answers))<131072);
      assert.equal(count(sqlite,'form_answer_sets'),1);assert.equal(count(sqlite,'payout_events'),beforeEvents+1);
    }finally{sqlite.close();globalThis.payoutCatalogActor=null;}
  }
});

void test('direct SuperAdmin seller preparation approves while Admin preparation awaits decision', async () => {
  for (const actorRole of ['super_admin','admin'] as const) for (const configured of [false,true]) {
    const {sqlite,db}=fixture();
    try {
      const actorId=actorRole==='super_admin'?'sa1':'admin1',requestId=`direct-${actorRole}-${configured}`;
      const options={sellerId:'seller-one',actorId,actorRole,note:'Verified eligible balance and destination',requestId,now,
        ...(configured?{form:form('staff.payout-1',requestId)}:{})};
      const payout=await prepareSellerPayout(db,options);
      const status=actorRole==='super_admin'?'approved':'prepared';
      assert.deepEqual({...sqlite.prepare('SELECT status,approved_by AS approvedBy,approved_at AS approvedAt,processed_at AS processedAt,paid_at AS paidAt,provider_reference AS reference FROM payouts WHERE id=?').get(payout.id) as object},
        {status,approvedBy:actorRole==='super_admin'?actorId:null,approvedAt:actorRole==='super_admin'?now:null,processedAt:null,paidAt:null,reference:null});
      assert.equal((sqlite.prepare('SELECT to_status AS status FROM payout_events WHERE payout_id=?').get(payout.id) as {status:string}).status,status);
      assert.equal(JSON.parse((sqlite.prepare('SELECT next_json AS next FROM audit_logs WHERE request_id=?').get(requestId) as {next:string}).next).status,status);
      const pendingNotices=sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE required_permission='payout.approve' OR subject_en LIKE '%Super Admin approval%'").get() as {n:number};
      assert.equal(pendingNotices.n===0,actorRole==='super_admin');
      assert.deepEqual(await prepareSellerPayout(db,options),{id:payout.id,duplicate:true});
      sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(actorId);
      await assert.rejects(prepareSellerPayout(db,options),/permission/i);
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE type='payout'").get() as {n:number}).n,0);
    } finally {sqlite.close();}
  }
});

void test('direct managed preparation uses current authority and keeps payment recording explicit', async () => {
  for (const actorRole of ['super_admin','admin'] as const) {
    const f=await earnedMaker();
    const {sqlite,db}=f;
    try {
      const actorId=actorRole==='super_admin'?'sa1':'admin1';
      sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',1,1)").run(actorId, `${actorId}@local.hastabazaar.test`, actorId);
      sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,1)').run(actorId,actorRole);
      const input={...f.context,actorId,requestId:`managed-direct-${actorRole}`,now,scheduledFor:now+1000};
      const id=await prepareManagedPayout(db,input);
      assert.deepEqual({...sqlite.prepare('SELECT status,approved_by AS approver,paid_at AS paidAt,provider_reference AS reference FROM managed_payouts WHERE id=?').get(id) as object},
        {status:actorRole==='super_admin'?'approved':'prepared',approver:actorRole==='super_admin'?actorId:null,paidAt:null,reference:null});
      assert.equal(await prepareManagedPayout(db,input),id);
      sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(actorId);
      await assert.rejects(prepareManagedPayout(db,input),/permission/i);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payout_allocations').get() as {n:number}).n,1);
    } finally {sqlite.close();}
  }
});

void test('direct seller preparation rolls back approval attribution and answers on current-authority races',async()=>{
  for(const configured of [false,true])for(const race of ['role','status'] as const){
    const {sqlite,database,db}=fixture();try{
      const prior=Object.fromEntries(['payouts','payout_entries','payout_events','audit_logs','form_answer_sets','notification_messages'].map(table=>[table,count(sqlite,table)]));
      const requestId=`authority-${configured}-${race}`;
      database.beforeBatch=()=>sqlite.exec(race==='role'?"DELETE FROM user_roles WHERE user_id='sa1'":"UPDATE users SET status='suspended' WHERE id='sa1'");
      const batchCalls=database.batchCalls;
      await assert.rejects(prepareSellerPayout(db,{sellerId:'seller-one',actorId:'sa1',actorRole:'super_admin',note:'Verified eligible balance and destination',requestId,now,...(configured?{form:form('staff.payout-1',requestId)}:{})}));
      assert.equal(database.batchCalls,batchCalls+1,'current authority race reaches actual batch');
      for(const [table,n] of Object.entries(prior))assert.equal(count(sqlite,table),n,table);
    }finally{sqlite.close();}
  }
});
