import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { customerFeeMariaMigration, customerFeeRequiredTables, customerFeeTriggerDefinitions,
  customerFeeRequiredExactChecks, customerFeeRequiredForeignKeys,
  customerFeeRequiredUniqueIndexes, customerFeeRequiredColumnCollations } from '../lib/operations/fee-schema-readiness.mjs';
const release = (
  process.env.HASTABAZAAR_RELEASE_ID ?? 'local-unversioned-candidate'
).trim();
const explicitSchemaInput=process.argv.find(arg=>arg.startsWith('--schema-input='))?.slice('--schema-input='.length);
if (!/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(release))
  throw new Error(
    'HASTABAZAAR_RELEASE_ID must be a filesystem-safe identifier between 3 and 128 characters.',
  );
const migrationNames = [
  'mariadb-schema.sql',
  'mariadb-referrals-wallet.sql',
  'mariadb-order-updates.sql',
  'mariadb-review-photos-replies.sql',
  'mariadb-referral-offer-fifty.sql',
  'mariadb-password-reset.sql',
  'mariadb-product-deletions.sql',
  'mariadb-delivery-locations.sql',
  'migrations/2026-09-09-email-login-otp.sql',
  'mariadb-identity-purchase-security.sql',
  'mariadb-parcel-operations.sql',
  'mariadb-product-identity-taxonomy.sql',
  'mariadb-staff-permissions.sql',
  'mariadb-delivery-rates-costs.sql',
  'mariadb-business-notifications.sql',
  'mariadb-exception-work.sql',
  'mariadb-guest-business-notifications.sql',
  'mariadb-gift-cards.sql',
  'mariadb-seller-registration.sql',
  'mariadb-verified-riders.sql',
  'mariadb-partial-cancellation.sql',
  'mariadb-homepage-product-controls.sql',
  'mariadb-marketplace-settings.sql',
  'mariadb-product-variations.sql',
  'mariadb-policy-commission-9-percent.sql',
  'mariadb-business-configuration.sql',
  'mariadb-seller-participation.sql',
  'mariadb-managed-commerce.sql',
  'mariadb-product-story-materials.sql',
  'mariadb-product-origin-evidence.sql',
  'mariadb-checkout-recipient-snapshots.sql',
  'mariadb-seller-governance.sql',
  'mariadb-first-party-analytics.sql',
  'mariadb-invoice-adjustments.sql',
  'mariadb-rider-open-box-finance.sql',
  'mariadb-recently-viewed.sql',
  'mariadb-managed-fixed-supply.sql',
  'mariadb-homepage-hero-carousel.sql',
  'mariadb-form-catalog.sql',
  'mariadb-category-images.sql',
  'mariadb-data-rights-legal-holds.sql',
  'mariadb-address-answer-owner-tombstones.sql',
  'mariadb-feedback-delivery-jobs.sql',
  'mariadb-checkout-contact-verification.sql',
  'mariadb-first-cod-review.sql',
  'mariadb-first-cod-evidence-guards.sql',
  'mariadb-promo-codes.sql',
  'mariadb-loyalty-points.sql',
  'mariadb-single-super-admin-approvals.sql',
  'mariadb-managed-maker-identity.sql',
  'mariadb-commission-workspace.sql',
  'mariadb-company-store-maker-readiness.sql',
  'mariadb-loyalty-scheduled-changes.sql',
  'mariadb-marketplace-fee-waivers.sql',
  customerFeeMariaMigration,
  'mariadb-commission-continuity.sql',
  'mariadb-seller-application-drafts.sql',
  'mariadb-seller-registration-intakes.sql',
];
const tables = {},
  triggers = {},
  migrations = [];
