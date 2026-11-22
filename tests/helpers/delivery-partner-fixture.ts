import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';

// Model the optional owner-applied tables independently in the disposable fixture.
export function installFixtureTables(sqlite: DatabaseSync) {
  assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  sqlite.exec(`CREATE TABLE delivery_partners (
    id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
    booking_mode TEXT NOT NULL DEFAULT 'manual', collects_cod INTEGER NOT NULL,
    tracking_pattern TEXT, default_slot INTEGER UNIQUE, revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    ALTER TABLE shipping_parcels ADD COLUMN delivery_partner_id TEXT REFERENCES delivery_partners(id);`);
}
