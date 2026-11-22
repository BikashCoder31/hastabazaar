import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { performGovernanceAction } from '../lib/db/repositories/operations';
import { getStaffPermissionProfile, proposeStaffPermissions, decideStaffPermissions } from '../lib/db/repositories/staff-permissions';
import { listStaffFormHistory } from '../lib/forms/staff-history';
import {can} from '../lib/marketplace/permissions';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter(name => /^\d{4}_.+\.sql$/.test(name)).sort())
    for (const sql of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (sql.trim()) sqlite.exec(sql);
  for (const [id, role] of [['super', 'super_admin'], ['admin', 'admin'], ['other', 'admin']]) {
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',1,1)")
      .run(id, `${id}@example.test`, id);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  for (const formId of ['staff.staff-permission-1', 'staff.staff-permission-2', 'staff.governance-promotion-create'])
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,
      updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,1,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}`);
  let beforeBatch: (() => void) | undefined;
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
      const hook = beforeBatch; beforeBatch = undefined; hook?.();
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return { db, sqlite, race(hook: () => void) { beforeBatch = hook; } };
}
const permission = { actorId: 'super', userId: 'admin', permissions: ['order.manage'], version: 0,
  reason: 'Restrict operational access', presetName: 'Order desk', now: 100 };
const promotion = { actorId: 'super', actorRole: 'super_admin' as const, action: 'promotion.create',
  requestId: 'placement-one', now: 100, data: { nameEn: 'Scheduled placement', note: 'Reviewed placement details',
    placement: 'homepage', startsAt: 100, endsAt: 200, productIds: [] } };
const form = (formId: 'staff.staff-permission-1' | 'staff.staff-permission-2' | 'staff.governance-promotion-create', requestId: string) => ({
  requestId, versionId: `${formId}-v1`, answers: { formId, version: 1, answers: [] },
});

for(const permissions of [[],['order.manage']])void test('first explicit '+(permissions.length?'scoped':'empty')+' profile retains one personal notice and current recipient role fences',async()=>{
 const f=fixture();try{
  assert.equal(can({role:'admin',permissions:[]},'account.self.manage'),true);
  assert.equal(can({role:'admin',permissions:[]},'order.manage'),false);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('other','super_admin',1)").run();
  f.race(()=>{f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='other' AND role='super_admin'").run();});
  const input={...permission,permissions,requestId:'first-profile',form:form('staff.staff-permission-1','first-profile')};
  await proposeStaffPermissions(f.db,input);
  const event=f.sqlite.prepare("SELECT id FROM team_governance_events WHERE action='access_changed' AND source_id='admin'").get();assert.ok(event);
  const rows=f.sqlite.prepare('SELECT recipient_user_id,channel,template_key,related_type,related_id,request_id,audience_role FROM notification_messages WHERE related_id=?').all(event.id);
  assert.equal(rows.length,4);assert.deepEqual(new Set(rows.map(row=>row.recipient_user_id)),new Set(['super','admin']));
  assert.equal(rows.filter(row=>row.recipient_user_id==='admin').length,2);assert.ok(rows.every(row=>row.template_key==='business.team.governance'));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.permissions.changed'").get()!.n,0);
  await proposeStaffPermissions(f.db,input);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages WHERE related_id=?').get(event.id)!.n,4);
  const notice=rows.find(row=>row.recipient_user_id==='admin');assert.ok(notice);
  const current=(await import('../lib/operations/team-notice-sources')).isCurrentTeamNotice;
  const projected={userId:String(notice.recipient_user_id),channel:String(notice.channel),template:String(notice.template_key),relatedId:String(notice.related_id),requestId:String(notice.request_id),audience:String(notice.audience_role),relatedType:String(notice.related_type)};
  assert.equal(await current(f.db,projected,100),true);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='admin' AND role='admin'").run();assert.equal(await current(f.db,projected,100),false);
 }finally{f.sqlite.close();}
});

void test('Super Admin saves effective permissions, audited receipt and one target notification in one operation', async () => {
  const f = fixture();
  try {
    const id = await proposeStaffPermissions(f.db, { ...permission, requestId: 'permission-one', form: form('staff.staff-permission-1', 'permission-one') });
    assert.deepEqual((await getStaffPermissionProfile(f.db, 'admin')).permissions, ['order.manage']);
    assert.equal((await getStaffPermissionProfile(f.db, 'admin')).version, 1);
    const request = f.sqlite.prepare('SELECT status,proposed_by,decided_by,decided_at FROM staff_permission_requests WHERE id=?').get(id);
    assert.deepEqual({ ...request }, { status: 'approved', proposed_by: 'super', decided_by: 'super', decided_at: 100 });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM staff_permission_presets').get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='staff.permissions.applied'").get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE request_id='permission-one'").get()?.n, 1);
    assert.equal((await listStaffFormHistory(f.db, { id: 'super', role: 'super_admin' }, 'staff-permission-proposal', { subjectId: id })).items.length, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.permissions.proposed'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.permissions.changed'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.team.governance' AND recipient_user_id='admin' AND channel='in_app'").get()?.n, 1);
    await proposeStaffPermissions(f.db, { ...permission, requestId: id, form: form('staff.staff-permission-1', id), now: 200 });
    assert.equal((await getStaffPermissionProfile(f.db, 'admin')).version, 1);
    await assert.rejects(() => proposeStaffPermissions(f.db, { ...permission, permissions: [], requestId: id, form: form('staff.staff-permission-1', id) }));
    await assert.rejects(() => decideStaffPermissions(f.db, { actorId: 'super', requestId: id, decision: 'approve', reason: 'No second approval needed', now: 200 }));
  } finally { f.sqlite.close(); }
});

void test('direct permission saves roll back on current authority, target role, version or form races', async () => {
  for (const race of [
    (s: DatabaseSync) => s.exec("UPDATE users SET status='disabled' WHERE id='super'"),
    (s: DatabaseSync) => s.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('admin','super_admin',2)"),
    (s: DatabaseSync) => s.exec("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',1,'super',2)"),
    (s: DatabaseSync) => s.exec("UPDATE form_config_versions SET status='retired' WHERE id='staff.staff-permission-1-v1'"),
  ]) {
    const f = fixture();
    try {
      f.race(() => race(f.sqlite));
      await assert.rejects(() => proposeStaffPermissions(f.db, { ...permission, requestId: 'permission-race', form: form('staff.staff-permission-1', 'permission-race') }));
      for (const table of ['staff_permission_requests', 'staff_permission_presets', 'form_answer_sets', 'notification_messages'])
        assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0, table);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='staff.permissions.applied'").get()?.n, 0);
    } finally { f.sqlite.close(); }
  }
});

void test('Super Admin creates active placement and Admin creates pending placement with only pending notices', async () => {
  const f = fixture();
  try {
    await performGovernanceAction(f.db, { ...promotion, form: { ...form('staff.governance-promotion-create', promotion.requestId), formId: 'staff.governance-promotion-create' } });
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,approved_by FROM promotions WHERE created_request_id=?').get(promotion.requestId) }, { status: 'active', approved_by: 'super' });
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.promotion.proposed'").get()?.n, 0);
    const audit = JSON.parse(String(f.sqlite.prepare('SELECT next_json FROM audit_logs WHERE request_id=?').get(promotion.requestId)?.next_json));
    assert.equal(audit.status, 'active');
    assert.equal(audit.approvalMode, 'direct');
    await performGovernanceAction(f.db, { ...promotion, actorId: 'admin', actorRole: 'admin', requestId: 'admin-placement' });
    assert.deepEqual({ ...f.sqlite.prepare("SELECT status,approved_by FROM promotions WHERE created_request_id='admin-placement'").get() }, { status: 'pending_approval', approved_by: null });
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.promotion.proposed' AND recipient_user_id='super' AND channel='in_app'").get()?.n, 1);
    await performGovernanceAction(f.db, { ...promotion, action: 'promotion.approve', requestId: 'admin-placement-decision', data: { id: String(f.sqlite.prepare("SELECT id FROM promotions WHERE created_request_id='admin-placement'").get()?.id) } });
  } finally { f.sqlite.close(); }
});

void test('promotion legacy retry checks current authority and rejects changed work', async () => {
  const f = fixture();
  try {
    await performGovernanceAction(f.db, promotion);
    await performGovernanceAction(f.db, { ...promotion, now: 200 });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM promotions').get()?.n, 1);
    await assert.rejects(() => performGovernanceAction(f.db, { ...promotion, data: { ...promotion.data, note: 'Changed placement rationale' } }));
    f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='super'");
    await assert.rejects(() => performGovernanceAction(f.db, promotion));
  } finally { f.sqlite.close(); }
});

void test('promotion creation rolls back active placement, audit and form when Super Admin authority changes', async () => {
  const f = fixture();
  try {
    f.race(() => f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='super'"));
    await assert.rejects(() => performGovernanceAction(f.db, { ...promotion, form: { ...form('staff.governance-promotion-create', promotion.requestId), formId: 'staff.governance-promotion-create' } }));
    for (const table of ['promotions', 'form_answer_sets', 'notification_messages'])
      assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0, table);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='promotion.create'").get()?.n, 0);
  } finally { f.sqlite.close(); }
});

void test('existing pending staff permission requests remain decidable by Super Admin', async () => {
  for (const decision of ['approve', 'reject'] as const) {
    const f = fixture();
    try {
      f.sqlite.exec("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',0,'super',1)");
      f.sqlite.exec("INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at) VALUES ('existing','admin','[\"order.manage\"]',0,'Existing pending work','super',1)");
      await decideStaffPermissions(f.db, { actorId: 'super', requestId: 'existing', decision, reason: 'Review existing pending work', now: 100 });
      assert.equal(f.sqlite.prepare("SELECT status FROM staff_permission_requests WHERE id='existing'").get()?.status, decision === 'approve' ? 'approved' : 'rejected');
      assert.equal((await getStaffPermissionProfile(f.db, 'admin')).version, decision === 'approve' ? 1 : 0);
    } finally { f.sqlite.close(); }
  }
});
