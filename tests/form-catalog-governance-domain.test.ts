import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';
import { digestFormRequest } from '../lib/forms/submission';

declare global {
  var governanceDomainDb: D1Database;
  var governanceDomainActor: { id: string; role: 'admin' | 'super_admin' } | null;
}

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url:
    'data:text/javascript,export const env={get DB(){return globalThis.governanceDomainDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"http://localhost:3000"}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.governanceDomainActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.governanceDomainActor}`, shortCircuit: true };
  if (specifier === '@/lib/http/request-security') return { url:
    'data:text/javascript,export function isTrustedMutationRequest(){return true}', shortCircuit: true };
  if (specifier.endsWith('/business-notifications')) return { url:
    'data:text/javascript,export async function operationalBusinessNotificationStatements(){return []};export async function caseBusinessNotificationStatements(){return []}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly sql: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.sql.get(...this.values) ?? null) as T | null; }
  async all<T>() { return { results: this.sql.all(...this.values) as T[] }; }
  async run() { const result = this.sql.run(...this.values); return { meta: { changes: Number(result.changes) } }; }
}
class Database {
  beforeBatch?: () => void;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.beforeBatch?.(); this.beforeBatch = undefined;
    this.sqlite.exec('BEGIN');
    try { const result = [];
      for (const statement of statements) result.push(await statement.run());
      this.sqlite.exec('COMMIT'); return result;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const formIds = [
  'staff.governance-rule-create', 'staff.governance-promotion-create',
  'staff.governance-incident-create', 'staff.governance-incident-update',
  'staff.governance-backup-verify',
] as const;
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT);
    CREATE TABLE staff_permission_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,
      subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE prohibited_product_rules(id TEXT PRIMARY KEY,code TEXT UNIQUE,title_en TEXT,title_ne TEXT,
      description_en TEXT,description_ne TEXT,severity TEXT,is_active INTEGER,created_by TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE promotions(id TEXT PRIMARY KEY,name_en TEXT,name_ne TEXT,status TEXT,placement TEXT,
      starts_at INTEGER,ends_at INTEGER,created_by TEXT,approved_by TEXT,note TEXT,created_request_id TEXT UNIQUE,
      operation_request_id TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE promotion_products(promotion_id TEXT,product_id TEXT,sort_order INTEGER);
    CREATE TABLE products(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE operational_incidents(id TEXT PRIMARY KEY,reference_number TEXT,severity TEXT,status TEXT,
      title TEXT,detail TEXT,resolution TEXT,owner_id TEXT,request_id TEXT UNIQUE,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
    CREATE TABLE backup_verifications(id TEXT PRIMARY KEY,scope TEXT,status TEXT,evidence_reference TEXT,
      note TEXT,verified_by TEXT,request_id TEXT UNIQUE,verified_at INTEGER);
    INSERT INTO users VALUES ('admin','active'),('super','active');
    INSERT INTO user_roles VALUES ('admin','admin'),('super','super_admin');
    INSERT INTO operational_incidents VALUES ('existing-incident','INC-OLD','medium','open','Existing incident',
      'Documented operational detail',NULL,'super','seed-incident',1,1,NULL);`);
  for (const statement of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split('--> statement-breakpoint'))
    if (statement.trim()) sqlite.exec(statement);
  // Preserve canonical receipt retention and current answer health columns in
  // this owned :memory: fixture; no canonical/local database is opened.
  for (const statement of readFileSync('drizzle/0081_core_form_receipt_retention.sql', 'utf8').split('--> statement-breakpoint'))
    if (statement.trim()) sqlite.exec(statement);
  for (const statement of readFileSync('drizzle/0151_form_health_records.sql', 'utf8').split('--> statement-breakpoint').slice(0, 4))
    if (statement.trim()) sqlite.exec(statement);
  for (const id of formIds) sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,
      updated_at,published_by,published_at,last_request_id) VALUES (?, ?,1,1,'published',?,
      'Fixture','super',1,'super',1,'super',1,?)`).run(`${id}-v1`, id,
      JSON.stringify({ formId: id, fields: [] }), `seed-${id}`);
  return { sqlite, database: new Database(sqlite) as unknown as D1Database };
}
const cases = [
  { action: 'rule.create', formId: formIds[0], actorId: 'admin', actorRole: 'admin',
    data: { code: 'PROHIBITED', titleEn: 'Prohibited item', descriptionEn: 'A documented prohibited item', severity: 'restricted' },
    table: 'prohibited_product_rules' },
  { action: 'promotion.create', formId: formIds[1], actorId: 'admin', actorRole: 'admin',
    data: { nameEn: 'Seasonal campaign', note: 'Documented campaign', startsAt: 100, endsAt: 200, placement: 'shop' },
    table: 'promotions' },
  { action: 'incident.create', formId: formIds[2], actorId: 'super', actorRole: 'super_admin',
    data: { title: 'Shipping incident', detail: 'A documented incident requiring operational follow-up', severity: 'high' },
    table: 'operational_incidents' },
  { action: 'incident.update', formId: formIds[3], actorId: 'super', actorRole: 'super_admin',
    data: { id: 'existing-incident', status: 'mitigating', resolution: 'Documented mitigation action' },
    table: 'operational_incidents' },
  { action: 'backup.verify', formId: formIds[4], actorId: 'super', actorRole: 'super_admin',
    data: { scope: 'd1', status: 'verified', evidenceReference: 'BACKUP-EVIDENCE', note: 'Verified snapshot evidence' },
    table: 'backup_verifications' },
] as const;

const legacyIncident = (action: string) => action === 'incident.create' || action === 'incident.update';
const activeCases = cases.filter(entry => !legacyIncident(entry.action));

// Explicit pre-existing legacy evidence, not a successful call to the retired
// mutation API. Keep the real published-answer builder and exact audit digest.
async function retainLegacyIncident(database: D1Database, entry: typeof cases[number], requestId: string) {
  const subjectId = entry.action === 'incident.create' ? 'retained-created-incident' : 'existing-incident';
  const answers = { formId: entry.formId, version: 1, answers: [] };
  const versionId = `${entry.formId}-v1`;
  const catalogDigest = await digestFormRequest({ action: entry.action, data: { ...entry.data }, versionId, answers });
  await database.batch([
    entry.action === 'incident.create'
      ? database.prepare(`INSERT INTO operational_incidents
        (id,reference_number,severity,status,title,detail,owner_id,request_id,created_at,updated_at)
        VALUES (?,'INC-RETAINED','high','open','Retained incident','Documented prior incident evidence',?,?,100,100)`)
        .bind(subjectId, entry.actorId, requestId)
      : database.prepare("UPDATE operational_incidents SET status='mitigating',resolution='Retained mitigation',updated_at=100 WHERE id=?").bind(subjectId),
    database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,request_id,created_at)
      VALUES (?, ?, ?, 'operational_incident', ?, ?, ?, 100)`)
      .bind(`retained-${requestId}`, entry.actorId, entry.action, subjectId, JSON.stringify({ catalogDigest }), requestId),
    buildFormAnswerInsert(database, { formId: entry.formId, requestId, versionId,
      subjectType: 'operational_incident', subjectId, actorId: entry.actorId, answers, now: 100 }),
  ]);
}

function publishContext(sqlite: DatabaseSync, formId: string, version: number) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,
      updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,1,'published',?,'Route fixture','super',2,'super',2,'super',2,?)`).run(
    `${formId}-v${version}`,formId,version,
    JSON.stringify({formId,fields:[{id:'review_context',key:'review_context',label:'Review context',
      type:'short_text',required:true,order:0,status:'active'}]}),`route-seed-${formId}-${version}`);
}

void test('three active governance routes require nonempty published answers and commit one contextual result', async () => {
  const { POST } = await import('../app/api/admin/governance/route');
  for (const entry of activeCases) {
    const { sqlite, database } = fixture();
    globalThis.governanceDomainDb = database;
    globalThis.governanceDomainActor = { id: entry.actorId, role: entry.actorRole };
    try {
      publishContext(sqlite,entry.formId,2);
      const requestId = `route-${entry.action.replace('.', '-')}`;
      const body = {action:entry.action,requestId,data:{...entry.data},formVersion:2,
        customAnswers:[{fieldId:'review_context',value:'Documented governance evidence'}]};
      const post = (value:unknown) => POST(new Request('http://localhost:3000/api/admin/governance',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(value)}));
      assert.equal((await post({...body,customAnswers:[]})).status,400,entry.action);
      assert.equal((await post({...body,customAnswers:[{fieldId:'request_id',value:'forged'}]})).status,400,entry.action);
      const created = await post(body);
      assert.equal(created.status,200,`${entry.action}: ${JSON.stringify(await created.clone().json())}`);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE form_id=? AND request_id=?')
        .get(entry.formId,requestId) as {n:number}).n,1,entry.action);
      assert.equal((await post(body)).status,200,`${entry.action} exact replay`);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE form_id=? AND request_id=?')
        .get(entry.formId,requestId) as {n:number}).n,1);
      assert.equal((await post({...body,data:{...body.data,note:'Changed governance details'}})).status,409);
    } finally { sqlite.close(); }
  }
  globalThis.governanceDomainActor = null;
});

