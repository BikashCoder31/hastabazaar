import { incentiveReportDatabase } from './incentive-report-database';
import { createHash } from 'node:crypto';
import { earnedMaker } from './company-store-financial-fixture';

export async function legalProcedureFixture(populated = false) {
  // All migrations run only in this helper's :memory: database, never retained data.
  const f = populated ? await earnedMaker(true, Date.parse('2026-10-01T00:00:00Z')) : await incentiveReportDatabase();
  // Hosted auth tables are installed separately from the commerce migrations.
  // This DDL is restricted to the helper's in-memory connection.
  f.sqlite.exec(`CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL);`);
  for (const [id, role, status] of [['legal-super', 'super_admin', 'active'],
    ['legal-admin', 'admin', 'active'], ['legal-customer', 'customer', 'active'],
    ['legal-disabled', 'super_admin', 'disabled']] as const) {
    f.sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at)
      VALUES (?,?,?,?,?,1,1)`).run(id, id + '-subject', id + '@example.test', id, status);
    f.sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
    const sessionNow=Date.now();
    f.sqlite.prepare(`INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at)
      VALUES (?,?,?,?,?)`)
      .run(createHash('sha256').update('fixture-' + id + '-subject').digest('hex'), id, sessionNow+8*3600000,sessionNow,sessionNow);
  }
  f.sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at)
    VALUES ('retained-event','legal-super','existing.event','order','retained-order','{"accepted":"unchanged"}',1)`).run();
  return {
    ...f,
    actor: { id: 'legal-super', authSubject: 'legal-super-subject', displayName: 'legal-super' },
    fingerprint() {
      return JSON.stringify(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all().filter(row => row.name !== 'audit_logs').map(row => [row.name,
          f.sqlite.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}"`).all()]));
    },
  };
}