for (const name of migrationNames) {
  const path = 'deployment/babal/' + name,
    sql = await readFile(name==='mariadb-schema.sql' && explicitSchemaInput ? explicitSchemaInput : path, 'utf8');
  migrations.push({
    path,
    sha256: createHash('sha256').update(sql).digest('hex'),
    usage:
      name === 'mariadb-schema.sql'
        ? 'empty-database-only'
        : 'additive-maintenance',
  });
  for (const match of sql.matchAll(
    /CREATE TABLE(?: IF NOT EXISTS)?\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*ENGINE/gi,
  )) {
    const columns = [
      ...match[2].matchAll(
        /(?:^|[\n,])\s*`?(\w+)`?\s+(?:VARCHAR|BIGINT|LONGTEXT|TEXT|INT|INTEGER|DOUBLE|REAL|BOOLEAN|CHAR|DECIMAL|TINYINT|BLOB)\b/gi,
      ),
    ].map((x) => x[1]);
    tables[match[1]] = [
      ...new Set([...(tables[match[1]] ?? []), ...columns]),
    ].sort((a, b) => a.localeCompare(b));
  }
  for (const alter of sql.matchAll(/ALTER TABLE\s+`?(\w+)`?\s+([\s\S]*?);/gi)) {
    for (const column of alter[2].matchAll(/\bADD COLUMN IF NOT EXISTS\s+`?(\w+)`?/gi)) {
      tables[alter[1]] = [...new Set([...(tables[alter[1]] ?? []), column[1]])].sort((a,b) => a.localeCompare(b));
    }
  }
  for (const m of sql.matchAll(/CREATE TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi))
    triggers[m[1]] = [];
}
triggers.order_items_require_available_inventory = [
  'seller_profiles',
  'users',
  'product_deletions',
  'for update',
];
triggers.loyalty_schedule_claim_guard = ['scheduled_revision', 'scheduled_for', 'new.created_at', 'loyalty_scheduled_rules_due'];
for (const name of ['loyalty_schedule_insert_guard', 'loyalty_schedule_update_guard'])
  triggers[name] = ['scheduled_unpause', 'current_revision', 'draft_revision', 'loyalty_revisions', 'starts_at'];
