import {buildBootstrapPrerequisites} from '../lib/operations/bootstrap-prerequisites.mjs';
import {buildBootstrapCompletion} from '../lib/operations/bootstrap-completion.mjs';
import {buildFreshBootstrapDefaults} from '../lib/operations/fresh-bootstrap-defaults.mjs';
import {buildCheckParity} from '../lib/operations/check-parity.mjs';
import {buildTextLengthParity} from '../lib/operations/text-length-parity.mjs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { customerFeeMariaMigration, customerFeeRequiredTables } from '../lib/operations/fee-schema-readiness.mjs';
import {generatePublicFeedbackMariaSql} from '../lib/forms/public-feedback-schema.mjs';

const { values: options, tokens } = parseArgs({
  options: {
    'output-directory': { type: 'string' },
    'include-order-refund-migrations': { type: 'boolean' },
  },
  tokens: true,
});
if (tokens.some(({ kind }) => kind !== 'option')) throw new Error('Only named options are supported.');
if (new Set(tokens.map(({ name }) => name)).size !== tokens.length) throw new Error('Options may only be specified once.');
const { 'output-directory': explicitOutputDirectory, 'include-order-refund-migrations': includeOrderRefund } = options;
if (explicitOutputDirectory !== undefined && !explicitOutputDirectory.trim()) throw new Error('Option values must be nonempty.');
if (includeOrderRefund && !explicitOutputDirectory) {
  throw new Error('--include-order-refund-migrations requires --output-directory for a new scratch directory.');
}
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = resolve(projectRoot, 'drizzle/meta/0020_snapshot.json');
const orderRefund = includeOrderRefund ? await import('../lib/operations/order-refund-maria-migrations.mjs') : null;
const requestedOutputDirectory = resolve(projectRoot, explicitOutputDirectory || 'deployment/babal');
const schemaOutputDirectory = orderRefund
  ? await orderRefund.resolveOrderRefundScratchOutput(projectRoot, requestedOutputDirectory)
  : requestedOutputDirectory;
