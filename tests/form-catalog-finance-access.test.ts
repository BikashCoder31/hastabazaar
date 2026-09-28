import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FORM_REGISTRY } from '../lib/forms/registry';
import { createStaffInvitation } from '../lib/db/repositories/staff';
import { proposeStaffPermissions, decideStaffPermissions, getStaffPermissionProfile } from '../lib/db/repositories/staff-permissions';
import { getDeliveryRates, saveDeliveryRates } from '../lib/db/repositories/delivery-rates';
import { validateFormDraft } from '../lib/forms/validation';
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { listStaffFormHistory, readStaffFormHistoryAnswer } from '../lib/forms/staff-history';
import { getFormAnswerById } from '../lib/db/repositories/form-answers';

declare global {
  var financeCatalogDb: D1Database;
  var financeCatalogActor: { id: string; role: 'admin' | 'super_admin' } | null;
  var financeCatalogEmails: number;
  var financeCatalogConfigs: Record<string, unknown>;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.financeCatalogDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.financeCatalogActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.financeCatalogActor}`, shortCircuit: true };
  if (specifier === '@/lib/email/staff-invitation') return { url: 'data:text/javascript,export async function sendStaffInvitationEmail(){globalThis.financeCatalogEmails++}', shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === 'next/link') return { url: `data:text/javascript,import {createElement} from ${JSON.stringify(import.meta.resolve('react'))};export default function Link(props){return createElement("a",props)}`, shortCircuit: true };
  if (specifier === '@/components/forms/form-config-client') return { url: 'data:text/javascript,export function usePublishedFormConfig(id){return {config:globalThis.financeCatalogConfigs[id],canSubmit:true,status:"ready",message:""}}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

void test('always mounted finance and access forms render their configured fields', async () => {
  const ids = ['staff.delivery-rate',
    'staff.referral-settings', 'staff.staff-invitation', 'staff.staff-permission-1',
    'staff.staff-permission-2'];
  globalThis.financeCatalogConfigs = Object.fromEntries(ids.map((formId) => [formId, {
    formId, version: 1, publishedAt: 1, fields: [{ id: 'context_note', key: 'context_note',
      label: 'Review context', type: 'short_text', required: true, order: 0, status: 'active' }],
  }]));
  const delivery = await import('../components/admin/delivery-rate-settings');
  const referral = await import('../components/admin/referral-settings');
  const invite = await import('../components/admin/staff-invitation-manager');
  const permissions = await import('../components/admin/staff-permission-manager');
  const markup = [
    renderToStaticMarkup(createElement(delivery.DeliveryRateSettings, { rates: { version: 'rates-v1', zones: { valley: 15000, terai: 18000, nationwide: 25000 }, districts: {} } })),
    renderToStaticMarkup(createElement(referral.ReferralSettings, { campaign: { enabled: 1, friendDiscountPaisa: 1000, rewardPaisa: 500, minimumSubtotalPaisa: 5000, returnWindowDays: 14 } })),
    renderToStaticMarkup(createElement(invite.StaffInvitationManager, { pendingInvitations: [] })),
    renderToStaticMarkup(createElement(permissions.StaffPermissionManager, {
      actorId: 'sa2', members: [{ userId: 'admin1', permissions: [], version: 0, updatedBy: null, updatedAt: null, displayName: 'Admin', email: 'admin@example.test' }],
      requests: [{ id: 'request', userId: 'admin1', permissionsJson: '[]', expectedVersion: 0, presetName: null,
        reason: 'Current proposal', proposedBy: 'sa1', proposedAt: 1, status: 'pending', decidedBy: null, decisionNote: null }], presets: [],
    })),
  ];
  for (const id of ids) {
    const html = markup.find((part) => part.includes(`data-form-id="${id}"`));
    assert.ok(html, `${id} must identify its live form`);
    assert.match(html, /name="custom\.context_note"/);
    assert.match(html, /name="formVersion" value="1"/);
  }
});

void test('finance and access forms lock money, identity and permission controls', () => {
  for (const id of [
    'staff.delivery-rate', 'staff.payout-1', 'staff.payout-2',
    'staff.referral-settings', 'staff.staff-invitation',
    'staff.staff-permission-1', 'staff.staff-permission-2',
  ] as const) {
    const definition = FORM_REGISTRY[id];
    assert.equal(definition.adapterId, id);
    assert.equal(definition.capabilities.answerBehavior, 'record');
    assert.ok(definition.baseFields.length > 1, `${id} must classify its domain controls`);
    assert.ok(definition.baseFields.every((field) => field.capability === 'protected'));
  }
});

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly sql: ReturnType<DatabaseSync['prepare']>, readonly source: string) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  get bindings() { return this.values; }
  async first<T>() { return (this.sql.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.sql.all(...this.values) as T[] }; }
  async run() { return { meta: { changes: Number(this.sql.run(...this.values).changes) } }; }
}
class Database {
  beforeBatch?: (statements: readonly Statement[]) => void;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql), sql); }
  async batch(statements: readonly Statement[]) {
    this.beforeBatch?.(statements); this.beforeBatch = undefined;
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

const financeKeys = {
  'staff.delivery-rate': ['rates', 'valley', 'terai', 'nationwide', 'districts', 'expectedVersion', 'reason', 'requestId'],
  'staff.payout-1': ['sellerId', 'note', 'amount', 'amountPaisa', 'destinationReference', 'idempotencyKey'],
  'staff.payout-2': ['payoutId', 'action', 'note', 'providerReference', 'amountPaisa', 'idempotencyKey'],
  'staff.referral-settings': ['enabled', 'discount', 'reward', 'minimum', 'days', 'friendDiscountPaisa', 'rewardPaisa', 'minimumSubtotalPaisa', 'returnWindowDays', 'reason', 'requestId'],
  'staff.staff-invitation': ['email', 'role', 'requestId'],
  'staff.staff-permission-1': ['action', 'userId', 'permissions', 'version', 'reason', 'presetName', 'requestId'],
  'staff.staff-permission-2': ['action', 'requestId', 'formRequestId', 'reason'],
} as const;
void test('all seven finance adapters protect every actual domain key and snake aliases against custom overrides', () => {
  for (const [id, keys] of Object.entries(financeKeys)) {
    const formId = id as keyof typeof financeKeys;
    for (const key of [...keys, 'formVersion', 'customAnswers']) {
      assert.ok(FORM_REGISTRY[formId].baseFields.some((field) => field.key === key && field.capability === 'protected'), `${id}:${key}`);
      const alias = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      assert.throws(() => validateFormDraft(formId, { formId, fields: [{
        id: 'custom_override', key: alias, label: 'Safe context', type: 'short_text', required: true, order: 0, status: 'active',
      }] }), `${id}:${alias}`);
    }
  }
});
function fixture(formId: string) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,status TEXT,display_name TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE notification_messages(id TEXT PRIMARY KEY,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,provider_reference TEXT,failure_reason TEXT,request_id TEXT UNIQUE,created_at INTEGER,sent_at INTEGER,read_at INTEGER);
    CREATE TABLE staff_invitations(id TEXT PRIMARY KEY,email TEXT,role TEXT,status TEXT,invited_by TEXT,accepted_by TEXT,expires_at INTEGER,created_at INTEGER,accepted_at INTEGER,revoked_at INTEGER);
    CREATE TABLE operation_transaction_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE delivery_rate_versions(id TEXT PRIMARY KEY,config_json TEXT,created_by TEXT,reason TEXT,created_at INTEGER);
    CREATE TABLE delivery_rate_current(id TEXT PRIMARY KEY,version_id TEXT);
    CREATE TABLE referral_campaign(id TEXT PRIMARY KEY,enabled INTEGER,friend_discount_paisa INTEGER,reward_paisa INTEGER,minimum_subtotal_paisa INTEGER,return_window_days INTEGER,updated_at INTEGER);
    INSERT INTO users VALUES ('sa1','sa1@example.test','active','First Super');
    INSERT INTO users VALUES ('sa2','sa2@example.test','active','Second Super');
    INSERT INTO users VALUES ('admin1','admin1@example.test','active','Admin');
    INSERT INTO user_roles VALUES ('sa1','super_admin'),('sa2','super_admin'),('admin1','admin');`);
  const rates = { zones: { valley: 15000, terai: 18000, nationwide: 25000 }, districts: {} };
  sqlite.prepare("INSERT INTO delivery_rate_versions VALUES ('rates-v1',?,'sa1','Fixture',1)").run(JSON.stringify(rates));
  sqlite.exec("INSERT INTO delivery_rate_current VALUES ('default','rates-v1')");
  sqlite.exec("INSERT INTO referral_campaign VALUES ('default',1,1000,500,5000,14,1)");
  sqlite.exec(readFileSync('drizzle/0031_staff_permissions.sql', 'utf8'));
  const staffUpgrade = readFileSync('drizzle/0062_single_super_admin_approvals.sql', 'utf8')
    .split('-- BEGIN staff_permission_requests')[1]?.split('-- END staff_permission_requests')[0];
  assert.ok(staffUpgrade);
  sqlite.exec(staffUpgrade);
  sqlite.exec(readFileSync('drizzle/0033_business_notifications.sql', 'utf8'));
  for (const statement of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split('--> statement-breakpoint'))
    if (statement.trim()) sqlite.exec(statement);
  publish(sqlite, formId);
  return { sqlite, database: new Database(sqlite) as unknown as D1Database };
}
function publish(sqlite: DatabaseSync, formId: string) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?,1,1,'published',?,'Fixture','sa1',1,'sa1',1,'sa1',1,?)`)
    .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [
      { id: 'context_note', key: 'context_note', type: 'short_text', label: 'Review context', required: true, order: 0, status: 'active' },
    ] }), `seed-${formId}`);
}
function answer(formId: 'staff.staff-invitation' | 'staff.staff-permission-1' | 'staff.staff-permission-2' | 'staff.delivery-rate' | 'staff.referral-settings', requestId: string, value = 'Reviewed HR request') {
  return { requestId, versionId: `${formId}-v1`, answers: {
    formId, version: 1, answers: [{ fieldId: 'context_note', label: 'Review context', type: 'short_text' as const, value }],
  } };
}

void test('invitation records one contextual snapshot with exact actor, role and answer replay', async () => {
  const { sqlite, database } = fixture('staff.staff-invitation');
  try {
    const options = { email: 'new@example.test', role: 'admin' as const, invitedBy: 'sa1', now: 100,
      requestId: 'invite-one', form: answer('staff.staff-invitation', 'invite-one') };
    const first = await createStaffInvitation(database, options);
    assert.equal(first.duplicate, false);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
    assert.deepEqual(await createStaffInvitation(database, options), { ...first, duplicate: true });
    await assert.rejects(createStaffInvitation(database, { ...options, invitedBy: 'sa2' }));
    await assert.rejects(createStaffInvitation(database, { ...options, role: 'super_admin' }));
    await assert.rejects(createStaffInvitation(database, { ...options, form: answer('staff.staff-invitation', 'invite-one', 'Different review') }));
    const stored = sqlite.prepare('SELECT subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId,answers_json AS answers FROM form_answer_sets').get() as Record<string, unknown>;
    assert.equal(stored.subjectType, 'staff_invitation');
    assert.equal(stored.subjectId, first.id);
    assert.equal(stored.actorId, 'sa1');
    assert.match(String(stored.answers), /Review context/);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM staff_invitations').get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});
void test('the sole active Super Admin can invite another Super Admin', async () => {
  const { sqlite, database } = fixture('staff.staff-invitation');
  try {
    sqlite.exec("DELETE FROM user_roles WHERE user_id='sa2'");
    const options = { email: 'additional-super@example.test', role: 'super_admin' as const,
      invitedBy: 'sa1', now: 100, requestId: 'solo-super-invite',
      form: answer('staff.staff-invitation', 'solo-super-invite') };
    const invitation = await createStaffInvitation(database, options);
    assert.deepEqual({ ...sqlite.prepare('SELECT role,status,invited_by AS invitedBy FROM staff_invitations WHERE id=?').get(invitation.id) },
      { role: 'super_admin', status: 'pending', invitedBy: 'sa1' });
    assert.equal((await createStaffInvitation(database, options)).duplicate, true);
    await assert.rejects(createStaffInvitation(database, { ...options, invitedBy: 'admin1', requestId: 'admin-invite',
      form: answer('staff.staff-invitation', 'admin-invite') }), /Super Admin authority/);
  } finally { sqlite.close(); }
});

void test('referral route records contextual evidence once without changing protected amount validation', async () => {
  const { sqlite, database } = fixture('staff.referral-settings');
  globalThis.financeCatalogDb = database;
  globalThis.financeCatalogActor = { id: 'sa1', role: 'super_admin' };
  try {
    const route = await import('../app/api/admin/referrals/route');
    const body = { enabled: true, friendDiscountPaisa: 1200, rewardPaisa: 600,
      minimumSubtotalPaisa: 7000, returnWindowDays: 14, reason: 'Campaign economics review.',
      requestId: 'referral-one', formVersion: 1,
      customAnswers: [{ fieldId: 'context_note', value: 'Reviewed promotion budget' }] };
    const request = (value: unknown) => new Request('http://localhost:3000/api/admin/referrals', {
      method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    assert.equal((await route.PUT(request(body))).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.referral-settings'").get() as { count: number }).count, 1);
    assert.equal((await route.PUT(request(body))).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='referral.offer.updated'").get() as { count: number }).count, 1);
    assert.equal((await route.PUT(request({ ...body, friendDiscountPaisa: 8000, requestId: 'bad-referral' }))).status, 400);
    globalThis.financeCatalogActor = { id: 'admin1', role: 'admin' };
    assert.equal((await route.PUT(request({ ...body, requestId: 'admin-referral' }))).status, 403);
  } finally { sqlite.close(); globalThis.financeCatalogActor = null; }
});

void test('staff invitation route validates configured answers and does not resend on exact retry', async () => {
  const { sqlite, database } = fixture('staff.staff-invitation');
  globalThis.financeCatalogDb = database;
  globalThis.financeCatalogActor = { id: 'sa1', role: 'super_admin' };
  globalThis.financeCatalogEmails = 0;
  try {
    const route = await import('../app/api/admin/staff-invitations/route');
    const body = { email: 'route@example.test', role: 'admin', requestId: 'route-invite-one',
      formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Reviewed HR request' }] };
    const request = (value: unknown) => new Request('http://localhost:3000/api/admin/staff-invitations', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    assert.equal((await route.POST(request(body))).status, 201);
    assert.equal((await route.POST(request(body))).status, 200);
    assert.equal(globalThis.financeCatalogEmails, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
    globalThis.financeCatalogActor = { id: 'admin1', role: 'admin' };
    assert.equal((await route.POST(request({ ...body, requestId: 'admin-attempt' }))).status, 403);
  } finally { sqlite.close(); globalThis.financeCatalogActor = null; }
});

void test('delivery rate change stores custom context atomically and replays only the same versioned request', async () => {
  const { sqlite, database } = fixture('staff.delivery-rate');
  try {
    const original = await getDeliveryRates(database);
    const rates = { zones: { valley: 17000, terai: 18000, nationwide: 25000 }, districts: {} };
    const options = { actorId: 'sa1', expectedVersion: original.version, rates,
      reason: 'Delivery tariff review.', now: 100, requestId: 'rates-one',
      form: answer('staff.delivery-rate', 'rates-one', 'Reviewed carrier quote') };
    await saveDeliveryRates(database, options);
    const changed = await getDeliveryRates(database);
    assert.equal(changed.zones.valley, 17000);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.delivery-rate' AND subject_id=?").get(changed.version) as { count: number }).count, 1);
    await saveDeliveryRates(database, options);
    await assert.rejects(saveDeliveryRates(database, { ...options, actorId: 'sa2' }));
    await assert.rejects(saveDeliveryRates(database, { ...options, rates: { ...rates, zones: { ...rates.zones, valley: 18000 } } }));
    await assert.rejects(saveDeliveryRates(database, { ...options, form: answer('staff.delivery-rate', 'rates-one', 'Changed quote') }));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='delivery.rates.updated'").get() as { count: number }).count, 1);
    assert.equal((await getDeliveryRates(database)).version, changed.version);
  } finally { sqlite.close(); }
});

void test('direct permission save and an existing pending decision each commit one contextual answer with exact replay', async () => {
  const { sqlite, database } = fixture('staff.staff-permission-1');
  publish(sqlite, 'staff.staff-permission-2');
  try {
    const proposal = { actorId: 'sa1', userId: 'admin1', permissions: ['order.manage'],
      version: 0, reason: 'Restrict to order desk.', now: 100, requestId: 'proposal-one',
      form: answer('staff.staff-permission-1', 'proposal-one') };
    const id = await proposeStaffPermissions(database, proposal);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.staff-permission-1'").get() as { count: number }).count, 1);
    assert.equal(await proposeStaffPermissions(database, proposal), id);
    await assert.rejects(proposeStaffPermissions(database, { ...proposal, actorId: 'sa2' }));
    await assert.rejects(proposeStaffPermissions(database, { ...proposal, permissions: ['support.manage'] }));
    await assert.rejects(proposeStaffPermissions(database, { ...proposal, form: answer('staff.staff-permission-1', 'proposal-one', 'Changed review') }));
    assert.equal((await getStaffPermissionProfile(database, 'admin1')).version, 1);
    sqlite.prepare(`INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at)
      VALUES ('legacy-pending','admin1','["order.manage"]',1,'Existing pending work','sa1',1)`).run();
    const decision = { actorId: 'sa2', requestId: 'legacy-pending', decision: 'approve' as const,
      reason: 'Independent review complete.', now: 101, formRequestId: 'decision-one',
      form: answer('staff.staff-permission-2', 'decision-one') };
    await decideStaffPermissions(database, decision);
    assert.deepEqual((await getStaffPermissionProfile(database, 'admin1')).permissions, ['order.manage']);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.staff-permission-2' AND subject_id=?").get('legacy-pending') as { count: number }).count, 1);
    await decideStaffPermissions(database, decision);
    await assert.rejects(decideStaffPermissions(database, { ...decision, actorId: 'sa1' }));
    await assert.rejects(decideStaffPermissions(database, { ...decision, form: answer('staff.staff-permission-2', 'decision-one', 'Changed review') }));
    assert.equal((await getStaffPermissionProfile(database, 'admin1')).version, 2);
  } finally { sqlite.close(); }
});

const routeCases = [
  { id: 'staff.delivery-rate', kind: 'delivery-rate', path: '/api/admin/delivery-rates', method: 'PUT',
    body: { expectedVersion: 'rates-v1', rates: { zones: { valley: 17000, terai: 18000, nationwide: 25000 }, districts: {} }, reason: 'Fictional tariff review', requestId: 'route-rate' } },
  { id: 'staff.referral-settings', kind: 'referral-settings', path: '/api/admin/referrals', method: 'PUT',
    body: { enabled: true, friendDiscountPaisa: 1200, rewardPaisa: 600, minimumSubtotalPaisa: 7000, returnWindowDays: 14, reason: 'Fictional campaign review', requestId: 'route-referral' } },
  { id: 'staff.staff-invitation', kind: 'staff-invitation', path: '/api/admin/staff-invitations', method: 'POST',
    body: { email: 'fictional-invite@example.test', role: 'admin', requestId: 'route-invitation' } },
  { id: 'staff.staff-permission-1', kind: 'staff-permission-proposal', path: '/api/admin/staff-permissions', method: 'POST',
    body: { action: 'propose', userId: 'admin1', permissions: ['order.manage'], version: 0, reason: 'Fictional access review', requestId: 'route-proposal' } },
  { id: 'staff.staff-permission-2', kind: 'staff-permission-decision', path: '/api/admin/staff-permissions', method: 'POST',
    body: { action: 'approve', requestId: 'pending-request', formRequestId: 'route-decision', reason: 'Independent fictional review' } },
] as const;
async function routeFixture(item: typeof routeCases[number]) {
  const result = fixture(item.id);
  globalThis.financeCatalogDb = result.database;
  globalThis.financeCatalogActor = { id: item.id === 'staff.staff-permission-2' ? 'sa2' : 'sa1', role: 'super_admin' };
  globalThis.financeCatalogEmails = 0;
  if (item.id === 'staff.staff-permission-2') {
    result.sqlite.exec(`INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at)
      VALUES ('admin1','[]',0,'sa1',1);
      INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at)
      VALUES ('pending-request','admin1','["order.manage"]',0,'Fictional initial proposal','sa1',1);`);
  }
  const receiverModule = item.id === 'staff.delivery-rate' ? await import('../app/api/admin/delivery-rates/route')
    : item.id === 'staff.referral-settings' ? await import('../app/api/admin/referrals/route')
    : item.id === 'staff.staff-invitation' ? await import('../app/api/admin/staff-invitations/route')
    : await import('../app/api/admin/staff-permissions/route');
  const receive = (request: Request) => item.method === 'PUT'
    ? (receiverModule as { PUT(request: Request): Promise<Response> }).PUT(request)
    : (receiverModule as { POST(request: Request): Promise<Response> }).POST(request);
  const payload = { ...item.body, formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Fictional reviewed context' }] };
  const send = (value: unknown = payload) => receive(new Request(`http://localhost:3000${item.path}`, {
    method: item.method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(value),
  }));
  return { ...result, receive, payload, send, actorId: globalThis.financeCatalogActor.id };
}
function nextPublication(sqlite: DatabaseSync, formId: string, archive = false) {
  const configJson = archive ? JSON.stringify({ formId, fields: [{ id: 'context_note', key: 'context_note', label: 'Review context', type: 'short_text', required: true, order: 0, status: 'archived' }] })
    : String(sqlite.prepare('SELECT config_json AS config FROM form_config_versions WHERE id=?').get(`${formId}-v1`)?.config);
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    SELECT ?||'-v2',form_id,2,2,'published',?,'Changed publication','sa1',2,'sa1',2,'sa1',2,?||'-publish-v2'
    FROM form_config_versions WHERE id=?||'-v1'`).run(formId, configJson, formId, formId);
}

void test('five live finance/access receivers require nonempty context, bound bodies, replay exactly and expose authorized archived history', async () => {
  for (const item of routeCases) {
    const h = await routeFixture(item);
    try {
      assert.equal((await h.send({ ...h.payload, customAnswers: [] })).status, 400, `${item.id}:required`);
      assert.equal((await h.receive(new Request(`http://localhost:3000${item.path}`, { method: item.method, headers: { origin: 'http://localhost:3000' }, body: '{' }))).status, 400, `${item.id}:malformed`);
      assert.equal((await h.send({ ...h.payload, customAnswers: [{ fieldId: 'context_note', value: 'x'.repeat(262145) }] })).status, 413, `${item.id}:bounded`);
      assert.ok((await h.send()).ok, `${item.id}:live required submission`);
      assert.ok((await h.send()).ok, `${item.id}:exact retry`);
      const answerId = (h.sqlite.prepare('SELECT id FROM form_answer_sets WHERE form_id=?').get(item.id) as { id: string }).id;
      const stored = await getFormAnswerById(h.database, answerId); assert.ok(stored);
      assert.equal(stored.actorId, h.actorId); assert.equal(stored.answers.answers[0].value, 'Fictional reviewed context');
      assert.equal((await h.send({ ...h.payload, customAnswers: [{ fieldId: 'context_note', value: 'Changed evidence' }] })).status, 409, `${item.id}:changed retry`);
      const viewer = { id: h.actorId, role: 'super_admin' as const };
      assert.equal(await authorizeFormAnswerRead(h.database, viewer, stored), true, `${item.id}:current staff history`);
      assert.equal(await authorizeFormAnswerRead(h.database, { id: 'admin1', role: 'admin' }, stored), false, `${item.id}:ordinary admin denied`);
      assert.equal(await authorizeFormAnswerRead(h.database, viewer, { ...stored, actorId: h.actorId === 'sa1' ? 'sa2' : 'sa1' }), false, `${item.id}:forged actor`);
      assert.equal(await authorizeFormAnswerRead(h.database, viewer, { ...stored, requestId: 'forged-request' }), false, `${item.id}:forged request`);
      assert.equal(await authorizeFormAnswerRead(h.database, viewer, { ...stored, subjectId: 'foreign-parent' }), false, `${item.id}:foreign parent`);
      assert.equal((await listStaffFormHistory(h.database, viewer, item.kind, { subjectId: stored.subjectId })).items.length, 1);
      nextPublication(h.sqlite, item.id, true);
      assert.ok((await h.send()).ok, `${item.id}:exact old-version replay after archive`);
      assert.ok(await readStaffFormHistoryAnswer(h.database, viewer, item.kind, stored.subjectId, stored.id), `${item.id}:archived context remains readable`);
      h.sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(h.actorId);
      assert.equal(await readStaffFormHistoryAnswer(h.database, viewer, item.kind, stored.subjectId, stored.id), null, `${item.id}:suspended denied`);
      assert.equal((h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get() as { n: number }).n, 1);
      if (item.id === 'staff.staff-invitation') assert.equal(globalThis.financeCatalogEmails, 1);
    } finally { h.sqlite.close(); globalThis.financeCatalogActor = null; }
  }
});

