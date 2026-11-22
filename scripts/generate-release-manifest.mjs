import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {extractCreateTables,extractTriggerEvents,schemaTokens} from '../lib/operations/sql-schema-inventory.mjs';
import { customerFeeMariaMigration, customerFeeRequiredTables, customerFeeTriggerDefinitions,
  customerFeeRequiredExactChecks, customerFeeRequiredForeignKeys,
  customerFeeRequiredUniqueIndexes, customerFeeRequiredColumnCollations, sameFeeSqlDefinition } from '../lib/operations/fee-schema-readiness.mjs';
const release = (
  process.env.HASTABAZAAR_RELEASE_ID ?? 'local-unversioned-candidate'
).trim();
const { values: options, tokens } = parseArgs({
  options: {
    'schema-input': { type: 'string' },
    'refresh-owner-inventory': { type: 'boolean' },
    'asset-root': { type: 'string' },
    output: { type: 'string' },
    'include-order-refund-migrations': { type: 'boolean' },
  },
  tokens: true,
});
if (tokens.some(({ kind }) => kind !== 'option')) throw new Error('Only named options are supported.');
if (new Set(tokens.map(({ name }) => name)).size !== tokens.length) throw new Error('Options may only be specified once.');
if (Object.values(options).some((value) => typeof value === 'string' && !value.trim())) throw new Error('Option values must be nonempty.');
const {
  'schema-input': explicitSchemaInput,
  'asset-root': assetRoot,
  output: explicitOutput,
  'include-order-refund-migrations': includeOrderRefund,
} = options;
const sourceRoot = includeOrderRefund ? fileURLToPath(new URL('../', import.meta.url)) : process.cwd();
const readSource = (path, options) => readFile(resolve(sourceRoot, path), options);
// Guarded features have an owner-reviewed companion, outside automated maintenance.
const ownerCompanions = [
  '0164_customer_cod_confirmation', '0165_delivery_failure_reasons',
  '0166_seller_staff_notes', '0167_cancellation_cause',
  '0168_packed_parcel_weight', '0169_occasion_discovery',
  '0170_occasion_images', '0171_delivery_partners', '0172_ncm_api',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function ownerNamedChecks(sql) {
  const tokens = schemaTokens(sql);
  const checks = {};
  const keyword = index => tokens[index]?.kind === 'word' && !tokens[index].quoted
    ? tokens[index].value.toUpperCase() : undefined;
  let table;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === 'symbol' && tokens[i].value === ';') table = undefined;
    if (['CREATE', 'ALTER'].includes(keyword(i)) && keyword(i + 1) === 'TABLE') {
      const at = keyword(i + 2) === 'IF' ? i + 5 : i + 2;
      table = tokens[at]?.kind === 'word' ? tokens[at].value : undefined;
    }
    if (keyword(i) !== 'CONSTRAINT' || keyword(i + 2) !== 'CHECK') continue;
    const name = tokens[i + 1];
    const open = tokens[i + 3];
    if (!table || name?.kind !== 'word' || open?.value !== '(') throw new Error('Unsupported owner CHECK definition');
    let depth = 1;
    let end = i + 4;
    while (end < tokens.length && depth > 0) {
      const token = tokens[end++];
      if (token.kind === 'symbol' && token.value === '(') depth++;
      if (token.kind === 'symbol' && token.value === ')') depth--;
    }
    if (depth) throw new Error('Unclosed owner CHECK ' + name.value);
    const key = table + '.' + name.value;
    if (Object.hasOwn(checks, key)) throw new Error('Duplicate owner CHECK ' + key);
    checks[key] = sql.slice(open.end, tokens[end - 1].start).trim();
    i = end - 1;
  }
  return checks;
}
const ownerAppliedMigrations = await Promise.all(ownerCompanions.map(async companion => {
  const path = 'deployment/babal/mariadb-' + companion.slice(5).replaceAll('_', '-') + '.sql';
  const d1Path = 'drizzle/' + companion + '.sql';
  const [source, d1Source] = await Promise.all([readSource(path), readSource(d1Path)]);
  const sql = source.toString('utf8');
  const requiredTables = Object.fromEntries(extractCreateTables(sql).map(
    table => [table.name, table.columns.map(column => column.name)],
  ));
  for (const [, table, changes] of sql.matchAll(/ALTER TABLE\s+`?(\w+)`?\s+([\s\S]*?);/gi)) {
    for (const [, column] of changes.matchAll(/\bADD COLUMN(?: IF NOT EXISTS)?\s+`?(\w+)`?/gi)) {
      (requiredTables[table] ??= []).push(column);
    }
  }
  const requiredTriggerShapes = {};
  const requiredExactTriggerDefinitions = {};
  for (const trigger of extractTriggerEvents(sql)) {
    if (trigger.action === 'DROP') {
      delete requiredTriggerShapes[trigger.name];
      delete requiredExactTriggerDefinitions[trigger.name];
      continue;
    }
    const shape = /^CREATE(?: OR REPLACE)? TRIGGER (?:IF NOT EXISTS )?`?\w+`?\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\s+ON\s+`?(\w+)`?\s+FOR\s+EACH\s+ROW\s+(BEGIN\b[\s\S]*?\bEND)\$\$[ \t]*\r?\n[ \t]*DELIMITER[ \t]+;/i.exec(sql.slice(trigger.start));
    if (!shape) throw new Error('Unsupported owner trigger definition in ' + path);
    requiredExactTriggerDefinitions[trigger.name] = shape[4];
    requiredTriggerShapes[trigger.name] = { timing: shape[1].toUpperCase(), event: shape[2].toUpperCase(), table: shape[3] };
  }
  return {
    path, sha256: sha256(source), usage: 'owner-applied',
    d1: { path: d1Path, sha256: sha256(d1Source) },
    requiresWriterPause: companion === '0164_customer_cod_confirmation',
    requiredTables, requiredChecks: ownerNamedChecks(sql), requiredTriggerShapes, requiredExactTriggerDefinitions,
  };
}));
if (options['refresh-owner-inventory']) {
  if (tokens.length !== 1) throw new Error('--refresh-owner-inventory updates only the historical manifest and takes no other options.');
  const path = 'deployment/babal/release-manifest.json';
  const historical = JSON.parse(await readSource(path, 'utf8'));
  historical.ownerAppliedMigrations = ownerAppliedMigrations;
  await writeFile(path, JSON.stringify(historical, null, 2) + '\n');
  process.exit(0);
}
if (assetRoot && explicitOutput) throw new Error('--asset-root requires a new directory and cannot be combined with --output.');
if (includeOrderRefund && (!explicitSchemaInput || !(assetRoot || explicitOutput))) {
  throw new Error('--include-order-refund-migrations requires --schema-input and --asset-root or --output for new scratch output.');
}
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
  // Complete-version companions follow the reviewed full-schema append order.
  // Inclusion is discovery for an explicitly reviewed cutover, not automatic replay.
  'mariadb-complete-version-foundation.sql',
  'mariadb-review-task-ownership.sql',
  'mariadb-core-form-receipt-retention.sql',
  'mariadb-document-review-history.sql',
  'mariadb-protected-change-holds.sql',
  'mariadb-public-profile-revisions.sql',
  'mariadb-seller-review-sources.sql',
  'mariadb-company-payment-accounts.sql',
  'mariadb-category-contracts-intake.sql',
  'mariadb-product-sellable-offers.sql',
  'mariadb-common-fee-policies.sql',
  'mariadb-private-price-guidance.sql',
  'mariadb-product-intake-workspace.sql',
  'mariadb-product-publication-versions.sql',
  'mariadb-product-availability.sql',
  'mariadb-product-legacy-observations.sql',
  'mariadb-product-priority-concerns.sql',
  'mariadb-cart-selected-offers.sql',
  'mariadb-manual-payment-allocations.sql',
  'mariadb-order-response-scope.sql',
  'mariadb-cancellation-scope-holds.sql',
  'mariadb-return-received-evidence.sql',
  'mariadb-return-physical-handling.sql',
  'mariadb-aftercare-followups.sql',
  'mariadb-refund-obligations.sql',
  'mariadb-refund-execution-sources.sql',
  'mariadb-original-delivery-allocations.sql',
  'mariadb-lawful-fee-refund-authorizations.sql',
  'mariadb-private-finance-evidence.sql',
  'mariadb-original-refund-cost-allocations.sql',
  'mariadb-refund-original-deadlines.sql',
  'mariadb-cancellation-refund-sources.sql',
  'mariadb-cancelled-delivery-allocations.sql',
  'mariadb-payout-request-policy.sql',
  'mariadb-payout-transfer-packets.sql',
  'mariadb-managed-actual-execution.sql',
  'mariadb-seller-recovery-cases.sql',
  'mariadb-seller-recovery-allocations.sql',
  'mariadb-seller-recovery-agreements.sql',
  'mariadb-recovery-model-settlements.sql',
  'mariadb-recovery-model-netting.sql',
  'mariadb-recovery-contact-clocks.sql',
  'mariadb-recovery-repayment-claims.sql',
  'mariadb-recovery-liability-corrections.sql',
  'mariadb-recovery-response-cycles.sql',
  'mariadb-recovery-historical-attributions.sql',
  'mariadb-recovery-source-reviews.sql',
  'mariadb-recovery-unpaid-sources.sql',
  'mariadb-recovery-payout-retirements.sql',
  'mariadb-recovery-unpaid-corrections.sql',
  'mariadb-recovery-carrier-reimbursements.sql',
  'mariadb-recovery-partial-sources.sql',
  'mariadb-recovery-calculation-reviews.sql',
  'mariadb-recovery-payout-returns.sql',
  'mariadb-recovery-carrier-unpaid.sql',
  'mariadb-recovery-history-chronology.sql',
  'mariadb-recovery-company-history.sql',
  'mariadb-recovery-fixed-original.sql',
  'mariadb-recovery-partial-paid.sql',
  'mariadb-recovery-receipt-dispositions.sql',
  'mariadb-customer-refund-reversals.sql',
  'mariadb-recovery-repayment-attributions.sql',
  'mariadb-receipt-return-bank-losses.sql',
  'mariadb-receipt-return-bank-satisfactions.sql',
  'mariadb-funding-bank-reversal-freshness.sql',
  'mariadb-managed-live-activation.sql',
  'mariadb-managed-live-financial.sql',
  'mariadb-durable-email-delivery.sql',
  'mariadb-email-service-health.sql',
  'mariadb-team-governance.sql',
  'mariadb-incident-governance.sql',
  'mariadb-form-health-records.sql',
  'mariadb-notification-runtime-compatibility.sql',
  'mariadb-review-task-system-ownership.sql',
  'mariadb-complete-version-legacy-transitions.sql',
  'mariadb-native-public-feedback-defaults.sql',
  'mariadb-product-orderable-price-history.sql',
  'mariadb-native-form-health.sql',
  'mariadb-bootstrap-prerequisites.sql',
  'mariadb-bootstrap-completion.sql',
  'mariadb-fresh-bootstrap-defaults.sql',
  'mariadb-check-parity.sql',
  'mariadb-text-length-parity.sql',
  'mariadb-native-order-stock-governance.sql',
];
const schemaBytes = await readFile(explicitSchemaInput || 'deployment/babal/mariadb-schema.sql');
const schemaSql = schemaBytes.toString('utf8');
const schemaTables = extractCreateTables(schemaSql);
if (!includeOrderRefund && schemaTables.some(({ name }) => name.toLowerCase() === 'order_item_pricing_snapshots')) {
  throw new Error('The selected order and refund schema requires --include-order-refund-migrations.');
}
const scratchAssetSources = new Map();
let requiredViews;
let scratchOutput;
let selectedTextLengthContract;
if (includeOrderRefund) {
  const orderRefund = await import('../lib/operations/order-refund-maria-migrations.mjs');
  scratchOutput = await orderRefund.resolveOrderRefundScratchOutput(sourceRoot, assetRoot ?? explicitOutput);
  const sources = await orderRefund.readOrderRefundMariaMigrations(sourceRoot);
  const checkedPredecessors = ['mariadb-text-length-parity.sql', 'mariadb-native-order-stock-governance.sql'];
  for (const name of checkedPredecessors) {
    scratchAssetSources.set(name, await readSource('deployment/babal/' + name));
  }
  selectedTextLengthContract = JSON.parse(await readSource('lib/operations/text-length-parity-contract.json', 'utf8'));
  orderRefund.verifyOrderRefundMariaSchema(schemaSql, selectedTextLengthContract.prefixSha256, [...scratchAssetSources.values()], sources.suffix);
  for (const [name, bytes] of sources.assets) {
    migrationNames.push(name);
    scratchAssetSources.set(name, bytes);
  }
  requiredViews = sources.requiredViews;
}
const bundleRoot = assetRoot && (scratchOutput ?? resolve(assetRoot));
if (bundleRoot) await mkdir(bundleRoot); // Never overwrite a previously selected bundle.
const guestShapeBody = "BEGIN IF NOT (NEW.recipient_user_id IS NOT NULL OR (BINARY NEW.audience_role=BINARY 'customer' AND BINARY NEW.channel=BINARY 'email' AND NEW.guest_email IS NOT NULL AND NEW.guest_order_id IS NOT NULL AND NEW.business_event_key IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notification_recipient_shape'; END IF; END";
const guestShapeTriggers = {
  notification_recipient_shape_insert: 'INSERT',
  notification_recipient_shape_update: 'UPDATE',
};
const selectedGuestShapeProofs = new Set();
const tables = {},
  triggers = {},
  migrations = [];