const outputPath = resolve(schemaOutputDirectory, 'mariadb-schema.sql');
const recoveryOutputPath = resolve(
  schemaOutputDirectory,
  'mariadb-reset-empty-import.sql',
);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const deliveryLocationsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-delivery-locations.sql'), 'utf8');
const singleSuperAdminSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-single-super-admin-approvals.sql'), 'utf8');
const checkoutContactVerificationSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-checkout-contact-verification.sql'),'utf8');
const firstCodReviewSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-first-cod-review.sql'), 'utf8');
const firstCodEvidenceGuardsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-first-cod-evidence-guards.sql'), 'utf8');
const parcelOperationsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-parcel-operations.sql'), 'utf8');
const staffPermissionsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-staff-permissions.sql'), 'utf8');
const verifiedRidersSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-verified-riders.sql'), 'utf8');
const sellerParticipationSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-seller-participation.sql'),
  'utf8',
);
const managedCommerceSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-managed-commerce.sql'),
  'utf8',
);
const productOriginEvidenceSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-origin-evidence.sql'), 'utf8');
const productStoryMaterialsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-product-story-materials.sql'),
  'utf8',
);
const checkoutRecipientSnapshotsSql = await readFile(
  resolve(
    projectRoot,
    'deployment/babal/mariadb-checkout-recipient-snapshots.sql',
  ),
  'utf8',
);
const sellerGovernanceSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-seller-governance.sql'),
  'utf8',
);
const sellerDraftsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-seller-application-drafts.sql'), 'utf8');
const sellerRegistrationSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-seller-registration.sql'), 'utf8');
const sellerIntakesSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-seller-registration-intakes.sql'), 'utf8');
const completeVersionFoundationSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-complete-version-foundation.sql'), 'utf8');
const reviewTaskOwnershipSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-review-task-ownership.sql'), 'utf8');
const coreFormReceiptSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-core-form-receipt-retention.sql'), 'utf8');
const documentReviewHistorySql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-document-review-history.sql'), 'utf8');
const protectedChangeHoldsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-protected-change-holds.sql'), 'utf8');
const publicProfileRevisionsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-public-profile-revisions.sql'), 'utf8');
const sellerReviewSourcesSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-seller-review-sources.sql'), 'utf8');
const companyPaymentAccountsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-company-payment-accounts.sql'), 'utf8');
const categoryContractsIntakeSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-category-contracts-intake.sql'), 'utf8');
const productSellableOffersSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-sellable-offers.sql'), 'utf8');
const commonFeePoliciesSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-common-fee-policies.sql'), 'utf8');
const privatePriceGuidanceSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-private-price-guidance.sql'), 'utf8');
const productIntakeWorkspaceSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-intake-workspace.sql'), 'utf8');
const refundObligationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-refund-obligations.sql'),'utf8');
const refundExecutionSourcesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-refund-execution-sources.sql'),'utf8');
const originalDeliveryAllocationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-original-delivery-allocations.sql'),'utf8');
const lawfulFeeRefundAuthorizationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-lawful-fee-refund-authorizations.sql'),'utf8');
const privateFinanceEvidenceSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-private-finance-evidence.sql'),'utf8');
const originalRefundCostAllocationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-original-refund-cost-allocations.sql'),'utf8');
const refundOriginalDeadlinesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-refund-original-deadlines.sql'),'utf8');
const cancellationRefundSourcesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-cancellation-refund-sources.sql'),'utf8');
const cancelledDeliveryAllocationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-cancelled-delivery-allocations.sql'),'utf8');
const payoutRequestPolicySql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-payout-request-policy.sql'),'utf8');
const payoutTransferPacketsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-payout-transfer-packets.sql'),'utf8');
const managedActualExecutionSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-managed-actual-execution.sql'),'utf8');
const sellerRecoveryCasesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-seller-recovery-cases.sql'),'utf8');
const sellerRecoveryAllocationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-seller-recovery-allocations.sql'),'utf8');
const sellerRecoveryAgreementsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-seller-recovery-agreements.sql'),'utf8');
const recoveryModelSettlementsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-model-settlements.sql'),'utf8');
const recoveryModelNettingSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-model-netting.sql'),'utf8');
const recoveryContactClocksSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-contact-clocks.sql'),'utf8');
const recoveryRepaymentClaimsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-repayment-claims.sql'),'utf8');
const recoveryLiabilityCorrectionsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-liability-corrections.sql'),'utf8');
const customerRefundReversalsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-customer-refund-reversals.sql'),'utf8');
const fundingBankReversalFreshnessSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-funding-bank-reversal-freshness.sql'),'utf8');
const managedLiveActivationSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-managed-live-activation.sql'),'utf8');
const managedLiveFinancialSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-managed-live-financial.sql'),'utf8');
const durableEmailDeliverySql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-durable-email-delivery.sql'),'utf8');
const emailServiceHealthSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-email-service-health.sql'),'utf8');
const teamGovernanceSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-team-governance.sql'),'utf8');
const reviewTaskSystemOwnershipSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-review-task-system-ownership.sql'),'utf8');
const legacyProtectedTransitionSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-complete-version-legacy-transitions.sql'),'utf8');
const nativePublicFeedbackDefaultsSql=generatePublicFeedbackMariaSql(await readFile(resolve(projectRoot,'drizzle/0154_native_public_feedback_defaults.sql'),'utf8'));
const productOrderablePriceHistorySql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-product-orderable-price-history.sql'),'utf8');
const nativeFormHealthSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-native-form-health.sql'),'utf8');
const incidentGovernanceSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-incident-governance.sql'),'utf8');
const formHealthRecordsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-form-health-records.sql'),'utf8');
const notificationRuntimeSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-notification-runtime-compatibility.sql'),'utf8');
const receiptReturnBankSatisfactionsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-receipt-return-bank-satisfactions.sql'),'utf8');
const receiptReturnBankLossesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-receipt-return-bank-losses.sql'),'utf8');
const recoveryRepaymentAttributionsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-repayment-attributions.sql'),'utf8');
const recoveryReceiptDispositionsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-receipt-dispositions.sql'),'utf8');
const recoveryPartialPaidSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-partial-paid.sql'),'utf8');
const recoveryFixedOriginalSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-fixed-original.sql'),'utf8');
const recoveryCompanyHistorySql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-company-history.sql'),'utf8');
const recoveryHistoryChronologySql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-history-chronology.sql'),'utf8');
const recoveryCarrierUnpaidSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-carrier-unpaid.sql'),'utf8');
const recoveryPayoutReturnSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-payout-returns.sql'),'utf8');
const recoveryCalculationSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-calculation-reviews.sql'),'utf8');
const recoveryPartialSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-partial-sources.sql'),'utf8');
const recoveryCarrierSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-carrier-reimbursements.sql'),'utf8');
const recoveryUnpaidCorrectionsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-unpaid-corrections.sql'),'utf8');
const recoveryPayoutRetirementsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-payout-retirements.sql'),'utf8');
const recoveryUnpaidSourcesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-unpaid-sources.sql'),'utf8');
const recoverySourceReviewsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-source-reviews.sql'),'utf8');
const recoveryHistoricalSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-historical-attributions.sql'),'utf8');
const recoveryResponseCyclesSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-recovery-response-cycles.sql'),'utf8');
const aftercareFollowupsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-aftercare-followups.sql'),'utf8');
const returnPhysicalHandlingSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-return-physical-handling.sql'),'utf8');
const returnReceivedEvidenceSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-return-received-evidence.sql'),'utf8');
const cancellationScopeHoldsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-cancellation-scope-holds.sql'),'utf8');
const orderResponseScopeSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-order-response-scope.sql'),'utf8');
const manualPaymentAllocationsSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-manual-payment-allocations.sql'),'utf8');
const cartSelectedOffersSql=await readFile(resolve(projectRoot,'deployment/babal/mariadb-cart-selected-offers.sql'),'utf8');
const productPriorityConcernsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-priority-concerns.sql'), 'utf8');
const productLegacyObservationsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-legacy-observations.sql'), 'utf8');
const productAvailabilitySql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-availability.sql'), 'utf8');
const productPublicationVersionsSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-product-publication-versions.sql'), 'utf8');
const firstPartyAnalyticsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-first-party-analytics.sql'),
  'utf8',
);
const invoiceAdjustmentsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-invoice-adjustments.sql'),
  'utf8',
);
const riderOpenBoxFinanceSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-rider-open-box-finance.sql'),
  'utf8',
);
const recentlyViewedSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-recently-viewed.sql'),
  'utf8',
);
const managedMakerIdentitySql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-managed-maker-identity.sql'), 'utf8');
const commissionWorkspaceSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-commission-workspace.sql'), 'utf8');
const commissionContinuitySql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-commission-continuity.sql'), 'utf8');
const makerReadinessSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-company-store-maker-readiness.sql'), 'utf8');
const loyaltyScheduledSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-loyalty-scheduled-changes.sql'), 'utf8');
const feeWaiversSql = await readFile(resolve(projectRoot, 'deployment/babal/mariadb-marketplace-fee-waivers.sql'), 'utf8');
const customerFeeWaiversSql = await readFile(resolve(projectRoot, 'deployment/babal', customerFeeMariaMigration), 'utf8');
const customerFeeTables = [...customerFeeWaiversSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(match => match[1]);
if (JSON.stringify(customerFeeTables) !== JSON.stringify(Object.keys(customerFeeRequiredTables))) throw new Error('Customer fee schema registry differs from the reviewed contract');
const managedFixedSupplySql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-managed-fixed-supply.sql'),
  'utf8',
);
const formCatalogSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-form-catalog.sql'),
  'utf8',
);
const categoryImagesSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-category-images.sql'),
  'utf8',
);
const dataRightsLegalHoldsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-data-rights-legal-holds.sql'),
  'utf8',
);
const addressAnswerOwnerTombstonesSql = await readFile(
  resolve(
    projectRoot,
    'deployment/babal/mariadb-address-answer-owner-tombstones.sql',
  ),
  'utf8',
);
const feedbackDeliveryJobsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-feedback-delivery-jobs.sql'),
  'utf8',
);

// Promo-only legacy columns needed by the frozen 0020 base. Canonical definitions remain in maintenance files.
const promoPrerequisiteColumns = {
  'mariadb-referrals-wallet.sql': [
    'orders.wallet_credit_paisa',
    'orders.referral_discount_paisa',
    'refunds.wallet_credit_paisa',
    'refunds.referral_discount_paisa',
    'refunds.credit_base_paisa',
  ],
  'mariadb-partial-cancellation.sql': [
    'orders.current_total_paisa',
    'orders.current_subtotal_paisa',
    'orders.current_delivery_paisa',
    'orders.current_wallet_paisa',
    'orders.current_discount_paisa',
  ],
  'mariadb-policy-commission-9-percent.sql': [
    'order_items.platform_discount_paisa',
    'refunds.commission_base_refunded_paisa',
    'refunds.commission_reversal_paisa',
  ],
};
const promoPrerequisites = [];
for (const [file, columns] of Object.entries(promoPrerequisiteColumns)) {
  const canonical = await readFile(
    resolve(projectRoot, 'deployment/babal', file),
    'utf8',
  );
  const statements = [
    ...canonical.matchAll(
      /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+[^;]+;/gi,
    ),
  ];
  for (const column of columns) {
    const matches = statements.filter(
      (match) => `${match[1]}.${match[2]}` === column,
    );
    if (matches.length !== 1)
      throw new Error(
        `Expected exactly one canonical promo prerequisite: ${file}:${column}`,
      );
    promoPrerequisites.push(matches[0][0]);
  }
}
const promoCodesSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-promo-codes.sql'),
  'utf8',
);

