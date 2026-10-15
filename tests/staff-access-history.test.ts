import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { listStaffAccessHistory } from '../lib/db/repositories/staff-access-history';
import {
  decideStaffPermissions,
  getStaffPermissionProfile,
  proposeStaffPermissions,
} from '../lib/db/repositories/staff-permissions';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort())
    for (const sql of readFileSync(`drizzle/${name}`, 'utf8').split(
      '--> statement-breakpoint',
    ))
      if (sql.trim()) sqlite.exec(sql);
  for (const [id, role, name] of [
    ['super', 'super_admin', 'Sita Owner'],
    ['reviewer', 'super_admin', 'Ram Owner'],
    ['admin', 'admin', 'Maya Staff'],
    ['customer', 'customer', 'Hari Customer'],
  ]) {
    sqlite
      .prepare(
        "INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',1,1)",
      )
      .run(id, `${id}@example.test`, name);
    sqlite
      .prepare(
        'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
      )
      .run(id, role);
  }
  for (const formId of ['staff.staff-permission-1', 'staff.staff-permission-2'])
    sqlite
      .prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,
      updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,1,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`)
      .run(
        `${formId}-v1`,
        formId,
        JSON.stringify({ formId, fields: [] }),
        `seed-${formId}`,
      );
  let beforeRead: (() => void) | undefined;
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...next: SQLInputValue[]) {
          values = next;
          return this;
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          const hook = beforeRead;
          beforeRead = undefined;
          hook?.();
          return { results: statement.all(...values) };
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return {
    db,
    sqlite,
    raceRead(hook: () => void) {
      beforeRead = hook;
    },
  };
}
const form = (
  formId: 'staff.staff-permission-1' | 'staff.staff-permission-2',
  requestId: string,
) => ({
  requestId,
  versionId: `${formId}-v1`,
  answers: { formId, version: 1, answers: [] },
});
const save = {
  actorId: 'super',
  userId: 'admin',
  permissions: ['order.manage'],
  version: 0,
  reason: 'Assign order handling work',
  now: 100,
};

void test('history requires a currently active Super Admin and never changes saved data', async () => {
  const { db, sqlite } = fixture();
  try {
    await proposeStaffPermissions(db, save);
    const before = sqlite
      .prepare('SELECT * FROM staff_permission_profiles')
      .all();
    for (const actor of ['admin', 'customer', 'missing'])
      await assert.rejects(
        () => listStaffAccessHistory(db, actor),
        /Super Admin/,
      );
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='super'");
    await assert.rejects(
      () => listStaffAccessHistory(db, 'super'),
      /Super Admin/,
    );
    sqlite.exec(
      "UPDATE users SET status='active' WHERE id='super'; DELETE FROM user_roles WHERE user_id='super'",
    );
    await assert.rejects(
      () => listStaffAccessHistory(db, 'super'),
      /Super Admin/,
    );
    assert.deepEqual(
      sqlite.prepare('SELECT * FROM staff_permission_profiles').all(),
      before,
    );
    assert.equal((await listStaffAccessHistory(db, 'reviewer')).length, 1);
  } finally {
    sqlite.close();
  }
});

void test('history exposes no rows if Super Admin authority is lost before the audit read', async () => {
  const f = fixture();
  try {
    await proposeStaffPermissions(f.db, save);
    f.raceRead(() =>
      f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='super'"),
    );
    assert.deepEqual(await listStaffAccessHistory(f.db, 'super'), []);
  } finally {
    f.sqlite.close();
  }
});

void test('history reads actual direct-save snapshots and keeps original form references', async () => {
  const { db, sqlite } = fixture();
  try {
    const requestId = await proposeStaffPermissions(db, {
      ...save,
      requestId: 'save-orders',
      form: form('staff.staff-permission-1', 'save-orders'),
    });
    await proposeStaffPermissions(db, {
      ...save,
      permissions: [],
      version: 1,
      now: 200,
    });
    const items = await listStaffAccessHistory(db, 'super');
    assert.equal(items.length, 2);
    const item = items[1];
    assert.equal(item.action, 'staff.permissions.applied');
    assert.equal(item.outcome, 'applied');
    assert.equal(item.staffId, 'admin');
    assert.equal(item.staffName, 'Maya Staff');
    assert.equal(item.actorId, 'super');
    assert.equal(item.actorName, 'Sita Owner');
    assert.equal(item.reason, 'Assign order handling work');
    assert.equal(item.createdAt, 100);
    assert.equal(item.requestId, requestId);
    assert.equal(item.formRequestId, 'save-orders');
    assert.equal(item.formHistoryKind, 'staff-permission-proposal');
    assert.deepEqual(item.afterPermissions, ['order.manage']);
    assert.deepEqual(item.changes?.added, []);
    assert.deepEqual(item.changes?.removed, [
      'seller.application.review',
      'product.review',
      'product.publish',
      'catalog.manage',
      'support.manage',
      'refund.approve.standard',
      'payout.prepare',
      'audit_log.view',
    ]);
    assert.deepEqual(items[0].afterPermissions, []);
    assert.deepEqual(items[0].changes?.removed, ['order.manage']);
  } finally {
    sqlite.close();
  }
});

void test('approved and rejected legacy decisions separate requested rights from applied rights', async () => {
  for (const decision of ['approve', 'reject'] as const) {
    const { db, sqlite } = fixture();
    try {
      sqlite.exec(`INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at)
        VALUES ('admin','["support.manage"]',0,'super',1);
        INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at)
        VALUES ('pending-one','admin','["order.manage"]',0,'Existing pending request','super',1);`);
      const before = await getStaffPermissionProfile(db, 'admin');
      await decideStaffPermissions(db, {
        actorId: 'reviewer',
        requestId: 'pending-one',
        decision,
        reason: 'Review the requested scope',
        now: 200,
        formRequestId: `decision-${decision}`,
        form: form('staff.staff-permission-2', `decision-${decision}`),
      });
      const [item] = await listStaffAccessHistory(db, 'super');
      assert.ok(item);
      assert.equal(
        item.outcome,
        decision === 'approve' ? 'applied' : 'rejected',
      );
      assert.equal(item.actorName, 'Ram Owner');
      assert.equal(item.requestId, 'pending-one');
      assert.equal(item.formRequestId, `decision-${decision}`);
      assert.equal(item.formHistoryKind, 'staff-permission-decision');
      assert.deepEqual(item.beforePermissions, ['support.manage']);
      assert.deepEqual(item.requestedPermissions, ['order.manage']);
      if (decision === 'approve') {
        assert.deepEqual(item.afterPermissions, ['order.manage']);
        assert.deepEqual(item.changes, {
          added: ['order.manage'],
          removed: ['support.manage'],
          unchanged: [],
        });
      } else {
        assert.deepEqual(item.afterPermissions, ['support.manage']);
        assert.deepEqual(item.changes, {
          added: [],
          removed: [],
          unchanged: ['support.manage'],
        });
        assert.deepEqual(await getStaffPermissionProfile(db, 'admin'), before);
      }
    } finally {
      sqlite.close();
    }
  }
});

void test('incomplete or reserved snapshots remain unknown and never become empty access', async () => {
  const { db, sqlite } = fixture();
  try {
    const insert =
      sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,
      previous_json,next_json,request_id,created_at) VALUES (?,'super',?,'staff_permissions','admin','Old record',?,?,?,?)`);
    insert.run(
      'missing-before',
      'staff.permissions.applied',
      null,
      '{"id":"old-one","permissions":["order.manage"]}',
      'old-one',
      100,
    );
    insert.run(
      'reserved-after',
      'staff.permissions.approved',
      '{"permissions":["support.manage"]}',
      '{"requestId":"old-two","permissions":["payout.approve"]}',
      'decision-two',
      200,
    );
    insert.run(
      'bad-rejection',
      'staff.permissions.rejected',
      'not-json',
      '{"requestId":"old-three","permissions":["order.manage"]}',
      'decision-three',
      300,
    );
    const [rejected, reserved, missing] = await listStaffAccessHistory(
      db,
      'super',
    );
    assert.ok(rejected && reserved && missing);
    assert.equal(rejected.outcome, 'rejected');
    assert.equal(rejected.beforePermissions, null);
    assert.equal(rejected.afterPermissions, null);
    assert.equal(rejected.changes, null);
    assert.deepEqual(rejected.requestedPermissions, ['order.manage']);
    assert.equal(reserved.outcome, 'incomplete');
    assert.equal(reserved.afterPermissions, null);
    assert.equal(reserved.changes, null);
    assert.equal(missing.outcome, 'incomplete');
    assert.equal(missing.beforePermissions, null);
    assert.deepEqual(missing.afterPermissions, ['order.manage']);
    assert.equal(missing.changes, null);
  } finally {
    sqlite.close();
  }
});

void test('history is capped at the latest 100 relevant audit entries with stable ordering', async () => {
  const { db, sqlite } = fixture();
  try {
    const insert =
      sqlite.prepare(`INSERT INTO audit_logs(id,action,subject_type,subject_id,previous_json,next_json,created_at)
      VALUES (?,'staff.permissions.applied','staff_permissions','deleted-staff','{"permissions":[]}','{"permissions":[]}',?)`);
    for (let index = 0; index < 105; index++)
      insert.run(`audit-${index.toString().padStart(3, '0')}`, index);
    sqlite.exec(`INSERT INTO audit_logs(id,action,subject_type,created_at)
      VALUES ('other-action','staff.permissions.proposed','staff_permissions',1000),
      ('other-subject','staff.permissions.applied','other',1000)`);
    const items = await listStaffAccessHistory(db, 'super');
    assert.equal(items.length, 100);
    assert.equal(items[0].id, 'audit-104');
    assert.equal(items[99].id, 'audit-005');
    assert.equal(items[0].staffName, null);
    assert.equal(items[0].actorName, null);
    assert.equal(items[0].requestId, null);
    assert.equal(items[0].formRequestId, null);
  } finally {
    sqlite.close();
  }
});