void test('five finance/access receivers accept published large context within the snapshot budget and bound the request envelope', async () => {
  for (const item of routeCases) {
    const h = await routeFixture(item);
    try {
      const fields = Array.from({length:5}, (_,order) => ({id:`context_note_${order}`,key:`context_note_${order}`,label:`Review context ${order}`,type:'long_text',required:true,order,status:'active'}));
      const config = validateFormDraft(item.id, {formId:item.id,fields});
      h.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?||'-v2',form_id,2,2,'published',?,'Large context fixture','sa1',2,'sa1',2,'sa1',2,?||'-large-publication' FROM form_config_versions WHERE id=?||'-v1'`).run(item.id,JSON.stringify(config),item.id,item.id);
      const payload = {...h.payload,formVersion:2,customAnswers:fields.map((field) => ({fieldId:field.id,value:'x'.repeat(4000)}))};
      const bytes = Buffer.byteLength(JSON.stringify(payload));
      assert.ok(bytes > 16384 && bytes < 131072, `${item.id}: legitimate payload exceeds old envelope`);
      const beforeAudit = Number(h.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n);
      const raw = (body:string,declared?:string) => h.receive(new Request(`http://localhost:3000${item.path}`,{method:item.method,headers:{origin:'http://localhost:3000','content-type':'application/json',...(declared?{'content-length':declared}:{})},body}));
      assert.equal((await raw(' ', '262145')).status,413,`${item.id}: advertised envelope overflow`);
      assert.equal((await raw(' '.repeat(262145))).status,413,`${item.id}: streamed envelope overflow`);
      assert.equal((await raw('{')).status,400,`${item.id}: malformed JSON`);
      assert.equal(Number(h.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n),beforeAudit);
      assert.equal(Number(h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n),0);
      assert.equal(globalThis.financeCatalogEmails,0);
      assert.equal((await h.send(payload)).status,item.id==='staff.staff-invitation'||item.id==='staff.staff-permission-1'?201:200,`${item.id}: published large context accepted`);
      assert.ok((await h.send(payload)).ok,`${item.id}: large context exact replay`);
      const answerId = String(h.sqlite.prepare('SELECT id FROM form_answer_sets WHERE form_id=?').get(item.id)?.id);
      const answer = await getFormAnswerById(h.database,answerId); assert.ok(answer);
      assert.equal(answer.answers.answers.length,5);
      assert.ok(Buffer.byteLength(JSON.stringify(answer.answers)) < 131072);
      assert.equal(Number(h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n),1);
      if(item.id==='staff.staff-invitation')assert.equal(globalThis.financeCatalogEmails,1);
    } finally {h.sqlite.close();globalThis.financeCatalogActor=null;}
  }
});