// Loyalty requires the actual wallet/gift parent tables and their existing financial posting guards.
// Keep this prerequisite extraction narrow; unrelated frozen-bootstrap gaps remain Task12.
const walletParentSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-referrals-wallet.sql'),
  'utf8',
);
const giftCardsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-gift-cards.sql'),
  'utf8',
);
const partialCancellationSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-partial-cancellation.sql'),
  'utf8',
);
function requiredParentTable(name) {
  const match = walletParentSql.match(
    new RegExp(
      'CREATE TABLE IF NOT EXISTS ' +
        name +
        String.raw` \([\s\S]+?ENGINE=InnoDB[^;]+;`,
    ),
  );
  if (!match)
    throw new Error('Missing canonical loyalty parent table: ' + name);
  return match[0];
}
function requiredParentTrigger(source, name) {
  const match = source.match(
    new RegExp(
      'DROP TRIGGER IF EXISTS ' + name + String.raw`;[\s\S]+?DELIMITER ;`,
    ),
  );
  if (!match)
    throw new Error('Missing canonical loyalty parent trigger: ' + name);
  return match[0];
}
const loyaltyParents = [
  requiredParentTable('wallet_accounts'),
  requiredParentTable('wallet_entries'),
  'CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id,created_at);',
  giftCardsSql.trim(),
  ...[
    'wallet_entry_balance',
    'wallet_entry_no_update',
    'wallet_entry_no_delete',
    'wallet_refund_restore',
  ].map((name) => requiredParentTrigger(walletParentSql, name)),
  requiredParentTrigger(partialCancellationSql, 'wallet_cancel_restore'),
];
const loyaltyPointsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-loyalty-points.sql'),
  'utf8',
);

const quote = (value) => `\`${String(value).replaceAll('`', '``')}\``;

function identifier(value) {
  if (value.length <= 64) return value;
  const suffix = createHash('sha256').update(value).digest('hex').slice(0, 10);
  return `${value.slice(0, 53)}_${suffix}`;
}

function indexedTextColumns(table) {
  const names = new Set();
  for (const column of Object.values(table.columns)) {
    if (column.primaryKey) names.add(column.name);
  }
  for (const index of Object.values(table.indexes ?? {})) {
    for (const column of index.columns) names.add(column);
  }
  for (const key of Object.values(table.foreignKeys ?? {})) {
    for (const column of key.columnsFrom) names.add(column);
    for (const column of key.columnsTo) names.add(column);
  }
  for (const key of Object.values(table.compositePrimaryKeys ?? {})) {
    for (const column of key.columns) names.add(column);
  }
  return names;
}

function columnType(column, compactText) {
  if (column.type === 'integer') return 'BIGINT';
  if (column.type === 'text') {
    if (compactText.has(column.name)) return 'VARCHAR(191)';
    return 'LONGTEXT';
  }
  throw new Error(`Unsupported SQLite column type: ${column.type}`);
}

function defaultSql(value) {
  if (value === undefined) return '';
  if (value === true) return ' DEFAULT 1';
  if (value === false) return ' DEFAULT 0';
  return ` DEFAULT ${value}`;
}

function checkExpression(tableName, expression) {
  return expression.replace(
    new RegExp(`"${tableName}"\\."([^"]+)"`, 'g'),
    (_, column) => quote(column),
  );
}

function checkConflictsWithForeignKeyAction(table, check) {
  return Object.values(table.foreignKeys ?? {}).some((key) => {
    const changesColumn =
      key.onDelete === 'set null' ||
      key.onDelete === 'cascade' ||
      key.onUpdate === 'set null' ||
      key.onUpdate === 'cascade';
    return (
      changesColumn &&
      key.columnsFrom.some((column) => check.value.includes(`"${column}"`))
    );
  });
}

function generatedColumns(tableName) {
  if (tableName === 'staff_invitations') {
    return [
      "`pending_email_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `status` = 'pending' THEN `email` ELSE NULL END) STORED",
    ];
  }
  if (tableName === 'payout_entries') {
    return [
      '`active_ledger_entry_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `released_at` IS NULL THEN `ledger_entry_id` ELSE NULL END) STORED',
    ];
  }
  if (tableName === 'seller_ledger_entries') {
    const active =
      "`order_item_id` IS NOT NULL AND `type` IN ('sale', 'commission', 'reserve_hold', 'reserve_release')";
    return [
      `\`active_order_item_key\` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN ${active} THEN \`order_item_id\` ELSE NULL END) STORED`,
      `\`active_order_item_type\` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN ${active} THEN \`type\` ELSE NULL END) STORED`,
    ];
  }
  return [];
}

function generatedIndexes(tableName) {
  if (tableName === 'staff_invitations') {
    return [
      'UNIQUE KEY `idx_staff_invitations_pending_email_unique` (`pending_email_key`)',
    ];
  }
  if (tableName === 'payout_entries') {
    return [
      'UNIQUE KEY `idx_payout_entries_active_ledger_unique` (`active_ledger_entry_key`)',
    ];
  }
  if (tableName === 'seller_ledger_entries') {
    return [
      'UNIQUE KEY `idx_seller_ledger_order_item_type_unique` (`active_order_item_key`, `active_order_item_type`)',
    ];
  }
  return [];
}

const output = [
  '-- Hatsabazaar production schema for MariaDB 10.11+',
  '-- Generated from drizzle/meta/0020_snapshot.json. Import into an empty database.',
  'SET NAMES utf8mb4;',
  "SET time_zone = '+00:00';",
  'SET FOREIGN_KEY_CHECKS = 0;',
  '',
];
const foreignKeys = [];

