import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Disposable schema only. Never accepts a filename or reads an application database. */
export function securityFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE marketplace_settings ("key" TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE operation_transaction_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
    CREATE TABLE fixture_events (id TEXT PRIMARY KEY);`);
  let tail: Promise<unknown> = Promise.resolve();
  const database = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql); let bindings: SQLInputValue[] = [];
      return {
        bind(...values: SQLInputValue[]) { bindings = values; return this; },
        async first<T>() { return (statement.get(...bindings) as T | undefined) ?? null; },
        async all<T>() { return { success: true, results: statement.all(...bindings) as T[], meta: {} }; },
        async run() { const result = statement.run(...bindings); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
      };
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      const work = tail.catch(() => undefined).then(async () => {
        sqlite.exec('BEGIN');
        try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      tail = work; return work;
    },
  } as unknown as D1Database;
  return { database, sqlite, close: () => sqlite.close() };
}