triggers.managed_allocation_preserve_identity = ['old.disposition', 'released', 'paid', 'new.amount_paisa', '<=>'];
triggers.managed_payout_preserve_identity = ['destination_reference', 'amount_paisa', 'payout_number', '<=>'];
triggers.managed_payout_preserve_terminal = ['paid', 'rejected', 'reversed', 'provider_reference', '<=>'];
const requiredTriggerShapes = {};
for(const table of ['operations','settings','sellers'])for(const event of ['update','delete','replace']){
  triggers[`commission_continuity_${table}_no_${event}`]=['signal sqlstate','45000','continuity_immutable',...(event==='replace'?['if exists','new.']:[])];
}
for (const [table, message, events] of [
  ['marketplace_fee_waiver_revisions', 'fee_waiver_revision_immutable', ['UPDATE', 'DELETE']],
  ['marketplace_fee_waiver_requests', 'fee_waiver_request_immutable', ['UPDATE', 'DELETE']],
  ['marketplace_fee_waiver_campaigns', 'fee_waiver_campaign_retained', ['DELETE']],
  ['order_item_marketplace_fees', 'marketplace_fee_snapshot_immutable', ['UPDATE', 'DELETE']],
]) for (const event of events) {
  const name = `${String(table)}_no_${event.toLowerCase()}`;
  triggers[name] = ['signal sqlstate', '45000', message];
  requiredTriggerShapes[name] = { table, event, timing: 'BEFORE' };
}
const requiredChecks = {
  'managed_payout_allocations.amount_paisa': ['amount_paisa', '<> 0'],
  'managed_payout_allocations.disposition': ['disposition', 'reserved', 'released', 'paid'],
  'managed_payout_allocations.managed_allocation_terminal_shape': ['disposition', 'reserved', 'terminal_at', 'is null', 'is not null'],
  'managed_maker_application_details.agreement_language': ['agreement_language', 'en', 'ne'],
  'seller_route_transition_applications.registered_terms_snapshot_json': ['registered_terms_snapshot_json', 'json_valid'],
  'loyalty_config.scheduled_unpause': ['scheduled_unpause', '0', '1'],
  'category_media.category_media_size': ['size_bytes', '0', '5242880'],
  'category_media.category_media_dimensions': ['width', 'height', '0', '2400', '1600'],
  'category_media.category_media_mime': ['mime_type', 'image/webp'],
  'category_media.category_media_hash': ['content_hash', 'char_length', '64'],
  'orders.chk_cancellation_totals': [
    'current_total_paisa',
    'current_subtotal_paisa',
    'current_wallet_paisa',
    'current_discount_paisa',
  ],
  'notification_messages.chk_notification_guest_shape': [
    'recipient_user_id',
    'guest_email',
    'guest_order_id',
    'business_event_key',
  ],
  'wallet_entries.chk_wallet_kind': [
    'gift_card',
    'referral_reward',
    'order_spend',
    'cancellation',
    'refund',
    'loyalty_redemption',
  ],
  'wallet_entries.chk_wallet_gift_source': [
    'gift_card',
    'order_id',
    'gift_card_id',
    'loyalty_redemption',
    'loyalty_redemption_id',
  ],
  'wallet_entries.chk_wallet_safe_amount': [
    'amount_paisa',
    'platform_amount_paisa',
    'between',
    '-9007199254740991',
    '9007199254740991',
  ],
};
// Inline MariaDB checks retain their column name; explicit cross-column checks
// have stable names. Readiness verifies both their presence and body evidence.
for (const [table, columns] of Object.entries({
  marketplace_fee_waiver_control: ['revision'],
  marketplace_fee_waiver_campaigns: ['revision', 'created_at', 'updated_at'],
  marketplace_fee_waiver_revisions: ['revision', 'starts_at', 'ends_at', 'created_at'],
  marketplace_fee_waiver_requests: ['created_at'],
  order_item_marketplace_fees: ['base_paisa', 'standard_paisa', 'waived_paisa', 'net_paisa', 'created_at'],
})) for (const column of columns) requiredChecks[`${table}.${column}`] = [column, 'between', '9007199254740991'];
Object.assign(requiredChecks, {
  'marketplace_fee_waiver_control.id': ['id', 'default'],
  'marketplace_fee_waiver_revisions.state': ['state', 'draft', 'published', 'paused', 'ended'],
  'marketplace_fee_waiver_revisions.name': ['name', 'char_length', 'trim', '100'],
  'marketplace_fee_waiver_revisions.description': ['description', 'char_length', '1000'],
  'marketplace_fee_waiver_requests.request_id': ['request_id', 'char_length', '191'],
  'marketplace_fee_waiver_requests.command_json': ['json_valid', 'json_type', 'command_json', 'object'],
  'marketplace_fee_waiver_requests.response_json': ['json_valid', 'json_type', 'response_json', 'object'],
  'order_item_marketplace_fees.standard_bps': ['standard_bps', 'between', '10000'],
  'order_item_marketplace_fees.marketplace_fee_reconciled': ['standard_paisa', 'waived_paisa', 'net_paisa', '-'],
  'order_item_marketplace_fees.marketplace_fee_full_waiver': ['campaign_id', 'campaign_revision', 'is null', 'is not null', 'waived_paisa', 'standard_paisa', 'net_paisa'],
});
requiredChecks['marketplace_fee_waiver_revisions.ends_at'].push('starts_at', '>');
// Complete CHECK_CLAUSE forms verified against MariaDB 10.11 introspection.
// MariaDB removes the redundant branch parentheses in the full-waiver check;
// retain the actual AND/OR precedence and all other grouping/operators.
const requiredExactChecks = {};
for (const [table, columns] of Object.entries({
  marketplace_fee_waiver_control: ['revision'],
  marketplace_fee_waiver_campaigns: ['revision', 'created_at', 'updated_at'],
  marketplace_fee_waiver_revisions: ['revision', 'starts_at', 'ends_at', 'created_at'],
  marketplace_fee_waiver_requests: ['created_at'],
  order_item_marketplace_fees: ['base_paisa', 'standard_paisa', 'waived_paisa', 'net_paisa', 'created_at'],
})) for (const column of columns) {
  const minimum = column === 'revision' && table !== 'marketplace_fee_waiver_control' || column === 'ends_at' ? 1 : 0;
  requiredExactChecks[`${table}.${column}`] = `${column} BETWEEN ${minimum} AND 9007199254740991`;
}
Object.assign(requiredExactChecks, {
  'marketplace_fee_waiver_control.id': "id = 'default'",
  'marketplace_fee_waiver_revisions.state': "state IN ('draft','published','paused','ended')",
  'marketplace_fee_waiver_revisions.name': 'CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 100',
  'marketplace_fee_waiver_revisions.description': 'CHAR_LENGTH(description) <= 1000',
  'marketplace_fee_waiver_requests.request_id': 'CHAR_LENGTH(request_id) BETWEEN 1 AND 191',
  'marketplace_fee_waiver_requests.command_json': "JSON_VALID(command_json) AND JSON_TYPE(command_json) = 'OBJECT'",
  'marketplace_fee_waiver_requests.response_json': "JSON_VALID(response_json) AND JSON_TYPE(response_json) = 'OBJECT'",
  'order_item_marketplace_fees.standard_bps': 'standard_bps BETWEEN 0 AND 10000',
  'order_item_marketplace_fees.marketplace_fee_reconciled': 'standard_paisa - waived_paisa = net_paisa',
  'order_item_marketplace_fees.marketplace_fee_full_waiver': 'campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa = 0 OR campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND waived_paisa = standard_paisa AND net_paisa = 0',
});
requiredExactChecks['marketplace_fee_waiver_revisions.ends_at'] += ' AND ends_at > starts_at';
const requiredForeignKeys = {
  'marketplace_fee_waiver_revisions.fee_revision_campaign_fk': { columns: ['campaign_id'], referencedTable: 'marketplace_fee_waiver_campaigns', referencedColumns: ['id'] },
  'marketplace_fee_waiver_revisions.fee_revision_actor_fk': { columns: ['created_by'], referencedTable: 'users', referencedColumns: ['id'] },
  'marketplace_fee_waiver_requests.fee_request_actor_fk': { columns: ['actor_id'], referencedTable: 'users', referencedColumns: ['id'] },
  'order_item_marketplace_fees.fee_evidence_item_fk': { columns: ['order_item_id'], referencedTable: 'order_items', referencedColumns: ['id'] },
  'order_item_marketplace_fees.fee_evidence_revision_fk': { columns: ['campaign_id', 'campaign_revision'], referencedTable: 'marketplace_fee_waiver_revisions', referencedColumns: ['campaign_id', 'revision'] },
};
for (const [table, columns] of Object.entries(customerFeeRequiredTables)) {
  if (!columns.every(column => tables[table]?.includes(column))) throw new Error('Customer fee source is missing reviewed columns: ' + table);
}
const manifest = {
  requiredExactChecks: { ...requiredExactChecks, ...customerFeeRequiredExactChecks,
    'commission_continuity_operations.continuity_operation_rate':'basis_points = 900',
    'commission_continuity_operations.continuity_operation_interval':'ends_at = 1794334500000 AND started_at < ends_at',
    'commission_continuity_operations.continuity_operation_recorded':'recorded_at = started_at',
    'commission_continuity_settings.continuity_setting_key':"setting_key IN ('independent_seller_commission_bps','managed_sale_linked_platform_retention_bps')",
  },
  requiredForeignKeys: { ...requiredForeignKeys, ...customerFeeRequiredForeignKeys,
    ...Object.fromEntries([
      ['operations','operation_actor','actor_id','users'],
      ['settings','setting_operation','operation_id','commission_continuity_operations'],
      ['settings','setting_current','setting_id','business_setting_versions'],
      ['settings','setting_successor','successor_id','business_setting_versions'],
      ['sellers','seller_operation','operation_id','commission_continuity_operations'],
      ['sellers','seller_setting','setting_id','commission_continuity_settings'],
      ['sellers','seller_profile','seller_id','seller_profiles'],
      ['sellers','seller_owner','owner_id','users'],
      ['sellers','seller_audit','audit_id','audit_logs'],
    ].map(([table,name,column,parent])=>[`commission_continuity_${table}.continuity_${name}_fk`,{columns:[column],referencedTable:parent,referencedColumns:[parent==='commission_continuity_settings'?'setting_id':'id']}]))
  },
  requiredTriggerShapes: { ...requiredTriggerShapes, ...Object.fromEntries(Object.entries(customerFeeTriggerDefinitions).map(([name, { table, event, timing }]) => [name, { table, event, timing }])) },
  requiredExactTriggerDefinitions: Object.fromEntries(Object.entries(customerFeeTriggerDefinitions).map(([name, shape]) => [name, shape.mariadb])),
  requiredUniqueIndexes: {
    'commission_continuity_operations.PRIMARY':['id'],
    'commission_continuity_settings.PRIMARY':['setting_id'],
    'commission_continuity_settings.continuity_setting_successor':['successor_id'],
    'commission_continuity_settings.continuity_operation_key':['operation_id','setting_key'],
    'commission_continuity_sellers.PRIMARY':['id'],
    'commission_continuity_sellers.continuity_seller_identity':['seller_id'],
    'commission_continuity_sellers.continuity_seller_audit':['audit_id'],
    'commission_continuity_sellers.continuity_operation_seller':['operation_id','seller_id'],
    ...customerFeeRequiredUniqueIndexes,
    'managed_payout_allocations.managed_allocation_one_reservation': ['reserved_entitlement_key'],
    'marketplace_fee_waiver_control.PRIMARY': ['id'],
    'marketplace_fee_waiver_campaigns.PRIMARY': ['id'],
    'marketplace_fee_waiver_revisions.PRIMARY': ['campaign_id', 'revision'],
    'marketplace_fee_waiver_revisions.request_id': ['request_id'],
    'marketplace_fee_waiver_requests.PRIMARY': ['request_id'],
    'order_item_marketplace_fees.PRIMARY': ['order_item_id'],
  },
  requiredGeneratedColumns: { 'managed_payout_allocations.reserved_entitlement_key': ["case when binary disposition='reserved' then entitlement_id else null end"] },
  requiredColumnCollations: {
    ...Object.fromEntries([
      ...['request_json','source_release','source_commit','capture_sha256','selection_sha256'].map(c=>'commission_continuity_operations.'+c),
      ...['setting_key','current_json','successor_json'].map(c=>'commission_continuity_settings.'+c),
      ...['agreement_version','audit_json'].map(c=>'commission_continuity_sellers.'+c),
    ].map(c=>[c,'utf8mb4_bin'])),
    ...customerFeeRequiredColumnCollations,
    'managed_payout_allocations.reserved_entitlement_key': 'utf8mb4_unicode_ci',
    'marketplace_fee_waiver_campaigns.id': 'utf8mb4_bin',
    'marketplace_fee_waiver_revisions.campaign_id': 'utf8mb4_bin',
    'marketplace_fee_waiver_revisions.request_id': 'utf8mb4_bin',
    'marketplace_fee_waiver_requests.request_id': 'utf8mb4_bin',
    'order_item_marketplace_fees.campaign_id': 'utf8mb4_bin',
    'marketplace_fee_waiver_revisions.created_by': 'utf8mb4_unicode_ci',
    'marketplace_fee_waiver_requests.actor_id': 'utf8mb4_unicode_ci',
    'order_item_marketplace_fees.order_item_id': 'utf8mb4_unicode_ci',
    'users.id': 'utf8mb4_unicode_ci',
    'order_items.id': 'utf8mb4_unicode_ci',
  },
  requiredChecks: { ...requiredChecks, ...Object.fromEntries(Object.entries(customerFeeRequiredExactChecks).map(([name, definition]) => [name, [definition.toLowerCase()]])) },
  release,
  startup: 'app.cjs',
  hosting: 'Babal.Host',
  requiredNodeMajor: 22,
  migrations,
  requiredTables: tables,
  requiredTriggers: { ...triggers, ...Object.fromEntries(Object.entries(customerFeeTriggerDefinitions).map(([name, shape]) => [name, ['signal sqlstate', '45000', shape.mariadb.match(/MESSAGE_TEXT='([^']+)'/)[1]]])) },
};
await writeFile(
  process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length) ?? 'deployment/babal/release-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  `Manifest: ${Object.keys(tables).length} tables, ${Object.keys(triggers).length} triggers, ${migrations.length} migrations.`,
);
