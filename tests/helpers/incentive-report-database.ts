import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** All real migrations and triggers, with plain D1-shaped result rows. */
export async function incentiveReportDatabase(beforeMigration?: (name: string, sqlite: DatabaseSync) => Promise<void>) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  try {
    const migrations = (
      await readdir(new URL('../../drizzle/', import.meta.url))
    )
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    for (const name of migrations) {
      await beforeMigration?.(name, sqlite);
      sqlite.exec(
        await readFile(
          new URL(`../../drizzle/${name}`, import.meta.url),
          'utf8',
        ),
      );
    }
    const db = {
      prepare(sql: string) {
        const statement = sqlite.prepare(sql);
        let values: SQLInputValue[] = [];
        return {
          bind(...bindings: SQLInputValue[]) {
            values = bindings;
            return this;
          },
          async first<T>(column?: string) {
            const row = statement.get(...values);
            return row ? ((column ? row[column] : { ...row }) as T) : null;
          },
          async all<T>() {
            return {
              success: true,
              results: statement
                .all(...values)
                .map((row) => ({ ...row })) as T[],
              meta: {},
            };
          },
          async run() {
            return {
              success: true,
              results: [],
              meta: { changes: Number(statement.run(...values).changes) },
            };
          },
        };
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as D1Database;
    return { db, sqlite, dispose: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
