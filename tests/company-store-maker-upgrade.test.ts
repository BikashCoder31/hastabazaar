import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyReadinessUpgrade, assertExistingRecordsPreserved, existingRecordSnapshot,
  inspectReadinessUpgrade, readReadinessManifest } from '../scripts/staging/company-store-readiness-upgrade.mjs';

async function oldDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of (await readdir('drizzle')).filter(name => /^\d{4}_.*\.sql$/.test(name) && name < '0071').sort())
    sqlite.exec(await readFile(resolve('drizzle', name), 'utf8'));
  sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES
    ('existing-super','existing-super@local.hastabazaar.test','Existing test Super Admin','active',1,1),
    ('existing-admin','existing-admin@local.hastabazaar.test','Existing test Admin','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('existing-super','super_admin',1),('existing-admin','admin',1);
    INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at)
      VALUES('original-audit','existing-super','test.original','user','existing-super','Preserve this original history','original-audit',1);`);
  return sqlite;
}

test('additive upgrade preserves every existing row and a second run changes nothing', async () => {
  const sqlite = await oldDatabase();
  try {
    const manifest = await readReadinessManifest(process.cwd());
    const before = existingRecordSnapshot(sqlite);
    assert.equal(inspectReadinessUpgrade(sqlite, 'existing-super').migrationNeeded, true);
    assert.deepEqual(applyReadinessUpgrade(sqlite, manifest, 'existing-super', 100), { migrations: 1, forms: 4, audits: 4 });
    assertExistingRecordsPreserved(sqlite, before);
    assert.equal(sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    const once = existingRecordSnapshot(sqlite);
    assert.deepEqual(applyReadinessUpgrade(sqlite, manifest, 'existing-super', 200), { migrations: 0, forms: 0, audits: 0 });
    assert.deepEqual(existingRecordSnapshot(sqlite), once);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 2);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 4);
  } finally { sqlite.close(); }
});

test('upgrade rejects an ordinary Admin and existing unpublished configuration without changes', async () => {
  const sqlite = await oldDatabase();
  try {
    const manifest = await readReadinessManifest(process.cwd());
    const before = existingRecordSnapshot(sqlite);
    assert.throws(() => applyReadinessUpgrade(sqlite, manifest, 'existing-admin', 100), /Super Admin/);
    assert.deepEqual(existingRecordSnapshot(sqlite), before);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,
      updated_by,updated_at,last_request_id) VALUES('unpublished','seller.managed-terms-acceptance',1,'draft',
      '{"formId":"seller.managed-terms-acceptance","fields":[]}','Existing draft','existing-super',1,'existing-super',1,'unpublished')`).run();
    const draftBefore = existingRecordSnapshot(sqlite);
    assert.throws(() => applyReadinessUpgrade(sqlite, manifest, 'existing-super', 100), /unpublished draft/);
    assert.deepEqual(existingRecordSnapshot(sqlite), draftBefore);
  } finally { sqlite.close(); }
});