void test('governance route reports commit-time publication races as stale without any action or answer', async () => {
  const { POST } = await import('../app/api/admin/governance/route');
  for (const entry of activeCases) {
    const { sqlite, database } = fixture();
    globalThis.governanceDomainDb = database;
    globalThis.governanceDomainActor = { id: entry.actorId, role: entry.actorRole };
    try {
      publishContext(sqlite,entry.formId,2);
      (database as unknown as Database).beforeBatch = () => publishContext(sqlite,entry.formId,3);
      const requestId = `race-${entry.action.replace('.', '-')}`;
      const response = await POST(new Request('http://localhost:3000/api/admin/governance',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},
        body:JSON.stringify({action:entry.action,requestId,data:{...entry.data},formVersion:2,
          customAnswers:[{fieldId:'review_context',value:'Documented governance evidence'}]}),
      }));
      assert.equal(response.status,409,`${entry.action}: ${JSON.stringify(await response.clone().json())}`);
      assert.equal((await response.json() as {code?:string}).code,'stale_version',entry.action);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE request_id=?')
        .get(requestId) as {n:number}).n,0);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?')
        .get(requestId) as {n:number}).n,0);
      if (entry.action === 'incident.update')
        assert.equal((sqlite.prepare("SELECT status FROM operational_incidents WHERE id='existing-incident'")
          .get() as {status:string}).status,'open');
      else assert.equal((sqlite.prepare(`SELECT COUNT(*) n FROM ${entry.table} WHERE ${
        entry.action === 'rule.create' ? 'code' : entry.action === 'promotion.create' ? 'created_request_id' : 'request_id'}=?`)
        .get(entry.action === 'rule.create' ? 'PROHIBITED' : requestId) as {n:number}).n,0);
    } finally { sqlite.close(); }
  }
  globalThis.governanceDomainActor = null;
});

