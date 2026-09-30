import { readFile } from 'node:fs/promises';

import { buildManagedCommercialSnapshot } from '../../lib/managed-commerce/snapshots.ts';
import { issueManagedInvoiceGroups } from '../../lib/db/repositories/managed-documents.ts';
import {
  accrueManagedEntitlements,
  getManagedFinanceSummary,
  nextPayoutProcessingAt,
  prepareManagedPayout,
  transitionManagedPayout,
} from '../../lib/db/repositories/managed-settlements.ts';
import { SIMULATED_RECORD_LABEL } from '../../lib/staging/environment.ts';
import { SQLiteD1Database } from './sqlite-d1.mjs';

const ids = Object.freeze({
  makerUser: 'demo-maker-user',
  reviewer: 'demo-super-admin-reviewer',
  financePreparer: 'demo-finance-preparer',
  financeApprover: 'demo-finance-approver',
  seller: 'demo-managed-maker',
  order: 'demo-order',
  orderItem: 'demo-order-item',
  snapshot: 'demo-managed-snapshot',
  entitlement: 'demo-managed-entitlement',
});

function initializeBaseSchema(sqlite) {
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE user_roles (user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL);
    CREATE TABLE staff_permission_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), permissions_json TEXT NOT NULL);
    CREATE TABLE staff_permission_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid = 1));
    CREATE TABLE seller_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE seller_participation_profiles (id TEXT PRIMARY KEY);
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, customer_email TEXT NOT NULL,
      customer_id TEXT, receipt_token_hash TEXT, status TEXT NOT NULL, payment_status TEXT NOT NULL,
      currency TEXT NOT NULL, delivered_at INTEGER
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      product_name_snapshot TEXT NOT NULL, sku_snapshot TEXT NOT NULL, quantity INTEGER NOT NULL,
      unit_price_paisa INTEGER NOT NULL, line_total_paisa INTEGER NOT NULL,
      fulfillment_status TEXT NOT NULL
    );
    CREATE TABLE return_requests (
      id TEXT PRIMARY KEY, order_item_id TEXT NOT NULL REFERENCES order_items(id)
    );
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY, return_request_id TEXT REFERENCES return_requests(id),
      status TEXT NOT NULL, commission_base_refunded_paisa INTEGER NOT NULL DEFAULT 0,
      operation_request_id TEXT
    );
    CREATE TABLE shipping_jobs (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id)
    );
    CREATE TABLE shipping_parcels (
      shipping_job_id TEXT PRIMARY KEY REFERENCES shipping_jobs(id),
      cod_due_paisa INTEGER NOT NULL CHECK(cod_due_paisa>=0),
      collected_paisa INTEGER NOT NULL DEFAULT 0 CHECK(collected_paisa>=0 AND collected_paisa<=cod_due_paisa)
    );
    CREATE TABLE operation_transaction_guards (
      id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT, subject_id TEXT,
      reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT UNIQUE, ip_hash TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

async function applyManagedCommerceMigration(sqlite) {
  const source = await readFile(new URL('../../drizzle/0046_managed_commerce.sql', import.meta.url), 'utf8');
  for (const statement of source.split('--> statement-breakpoint')) {
    if (statement.trim()) sqlite.exec(statement);
  }
}

function recordJourneyEvents(sqlite, now) {
  const events = [
    ['application_submitted', ids.makerUser],
    ['application_reviewed', ids.reviewer],
    ['product_approved', ids.reviewer],
    ['order_formed', ids.makerUser],
    ['rider_assigned', ids.reviewer],
    ['whole_parcel_inspected', ids.makerUser],
    ['parcel_otp_verified', ids.makerUser],
    ['customer_payment_recorded', ids.financePreparer],
    ['parcel_delivered', ids.makerUser],
    ['rider_remittance_submitted', ids.financePreparer],
    ['rider_remittance_reconciled', ids.financeApprover],
  ];
  const insert = sqlite.prepare(`INSERT INTO audit_logs
    (id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
    VALUES (?,?,?,?,?,'Disposable staging demonstration',NULL,?,?,NULL,?)`);
  events.forEach(([action, actorId], index) => insert.run(
    `demo-event-${index + 1}`, actorId, `staging_demo.${action}`, 'simulated_journey',
    ids.order, JSON.stringify({ simulationLabel: SIMULATED_RECORD_LABEL }),
    `demo:${action}`, now + index,
  ));
  return events.map(([action]) => action);
}

export async function runManagedMakerDemo() {
  const database = new SQLiteD1Database();
  const { sqlite } = database;
  const now = Date.UTC(2026, 8, 21, 6, 0, 0);
  try {
    initializeBaseSchema(sqlite);
    await applyManagedCommerceMigration(sqlite);
    sqlite.exec(`
      INSERT INTO users(id,display_name) VALUES
        ('${ids.makerUser}','SIMULATED Maker'),
        ('${ids.reviewer}','SIMULATED Super Admin'),
        ('${ids.financePreparer}','SIMULATED Finance Preparer'),
        ('${ids.financeApprover}','SIMULATED Finance Approver');
      INSERT INTO user_roles(user_id,role) VALUES
        ('${ids.reviewer}','super_admin'),
        ('${ids.financePreparer}','admin'),
        ('${ids.financeApprover}','super_admin');
      INSERT INTO seller_profiles VALUES ('${ids.seller}','${ids.makerUser}');
      INSERT INTO seller_participation_profiles(id) VALUES ('${ids.seller}');
      INSERT INTO orders VALUES (
        '${ids.order}','SIM-M2-1000','customer@local.hastabazaar.test','${ids.makerUser}',
        'simulated-receipt-token','delivered','paid','NPR',${now}
      );
      INSERT INTO order_items VALUES (
        '${ids.orderItem}','${ids.order}','SIMULATED Mithila Clay Cup','SIM-CLAY-001',1,
        100000,100000,'delivered'
      );
    `);

    const snapshot = buildManagedCommercialSnapshot({
      sellerId: ids.seller,
      commercialModel: 'managed_sale_linked_percentage_v1',
      legalSellerReference: 'SIMULATED HASTABAZAAR OPERATING ENTITY',
      invoiceIssuerReference: 'SIMULATED HASTABAZAAR ISSUER',
      payoutBeneficiaryReference: 'SIMULATED MAKER BENEFICIARY',
      agreementVersion: 'SIMULATED-MM-V1',
      agreementLanguage: 'ne',
      termsSettingVersionId: 'simulated-terms-v1',
      deliveryHoldDays: 0,
      holdSettingVersionId: 'simulated-hold-v1',
      productValuePaisa: 100000,
      makerFundedDiscountPaisa: 0,
      platformFundedDiscountPaisa: 0,
      platformRetentionBps: 900,
    });
    sqlite.prepare(`INSERT INTO managed_commercial_snapshots(
      id,order_item_id,seller_id,participation_route,commercial_model,legal_seller_reference,
      invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,
      terms_setting_version_id,delivery_hold_days,hold_setting_version_id,product_value_paisa,
      maker_funded_discount_paisa,platform_funded_discount_paisa,eligible_base_paisa,
      platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,
      agreed_supplier_amount_paisa,simulation_label,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      ids.snapshot, ids.orderItem, ids.seller, snapshot.participationRoute, snapshot.commercialModel,
      snapshot.legalSellerReference, snapshot.invoiceIssuerReference, snapshot.payoutBeneficiaryReference,
      snapshot.agreementVersion, snapshot.agreementLanguage, snapshot.termsSettingVersionId,
      snapshot.deliveryHoldDays, snapshot.holdSettingVersionId, snapshot.productValuePaisa,
      snapshot.makerFundedDiscountPaisa, snapshot.platformFundedDiscountPaisa,
      snapshot.eligibleBasePaisa, snapshot.platformRetentionBps, snapshot.platformRetainedPaisa,
      snapshot.makerEntitlementPaisa, snapshot.agreedSupplierAmountPaisa,
      snapshot.simulationLabel, now,
    );
    sqlite.prepare(`INSERT INTO managed_entitlements(
      id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at
    ) VALUES (?,?,?,'calculated',?,?,?)`).run(
      ids.entitlement, ids.snapshot, ids.seller, snapshot.makerEntitlementPaisa, now, now,
    );

    const journeyEvents = recordJourneyEvents(sqlite, now);
    const earned = await accrueManagedEntitlements(database, {
      orderId: ids.order,
      actorId: ids.reviewer,
      requestId: 'demo:entitlement:earn',
      now: now + 20,
    });
    const duplicateEarned = await accrueManagedEntitlements(database, {
      orderId: ids.order,
      actorId: ids.reviewer,
      requestId: 'demo:entitlement:earn',
      now: now + 21,
    });
    const invoiceCount = await issueManagedInvoiceGroups(database, {
      orderId: ids.order,
      requestId: 'demo:invoice',
      now: now + 30,
    });
    const financeBeforePayout = await getManagedFinanceSummary(database, ids.seller, now + 40);
    const scheduledFor = nextPayoutProcessingAt({
      eligibleAt: now + 40,
      processingWeekday: 'wednesday',
      cutoffWeekday: 'tuesday',
      cutoffLocalTime: '17:00',
    });
    const payoutId = await prepareManagedPayout(database, {
      sellerId: ids.seller,
      actorId: ids.financePreparer,
      destinationReference: 'SIMULATED-RECEIVING-ACCOUNT',
      requestId: 'demo:payout:prepare',
      now: now + 40,
      scheduledFor,
    });
    await transitionManagedPayout(database, {
      payoutId,
      actorId: ids.financeApprover,
      action: 'approve',
      requestId: 'demo:payout:approve',
      now: now + 50,
    });
    await transitionManagedPayout(database, {
      payoutId,
      actorId: ids.financeApprover,
      action: 'mark_paid',
      requestId: 'demo:payout:paid',
      providerReference: 'SIMULATED-PAYOUT-REFERENCE',
      now: now + 60,
    });
    await transitionManagedPayout(database, {
      payoutId,
      actorId: ids.financeApprover,
      action: 'mark_paid',
      requestId: 'demo:payout:paid',
      providerReference: 'SIMULATED-PAYOUT-REFERENCE',
      now: now + 61,
    });
    const financeAfterPayout = await getManagedFinanceSummary(database, ids.seller, now + 70);
    const payout = sqlite.prepare('SELECT payout_number,amount_paisa,status,simulation_label FROM managed_payouts WHERE id=?').get(payoutId);
    const invoice = sqlite.prepare('SELECT invoice_number,status,simulation_label FROM managed_invoice_groups WHERE order_id=?').get(ids.order);
    if (!payout || !invoice) throw new Error('The simulated payout and invoice evidence must exist.');
    return Object.freeze({
      simulationLabel: SIMULATED_RECORD_LABEL,
      commercialModel: snapshot.commercialModel,
      eligibleBasePaisa: snapshot.eligibleBasePaisa,
      platformRetentionBps: snapshot.platformRetentionBps,
      platformRetainedPaisa: snapshot.platformRetainedPaisa,
      makerEntitlementPaisa: snapshot.makerEntitlementPaisa,
      earned,
      duplicateEarned,
      invoiceCount,
      financeBeforePayout,
      financeAfterPayout,
      payout: {
        payoutNumber: String(payout.payout_number),
        amountPaisa: Number(payout.amount_paisa),
        status: String(payout.status),
        simulationLabel: String(payout.simulation_label),
      },
      invoice: {
        invoiceNumber: String(invoice.invoice_number),
        status: String(invoice.status),
        simulationLabel: String(invoice.simulation_label),
      },
      scheduledFor,
      journeyEvents,
    });
  } finally {
    database.close();
  }
}
