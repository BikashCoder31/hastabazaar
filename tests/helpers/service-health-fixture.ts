import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
export function serviceHealthFixture() {
  const sqlite = new DatabaseSync(':memory:');
  const cursorSchema = readFileSync(
    new URL('../../drizzle/0147_durable_email_delivery.sql', import.meta.url),
    'utf8',
  ).match(/CREATE TABLE operational_reminder_cursors\s*\([\s\S]*?\);/)?.[0];
  if (!cursorSchema)
    throw new Error('Actual operational reminder cursor schema is missing.');
  sqlite.exec(cursorSchema);
  sqlite.exec(
    readFileSync(
      new URL('../../drizzle/0148_email_service_health.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL('../../drizzle/0150_incident_governance.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(` CREATE TABLE transition_notices(id TEXT PRIMARY KEY,transition TEXT,incident_id TEXT);
 CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT);CREATE TABLE staff_permission_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));
 INSERT INTO users VALUES('sa','active'),('admin','active'),('customer','active');INSERT INTO user_roles VALUES('sa','super_admin'),('admin','admin'),('customer','customer');`);
  const db = {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...v: SQLInputValue[]) {
          values = v;
          return this;
        },
        async first() {
          return stmt.get(...values) ?? null;
        },
        async all() {
          return { results: stmt.all(...values) };
        },
        async run() {
          return { meta: { changes: Number(stmt.run(...values).changes) } };
        },
      };
    },
    async batch(statements: {run(): Promise<{meta:{changes:number}}>}[]) {
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
  };
  return { db: db as unknown as D1Database, sqlite };
}
