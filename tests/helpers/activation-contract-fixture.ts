import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getBusinessSettingDefinition } from '../../lib/configuration/definitions';
import { managedMakerAgreementSnapshot } from '../../lib/sellers/managed-identity';
import { historicalCommissionFixture } from './historical-commission-fixture';

/** Extend old, focused operation fixtures with the real immutable acceptance contract.
 * The complete application/review/checkout journey uses company-store-maker-fixture instead. */
export function addActivationContractEvidence(sqlite: DatabaseSync, sellerId = 'seller-one', ownerId = 'maker') {
  if(sqlite.prepare('PRAGMA database_list').all().some(row=>row.file))throw new Error('Activation fixtures require an in-memory database.');
  const exists = (table: string) => sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table);
  if (!exists('business_setting_versions')) sqlite.exec(readFileSync('drizzle/0044_business_configuration.sql', 'utf8'));
  if (!sqlite.prepare('SELECT 1 FROM users WHERE id=?').get(ownerId)) sqlite.prepare("INSERT INTO users(id,status) VALUES(?,'active')").run(ownerId);
  for (const [key, value] of [['managed_maker_program_mode', 'activation_enabled'], ['managed_maker_active_model', 'managed_sale_linked_percentage_v1']]) {
    if (!sqlite.prepare('SELECT 1 FROM business_setting_versions WHERE setting_key=?').get(key)) sqlite.prepare(`INSERT INTO business_setting_versions
      (id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES(?,?,1,?,'published',1,'controlled',1,'Isolated activation contract','admin',1,?)`).run(`${key}-v1`, key, JSON.stringify(value), `contract:${key}`);
  }
  if (!exists('seller_documents')) sqlite.exec('CREATE TABLE seller_documents(id TEXT PRIMARY KEY,seller_id TEXT,kind TEXT,status TEXT,object_key TEXT)');
  if (!exists('managed_maker_application_details')) sqlite.exec(readFileSync('drizzle/0068_managed_maker_identity.sql', 'utf8'));
  const columns = (table: string) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  if (!columns('seller_profiles').includes('payout_account_reference')) sqlite.exec('ALTER TABLE seller_profiles ADD COLUMN payout_account_reference TEXT');
  if (!columns('managed_maker_application_details').includes('agreement_language')) {
    sqlite.exec('ALTER TABLE managed_maker_application_details ADD COLUMN agreement_language TEXT; ALTER TABLE managed_maker_application_details ADD COLUMN agreement_form_version_id TEXT');
  }
  if (!columns('seller_participation_profiles').includes('accepted_managed_detail_id')) sqlite.exec('ALTER TABLE seller_participation_profiles ADD COLUMN accepted_managed_detail_id TEXT');
  if (!exists('seller_restrictions')) sqlite.exec('CREATE TABLE seller_restrictions(seller_id TEXT PRIMARY KEY,mode TEXT,suspended_until INTEGER)');
  historicalCommissionFixture(sqlite,ownerId);
  const snapshot = {...managedMakerAgreementSnapshot(getBusinessSettingDefinition('managed_maker_company_account').defaultValue, 900),
    settingVersionIds:{account:null,retention:'historical-managed_sale_linked_platform_retention_bps'}};
  sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,status,object_key) VALUES('activation-id',?,'representative_identity','pending',?)")
    .run(sellerId, `private/seller-documents/${sellerId}/identity`);
  sqlite.prepare(`INSERT INTO managed_maker_application_details(id,seller_id,government_id_type,identity_document_id,
    agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,created_at)
    VALUES('activation-accepted-detail',?,'citizenship','activation-id',?,100,?,?,100)`)
    .run(sellerId, snapshot.version, ownerId, JSON.stringify(snapshot));
}
