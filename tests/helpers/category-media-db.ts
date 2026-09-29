import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Disposable SQLite with every real migration and atomic D1-style batches. */
export async function categoryMediaDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const names = (await readdir(new URL('../../drizzle/', import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const name of names) {
    const source = await readFile(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8');
    for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) sqlite.exec(statement);
  }
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...bindings: unknown[]) { values = bindings as SQLInputValue[]; return statement; },
        async first(column?: string) {
          const row = sqlite.prepare(sql).get(...values);
          return column ? row?.[column] ?? null : row ?? null;
        },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true, meta: {} }; },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }, results: [] };
        },
      };
      return statement;
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
  return { db, sqlite, dispose() { sqlite.close(); } };
}
