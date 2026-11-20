import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { invalidateRestoredAuthority } from '../scripts/recovery/native-inventory.mjs';

const migration = (file: string) =>
  readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8');
function tableDdl(sql: string, table: string) {
  const match = sql.match(new RegExp('CREATE TABLE ' + table + '\\s*\\([\\s\\S]*?\\);'));
  assert.ok(match);
  return match[0];
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE marketplace_settings(key TEXT); CREATE TABLE staff_invitations(status TEXT);');
  const connection = {
    async beginTransaction() { sqlite.exec('BEGIN'); },
    async query(sql: string) { sqlite.exec(sql); },
    async commit() { sqlite.exec('COMMIT'); },
    async rollback() { sqlite.exec('ROLLBACK'); },
  };
  return { sqlite, connection };
}

void test('native recovery retires worker tokens and preserves reservation and delivery history', async () => {
  const { sqlite, connection } = fixture();
  try {
    const common = migration('0089_common_fee_policies.sql');
    const delivery = migration('0147_durable_email_delivery.sql');
    sqlite.exec("CREATE TABLE seller_profiles(id TEXT PRIMARY KEY); INSERT INTO seller_profiles VALUES ('seller');");
    sqlite.exec(tableDdl(common, 'commission_terms_email_controls'));
    sqlite.exec(tableDdl(delivery, 'operational_reminder_cursors'));
    sqlite.exec(tableDdl(delivery, 'email_delivery_attempts'));
    sqlite.exec(`
      INSERT INTO operational_reminder_cursors VALUES
        ('dispatch','manual_payment',42,'old-cursor',9000),
        ('sweep','checkpoint',43,NULL,NULL);
      INSERT INTO commission_terms_email_controls VALUES
        ('seller',9,101,102,103,'prior-message','old-fee','current-message',9000);
      CREATE TABLE notification_messages(id TEXT PRIMARY KEY,status TEXT,delivery_claim_token TEXT,delivery_lease_until INTEGER);
      INSERT INTO notification_messages VALUES ('current-message','sending','old-fee',9000),('prior-message','sent',NULL,0);
      INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at,provider_receipt) VALUES
        ('a','business','current-message','old-fee',1,'claimed','mid-a',1,NULL),
        ('b','business','handoff-message','handoff-token',1,'handoff_started','mid-b',2,NULL),
        ('c','business','uncertain-message','uncertain-token',1,'uncertain','mid-c',3,NULL),
        ('d','business','prior-message','sent-token',1,'accepted','mid-d',4,'receipt');
    `);
    const all = (table: string) => sqlite.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all();
    const tables = ['operational_reminder_cursors', 'commission_terms_email_controls', 'notification_messages', 'email_delivery_attempts'];
    const before = tables.map(all);
    const inventory = { tables: tables.map(name => ({ name, classification: 'dispatch' })) };
    await invalidateRestoredAuthority(connection, inventory);
    await invalidateRestoredAuthority(connection, inventory);
    assert.deepEqual(all(tables[0]).map(row => ({ ...row })), before[0].map(row => ({
      ...row, lease_token: null, lease_until: null,
    })));
    assert.deepEqual(all(tables[1]).map(row => ({ ...row })), before[1].map(row => ({
      ...row, routine_claim_token: null,
    })));
    assert.deepEqual(all(tables[2]), before[2]);
    assert.deepEqual(all(tables[3]), before[3]);
    assert.equal(sqlite.prepare('SELECT 1 FROM operational_reminder_cursors WHERE lease_token=?').get('old-cursor'), undefined);
    assert.equal(sqlite.prepare('SELECT 1 FROM commission_terms_email_controls WHERE routine_claim_token=?').get('old-fee'), undefined);
  } finally {
    sqlite.close();
  }
});

void test('native recovery accepts older inventory without either worker table', async () => {
  const { sqlite, connection } = fixture();
  try {
    sqlite.exec("INSERT INTO staff_invitations VALUES ('pending')");
    await invalidateRestoredAuthority(connection, { tables: [] });
    assert.equal(sqlite.prepare('SELECT status FROM staff_invitations').get()?.status, 'expired');
  } finally {
    sqlite.close();
  }
});