void test('five finance/access receivers report publication races as stale_version with no contextual answer', async () => {
  for (const item of routeCases) {
    const h = await routeFixture(item);
    try {
      (h.database as unknown as Database).beforeBatch = () => nextPublication(h.sqlite, item.id);
      const response = await h.send();
      assert.equal(response.status, 409, item.id);
      assert.equal((await response.json() as { code: string }).code, 'stale_version', item.id);
      assert.equal((h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get() as { n: number }).n, 0);
      if (item.id === 'staff.staff-invitation') assert.equal(globalThis.financeCatalogEmails, 0);
    } finally { h.sqlite.close(); globalThis.financeCatalogActor = null; }
  }
});

void test('five finance/access exact replays recheck current Super Admin authority', async () => {
  for (const item of routeCases) {
    const h = await routeFixture(item);
    try {
      assert.ok((await h.send()).ok, item.id);
      h.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(h.actorId);
      assert.equal((await h.send()).ok, false, `${item.id}:revoked role cannot replay despite stale route actor`);
      assert.equal((h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get() as { n: number }).n, 1);
      if (item.id === 'staff.staff-invitation') assert.equal(globalThis.financeCatalogEmails, 1);
    } finally { h.sqlite.close(); globalThis.financeCatalogActor = null; }
  }
});

