import type { DatabaseSync } from 'node:sqlite';

// Standalone in-memory fixture definitions. The owner migration is never an input.
export function installNcmFixtureTables(sqlite: DatabaseSync) {
  sqlite.exec(`
    CREATE TABLE ncm_partner_settings(
      partner_id TEXT PRIMARY KEY, connection_fingerprint TEXT, assigned_branches_json TEXT, branches_json TEXT,
      branches_checked_at INTEGER, refresh_started_at INTEGER, connected_at INTEGER,
      delivery_type TEXT DEFAULT 'Door2Door', package_name TEXT DEFAULT '', revision INTEGER DEFAULT 1,
      updated_at INTEGER, last_check_at INTEGER, check_started_at INTEGER
    );
    CREATE TABLE ncm_pickup_branches(
      pickup_address_id TEXT PRIMARY KEY, partner_id TEXT, address_updated_at INTEGER, branch TEXT, updated_at INTEGER
    );
    CREATE TABLE ncm_bookings(
      job_id TEXT PRIMARY KEY, partner_id TEXT, actor_id TEXT, vendor_reference TEXT UNIQUE, ncm_order_id TEXT UNIQUE,
      state TEXT, request_id TEXT UNIQUE, started_at INTEGER, updated_at INTEGER, response_json TEXT, label_json TEXT,
      cod_reported_paisa INTEGER, delivery_charge_paisa INTEGER, return_charge_paisa INTEGER, last_status TEXT
    );
    CREATE TABLE ncm_api_daily_usage(usage_day TEXT,bucket TEXT,used INTEGER,PRIMARY KEY(usage_day,bucket));
    CREATE TABLE ncm_webhook_events(
      id TEXT PRIMARY KEY,kind TEXT,event TEXT,payload_json TEXT,received_at INTEGER,processed_at INTEGER,
      attempts INTEGER DEFAULT 0,next_attempt_at INTEGER DEFAULT 0,claimed_at INTEGER
    );
    CREATE TABLE ncm_courier_notes(
      ncm_order_id TEXT,comment_id TEXT,job_id TEXT,kind TEXT,comment TEXT,created_at INTEGER,
      PRIMARY KEY(ncm_order_id,comment_id)
    );
  `);
}