for (const name of migrationNames) {
  const path = 'deployment/babal/' + name;
  const bytes = name === 'mariadb-schema.sql' ? schemaBytes : scratchAssetSources.get(name) ?? await readSource(path);
  const sql = bytes.toString('utf8');
  if (bundleRoot) {
    const destination = resolve(bundleRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
  }
  migrations.push({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    usage:
      name === 'mariadb-schema.sql' || name === 'mariadb-fresh-bootstrap-defaults.sql'
        ? 'empty-database-only'
        : 'additive-maintenance',
  });
  for (const table of name === 'mariadb-schema.sql' ? schemaTables : extractCreateTables(sql)) {
    tables[table.name] = [
      ...new Set([...(tables[table.name] ?? []), ...table.columns.map(column=>column.name)]),
    ].sort((a, b) => a.localeCompare(b));
  }
  for (const alter of sql.matchAll(/ALTER TABLE\s+`?(\w+)`?\s+([\s\S]*?);/gi)) {
    for (const column of alter[2].matchAll(/\bADD COLUMN(?: IF NOT EXISTS)?\s+`?(\w+)`?/gi)) {
      tables[alter[1]] = [...new Set([...(tables[alter[1]] ?? []), column[1]])].sort((a,b) => a.localeCompare(b));
    }
  }
  for (const {action,name:triggerName,start} of extractTriggerEvents(sql)) {
    if(action==='CREATE') triggers[triggerName] = [];
    else delete triggers[triggerName];
    if (name !== 'mariadb-schema.sql' || !explicitSchemaInput || !Object.hasOwn(guestShapeTriggers, triggerName)) continue;
    selectedGuestShapeProofs.delete(triggerName);
    if (action !== 'CREATE') continue;
    // The reviewed native companion uses one complete CREATE per Maria CLI delimiter block.
    const delimiterOpen = /(?:^|\r?\n)[ \t]*DELIMITER[ \t]+\$\$[ \t]*\r?\n[ \t]*$/i;
    const statement = /^([^\r\n]+)\$\$[ \t]*\r?\n[ \t]*DELIMITER[ \t]+;[ \t]*(?:\r?\n|$)/i.exec(sql.slice(start));
    const event = guestShapeTriggers[triggerName];
    const expected = `CREATE OR REPLACE TRIGGER ${triggerName} BEFORE ${event} ON notification_messages FOR EACH ROW ${guestShapeBody}`;
    if (statement && delimiterOpen.test(sql.slice(0, start)) && sameFeeSqlDefinition(statement[1], expected)) {
      selectedGuestShapeProofs.add(triggerName);
    }
  }
}
// Readiness enumerates relation columns for tables and views alike.
Object.assign(tables, requiredViews);
// The guarded completion uses prepared DDL, which a structural SQL inventory
// deliberately does not mistake for executable CREATE statements in literals.
const completionContract=JSON.parse(await readSource('lib/operations/bootstrap-completion-contract.json','utf8'));
for(const trigger of completionContract.reference.triggers)triggers[trigger.name]=[];
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
const selectedGuestShapeDefinitions = {};
if (selectedGuestShapeProofs.size === Object.keys(guestShapeTriggers).length) {
  for (const [name, event] of Object.entries(guestShapeTriggers)) {
    triggers[name] = ['signal sqlstate', '45000', 'notification_recipient_shape'];
    requiredTriggerShapes[name] = { table: 'notification_messages', event, timing: 'BEFORE' };
    selectedGuestShapeDefinitions[name] = guestShapeBody;
  }
}
triggers.native_form_command_provenance_retained=['old.command_key is not null','hex(new.id)','hex(old.id)','hex(new.next_json)','hex(old.next_json)','<=>','signal sqlstate','45000','native_form_command_provenance_retained'];
requiredTriggerShapes.native_form_command_provenance_retained={table:'audit_logs',event:'UPDATE',timing:'BEFORE'};
const nativeHealthTriggerDefinition="BEGIN IF OLD.command_key IS NOT NULL AND (NOT (HEX(NEW.id) <=> HEX(OLD.id)) OR NOT (HEX(NEW.next_json) <=> HEX(OLD.next_json))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_command_provenance_retained'; END IF; END";
for (const [name,event] of [['orderable_price_observation_immutable','UPDATE'],['orderable_price_observation_retained','DELETE']]) {
  triggers[name]=['signal sqlstate','45000',name];
  requiredTriggerShapes[name]={table:'product_orderable_price_observations',event,timing:'BEFORE'};
}
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
  ...Object.fromEntries([
    ['product','product_id','products'],['seller','seller_id','seller_profiles'],
    ['offer','offer_id','product_offer_identities'],['offer_version','offer_version_id','product_offer_versions'],
    ['public_version','public_version_id','product_publication_candidates'],['publication','publication_id','product_publication_decisions'],
    ['actor','actor_id','users'],
  ].map(([name,column,parent])=>['product_orderable_price_observations.orderable_price_'+name+'_fk',{columns:[column],referencedTable:parent,referencedColumns:['id']}])),
  'marketplace_fee_waiver_revisions.fee_revision_campaign_fk': { columns: ['campaign_id'], referencedTable: 'marketplace_fee_waiver_campaigns', referencedColumns: ['id'] },
  'marketplace_fee_waiver_revisions.fee_revision_actor_fk': { columns: ['created_by'], referencedTable: 'users', referencedColumns: ['id'] },
  'marketplace_fee_waiver_requests.fee_request_actor_fk': { columns: ['actor_id'], referencedTable: 'users', referencedColumns: ['id'] },
  'order_item_marketplace_fees.fee_evidence_item_fk': { columns: ['order_item_id'], referencedTable: 'order_items', referencedColumns: ['id'] },
  'order_item_marketplace_fees.fee_evidence_revision_fk': { columns: ['campaign_id', 'campaign_revision'], referencedTable: 'marketplace_fee_waiver_revisions', referencedColumns: ['campaign_id', 'revision'] },
};
const priceHistoryExactChecks={
  'product_orderable_price_observations.orderable_price_positive':'selling_paisa > 0',
  'product_orderable_price_observations.orderable_price_currency':"HEX(currency) = '4E5052'",
  'product_orderable_price_observations.orderable_price_time':'observed_at >= 0',
  'product_price_reference_reviews.price_reference_evidence_kind_0155':"HEX(evidence_kind) IN ('686973746F726963616C5F6F72646572','65787465726E616C5F6F66666572','7265766965775F66696E64696E67','706C6174666F726D5F6F7264657261626C65')",
  'product_price_reference_reviews.price_reference_history_basis':"IF(HEX(evidence_kind)='706C6174666F726D5F6F7264657261626C65',history_basis IS NOT NULL AND CHAR_LENGTH(TRIM(history_basis))>=10,history_basis IS NULL)",
};
Object.assign(requiredExactChecks,priceHistoryExactChecks);
for(const[key,definition]of Object.entries(priceHistoryExactChecks))requiredChecks[key]=[definition.toLowerCase()];
const nativeHealthExactChecks={
  'form_health_observations.form_health_native_evidence_0156':"HEX(evidence_kind) IN ('72756E74696D65','666F726D5F616E737765725F736574','636F72655F72656365697074','6E61746976655F636F6D6D616E64')",
  'form_health_observations.form_health_native_save_0156':"IF(HEX(phase)='6C6F6164',HEX(outcome) IN ('636F6D70617469626C65','66616C6C6261636B','626C6F636B6564') AND HEX(evidence_kind)='72756E74696D65' AND evidence_id IS NULL,HEX(phase)='73617665' AND HEX(outcome)='7361766564' AND HEX(evidence_kind) IN ('666F726D5F616E737765725F736574','636F72655F72656365697074','6E61746976655F636F6D6D616E64') AND evidence_id IS NOT NULL)",
};
Object.assign(requiredExactChecks,nativeHealthExactChecks);
for(const[key,definition]of Object.entries(nativeHealthExactChecks))requiredChecks[key]=[definition.toLowerCase()];
const checkParityContract=JSON.parse(await readSource('lib/operations/check-parity-contract.json','utf8'));
for(const check of checkParityContract.checks){
 if(!check.nativeClause)throw new Error('CHECK parity lacks verified native metadata: '+check.name);
 requiredExactChecks[`${check.table}.${check.name}`]=check.nativeClause;
 requiredChecks[`${check.table}.${check.name}`]=[check.nativeClause.toLowerCase()];
}
for(const correction of checkParityContract.corrections){
 requiredExactChecks[`${correction.table}.${correction.name}`]=correction.afterClause;
 requiredChecks[`${correction.table}.${correction.name}`]=[correction.afterClause.toLowerCase()];
}
const textLengthContract=selectedTextLengthContract??JSON.parse(await readSource('lib/operations/text-length-parity-contract.json','utf8'));
if(textLengthContract.nativeCalibration?.checks!==textLengthContract.checks.length)throw new Error('Text length parity lacks complete native calibration');
for(const check of textLengthContract.checks){
 if(!check.nativeClause)throw new Error('Text length parity lacks calibrated native metadata: '+check.name);
 requiredExactChecks[`${check.table}.${check.name}`]=check.nativeClause;
 requiredChecks[`${check.table}.${check.name}`]=[check.nativeClause.toLowerCase()];
}
for (const [table, columns] of Object.entries(customerFeeRequiredTables)) {
  if (!columns.every(column => tables[table]?.includes(column))) throw new Error('Customer fee source is missing reviewed columns: ' + table);
}
// An unrecognized selected schema still needs the legacy runtime CHECK proof.
if (Object.keys(selectedGuestShapeDefinitions).length) {
  delete requiredChecks['notification_messages.chk_notification_guest_shape'];
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
  requiredExactTriggerDefinitions: { ...Object.fromEntries(Object.entries(customerFeeTriggerDefinitions).map(([name, shape]) => [name, shape.mariadb])), native_form_command_provenance_retained:nativeHealthTriggerDefinition, ...selectedGuestShapeDefinitions },
  requiredUniqueIndexes: {
    'seller_ledger_entries.idx_seller_ledger_refund_type_unique':['refund_id','type'],
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
  ...(ownerAppliedMigrations.length ? { ownerAppliedMigrations } : {}),
  requiredTables: tables,
  requiredTriggers: { ...triggers, ...Object.fromEntries(Object.entries(customerFeeTriggerDefinitions).map(([name, shape]) => [name, ['signal sqlstate', '45000', shape.mariadb.match(/MESSAGE_TEXT='([^']+)'/)[1]]])) },
};
await writeFile(
  bundleRoot ? resolve(bundleRoot, 'deployment/babal/release-manifest.json') : scratchOutput ?? explicitOutput ?? 'deployment/babal/release-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
  includeOrderRefund ? { flag: 'wx' } : undefined,
);
console.log(
  `Manifest: ${Object.keys(tables).length} tables, ${Object.keys(triggers).length} triggers, ${migrations.length} migrations.`,
);
