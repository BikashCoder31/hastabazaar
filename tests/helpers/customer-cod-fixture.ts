import type { DatabaseSync } from 'node:sqlite';

/** Model the installed schema on a disposable, empty COD review table. */
export function installFixtureCustomerCodSchema(sqlite: DatabaseSync) {
  if (!sqlite.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'cod_confirmation_required')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN cod_confirmation_required INTEGER NOT NULL DEFAULT 0 CHECK (cod_confirmation_required IN (0,1))');
  }
  if (sqlite.prepare('PRAGMA table_info(first_cod_reviews)').all().some(column => column.name === 'hold_source')) return;
  sqlite.exec(`
    PRAGMA legacy_alter_table=ON;
    ALTER TABLE first_cod_reviews RENAME TO fixture_legacy_cod_reviews;
    CREATE TABLE first_cod_reviews (
      order_id TEXT PRIMARY KEY REFERENCES orders(id),
      customer_id TEXT NOT NULL REFERENCES users(id),
      total_paisa INTEGER NOT NULL CHECK(total_paisa BETWEEN 0 AND 9007199254740991),
      status TEXT NOT NULL CHECK(status IN ('pending','confirmed')),
      created_at INTEGER NOT NULL,
      confirmed_by TEXT REFERENCES users(id),
      confirmed_at INTEGER,
      reason TEXT,
      request_id TEXT UNIQUE,
      hold_source TEXT NOT NULL DEFAULT 'first_order' CHECK(hold_source IN ('first_order','customer_flag')),
      CHECK(hold_source='customer_flag' OR total_paisa>=500000)
    );
    DROP TABLE fixture_legacy_cod_reviews;
    PRAGMA legacy_alter_table=OFF;
  `);
}
