import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { incentiveReportDatabase } from './incentive-report-database';

/** Real migrated column definitions, copied to a permissive in-memory read fixture.
 * Deliberately omit write guards here so tests can model broken/legacy history.
 * The migrated empty database is also tested directly; no retained path is opened.
 */
export async function accountingFixture(fullSchema = false) {
  const original = await incentiveReportDatabase();
  let sqlite = original.sqlite;
  if (!fullSchema) {
    sqlite = new DatabaseSync(':memory:');
    for (const { name } of original.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[]) {
      const columns = original.sqlite
        .prepare(`PRAGMA table_info("${name}")`)
        .all() as { name: string; type: string }[];
      sqlite.exec(
        `CREATE TABLE "${name}" (${columns.map((c) => `"${c.name}" ${c.type}`).join(',')})`,
      );
    }
    original.dispose();
  }
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      if (
        !/^\s*(SELECT|WITH)\b/i.test(sql) ||
        /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH)\b/i.test(
          sql,
        )
      )
        throw Error('Accounting attempted a write');
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      const prepared = {
        bind(...args: SQLInputValue[]) {
          values = args;
          return prepared;
        },
        async all() {
          return {
            success: true,
            results: statement.all(...values),
            meta: { changes: 0 },
          };
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async run() {
          throw Error('Accounting attempted run');
        },
      };
      return prepared;
    },
    async batch(statements: { all(): Promise<unknown> }[]) {
      return Promise.all(statements.map((s) => s.all()));
    },
  } as unknown as D1Database;
  return {
    db,
    sqlite,
    queries,
    insert(table: string, row: Record<string, SQLInputValue>) {
      const keys = Object.keys(row);
      sqlite
        .prepare(
          `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        )
        .run(...Object.values(row));
    },
    fingerprint() {
      return JSON.stringify(
        (
          sqlite
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all() as { name: string }[]
        ).map(({ name }) => [
          name,
          sqlite.prepare(`SELECT * FROM "${name}"`).all(),
        ]),
      );
    },
    dispose() {
      sqlite.close();
    },
  };
}
