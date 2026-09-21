import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productionAdditiveMigrations = [
  '../deployment/babal/mariadb-managed-fixed-supply.sql',
  '../deployment/babal/mariadb-homepage-hero-carousel.sql',
] as const;

void test('foreign-key migrations keep the production utf8mb4_unicode_ci contract', async () => {
  for (const relativePath of productionAdditiveMigrations) {
    const sql = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    const createTableStatements = sql.match(
      /CREATE TABLE IF NOT EXISTS[\s\S]*?;/gi,
    );

    assert.ok(createTableStatements?.length, `${relativePath} creates tables`);
    for (const statement of createTableStatements) {
      if (!/FOREIGN KEY/i.test(statement)) continue;
      assert.match(
        statement,
        /DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/i,
        `${relativePath} must not inherit a host database's legacy collation`,
      );
    }
  }
});