void test('governance answer history requires a current grant and exact parent audit for all five actions', async () => {
  const { performGovernanceAction } = await import('../lib/db/repositories/operations');
  const { authorizeFormAnswerRead } = await import('../lib/forms/access');
  const { availableStaffHistoryKinds, listStaffFormHistory } = await import('../lib/forms/staff-history');
  const kinds = ['governance-rule-create','governance-promotion-create',
    'governance-incident-create','governance-incident-update','governance-backup-verify'];
  for (const [index,entry] of cases.entries()) {
    const { sqlite, database } = fixture();
    try {
      const requestId = `history-${entry.action}`;
      if (legacyIncident(entry.action)) await retainLegacyIncident(database, entry, requestId);
      else await performGovernanceAction(database,{actorId:entry.actorId,actorRole:entry.actorRole,
        action:entry.action,requestId,data:{...entry.data},now:100,
        form:{formId:entry.formId,requestId,versionId:`${entry.formId}-v1`,
          answers:{formId:entry.formId,version:1,answers:[]}}});
      const answer = sqlite.prepare(`SELECT id,form_id AS formId,subject_type AS subjectType,
        subject_id AS subjectId,actor_id AS actorId,request_id AS requestId
        FROM form_answer_sets WHERE form_id=?`).get(entry.formId) as {
          id:string;formId:string;subjectType:string;subjectId:string;actorId:string;requestId:string};
      const viewer = {id:entry.actorId,role:entry.actorRole};
      assert.ok((await availableStaffHistoryKinds(database,viewer)).some(kind=>kind.kind===kinds[index]),entry.action);
      assert.equal(await authorizeFormAnswerRead(database,viewer,answer),true,entry.action);
      assert.equal((await listStaffFormHistory(database,viewer,kinds[index],{subjectId:answer.subjectId})).items.length,1);
      publishContext(sqlite,entry.formId,2);
      assert.equal((await listStaffFormHistory(database,viewer,kinds[index],{subjectId:answer.subjectId})).items.length,1,
        `${entry.action} older publication retains authorized history`);
      assert.equal(await authorizeFormAnswerRead(database,viewer,{...answer,requestId:'forged'}),false);
      if (entry.actorRole === 'super_admin')
        assert.equal(await authorizeFormAnswerRead(database,{id:'admin',role:'admin'},answer),false);
      else {
        sqlite.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json) VALUES (?,?)')
          .run(entry.actorId,'[]');
        assert.equal(await authorizeFormAnswerRead(database,viewer,answer),false,
          `${entry.action} revoked permission`);
        sqlite.prepare('DELETE FROM staff_permission_profiles WHERE user_id=?').run(entry.actorId);
      }
      sqlite.prepare('DELETE FROM audit_logs WHERE request_id=?').run(requestId);
      assert.equal(await authorizeFormAnswerRead(database,viewer,answer),false,
        `${entry.action} requires its exact audit`);
      sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(entry.actorId);
      assert.equal(await authorizeFormAnswerRead(database,viewer,answer),false);
    } finally { sqlite.close(); }
  }
});