for (const [tableName, table] of Object.entries(snapshot.tables)) {
  const compactText = indexedTextColumns(table);
  const definitions = [];
  for (const column of Object.values(table.columns)) {
    definitions.push(
      [
        quote(column.name),
        columnType(column, compactText),
        column.notNull ? 'NOT NULL' : 'NULL',
        defaultSql(column.default).trim(),
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  definitions.push(...generatedColumns(tableName));

  const primaryColumns = Object.values(table.columns)
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
  if (primaryColumns.length > 0) {
    definitions.push(`PRIMARY KEY (${primaryColumns.map(quote).join(', ')})`);
  }
  for (const key of Object.values(table.compositePrimaryKeys ?? {})) {
    definitions.push(`PRIMARY KEY (${key.columns.map(quote).join(', ')})`);
  }
  for (const index of Object.values(table.indexes ?? {})) {
    if (index.where) continue;
    definitions.push(
      `${index.isUnique ? 'UNIQUE ' : ''}KEY ${quote(index.name)} (${index.columns.map(quote).join(', ')})`,
    );
  }
  definitions.push(...generatedIndexes(tableName));
  for (const check of Object.values(table.checkConstraints ?? {})) {
    if (['payouts_maker_checker','refunds_high_value_maker_checker','promotions_maker_checker'].includes(check.name)) continue;
    if (checkConflictsWithForeignKeyAction(table, check)) {
      output.push(
        `-- ${check.name} is enforced by application transactions because MariaDB 10.11 rejects CHECK columns changed by SET NULL/CASCADE foreign-key actions.`,
      );
      continue;
    }
    definitions.push(
      `CONSTRAINT ${quote(check.name)} CHECK (${checkExpression(tableName, check.value)})`,
    );
  }

  output.push(
    `CREATE TABLE IF NOT EXISTS ${quote(tableName)} (`,
    definitions.map((definition) => `  ${definition}`).join(',\n'),
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
  );

  for (const key of Object.values(table.foreignKeys ?? {})) {
    foreignKeys.push(
      `ALTER TABLE ${quote(key.tableFrom)} ADD CONSTRAINT ${quote(identifier(key.name))} FOREIGN KEY (${key.columnsFrom.map(quote).join(', ')}) REFERENCES ${quote(key.tableTo)} (${key.columnsTo.map(quote).join(', ')}) ON DELETE ${key.onDelete.toUpperCase()} ON UPDATE ${key.onUpdate.toUpperCase()};`,
    );
  }
}

output.push(
  '-- Versioned business configuration. Values are validated by the typed application registry.',
  'CREATE TABLE IF NOT EXISTS `business_setting_versions` (',
  '  `id` VARCHAR(191) NOT NULL,',
  '  `setting_key` VARCHAR(191) NOT NULL,',
  '  `version` BIGINT NOT NULL,',
  '  `value_json` LONGTEXT NOT NULL,',
  "  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',",
  '  `revision` BIGINT NOT NULL DEFAULT 1,',
  '  `change_control` VARCHAR(32) NOT NULL,',
  '  `effective_from` BIGINT NULL,',
  '  `effective_until` BIGINT NULL,',
  '  `reason` LONGTEXT NOT NULL,',
  '  `created_by` VARCHAR(191) NOT NULL,',
  '  `created_at` BIGINT NOT NULL,',
  '  `submitted_by` VARCHAR(191) NULL,',
  '  `submitted_at` BIGINT NULL,',
  '  `approved_by` VARCHAR(191) NULL,',
  '  `approved_at` BIGINT NULL,',
  '  `published_by` VARCHAR(191) NULL,',
  '  `published_at` BIGINT NULL,',
  '  `decision_note` LONGTEXT NULL,',
  '  `supersedes_id` VARCHAR(191) NULL,',
  '  `last_request_id` VARCHAR(191) NOT NULL,',
  '  PRIMARY KEY (`id`),',
  '  UNIQUE KEY `idx_business_setting_versions_key_version` (`setting_key`, `version`),',
  '  UNIQUE KEY `idx_business_setting_versions_request` (`last_request_id`),',
  '  KEY `idx_business_setting_versions_effective` (`setting_key`, `status`, `effective_from`, `effective_until`),',
  '  KEY `idx_business_setting_versions_review` (`status`, `created_at`),',
  "  CONSTRAINT `business_setting_versions_status` CHECK (`status` IN ('draft', 'pending_approval', 'published', 'rejected', 'cancelled')),",
  '  CONSTRAINT `business_setting_versions_revision` CHECK (`revision` >= 1),',
  "  CONSTRAINT `business_setting_versions_control` CHECK (`change_control` IN ('simple', 'controlled')),",
  '  CONSTRAINT `business_setting_versions_interval` CHECK (`effective_until` IS NULL OR (`effective_from` IS NOT NULL AND `effective_until` > `effective_from`)),',
  '  CONSTRAINT `business_setting_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_published_by_users_id_fk` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_supersedes_id_fk` FOREIGN KEY (`supersedes_id`) REFERENCES `business_setting_versions` (`id`) ON DELETE RESTRICT',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  'CREATE TABLE IF NOT EXISTS `business_setting_guards` (',
  '  `id` VARCHAR(191) NOT NULL,',
  '  `valid` BIGINT NOT NULL,',
  '  PRIMARY KEY (`id`),',
  '  CONSTRAINT `business_setting_guards_valid` CHECK (`valid` = 1)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  // Canonical delivery tables are required before the first-COD lifecycle guards.
  // Existing nullable registration prerequisites must precede dependent identity triggers.
  sellerRegistrationSql.trim(),
  '',
  deliveryLocationsSql.trim(),
  '',
  sellerParticipationSql.trim(),
  '',
  managedCommerceSql.trim(),
  '',
  productStoryMaterialsSql.trim(),
  productOriginEvidenceSql.trim(),
  '',
  checkoutRecipientSnapshotsSql.trim(),
  '',
  sellerGovernanceSql.trim(),
  '',
  firstPartyAnalyticsSql.trim(),
  '',
  invoiceAdjustmentsSql.trim(),
  '',
  parcelOperationsSql.trim(),
  staffPermissionsSql.trim(),
  verifiedRidersSql.trim(),
  riderOpenBoxFinanceSql.trim(),
  '',
  recentlyViewedSql.trim(),
  '',
  managedFixedSupplySql.trim(),
  managedMakerIdentitySql.trim(),
  commissionWorkspaceSql.trim(),
  '',
  formCatalogSql.trim(),
  categoryImagesSql.trim(),
  dataRightsLegalHoldsSql.trim(),
  addressAnswerOwnerTombstonesSql.trim(),
  feedbackDeliveryJobsSql.trim(),
  '',
  '-- Legacy column prerequisites for promo DDL only; not full financial bootstrap repair.',
  ...promoPrerequisites,
  ...loyaltyParents,
  promoCodesSql.trim(),
  loyaltyPointsSql.trim(),
  makerReadinessSql.trim(),
  loyaltyScheduledSql.trim(),
  feeWaiversSql.trim(),
  customerFeeWaiversSql.trim(),
  commissionContinuitySql.trim(),
  '',
  '-- Babal.Host password authentication and server-side sessions.',
  'CREATE TABLE IF NOT EXISTS `user_credentials` (',
  '  `user_id` VARCHAR(191) NOT NULL,',
  '  `password_hash` VARCHAR(191) NOT NULL,',
  '  `password_salt` VARCHAR(191) NOT NULL,',
  '  `password_version` BIGINT NOT NULL DEFAULT 1,',
  '  `created_at` BIGINT NOT NULL,',
  '  `updated_at` BIGINT NOT NULL,',
  '  PRIMARY KEY (`user_id`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  'CREATE TABLE IF NOT EXISTS `user_sessions` (',
  '  `token_hash` VARCHAR(64) NOT NULL,',
  '  `user_id` VARCHAR(191) NOT NULL,',
  '  `expires_at` BIGINT NOT NULL,',
  '  `created_at` BIGINT NOT NULL,',
  '  `last_seen_at` BIGINT NOT NULL,',
  '  PRIMARY KEY (`token_hash`),',
  '  KEY `idx_user_sessions_user` (`user_id`),',
  '  KEY `idx_user_sessions_expiry` (`expires_at`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  'CREATE TABLE IF NOT EXISTS `email_login_challenges` (',
  '  `token_hash` VARCHAR(64) NOT NULL,',
  '  `code_hash` VARCHAR(64) NOT NULL,',
  '  `user_id` VARCHAR(191) NOT NULL,',
  '  `attempts` BIGINT NOT NULL DEFAULT 0,',
  '  `expires_at` BIGINT NOT NULL,',
  '  `created_at` BIGINT NOT NULL,',
  '  `consumed_at` BIGINT NULL,',
  '  PRIMARY KEY (`token_hash`),',
  '  KEY `idx_email_login_challenges_user_created` (`user_id`, `created_at`),',
  '  KEY `idx_email_login_challenges_expiry` (`expires_at`),',
  '  CONSTRAINT `email_login_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  '-- Foreign keys are added after every table exists to support circular references.',
  ...foreignKeys,
  'ALTER TABLE `user_credentials` ADD CONSTRAINT `user_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;',
  'ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;',
  '',
  '-- Production-safe discovery taxonomy. No sample users, sellers, or products are inserted.',
  `INSERT IGNORE INTO \`categories\` (\`id\`, \`parent_id\`, \`slug\`, \`name_en\`, \`name_ne\`, \`is_active\`, \`sort_order\`, \`created_at\`, \`updated_at\`) VALUES
  ('cat-gifts', NULL, 'gifts', 'Gifts', 'उपहार', 1, 10, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-home-decor', NULL, 'home-decor', 'Home decor', 'गृह सजावट', 1, 20, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-jewelry-accessories', NULL, 'jewelry-accessories', 'Jewelry & accessories', 'गहना तथा सहायक सामग्री', 1, 30, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-traditional-textiles', NULL, 'traditional-textiles', 'Traditional textiles', 'परम्परागत कपडा', 1, 40, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-lifestyle', NULL, 'lifestyle', 'Lifestyle', 'जीवनशैली', 1, 50, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-art-paintings', NULL, 'art-paintings', 'Art & paintings', 'कला तथा चित्रकला', 1, 60, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-pottery', NULL, 'pottery', 'Pottery', 'माटोका भाँडा', 1, 70, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-wood-bamboo-craft', NULL, 'wood-bamboo-craft', 'Wood/bamboo craft', 'काठ तथा बाँसका हस्तकला', 1, 80, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-personalized-gifts', NULL, 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 90, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-corporate-gifting', NULL, 'corporate-gifting', 'Corporate gifting', 'संस्थागत उपहार', 1, 100, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);`,
  '',
  `INSERT IGNORE INTO \`occasions\` (\`id\`, \`slug\`, \`name_en\`, \`name_ne\`, \`is_active\`, \`sort_order\`, \`created_at\`, \`updated_at\`) VALUES
  ('occasion-birthday', 'birthday-gifts', 'Birthday gifts', 'जन्मदिनका उपहार', 1, 10, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-wedding', 'wedding-gifts', 'Wedding gifts', 'विवाहका उपहार', 1, 20, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-dashain', 'dashain-gifts', 'Dashain gifts', 'दशैंका उपहार', 1, 30, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-tihar', 'tihar-gifts', 'Tihar gifts', 'तिहारका उपहार', 1, 40, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-mothers-day', 'mothers-day', 'Mother''s Day', 'आमाको मुख हेर्ने दिन', 1, 50, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-fathers-day', 'fathers-day', 'Father''s Day', 'बुबाको मुख हेर्ने दिन', 1, 60, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-anniversary', 'anniversary', 'Anniversary', 'वार्षिकोत्सव', 1, 70, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-corporate', 'corporate-gifts', 'Corporate gifts', 'संस्थागत उपहार', 1, 80, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-nepali-abroad', 'nepali-gifts-abroad', 'Nepali gifts abroad', 'विदेशमा नेपाली उपहार', 1, 90, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-housewarming', 'housewarming', 'Housewarming', 'गृहप्रवेशका उपहार', 1, 100, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-personalized', 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 110, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);`,
  '',
  'CREATE TABLE IF NOT EXISTS `hastabazaar_schema_versions` (',
  '  `version` VARCHAR(64) NOT NULL,',
  '  `applied_at` BIGINT NOT NULL,',
  '  PRIMARY KEY (`version`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  "INSERT IGNORE INTO `hastabazaar_schema_versions` (`version`, `applied_at`) VALUES ('0020_snapshot', UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);",
  '',
  singleSuperAdminSql.trim(),
  checkoutContactVerificationSql.trim(),
  firstCodReviewSql.trim(),
  firstCodEvidenceGuardsSql.trim(),
  sellerDraftsSql.trim(),
  sellerIntakesSql.trim(),
  completeVersionFoundationSql.trim(),
  reviewTaskOwnershipSql.trim(),
  coreFormReceiptSql.trim(),
  documentReviewHistorySql.trim(),
  protectedChangeHoldsSql.trim(),
  publicProfileRevisionsSql.trim(),
  sellerReviewSourcesSql.trim(),
  companyPaymentAccountsSql.trim(),
  categoryContractsIntakeSql.trim(),
  productSellableOffersSql.trim(),
  commonFeePoliciesSql.trim(),
  privatePriceGuidanceSql.trim(),
  productIntakeWorkspaceSql.trim(),
  productPublicationVersionsSql.trim(),
  productAvailabilitySql.trim(),
  productLegacyObservationsSql.trim(),
  productPriorityConcernsSql.trim(),
  cartSelectedOffersSql.trim(),
  partialCancellationSql.trim(),
  manualPaymentAllocationsSql.trim(),
  orderResponseScopeSql.trim(),
  cancellationScopeHoldsSql.trim(),
  returnReceivedEvidenceSql.trim(),
  returnPhysicalHandlingSql.trim(),
  aftercareFollowupsSql.trim(),
  refundObligationsSql.trim(),
  refundExecutionSourcesSql.trim(),
  originalDeliveryAllocationsSql.trim(),
  lawfulFeeRefundAuthorizationsSql.trim(),
  privateFinanceEvidenceSql.trim(),
  originalRefundCostAllocationsSql.trim(),
  refundOriginalDeadlinesSql.trim(),
  cancellationRefundSourcesSql.trim(),
  cancelledDeliveryAllocationsSql.trim(),
  payoutRequestPolicySql.trim(),
  payoutTransferPacketsSql.trim(),
  managedActualExecutionSql.trim(),
  sellerRecoveryCasesSql.trim(),
  sellerRecoveryAllocationsSql.trim(),
  sellerRecoveryAgreementsSql.trim(),
  recoveryModelSettlementsSql.trim(),
  recoveryModelNettingSql.trim(),
  recoveryContactClocksSql.trim(),
  recoveryRepaymentClaimsSql.trim(),
  recoveryLiabilityCorrectionsSql.trim(),
  recoveryResponseCyclesSql.trim(),
  recoveryHistoricalSql.trim(),
  recoverySourceReviewsSql.trim(),
  recoveryUnpaidSourcesSql.trim(),
  recoveryPayoutRetirementsSql.trim(),
  recoveryUnpaidCorrectionsSql.trim(),
  recoveryCarrierSql.trim(),
  recoveryPartialSql.trim(),
  recoveryCalculationSql.trim(),
  recoveryPayoutReturnSql.trim(),
  recoveryCarrierUnpaidSql.trim(),
  recoveryHistoryChronologySql.trim(),
  recoveryCompanyHistorySql.trim(),
  recoveryFixedOriginalSql.trim(),
  recoveryPartialPaidSql.trim(),
  recoveryReceiptDispositionsSql.trim(),
  customerRefundReversalsSql.trim(),
  recoveryRepaymentAttributionsSql.trim(),
  receiptReturnBankLossesSql.trim(),
  receiptReturnBankSatisfactionsSql.trim(),
  fundingBankReversalFreshnessSql.trim(),
  managedLiveActivationSql.trim(),
  managedLiveFinancialSql.trim(),
  durableEmailDeliverySql.trim(),
  emailServiceHealthSql.trim(),
  teamGovernanceSql.trim(),
  incidentGovernanceSql.trim(),
  formHealthRecordsSql.trim(),
  notificationRuntimeSql.trim(),
  reviewTaskSystemOwnershipSql.trim(),
  legacyProtectedTransitionSql.trim(),
  nativePublicFeedbackDefaultsSql.trim(),
  productOrderablePriceHistorySql.trim(),
  nativeFormHealthSql.trim(),
  'SET FOREIGN_KEY_CHECKS = 1;',
  '',
);

// Validate authoritative definitions and all later migration references before output.
const bootstrapLater=await Promise.all((await readdir(resolve(projectRoot,'drizzle')))
 .filter(name=>/^\d{4}.*\.sql$/.test(name)&&name>'0043_zz')
 .map(async name=>({name,sql:await readFile(resolve(projectRoot,'drizzle',name),'utf8')})));
const bootstrapPrerequisitesSql=buildBootstrapPrerequisites({
 maria:await readFile(resolve(projectRoot,'deployment/babal/mariadb-policy-commission-9-percent.sql'),'utf8'),
 sqlite:await readFile(resolve(projectRoot,'drizzle/0043_policy_commission_9_percent.sql'),'utf8'),later:bootstrapLater});
const checkedBootstrapCompanion=await readFile(resolve(projectRoot,'deployment/babal/mariadb-bootstrap-prerequisites.sql'),'utf8');
if(checkedBootstrapCompanion.replace(/\r\n/g,'\n')!==bootstrapPrerequisitesSql)throw new Error('Bootstrap companion differs from authoritative generation');

if (!orderRefund) await mkdir(dirname(outputPath), { recursive: true });
const schemaSql = output.join('\n').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm,'');
// Preserve the entire historical schema, including FK restoration, as reset input.
const acceptedSchemaSql=schemaSql+'\n'+bootstrapPrerequisitesSql;
const completionContract=JSON.parse(await readFile(resolve(projectRoot,'lib/operations/bootstrap-completion-contract.json'),'utf8'));
if(createHash('sha256').update(acceptedSchemaSql).digest('hex')!==completionContract.prefixSha256)throw new Error('Review bootstrap completion against changed accepted prefix');
const completionSources=Object.fromEntries(await Promise.all(Object.keys(completionContract.reference.sources).map(async path=>[path,await readFile(resolve(projectRoot,path),'utf8')])));
const completionSql=buildBootstrapCompletion({...completionContract,sourceTexts:completionSources});
const freshDefaultsSql=buildFreshBootstrapDefaults(completionContract);
for(const [name,generated]of [['mariadb-bootstrap-completion.sql',completionSql],['mariadb-fresh-bootstrap-defaults.sql',freshDefaultsSql]])if((await readFile(resolve(projectRoot,'deployment/babal',name),'utf8')).replace(/\r\n/g,'\n')!==generated)throw new Error('Bootstrap completion differs from reviewed generation: '+name);
const completePrefixSql=acceptedSchemaSql+'\n'+completionSql+'\n'+freshDefaultsSql;
const convergenceSql=(await readFile(resolve(projectRoot,'deployment/babal/mariadb-retained-schema-convergence.sql'),'utf8')).replaceAll('\r\n','\n');
const convergedPrefixSql=completePrefixSql+'\n'+convergenceSql;
const checkContract=JSON.parse(await readFile(resolve(projectRoot,'lib/operations/check-parity-contract.json'),'utf8'));
if(createHash('sha256').update(convergedPrefixSql).digest('hex')!==checkContract.prefixSha256)throw new Error('Review CHECK parity against changed complete prefix');
const checkSources=Object.fromEntries(await Promise.all(Object.keys(checkContract.sources).map(async path=>[path,await readFile(resolve(projectRoot,path),'utf8')])));
const checkSql=buildCheckParity(checkContract,checkSources);
if((await readFile(resolve(projectRoot,'deployment/babal/mariadb-check-parity.sql'),'utf8')).replace(/\r\n/g,'\n')!==checkSql)throw new Error('CHECK parity companion differs from reviewed generation');
const checkParitySchemaSql=convergedPrefixSql+'\n'+checkSql;
const textLengthContract=JSON.parse(await readFile(resolve(projectRoot,'lib/operations/text-length-parity-contract.json'),'utf8'));
if(createHash('sha256').update(checkParitySchemaSql).digest('hex')!==textLengthContract.prefixSha256)throw new Error('Review text length parity against changed accepted CHECK prefix');
const textLengthSources=Object.fromEntries(await Promise.all(Object.keys(textLengthContract.sources).map(async path=>[path,await readFile(resolve(projectRoot,path),'utf8')])));
const textLengthSql=buildTextLengthParity(textLengthContract,textLengthSources);
if((await readFile(resolve(projectRoot,'deployment/babal/mariadb-text-length-parity.sql'),'utf8')).replace(/\r\n/g,'\n')!==textLengthSql)throw new Error('Text length companion differs from calibrated generation');
const nativeOrderStockGovernanceSql=(await readFile(resolve(projectRoot,'deployment/babal/mariadb-native-order-stock-governance.sql'),'utf8')).replaceAll('\r\n','\n');
const currentSchemaSql=checkParitySchemaSql+'\n'+textLengthSql+'\n'+nativeOrderStockGovernanceSql;
const orderRefundSources = orderRefund && await orderRefund.readOrderRefundMariaMigrations(projectRoot);
if (orderRefund) await mkdir(schemaOutputDirectory);
const outputOptions = { encoding: 'utf8', flag: orderRefund ? 'wx' : 'w' };
await writeFile(outputPath, currentSchemaSql + (orderRefundSources?.suffix ?? ''), outputOptions);
const governanceResetTables=[teamGovernanceSql,incidentGovernanceSql,formHealthRecordsSql,legacyProtectedTransitionSql].flatMap(sql=>[...sql.matchAll(/CREATE TABLE (\w+)\s*\(/g)].map(match=>match[1])).reverse();
const resetTables = [
  'product_orderable_price_observations',
  'cart_offer_commands',
  'cart_offer_lines',
  'product_priority_report_media',
  'product_priority_cases',
  'product_priority_events',
  'product_legacy_media_copies',
  'product_legacy_observations',
  'product_availability_states',
  'product_availability_events',
  'product_publication_media',
  'product_publication_heads',
  'product_publication_links',
  'product_publication_decisions',
  'product_publication_candidates',
  ...governanceResetTables,
  'service_health_guards',
  'service_health_incidents',
  'service_health_observations',
  'operational_reminder_milestones',
  'operational_notice_states',
  'operational_reminder_cursors',
  'email_transport_backoff',
  'email_delivery_attempts',
  'managed_live_invoice_adjustment_sources',
  'managed_live_invoice_numbers',
  'managed_live_invoice_series',
  'managed_live_financial_scopes',
  'managed_live_activation_decisions',
  'managed_live_clearances',
  'managed_clearance_evidence_files',
  'managed_clearance_evidence_intents',
  'receipt_return_bank_satisfaction_pools',
  'receipt_return_bank_satisfactions',
  'receipt_return_bank_loss_pools',
  'receipt_return_bank_losses',
  'seller_recovery_repayment_attributions',
  'customer_refund_reversal_dispositions',
  'customer_refund_return_pools',
  'customer_refund_reversals',
  'seller_recovery_restoration_reclassifications',
  'seller_recovery_receipt_reversal_parts',
  'seller_recovery_receipt_reversal_reviews',
  'seller_recovery_payout_return_restorations',
  'seller_recovery_carrier_unpaid_reviews',
  'seller_recovery_payout_return_reviews',
  'seller_recovery_payout_return_pools',
  'seller_recovery_carrier_restorations',
  'seller_recovery_carrier_reviews',
  'seller_recovery_unpaid_corrections',
  'seller_recovery_payout_retirements',
  'seller_recovery_calculation_answers',
  'seller_recovery_calculation_reviews',
  'seller_recovery_partial_sources',
  'seller_recovery_unpaid_sources',
  'seller_recovery_source_reviews',
  'seller_recovery_original_unpaid_pools',
  'seller_recovery_historical_pools',
  'seller_recovery_company_deductions',
  'seller_recovery_historical_attributions',
  'seller_recovery_response_windows',
  'seller_recovery_restorations',
  'seller_recovery_liability_corrections',

  'seller_recovery_claim_events',
  'seller_recovery_repayment_claims',

  'seller_recovery_contact_windows',
  'seller_recovery_contacts',


  'managed_supplier_recovery_credits',

  'seller_recovery_proposals',

  'seller_recovery_reductions',
  'seller_recovery_allocations',

  'seller_recovery_events',
  'seller_recovery_cases',


  'company_outgoing_bank_identities',
  'payout_transfer_packets',

  'order_delivery_adjustments',

  'cancellation_refund_sources',
  'order_cancellation_reviews',
  'order_cancellation_events',

  'refund_obligation_deadlines',

  'refund_cost_allocations',
  'finance_evidence_files',
  'finance_evidence_intents',

  'lawful_fee_refund_authorizations',

  'order_delivery_allocations',
  'outgoing_payment_packets',
  'company_funding_statements',
  'company_funding_accounts',
  'refund_destination_versions',
  'refund_destination_heads',
  'refund_obligation_events',
  'refund_obligations',

  'manual_payment_reminders',
  'company_receipt_controls',
  'manual_payment_exceptions',
  'company_receipt_reversals',
  'manual_payment_allocations',
  'manual_receipt_uses',
  'company_receipt_conflicts',
  'company_money_receipts',
  'manual_payment_claim_files',
  'manual_payment_claim_events',
  'manual_payment_claims',
  'cod_company_receipt_allocations',
  'cod_approved_deductions',
  'manual_payment_exception_events',
  'aftercare_followup_milestones',
  'aftercare_followup_events',
  'return_stock_actions',
  'return_replacement_shipments',
  'return_handling_events',
  'return_handling',
  'order_response_customer_state',
  'order_response_milestones',
  'order_response_events',
  'order_fulfillment_holds',
  'order_response_items',
  'order_response_cases',
  'order_response_portions',
  'manual_payment_windows',

  'product_intake_proposals',
  'product_intake_events',
  'product_intake_cases',
  'product_intake_media',
  'product_intake_workspace_heads',
  'product_intake_workspace_versions',
  'product_discount_advisory_items',
  'product_discount_advisories',
  'product_discount_cycles',
  'product_price_reference_reviews',
  'product_private_price_requests',
  'product_private_price_inputs',
  'commission_terms_scan_state',
  'commission_terms_hold_batch_events',
  'commission_terms_hold_batches',
  'commission_terms_email_controls',
  'commission_terms_events',
  'commission_terms_cases',
  'commission_common_cancellations',
  'commission_common_policies',
  'order_item_offer_snapshots',
  'offer_stock_reservations',
  'offer_stock_events',
  'offer_stock',
  'product_offer_current',
  'product_offer_decisions',
  'product_offer_heads',
  'product_offer_identities',
  'product_offer_versions',
  'product_intake_versions',
  'product_intake_drafts',
  'category_template_states',
  'category_template_versions',
  'company_payment_instructions',
  'company_payment_account_events',
  'company_payment_account_current',
  'company_payment_account_versions',
  'company_payment_account_identities',
  'company_payment_accounts',
  'seller_public_profile_events',
  'seller_public_profile_revision_media',
  'seller_public_profile_revisions',
  'seller_public_profile_corrections',
  'seller_public_profile_drafts',
  'seller_public_profile_states',
  'seller_payout_packet_replacements',
  'seller_payout_packet_dispositions',
  'seller_identity_fact_versions',
  'seller_protected_change_events',
  'seller_protected_change_permissions',
  'seller_beneficiary_versions',
  'seller_payout_review_blocks',
  'seller_capability_holds',
  'seller_protected_change_cases',
  'seller_document_replacement_permissions',
  'seller_document_change_requests',
  'seller_protected_revisions',
  'review_tasks',
  'seller_registration_intakes',
  'seller_application_draft_uploads',
  'seller_application_drafts',
  'commission_continuity_sellers',
  'commission_continuity_settings',
  'commission_continuity_operations',
  ...Object.keys(customerFeeRequiredTables).reverse(),
  'order_item_marketplace_fees',
  'marketplace_fee_waiver_requests',
  'marketplace_fee_waiver_revisions',
  'marketplace_fee_waiver_campaigns',
  'marketplace_fee_waiver_control',
  'category_image_assignments',
  'category_media',
  'delivery_assignments',
  'address_locations',
  'first_cod_reviews',
  'local_contact_captures',
  'account_contact_challenges',
  'account_phone_verifications',
  'account_email_verifications',
  'rider_assignment_snapshots',
  'rider_remittance_allocations',
  'rider_compensation_entries',
  'rider_cash_obligations',
  'rider_otp_challenges',
  'rider_reports',
  'rider_events',
  'rider_applications',
  'rider_profiles',
  'rider_policy_versions',
  'rider_policy',
  'parcel_operation_events',
  'parcel_cash_records',
  'shipping_parcels',
  'operation_transaction_guards',
  'staff_permission_presets',
  'staff_permission_requests',
  'staff_permission_profiles',
  'staff_permission_guards',
  'wallet_entries',
  'commission_rate_acceptances',
  'commission_rate_cancellations',
  'commission_rate_changes',
  'commission_control',
  'loyalty_points_entries',
  'loyalty_redemptions',
  'loyalty_daily_claims',
  'loyalty_day_issuance',
  'loyalty_accounts',
  'loyalty_config',
  'loyalty_revisions',
  'gift_cards',
  'wallet_accounts',
  'promo_redemptions',
  'promo_customer_usage',
  'promo_revisions',
  'promo_campaigns',
  'feedback_delivery_jobs',
  'address_answer_owner_tombstones',
  'data_rights_legal_holds',
  'form_answer_sets',
  'form_config_versions',
  'seller_agreement_acceptance_history',
  'seller_route_transition_applications',
  'managed_supplier_payments',
  'managed_supplier_adjustments',
  'managed_supplier_obligations',
  'managed_supply_records',
  'recently_viewed_products',
  'managed_invoice_adjustments',
  'traffic_events',
  'traffic_sessions',
  'seller_deletion_preflights',
  'seller_restriction_events',
  'seller_restrictions',
  'managed_invoice_groups',
  'managed_payout_entries',
  'managed_payout_allocations',
  'managed_payouts',
  'managed_settlement_entries',
  'managed_entitlements',
  'managed_commercial_snapshots',
  'managed_maker_application_details',
  'seller_profile_media',
  'seller_operational_addresses',
  'seller_participation_guards',
  'seller_participation_profiles',
  'business_setting_guards',
  'business_setting_versions',
  'email_login_challenges',
  'user_sessions',
  'user_credentials',
  'hastabazaar_schema_versions',
  ...Object.keys(snapshot.tables).reverse(),
];
// The empty-target reset source must cover every final generated table. This
// source inventory check never opens a database or executes the reset artifact.
const createdTables=new Set([...schemaSql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?(\w+)`?\s*\(/gi)].map(match=>match[1]));
const resetInventory=new Set(resetTables);
const missingResetTables=[...createdTables].filter(table=>!resetInventory.has(table));
if(missingResetTables.length)throw new Error('Empty-import reset source omits tables: '+missingResetTables.join(', '));
const recoverySql = [
  '-- RECOVERY ONLY: clears the failed partial import in an otherwise empty database.',
  '-- Do not use this file after real users, products, orders, or uploads exist.',
  'SET FOREIGN_KEY_CHECKS = 0;',
  'DROP VIEW IF EXISTS seller_recovery_reversed_allocations;\nDROP VIEW IF EXISTS seller_recovery_raw_restorations;\nDROP VIEW IF EXISTS seller_recovery_fixed_original_balances;\nDROP VIEW IF EXISTS seller_recovery_all_historical_uses;\nDROP VIEW IF EXISTS seller_recovery_original_unpaid_reviews;\nDROP VIEW IF EXISTS seller_recovery_all_restorations;',
  'DROP VIEW IF EXISTS manual_receipt_bank_backing;',
  'DROP VIEW IF EXISTS cod_reconciliation_balances;',
  'DROP VIEW IF EXISTS manual_payment_cutoffs;',
  'DROP VIEW IF EXISTS manual_payment_balances;',
  ...resetTables.map((table) => `DROP TABLE IF EXISTS ${quote(table)};`),
  '',
  schemaSql,
].join('\n');
await writeFile(recoveryOutputPath, recoverySql, outputOptions);
console.log(`Wrote ${outputPath}`);
console.log(`Wrote ${recoveryOutputPath}`);
