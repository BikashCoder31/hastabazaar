import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export async function locateLocalD1Database(paths) {
  const directory = join(paths.state, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite')
    .map((entry) => join(directory, entry.name));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one disposable local D1 database, found ${candidates.length}.`);
  }
  return candidates[0];
}

export async function applyLocalD1Migrations(paths, projectRoot) {
  const databasePath = await locateLocalD1Database(paths);
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS _hastabazaar_local_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )`);
    const migrationDirectory = join(projectRoot, 'drizzle');
    const names = (await readdir(migrationDirectory))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    let applied = 0;
    for (const name of names) {
      const exists = sqlite
        .prepare('SELECT 1 AS found FROM _hastabazaar_local_migrations WHERE name = ?')
        .get(name);
      if (exists) continue;
      const sql = await readFile(join(migrationDirectory, name), 'utf8');
      // SQLite ignores foreign_keys changes inside a transaction. Rebuilds must
      // disable them before BEGIN so DROP does not cascade through old parents.
      const foreignKeys = sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys;
      const legacyAlter = sqlite.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table;
      if (/PRAGMA\s+foreign_keys\s*=\s*(?:OFF|0)\b/i.test(sql)) sqlite.exec('PRAGMA foreign_keys=OFF');
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim()) sqlite.exec(statement);
        }
        if (sqlite.prepare('PRAGMA foreign_key_check').all().length) {
          throw new Error('The migrated schema contains invalid foreign-key relationships.');
        }
        sqlite
          .prepare('INSERT INTO _hastabazaar_local_migrations (name, applied_at) VALUES (?, ?)')
          .run(name, Date.now());
        sqlite.exec('COMMIT');
        applied += 1;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw new Error(`Local staging migration ${basename(name)} failed.`, { cause: error });
      } finally {
        sqlite.exec(`PRAGMA foreign_keys=${foreignKeys}; PRAGMA legacy_alter_table=${legacyAlter}`);
      }
    }
    return { databasePath, applied, total: names.length };
  } finally {
    sqlite.close();
  }
}