void test('finance/access transaction state races cannot commit contextual answers for stale or zero-row work', async () => {
  for (const item of routeCases) {
    const h = await routeFixture(item);
    try {
      const db = h.database as unknown as Database;
      db.beforeBatch = (statements) => {
        if (item.id === 'staff.delivery-rate') h.sqlite.exec("DELETE FROM delivery_rate_current WHERE id='default'");
        if (item.id === 'staff.referral-settings') {
          // A competitor's timestamp can equal the proposed timestamp. That must not prove our UPDATE ran.
          const update = statements.find((statement) => statement.source.startsWith('UPDATE referral_campaign'));
          assert.ok(update);
          h.sqlite.prepare("UPDATE referral_campaign SET updated_at=?,reward_paisa=777 WHERE id='default'").run(update.bindings[5]);
        }
        if (item.id === 'staff.staff-invitation') {
          h.sqlite.exec("INSERT INTO users VALUES ('new-active-staff','fictional-invite@example.test','active','Fictional colleague'); INSERT INTO user_roles VALUES ('new-active-staff','admin')");
        }
        if (item.id === 'staff.staff-permission-1') h.sqlite.exec("DELETE FROM user_roles WHERE user_id='admin1'");
        if (item.id === 'staff.staff-permission-2') h.sqlite.exec("UPDATE staff_permission_requests SET status='rejected' WHERE id='pending-request'");
      };
      assert.equal((await h.send()).ok, false, `${item.id}:stale state fails`);
      assert.equal((h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get() as { n: number }).n, 0, item.id);
      if (item.id === 'staff.staff-invitation') assert.equal(globalThis.financeCatalogEmails, 0);
      if (item.id === 'staff.referral-settings') assert.equal(h.sqlite.prepare("SELECT reward_paisa AS reward FROM referral_campaign WHERE id='default'").get()?.reward, 777);
    } finally { h.sqlite.close(); globalThis.financeCatalogActor = null; }
  }
});

