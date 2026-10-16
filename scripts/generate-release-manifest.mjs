import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const release = (
  process.env.HASTABAZAAR_RELEASE_ID ?? 'local-unversioned-candidate'
).trim();
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
];
const tables = {},
  triggers = {},
  migrations = [];
for (const name of migrationNames) {
  const path = 'deployment/babal/' + name,
    sql = await readFile(path, 'utf8');
  migrations.push({
    path,
    sha256: createHash('sha256').update(sql).digest('hex'),
    usage:
      name === 'mariadb-schema.sql'
        ? 'empty-database-only'
        : 'additive-maintenance',
  });
  for (const match of sql.matchAll(
    /CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*ENGINE/gi,
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
const manifest = {
  requiredUniqueIndexes: { 'managed_payout_allocations.managed_allocation_one_reservation': ['reserved_entitlement_key'] },
  requiredGeneratedColumns: { 'managed_payout_allocations.reserved_entitlement_key': ["case when binary disposition='reserved' then entitlement_id else null end"] },
  requiredColumnCollations: { 'managed_payout_allocations.reserved_entitlement_key': 'utf8mb4_unicode_ci' },
  requiredChecks,
  release,
  startup: 'app.cjs',
  hosting: 'Babal.Host',
  requiredNodeMajor: 22,
  migrations,
  requiredTables: tables,
  requiredTriggers: triggers,
};
await writeFile(
  'deployment/babal/release-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  `Manifest: ${Object.keys(tables).length} tables, ${Object.keys(triggers).length} triggers, ${migrations.length} migrations.`,
);
