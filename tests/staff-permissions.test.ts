import assert from 'node:assert/strict';
import test from 'node:test';
import {
  can,
  effectivePermissions,
  configurableAdminPermissions,
  validateAdminPermissions,
} from '../lib/marketplace/permissions';
void test('legacy Admin access survives while explicit empty access revokes operational permissions', () => {
  assert.equal(can({ role: 'admin' }, 'order.manage'), true);
  assert.equal(can({ role: 'admin', permissions: [] }, 'order.manage'), false);
  assert.equal(
    can({ role: 'admin', permissions: [] }, 'account.self.manage'),
    true,
  );
  assert.equal(
    can({ role: 'admin', permissions: ['order.manage'] }, 'order.manage'),
    true,
  );
  assert.equal(
    can({ role: 'admin', permissions: ['order.manage'] }, 'support.manage'),
    false,
  );
});
void test('Super Admin-only authority cannot be delegated or removed through Admin overrides', () => {
  assert.equal(
    can(
      { role: 'admin', permissions: ['admin.invite', 'payout.approve'] },
      'admin.invite',
    ),
    false,
  );
  assert.equal(
    can({ role: 'super_admin', permissions: [] }, 'admin.permissions.manage'),
    true,
  );
  assert.throws(() => validateAdminPermissions(['admin.invite']));
  assert.throws(() => validateAdminPermissions(['unknown']));
  assert.throws(() => validateAdminPermissions('order.manage'));
  assert.deepEqual(validateAdminPermissions(['order.manage', 'order.manage']), [
    'order.manage',
  ]);
  assert.ok(effectivePermissions({ role: 'admin' }).includes('payout.prepare'));
  assert.ok(!configurableAdminPermissions.includes('payout.approve'));
});

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  getStaffPermissionProfile,
  hasStaffPermissionBySubject,
  proposeStaffPermissions,
  decideStaffPermissions,
  listStaffPermissionChanges,
} from '../lib/db/repositories/staff-permissions';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);CREATE TABLE audit_logs(id TEXT,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER)',
  );
  sqlite.exec(
    'CREATE TABLE notification_messages(id TEXT PRIMARY KEY,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,provider_reference TEXT,failure_reason TEXT,request_id TEXT UNIQUE,created_at INTEGER,sent_at INTEGER,read_at INTEGER)',
  );
  sqlite.exec(readFileSync('drizzle/0033_business_notifications.sql', 'utf8'));
  const migration = readFileSync('drizzle/0031_staff_permissions.sql', 'utf8');
  sqlite.exec(migration);
  sqlite.exec(migration);
  const approvalMigration = readFileSync('drizzle/0062_single_super_admin_approvals.sql', 'utf8');
  const staffUpgrade = approvalMigration.split('-- BEGIN staff_permission_requests')[1]?.split('-- END staff_permission_requests')[0];
  assert.ok(staffUpgrade, 'The versioned migration must include staff permission requests.');
  sqlite.exec('PRAGMA foreign_keys=OFF;');
  sqlite.exec(staffUpgrade);
  sqlite.exec('PRAGMA foreign_keys=ON;');
  for (const [id, role] of [
    ['sa1', 'super_admin'],
    ['sa2', 'super_admin'],
    ['admin1', 'admin'],
    ['admin2', 'admin'],
    ['customer', 'customer'],
  ]) {
    sqlite.prepare("INSERT INTO users VALUES (?,?,'active')").run(id, id);
    sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run(id, role);
  }
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...v: SQLInputValue[]) {
          values = v;
          return this;
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
const proposal = {
  actorId: 'sa1',
  userId: 'admin1',
  permissions: ['order.manage'],
  version: 0,
  reason: 'Restrict to order operations.',
  presetName: 'Order desk',
  now: 100,
};
void test('proposal preserves legacy access; the same Super Admin approval changes the next lookup and creates reusable snapshot', async () => {
  const { db, sqlite } = fixture();
  try {
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin1', 'support.manage'),
      true,
    );
    const id = await proposeStaffPermissions(db, proposal);
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin1', 'support.manage'),
      true,
    );
    await assert.rejects(() =>
      decideStaffPermissions(db, {
        actorId: 'admin2',
        requestId: id,
        decision: 'approve',
        reason: 'Attempt Admin approval.',
        now: 101,
      }),
    );
    await decideStaffPermissions(db, {
      actorId: 'sa1',
      requestId: id,
      decision: 'approve',
      reason: 'Order desk scope reviewed.',
      now: 102,
    });
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin1', 'support.manage'),
      false,
    );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin1', 'order.manage'),
      true,
    );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin2', 'support.manage'),
      true,
    );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'sa1', 'admin.permissions.manage'),
      true,
    );
    assert.equal((await getStaffPermissionProfile(db, 'admin1')).version, 1);
    const changes = await listStaffPermissionChanges(db);
    assert.equal(changes.presets.length, 1);
    assert.equal(changes.requests[0].status, 'approved');
    assert.equal(changes.requests[0].proposedBy, 'sa1');
    assert.equal(changes.requests[0].decidedBy, 'sa1');
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action NOT LIKE 'staff.authorization.%'",
        )
        .get()?.n,
      2,
    );
    await assert.rejects(() =>
      decideStaffPermissions(db, {
        actorId: 'sa2',
        requestId: id,
        decision: 'approve',
        reason: 'Repeated approval rejected.',
        now: 103,
      }),
    );
  } finally {
    sqlite.close();
  }
});
void test('stale proposal approval rolls back claim, access, preset and audit atomically', async () => {
  const { db, sqlite } = fixture();
  try {
    const first = await proposeStaffPermissions(db, proposal);
    const stale = await proposeStaffPermissions(db, {
      ...proposal,
      permissions: [],
      presetName: 'No operations',
    });
    await decideStaffPermissions(db, {
      actorId: 'sa2',
      requestId: first,
      decision: 'approve',
      reason: 'Approve order-only scope.',
      now: 103,
    });
    await assert.rejects(() =>
      decideStaffPermissions(db, {
        actorId: 'sa2',
        requestId: stale,
        decision: 'approve',
        reason: 'Stale settings cannot apply.',
        now: 104,
      }),
    );
    assert.equal((await getStaffPermissionProfile(db, 'admin1')).version, 1);
    assert.equal(
      (await listStaffPermissionChanges(db)).requests.find(
        (r) => r.id === stale,
      )?.status,
      'pending',
    );
    assert.equal((await listStaffPermissionChanges(db)).presets.length, 1);
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action NOT LIKE 'staff.authorization.%'",
        )
        .get()?.n,
      3,
    );
    await decideStaffPermissions(db, {
      actorId: 'sa2',
      requestId: stale,
      decision: 'reject',
      reason: 'Reject superseded proposal.',
      now: 105,
    });
    assert.equal((await getStaffPermissionProfile(db, 'admin1')).version, 1);
  } finally {
    sqlite.close();
  }
});
void test('no self changes, reserved delegation, non-Admin targets, or suspended proposers; corrupt data fails closed', async () => {
  const { db, sqlite } = fixture();
  try {
    for (const overrides of [
      { actorId: 'admin1' },
      { userId: 'sa1' },
      { userId: 'customer' },
      { permissions: ['payout.approve'] },
      { permissions: ['admin.permissions.manage'] },
    ])
      await assert.rejects(() =>
        proposeStaffPermissions(db, { ...proposal, ...overrides }),
      );
    const id = await proposeStaffPermissions(db, proposal);
    sqlite.prepare("UPDATE users SET status='suspended' WHERE id='sa1'").run();
    await assert.rejects(() =>
      decideStaffPermissions(db, {
        actorId: 'sa2',
        requestId: id,
        decision: 'approve',
        reason: 'Suspended maker cannot apply.',
        now: 104,
      }),
    );
    sqlite
      .prepare(
        "UPDATE staff_permission_profiles SET permissions_json='not-json' WHERE user_id='admin1'",
      )
      .run();
    assert.deepEqual(
      (await getStaffPermissionProfile(db, 'admin1')).permissions,
      [],
    );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin1', 'order.manage'),
      false,
    );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'sa1', 'order.manage'),
      false,
    );
  } finally {
    sqlite.close();
  }
});
void test('approved empty list revokes all operational permissions without altering role or other Admins', async () => {
  const { db, sqlite } = fixture();
  try {
    const id = await proposeStaffPermissions(db, {
      ...proposal,
      permissions: [],
    });
    await decideStaffPermissions(db, {
      actorId: 'sa2',
      requestId: id,
      decision: 'approve',
      reason: 'Remove operational scope.',
      now: 104,
    });
    for (const permission of configurableAdminPermissions)
      assert.equal(
        await hasStaffPermissionBySubject(db, 'admin1', permission),
        false,
      );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin1', 'account.self.manage'),
      true,
    );
    assert.equal(
      await hasStaffPermissionBySubject(db, 'admin2', 'order.manage'),
      true,
    );
    assert.equal(
      sqlite.prepare("SELECT role FROM user_roles WHERE user_id='admin1'").get()
        ?.role,
      'admin',
    );
  } finally {
    sqlite.close();
  }
});
import { recordStaffAuthorizationOutcome } from '../lib/operations/authorization-audit';
void test('denied staff audit records only safe active-staff outcomes and does not fail open if storage fails', async () => {
  const { db, sqlite } = fixture();
  try {
    await recordStaffAuthorizationOutcome(db, {
      actorId: 'admin1',
      permission: 'admin.permissions.manage',
      outcome: 'denied',
      now: 500,
    });
    await recordStaffAuthorizationOutcome(db, {
      actorId: 'customer',
      permission: 'admin.permissions.manage',
      outcome: 'denied',
      now: 500,
    });
    const rows = sqlite
      .prepare(
        "SELECT action,next_json AS payload FROM audit_logs WHERE action='staff.authorization.denied'",
      )
      .all();
    assert.equal(rows.length, 1);
    assert.deepEqual(JSON.parse(String(rows[0].payload)), {
      permission: 'admin.permissions.manage',
      outcome: 'denied',
    });
    sqlite.exec('DROP TABLE audit_logs');
    await assert.doesNotReject(() =>
      recordStaffAuthorizationOutcome(db, {
        actorId: 'admin1',
        permission: 'order.manage',
        outcome: 'denied',
      }),
    );
  } finally {
    sqlite.close();
  }
});