void test('completed payouts and permission decisions keep their form-history entry points after action forms disappear', async () => {
  globalThis.financeCatalogConfigs = {};
  const { PayoutWorkflowActions } = await import('../components/admin/payout-actions');
  const { StaffPermissionManager } = await import('../components/admin/staff-permission-manager');
  const payoutHtml = renderToStaticMarkup(createElement(PayoutWorkflowActions, {payoutId:'paid-payout',status:'paid',canApprove:true,canProcess:true,isPreparer:false}));
  assert.doesNotMatch(payoutHtml,/data-form-id="staff.payout-2"/);
  assert.match(payoutHtml,/kind=payout-action[^"\s]*id=paid-payout/);
  const permissionHtml = renderToStaticMarkup(createElement(StaffPermissionManager, {actorId:'sa2',members:[],presets:[],requests:[{
    id:'decided-request',userId:'admin1',permissionsJson:'[]',expectedVersion:0,presetName:null,reason:'Fictional review',proposedBy:'sa1',proposedAt:1,status:'approved',decidedBy:'sa2',decisionNote:'Independent review',
  }]}));
  assert.doesNotMatch(permissionHtml,/data-form-id="staff.staff-permission-2"/);
  assert.match(permissionHtml,/kind=staff-permission-decision[^"\s]*id=decided-request/);
});
