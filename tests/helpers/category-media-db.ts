import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export function declareOccasionImageFixtureStorage(sqlite: DatabaseSync) {
  if (sqlite.prepare('PRAGMA database_list').all().some(row => row.file))
    throw new Error('Occasion image test storage requires an in-memory fixture.');
  sqlite.exec(`
    CREATE TABLE occasion_media (
      id TEXT PRIMARY KEY, occasion_id TEXT REFERENCES occasions(id), object_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, width INTEGER NOT NULL,
      height INTEGER NOT NULL, content_hash TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
      request_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(created_by,request_id)
    );
    CREATE TABLE occasion_image_assignments (
      occasion_id TEXT PRIMARY KEY REFERENCES occasions(id), media_id TEXT UNIQUE REFERENCES occasion_media(id),
      updated_by TEXT NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL
    );
  `);
}

/** Disposable SQLite with historical schema and atomic D1-style batches. */
export async function categoryMediaDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const names = (await readdir(new URL('../../drizzle/', import.meta.url)))
    .filter(name => /^\d{4}_.+\.sql$/.test(name) && name !== '0170_occasion_images.sql').sort();
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
