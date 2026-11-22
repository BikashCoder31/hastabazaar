import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import type { AuthenticatedUser } from '../app/auth';
import {
  decideStaffPermissions,
  proposeStaffPermissions,
  StaffPermissionConflictError,
} from '../lib/db/repositories/staff-permissions';

declare global {
  var staffSecurityDatabase: D1Database;
  var staffSecurityIdentity: AuthenticatedUser | null;
}

// Keep the authorization helper, receiver, repository, and database queries real.
// Only the external identity provider and worker/framework environment are replaced.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export const env={get DB(){return globalThis.staffSecurityDatabase}}',
    shortCircuit: true,
  };
  if (specifier === '@/app/auth') return {
    url: `data:text/javascript,
      export async function getAuthenticatedUser(){return globalThis.staffSecurityIdentity}
      export async function requireAuthenticatedUser(){
        if(!globalThis.staffSecurityIdentity)throw Error('Unexpected page authentication');
        return globalThis.staffSecurityIdentity;
      }`,
    shortCircuit: true,
  };
  if (specifier === 'next/navigation') return {
    url: 'data:text/javascript,export function redirect(){throw Error("Unexpected page redirect")}',
    shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });

const { requireStaffApi, StaffAuthorizationError } = await import('../lib/auth/staff');
const { POST } = await import('../app/api/admin/staff-permissions/route');
const origin = 'https://staff-security.example.test';
const proposal = {
  action: 'propose', userId: 'admin-target', permissions: ['order.manage'], version: 3,
  reason: 'Move to the order desk.', presetName: 'Order desk', requestId: 'save-orders',
  formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Reviewed with the staff member.' }],
};

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter(name => /^\d{4}_.+\.sql$/.test(name)).sort())
    for (const sql of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (sql.trim()) sqlite.exec(sql);
  for (const [id, role, status] of [
    ['super', 'super_admin', 'active'], ['other-super', 'super_admin', 'active'],
    ['admin-actor', 'admin', 'active'], ['admin-target', 'admin', 'active'],
    ['dual-target', 'admin', 'active'], ['inactive', 'super_admin', 'disabled'],
    ['revoked', 'super_admin', 'active'],
  ]) {
    sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at)
      VALUES (?,?,?,?,?,1,1)`).run(id, `identity-${id}`, `${id}@example.test`, id, status);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  sqlite.exec(`INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('dual-target','super_admin',1);
    DELETE FROM user_roles WHERE user_id='revoked';
    INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at)
      VALUES ('admin-target','["support.manage"]',3,'other-super',20);`);
  for (const formId of ['staff.staff-permission-1', 'staff.staff-permission-2']) {
    const config = { formId, fields: [{ id: 'context_note', key: 'context_note', label: 'Review context',
      type: 'short_text', required: true, order: 0, status: 'active' }] };
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
      reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify(config), `seed-${formId}`);
  }
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...next: SQLInputValue[]) { values = next; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
      };
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  globalThis.staffSecurityDatabase = db;
  globalThis.staffSecurityIdentity = null;
  const previousOrigin = process.env.APP_ORIGIN;
  const previousAllowedOrigins = process.env.APP_ALLOWED_ORIGINS;
  process.env.APP_ORIGIN = origin;
  delete process.env.APP_ALLOWED_ORIGINS;
  return {
    sqlite, db,
    identify(id: string | null) {
      globalThis.staffSecurityIdentity = id === null ? null : {
        userId: `identity-${id}`, displayName: id, fullName: id,
        email: `${id}@example.test`, mailboxVerified: true,
      };
    },
    snapshot() {
      const tables = ['staff_permission_profiles', 'staff_permission_requests', 'staff_permission_presets',
        'staff_permission_guards', 'form_answer_sets', 'notification_messages'];
      return {
        ...Object.fromEntries(tables.map(table => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()])),
        receipts: sqlite.prepare("SELECT * FROM audit_logs WHERE action NOT LIKE 'staff.authorization.%' ORDER BY id").all(),
      };
    },
    close() {
      globalThis.staffSecurityIdentity = null;
      if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previousOrigin;
      if (previousAllowedOrigins === undefined) delete process.env.APP_ALLOWED_ORIGINS;
      else process.env.APP_ALLOWED_ORIGINS = previousAllowedOrigins;
      sqlite.close();
    },
  };
}

function send(payload: unknown = proposal, headers: Record<string, string> = {}) {
  return POST(new Request(`${origin}/api/admin/staff-permissions`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  }));
}

void test('real staff authentication rejects anonymous, inactive and revoked identities and accepts an active Super Admin', async () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    for (const [id, status] of [[null, 401], ['inactive', 403], ['revoked', 403]] as const) {
      f.identify(id);
      await assert.rejects(() => requireStaffApi('admin.permissions.manage'),
        (error: unknown) => error instanceof StaffAuthorizationError && error.status === status, String(id));
      assert.equal((await send()).status, status, `${id}: receiver must use real authentication`);
      assert.deepEqual(f.snapshot(), before, `${id}: no domain or receipt changes`);
    }
    f.identify('super');
    const actor = await requireStaffApi('admin.permissions.manage');
    assert.equal(actor.id, 'super');
    assert.equal(actor.role, 'super_admin');
  } finally { f.close(); }
});

void test('an ordinary Admin cannot save another Admin through the receiver or the repository', async () => {
  const f = fixture();
  try {
    f.identify('admin-actor');
    const before = f.snapshot();
    assert.equal((await send()).status, 403);
    assert.deepEqual(f.snapshot(), before);
    // Different actor/target IDs reach the authority guard, not the self-change check.
    await assert.rejects(() => proposeStaffPermissions(f.db, {
      actorId: 'admin-actor', userId: 'admin-target', permissions: ['order.manage'],
      version: 3, reason: proposal.reason, presetName: proposal.presetName, now: 100,
    }), StaffPermissionConflictError);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.close(); }
});

void test('denied actors cannot approve or reject a genuinely pending request for another Admin', async () => {
  const f = fixture();
  try {
    f.sqlite.exec(`INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,
      preset_name,reason,proposed_by,proposed_at)
      VALUES ('pending-other','admin-target','["order.manage"]',3,'Order desk','Existing request','super',50);`);
    const before = f.snapshot();
    for (const actorId of ['admin-actor', 'inactive', 'revoked']) {
      f.identify(actorId);
      for (const decision of ['approve', 'reject'] as const) {
        assert.equal(f.sqlite.prepare("SELECT status FROM staff_permission_requests WHERE id='pending-other'").get()?.status, 'pending');
        assert.equal((await send({ action: decision, requestId: 'pending-other',
          formRequestId: `denied-${actorId}-${decision}`, reason: 'Review existing permissions.',
          formVersion: 1, customAnswers: proposal.customAnswers })).status, 403);
        await assert.rejects(() => decideStaffPermissions(f.db, {
          actorId, requestId: 'pending-other', decision, reason: 'Review existing permissions.', now: 100,
        }), StaffPermissionConflictError);
        assert.deepEqual(f.snapshot(), before, `${actorId}:${decision}`);
      }
    }
  } finally { f.close(); }
});

void test('a Super Admin cannot change a different Super Admin or a target with both staff roles', async () => {
  const f = fixture();
  try {
    f.identify('super');
    const before = f.snapshot();
    for (const userId of ['other-super', 'dual-target']) {
      assert.equal((await send({ ...proposal, userId, version: 0, requestId: `deny-${userId}` })).status, 409);
      assert.deepEqual(f.snapshot(), before, userId);
    }
  } finally { f.close(); }
});

void test('the permission receiver rejects malicious-origin and cross-site valid submissions without mutations', async () => {
  const f = fixture();
  try {
    f.identify('super');
    const before = f.snapshot();
    const untrustedHeaders: Record<string, string>[] = [{ origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }];
    for (const headers of untrustedHeaders) {
      assert.equal((await send(proposal, headers)).status, 403);
      assert.deepEqual(f.snapshot(), before);
    }
  } finally { f.close(); }
});

void test('a real save links the complete receipt and applies changed Admin access on the next request', async () => {
  const f = fixture();
  try {
    f.identify('admin-target');
    assert.equal((await requireStaffApi('support.manage')).id, 'admin-target');
    await assert.rejects(() => requireStaffApi('order.manage'), StaffAuthorizationError);
    f.identify('super');
    const startedAt = Date.now();
    const response = await send();
    assert.equal(response.status, 201);
    assert.equal((await response.json() as { id: string }).id, 'save-orders');
    const receipts = f.sqlite.prepare(`SELECT actor_id,action,subject_type,subject_id,reason,
      previous_json,next_json,request_id,created_at FROM audit_logs WHERE action='staff.permissions.applied'`).all();
    assert.equal(receipts.length, 1);
    const receipt = receipts[0];
    assert.ok(receipt);
    assert.deepEqual({ actor: receipt.actor_id, action: receipt.action, subjectType: receipt.subject_type,
      subject: receipt.subject_id, reason: receipt.reason, request: receipt.request_id }, {
      actor: 'super', action: 'staff.permissions.applied', subjectType: 'staff_permissions',
      subject: 'admin-target', reason: 'Move to the order desk.', request: 'save-orders',
    });
    assert.deepEqual(JSON.parse(String(receipt.previous_json)), {
      userId: 'admin-target', permissions: ['support.manage'], version: 3, updatedBy: 'other-super', updatedAt: 20,
    });
    const nextReceipt=JSON.parse(String(receipt.next_json)) as Record<string,unknown>;
    const {commandProof,...originalReceipt}=nextReceipt;
    assert.deepEqual(originalReceipt, {
      id: 'save-orders', permissions: ['order.manage'], presetName: 'Order desk', version: 4,
      status: 'approved', approvalMode: 'direct',
    });
    assert.ok(commandProof&&typeof commandProof==='object');
    const proof=commandProof as Record<string,unknown>;
    assert.equal(proof.version,1);assert.equal(proof.actorAuthSubject,'identity-super');
    assert.equal(proof.action,'propose');assert.equal(proof.sourceId,'admin-target');assert.equal(proof.requestId,'save-orders');
    assert.equal(typeof proof.inputDigest,'string');assert.match(String(proof.inputDigest),/^[a-f0-9]{64}$/);
    assert.equal(typeof proof.answersDigest,'string');assert.match(String(proof.answersDigest),/^[a-f0-9]{64}$/);
    assert.ok(Number(receipt.created_at) >= startedAt && Number(receipt.created_at) <= Date.now());
    assert.deepEqual({ ...f.sqlite.prepare(`SELECT user_id,permissions_json,version,last_request_id,updated_by,updated_at
      FROM staff_permission_profiles WHERE user_id='admin-target'`).get() }, {
      user_id: 'admin-target', permissions_json: '["order.manage"]', version: 4,
      last_request_id: 'save-orders', updated_by: 'super', updated_at: receipt.created_at,
    });
    assert.deepEqual({ ...f.sqlite.prepare(`SELECT id,user_id,expected_version,proposed_by,decided_by,status,
      proposed_at,decided_at,decision_note FROM staff_permission_requests WHERE id='save-orders'`).get() }, {
      id: 'save-orders', user_id: 'admin-target', expected_version: 3, proposed_by: 'super', decided_by: 'super',
      status: 'approved', proposed_at: receipt.created_at, decided_at: receipt.created_at, decision_note: proposal.reason,
    });
    assert.deepEqual({ ...f.sqlite.prepare(`SELECT id,name,permissions_json,created_by,created_at
      FROM staff_permission_presets WHERE id='save-orders'`).get() }, {
      id: 'save-orders', name: 'Order desk', permissions_json: '["order.manage"]',
      created_by: 'super', created_at: receipt.created_at,
    });
    const answers = f.sqlite.prepare(`SELECT form_id,request_id,config_version_id,subject_type,subject_id,
      actor_id,answers_json,created_at FROM form_answer_sets WHERE request_id='save-orders'`).all();
    assert.equal(answers.length, 1);
    const answer = answers[0];
    assert.ok(answer);
    assert.deepEqual({ form: answer.form_id, request: answer.request_id, version: answer.config_version_id,
      subjectType: answer.subject_type, subject: answer.subject_id, actor: answer.actor_id, at: answer.created_at }, {
      form: 'staff.staff-permission-1', request: 'save-orders', version: 'staff.staff-permission-1-v1',
      subjectType: 'staff_permission_request', subject: 'save-orders', actor: 'super', at: receipt.created_at,
    });
    assert.deepEqual(JSON.parse(String(answer.answers_json)), {
      formId: 'staff.staff-permission-1', version: 1,
      answers: [{ fieldId: 'context_note', label: 'Review context',
        type: 'short_text', value: 'Reviewed with the staff member.' }],
    });
    const notifications = f.sqlite.prepare(`SELECT recipient_user_id,channel,template_key,related_type,related_id,created_at
      FROM notification_messages ORDER BY channel`).all();
    const event=f.sqlite.prepare("SELECT id FROM team_governance_events WHERE action='access_changed' AND source_id='admin-target' AND request_id='save-orders'").get();assert.ok(event);
    const expected=['super','other-super','dual-target','admin-target'].flatMap(recipient=>['email','in_app'].map(channel=>({recipient_user_id:recipient,channel,template_key:'business.team.governance',related_type:'team_governance_event',related_id:event.id,created_at:receipt.created_at})));
    const key=(row:Record<string,unknown>)=>String(row.recipient_user_id)+':'+String(row.channel);
    assert.deepEqual(notifications.map(row=>({...row})).sort((a,b)=>key(a).localeCompare(key(b))),expected.sort((a,b)=>key(a).localeCompare(key(b))));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.permissions.changed'").get()!.n,0);
    const committed = f.snapshot();
    assert.equal((await send()).status, 201);
    assert.deepEqual(f.snapshot(), committed, 'An exact retry must preserve every committed row.');
    f.identify('admin-target');
    await assert.rejects(() => requireStaffApi('support.manage'),
      (error: unknown) => error instanceof StaffAuthorizationError && error.status === 403);
    const updated = await requireStaffApi('order.manage');
    assert.equal(updated.id, 'admin-target');
    assert.deepEqual(updated.permissions, ['order.manage']);
    assert.deepEqual(f.snapshot(), committed, 'Permission reads and denials cannot change the saved access.');
  } finally { f.close(); }
});
