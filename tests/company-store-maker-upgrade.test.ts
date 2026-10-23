import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import { inspectLocalFeatureSchema } from '../scripts/start-local.mjs';
import { applyReadinessUpgrade, assertExistingRecordsPreserved, existingRecordSnapshot,
  inspectReadinessUpgrade, readReadinessManifest, assertReadinessPreviewStopped,
  writeExclusiveReadinessBackup } from '../scripts/staging/company-store-readiness-upgrade.mjs';

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

void test('upgrade refuses an occupied preview and never overwrites a backup', async()=>{
  const server=createServer();
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const address=server.address();assert.ok(address&&typeof address==='object');
  try {await assert.rejects(assertReadinessPreviewStopped(address.port),/occupied/);}
  finally {await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
  const directory=await mkdtemp(resolve(tmpdir(),'hastabazaar-upgrade-backup-'));
  const sqlite=await oldDatabase();
  try {
    const target=resolve(directory,'preserve.sqlite');await writeFile(target,'existing backup');
    await assert.rejects(writeExclusiveReadinessBackup(sqlite,target),/EEXIST/);
    assert.equal(await readFile(target,'utf8'),'existing backup');
    const fresh=resolve(directory,'fresh.sqlite');await writeExclusiveReadinessBackup(sqlite,fresh);
    const check=new DatabaseSync(fresh,{readOnly:true});
    try {assert.deepEqual(existingRecordSnapshot(check),existingRecordSnapshot(sqlite));}finally {check.close();}
  }finally {sqlite.close();await rm(directory,{recursive:true,force:true});}
});

void test('legacy maker/loyalty additive upgrade preserves every row and leaves later fee storage for separate review', async () => {
  const sqlite = await oldDatabase();
  try {
    const manifest = await readReadinessManifest(process.cwd());
    const before = existingRecordSnapshot(sqlite);
    assert.equal(inspectReadinessUpgrade(sqlite, 'existing-super').migrationNeeded, true);
    assert.deepEqual(applyReadinessUpgrade(sqlite, manifest, 'existing-super', 100), { migrations: 2, forms: 4, audits: 4 });
    assert.deepEqual(inspectLocalFeatureSchema(sqlite), {ready: false, missing: [
      'customer_fee_waiver_control', 'customer_fee_waiver_campaigns', 'customer_fee_waiver_revisions',
      'customer_fee_waiver_requests', 'order_customer_service_fees',
      'marketplace_fee_waiver_control', 'marketplace_fee_waiver_campaigns', 'marketplace_fee_waiver_revisions',
      'marketplace_fee_waiver_requests', 'order_item_marketplace_fees',
      'marketplace_fee_waiver_revisions_no_update', 'marketplace_fee_waiver_revisions_no_delete',
      'marketplace_fee_waiver_requests_no_update', 'marketplace_fee_waiver_requests_no_delete',
      'marketplace_fee_waiver_campaigns_no_delete', 'order_item_marketplace_fees_no_update', 'order_item_marketplace_fees_no_delete',
      'table:customer_fee_waiver_control', 'table:customer_fee_waiver_campaigns', 'table:customer_fee_waiver_revisions',
      'table:customer_fee_waiver_requests', 'table:order_customer_service_fees',
      'index:idx_customer_fee_waiver_history', 'index:idx_order_customer_service_fees_campaign',
      'trigger:customer_fee_waiver_revisions_no_replace', 'trigger:customer_fee_waiver_requests_no_replace',
      'trigger:order_customer_service_fees_no_replace', 'trigger:customer_fee_waiver_revisions_no_update',
      'trigger:customer_fee_waiver_revisions_no_delete', 'trigger:customer_fee_waiver_requests_no_update',
      'trigger:customer_fee_waiver_requests_no_delete', 'trigger:customer_fee_waiver_campaigns_no_delete',
      'trigger:order_customer_service_fees_no_update', 'trigger:order_customer_service_fees_no_delete',
      'trigger:order_customer_service_fees_match_order', 'trigger:orders_preserve_customer_service_fee',
    ]});
    assert.deepEqual({...sqlite.prepare('SELECT scheduled_revision,scheduled_for,scheduled_unpause FROM loyalty_config').get()},
      {scheduled_revision:null,scheduled_for:null,scheduled_unpause:0});
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

void test('combined upgrade applies only the missing schedule migration and rejects partial storage', async () => {
  const sqlite = await oldDatabase();
  try {
    const manifest = await readReadinessManifest(process.cwd());
    sqlite.exec(await readFile('drizzle/0071_company_store_maker_readiness.sql','utf8'));
    const before=existingRecordSnapshot(sqlite);
    assert.deepEqual(applyReadinessUpgrade(sqlite,manifest,'existing-super',100),{migrations:1,forms:4,audits:4});
    assertExistingRecordsPreserved(sqlite,before);
    sqlite.exec('DROP TRIGGER loyalty_schedule_claim_guard');
    const partial=existingRecordSnapshot(sqlite);
    assert.throws(()=>applyReadinessUpgrade(sqlite,manifest,'existing-super',200),/Partial.*schedul/i);
    assert.deepEqual(existingRecordSnapshot(sqlite),partial);
  } finally {sqlite.close();}
});

void test('upgrade rejects an ordinary Admin and existing unpublished configuration without changes', async () => {
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

void test('form initialization preserves populated orders including generated columns', async () => {
  const f = await earnedMaker();
  try {
    const before = existingRecordSnapshot(f.sqlite);
    assert.deepEqual(applyReadinessUpgrade(f.sqlite, await readReadinessManifest(process.cwd()), 'reviewer', f.financialNow),
      { migrations: 0, forms: 4, audits: 4 });
    assertExistingRecordsPreserved(f.sqlite, before);
    assert.equal(f.sqlite.prepare('SELECT discount_source FROM order_items').get()?.discount_source, 'none');
  } finally { f.dispose(); }
});