void test('governance no-input decisions reject fake form context and unavailable current grants', async () => {
  const { POST } = await import('../app/api/admin/governance/route');
  const { sqlite, database } = fixture();
  globalThis.governanceDomainDb = database;
  globalThis.governanceDomainActor = {id:'admin',role:'admin'};
  try {
    const post = (body:unknown) => POST(new Request('http://localhost:3000/api/admin/governance',{
      method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},
      body:JSON.stringify(body)}));
    assert.equal((await post({action:'rule.toggle',requestId:'fake-form',data:{id:'missing',isActive:true},
      formVersion:1,customAnswers:[]})).status,400);
    publishContext(sqlite,cases[0].formId,2);
    sqlite.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json) VALUES (?,?)')
      .run('admin','[]');
    assert.equal((await post({action:'rule.create',requestId:'revoked-grant',data:{...cases[0].data},
      formVersion:2,customAnswers:[{fieldId:'review_context',value:'Documented governance evidence'}]})).status,409);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get() as {n:number}).n,0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get() as {n:number}).n,0);
  } finally { sqlite.close(); globalThis.governanceDomainActor=null; }
});

void test('three active governance actions atomically retain answers and reject changed or cross-actor replay', async () => {
  const { performGovernanceAction } = await import('../lib/db/repositories/operations');
  for (const entry of activeCases) {
    const { sqlite, database } = fixture();
    try {
      const options = { actorId: entry.actorId, actorRole: entry.actorRole, action: entry.action,
        requestId: `governance-${entry.action}`, data: { ...entry.data }, now: 100,
        form: { formId: entry.formId, requestId: `governance-${entry.action}`,
          versionId: `${entry.formId}-v1`, answers: { formId: entry.formId, version: 1, answers: [] } } };
      await performGovernanceAction(database, options);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE form_id=?').get(entry.formId) as { n: number }).n, 1, entry.action);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(options.requestId) as { n: number }).n, 1);
      await performGovernanceAction(database, options);
      await assert.rejects(performGovernanceAction(database, { ...options, data: { ...options.data, note: 'Changed action detail' } }));
      await assert.rejects(performGovernanceAction(database, { ...options, actorId: entry.actorId === 'admin' ? 'super' : 'admin' }));
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE form_id=?').get(entry.formId) as { n: number }).n, 1);
    } finally { sqlite.close(); }
  }
});

