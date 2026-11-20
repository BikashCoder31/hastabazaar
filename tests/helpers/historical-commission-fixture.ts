import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { SELLER_AGREEMENT_VERSION } from '../../lib/content/legal-policies';

/** Explicit old commercial terms for isolated historical scenarios. Never opens a database. */
export function historicalCommissionFixture(sqlite: DatabaseSync, actorId: string, acceptExistingSellers = false) {
  assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''), 'Financial fixtures must use in-memory databases only.');
  // These scenarios predate the customer service fee. Keep their original totals explicit.
  if (!sqlite.prepare("SELECT 1 FROM business_setting_versions WHERE setting_key='platform_service_fee_policy'").get())
    sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES('historical-no-service-fee','platform_service_fee_policy',1,'{"enabled":false,"amountPaisa":1000}','published',1,'controlled',1,'Explicit isolated historical no-fee terms',?,1,'historical-no-service-fee')`).run(actorId);
  for (const key of ['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps']) {
    if (sqlite.prepare('SELECT 1 FROM business_setting_versions WHERE setting_key=?').get(key)) continue;
    sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES(?,?,1,'900','published',1,'controlled',1,'Explicit isolated historical terms',?,1,?)`).run('historical-'+key,key,actorId,'historical-'+key);
  }
  if (!acceptExistingSellers) return;
  const current = sqlite.prepare("SELECT id,value_json value FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps' AND status='published' AND effective_from=1 ORDER BY version DESC LIMIT 1").get();
  assert.ok(current, 'The historical fixture requires explicit original terms.');
  for (const seller of sqlite.prepare('SELECT id,user_id FROM seller_profiles').all()) {
    if (sqlite.prepare('SELECT 1 FROM seller_agreement_acceptance_history WHERE seller_id=? AND commission_setting_version_id=?').get(seller.id,current.id)) continue;
    sqlite.prepare(`INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at)
      VALUES(?,?,?,'en',?,?,?,?,1)`).run('historical-accept-'+seller.id,seller.id,SELLER_AGREEMENT_VERSION,current.id,Number(current.value),'historical-accept-'+seller.id,seller.user_id);
  }
}