void test('a failed governance batch rolls back parent, audit, and answer; current authority is required', async () => {
  const { performGovernanceAction } = await import('../lib/db/repositories/operations');
  const { sqlite, database } = fixture();
  try {
    const entry = cases[0];
    const options = { actorId: entry.actorId, actorRole: entry.actorRole, action: entry.action,
      requestId: 'governance-race', data: { ...entry.data }, now: 100,
      form: { formId: entry.formId, requestId: 'governance-race',
        versionId: `${entry.formId}-v1`, answers: { formId: entry.formId, version: 1, answers: [] } } };
    (database as unknown as Database).beforeBatch = () => sqlite.exec("DELETE FROM user_roles WHERE user_id='admin'");
    await assert.rejects(performGovernanceAction(database, options));
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM prohibited_product_rules').get() as { n: number }).n, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get() as { n: number }).n, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get() as { n: number }).n, 0);
  } finally { sqlite.close(); }
});

void test('all three active actions roll back on obsolete or missing answer versions, while exact historical replay remains valid', async () => {
  const { performGovernanceAction } = await import('../lib/db/repositories/operations');
  for (const entry of activeCases) {
    const { sqlite, database } = fixture();
    try {
      const requestId = `version-${entry.action}`;
      const base = { actorId: entry.actorId, actorRole: entry.actorRole, action: entry.action,
        requestId, data: { ...entry.data }, now: 100,
        form: { formId: entry.formId, requestId, versionId: 'missing-version',
          answers: { formId: entry.formId, version: 1, answers: [] } } };
      await assert.rejects(performGovernanceAction(database, base), entry.action);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(requestId) as { n: number }).n, 0);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE request_id=?').get(requestId) as { n: number }).n, 0);
      if (entry.action === 'incident.update')
        assert.equal((sqlite.prepare("SELECT status FROM operational_incidents WHERE id='existing-incident'").get() as { status: string }).status, 'open');
      else assert.equal((sqlite.prepare(`SELECT COUNT(*) n FROM ${entry.table} WHERE ${entry.action === 'incident.create' ? 'request_id' : entry.action === 'promotion.create' ? 'created_request_id' : entry.action === 'backup.verify' ? 'request_id' : 'code'}=?`)
        .get(entry.action === 'rule.create' ? 'PROHIBITED' : requestId) as { n: number }).n, 0);
      const valid = { ...base, form: { ...base.form, versionId: `${entry.formId}-v1` } };
      await performGovernanceAction(database, valid);
      sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,
          updated_at,published_by,published_at,last_request_id)
        SELECT ?,form_id,2,1,'published',config_json,'Later','super',2,'super',2,'super',2,?
        FROM form_config_versions WHERE id=?`).run(`${entry.formId}-v2`, `later-${entry.formId}`, `${entry.formId}-v1`);
      await performGovernanceAction(database, valid);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE request_id=?').get(requestId) as { n: number }).n, 1);
    } finally { sqlite.close(); }
  }
});

void test('retired incident actions direct to System health and cannot mutate or replay retained history', async () => {
  const { POST } = await import('../app/api/admin/governance/route');
  const { performGovernanceAction } = await import('../lib/db/repositories/operations');
  for (const entry of cases.filter(entry => legacyIncident(entry.action))) {
    const { sqlite, database } = fixture();
    globalThis.governanceDomainDb = database;
    globalThis.governanceDomainActor = { id: entry.actorId, role: entry.actorRole };
    try {
      const requestId = `retired-${entry.action.replace('.', '-')}`;
      const options = { actorId: entry.actorId, actorRole: entry.actorRole, action: entry.action,
        requestId, data: { ...entry.data }, now: 200,
        form: { formId: entry.formId, requestId, versionId: `${entry.formId}-v1`,
          answers: { formId: entry.formId, version: 1, answers: [] } } };
      await assert.rejects(performGovernanceAction(database, options), /System health incident workspace/);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get() as { n: number }).n, 0);
      assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get() as { n: number }).n, 0);
      await retainLegacyIncident(database, entry, requestId);
      const original = sqlite.prepare('SELECT * FROM operational_incidents ORDER BY id').all();
      const originalAudit = sqlite.prepare('SELECT * FROM audit_logs').all();
      const originalAnswers = sqlite.prepare('SELECT * FROM form_answer_sets').all();
      for (const attemptedId of [requestId, `${requestId}-new`]) {
        const response = await POST(new Request('http://localhost:3000/api/admin/governance', {
          method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({ action: entry.action, requestId: attemptedId, data: { ...entry.data },
            formVersion: 1, customAnswers: [] }),
        }));
        assert.equal(response.status, 409, entry.action);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        const body = await response.json() as { href: string; error: string };
        assert.match(body.error, /Legacy history is retained/);
        assert.equal(body.href, '/admin/system-health/incidents' +
          (entry.action === 'incident.update' ? '?legacy=existing-incident' : ''));
        await assert.rejects(performGovernanceAction(database, { ...options, requestId: attemptedId,
          form: { ...options.form, requestId: attemptedId } }), /System health incident workspace/);
      }
      assert.deepEqual(sqlite.prepare('SELECT * FROM operational_incidents ORDER BY id').all(), original);
      assert.deepEqual(sqlite.prepare('SELECT * FROM audit_logs').all(), originalAudit);
      assert.deepEqual(sqlite.prepare('SELECT * FROM form_answer_sets').all(), originalAnswers);
    } finally { sqlite.close(); globalThis.governanceDomainActor = null; }
  }
});

void test('governance replay requires current authority and no-input decisions create no answer', async () => {
  const { performGovernanceAction } = await import('../lib/db/repositories/operations');
  const { sqlite, database } = fixture();
  try {
    const entry = cases[0];
    const options = { actorId: entry.actorId, actorRole: entry.actorRole, action: entry.action,
      requestId: 'governance-revoked', data: { ...entry.data }, now: 100,
      form: { formId: entry.formId, requestId: 'governance-revoked',
        versionId: `${entry.formId}-v1`, answers: { formId: entry.formId, version: 1, answers: [] } } };
    await performGovernanceAction(database, options);
    sqlite.exec("DELETE FROM user_roles WHERE user_id='admin'");
    await assert.rejects(performGovernanceAction(database, options));
    await performGovernanceAction(database, { actorId: 'super', actorRole: 'super_admin',
      action: 'rule.toggle', requestId: 'protected-toggle', data: {
        id: (sqlite.prepare("SELECT id FROM prohibited_product_rules WHERE code='PROHIBITED'").get() as { id: string }).id,
        isActive: false }, now: 110 });
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get() as { n: number }).n, 1);
    await assert.rejects(performGovernanceAction(database, { actorId: 'super', actorRole: 'super_admin',
      action: 'rule.toggle', requestId: 'fake-form', data: { id: 'missing', isActive: true }, now: 111,
      form: { ...options.form, requestId: 'fake-form' } }));
    assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='fake-form'").get() as { n: number }).n, 0);
  } finally { sqlite.close(); }
});
