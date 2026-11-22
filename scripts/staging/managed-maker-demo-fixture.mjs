import assert from 'node:assert/strict';

import { buildManagedCommercialSnapshot } from '../../lib/managed-commerce/snapshots.ts';
import { issueManagedInvoiceGroups } from '../../lib/db/repositories/managed-documents.ts';
import {
  accrueManagedEntitlements,
  getManagedFinanceSummary,
  nextPayoutProcessingAt,
  prepareManagedPayout,
  transitionManagedPayout,
} from '../../lib/db/repositories/managed-settlements.ts';
import { reviewProduct } from '../../lib/db/repositories/products.ts';
import { activateManagedMakerForSimulation } from '../../lib/managed-commerce/activation.ts';
import {
  approvePayoutTransfer,
  preparePayoutTransfer,
  recordPayoutTransferOutcome,
  startPayoutTransfer,
} from '../../lib/payments/payout-transfers.ts';
import { verifySellerDocument } from '../../lib/sellers/document-review.ts';
import { resolveRuntimeEnvironment, SIMULATED_RECORD_LABEL } from '../../lib/staging/environment.ts';
import { seedCheckoutBuyer } from '../../tests/helpers/checkout-contact.ts';
import { readyMaker } from '../../tests/helpers/company-store-lifecycle-fixture.ts';
import { verifiedPayoutSources } from '../../tests/helpers/verified-payout-sources.ts';

const ids = Object.freeze({
  financePreparer: 'demo-finance-preparer',
  financeApprover: 'demo-finance-approver',
  buyer: 'demo-buyer',
  order: 'demo-order',
  orderItem: 'demo-order-item',
  snapshot: 'demo-managed-snapshot',
  entitlement: 'demo-managed-entitlement',
});

function recordJourneyEvents(sqlite, now, makerUser, reviewer) {
  const events = [
    ['application_submitted', makerUser],
    ['application_reviewed', reviewer],
    ['product_approved', reviewer],
    ['order_formed', makerUser],
    ['rider_assigned', reviewer],
    ['whole_parcel_inspected', makerUser],
    ['parcel_otp_verified', makerUser],
    ['customer_payment_recorded', ids.financePreparer],
    ['parcel_delivered', makerUser],
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
  const environment = resolveRuntimeEnvironment({ runtimeEnvironment: 'test', nodeEnvironment: process.env.NODE_ENV });
  const now = Date.UTC(2026, 8, 21, 6, 0, 0);
  const fixture = await readyMaker(now - 86_400_000);
  const { db: database, sqlite, sellerId, actorId: makerUser, activation } = fixture;
  const { actorId: reviewer } = activation;
  try {
    assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    for (const doc of sqlite.prepare(`SELECT id FROM seller_documents
      WHERE seller_id=? AND kind='representative_identity' AND status<>'verified'`).all(sellerId)) {
      assert.ok(typeof doc.id === 'string');
      await verifySellerDocument(database, {
        sellerId, documentId: doc.id, actorId: reviewer,
        reason: 'Review the original fictional maker identity before simulated activation.',
        commandId: `demo:identity:review:${doc.id}`, expectedReviewId: null, now: fixture.now + 2,
      });
    }
    await activateManagedMakerForSimulation(database, { ...activation, environment });
    await reviewProduct(database, {
      productId: 'cup', actorId: reviewer, action: 'publish',
      reason: 'Publish the fictional cup inside this private memory fixture.',
      requestId: 'demo:product:publish', now: fixture.now + 4,
    });
    const sources = await verifiedPayoutSources(fixture, sellerId);
    await seedCheckoutBuyer(database, ids.buyer, 'customer@local.hastabazaar.test', '9811111111', now);
    sqlite.exec(`
      INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES
        ('${ids.financePreparer}','demo-preparer@local.hastabazaar.test','SIMULATED Finance Preparer','active',${now},${now}),
        ('${ids.financeApprover}','demo-reviewer@local.hastabazaar.test','SIMULATED Remittance Reviewer','active',${now},${now});
    `);

    // Seed the original historical sale in this private simulation; no public checkout or payment provider is called.
    sqlite.prepare(`INSERT INTO orders(
      id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,
      shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,
      payment_mode,payment_status,created_at,updated_at,receipt_token_hash
    ) VALUES (?,'SIM-M2-1000',?,'customer@local.hastabazaar.test','9811111111','placed','en-NP',
      'simulated-original-terms','{}',100000,0,100000,'cod','unpaid',?,?,'simulated-receipt-token')`)
      .run(ids.order, ids.buyer, now, now);
    sqlite.prepare(`INSERT INTO order_items(
      id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,
      unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,
      commission_rule_version,created_at
    ) VALUES (?,?,'cup',?,'SIMULATED Maker','SIMULATED Mithila Clay Cup','SIM-CLAY-001',
      100000,1,0,0,100000,'managed-sale-linked',?)`).run(ids.orderItem, ids.order, sellerId, now);

    const snapshot = buildManagedCommercialSnapshot({
      sellerId: sellerId,
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
      ids.snapshot, ids.orderItem, sellerId, snapshot.participationRoute, snapshot.commercialModel,
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
      ids.entitlement, ids.snapshot, sellerId, snapshot.makerEntitlementPaisa, now, now,
    );

    sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?")
      .run(now, ids.order);
    sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(ids.orderItem);
    const journeyEvents = recordJourneyEvents(sqlite, now, makerUser, reviewer);
    const earned = await accrueManagedEntitlements(database, {
      orderId: ids.order,
      actorId: reviewer,
      requestId: 'demo:entitlement:earn',
      now: now + 20,
    });
    const duplicateEarned = await accrueManagedEntitlements(database, {
      orderId: ids.order,
      actorId: reviewer,
      requestId: 'demo:entitlement:earn',
      now: now + 21,
    });
    const invoiceCount = await issueManagedInvoiceGroups(database, {
      orderId: ids.order,
      requestId: 'demo:invoice',
      now: now + 30,
    });
    const financeBeforePayout = await getManagedFinanceSummary(database, sellerId, now + 40);
    const scheduledFor = nextPayoutProcessingAt({
      eligibleAt: now + 40,
      processingWeekday: 'wednesday',
      cutoffWeekday: 'tuesday',
      cutoffLocalTime: '17:00',
    });
    const payoutId = await prepareManagedPayout(database, {
      environment, sellerId, actorId: reviewer,
      destinationReference: sources.beneficiaryReference,
      expectedAmountPaisa: snapshot.makerEntitlementPaisa,
      requestId: 'demo:payout:prepare',
      now: now + 40,
      scheduledFor,
    });
    await assert.rejects(transitionManagedPayout(database, {
      environment, payoutId, actorId: reviewer,
      action: 'mark_paid',
      requestId: 'demo:payout:legacy-rejected',
      providerReference: 'SIMULATED-REFERENCE-ONLY',
      now: scheduledFor,
    }), /original verified execution packet/);

    const packet = await preparePayoutTransfer(database, sources.ctx('demo:packet:prepare'), {
      model: 'managed', payoutId, accountVersionId: sources.accountVersionId, environment,
      reason: 'Bind the exact original simulated entitlement, reviewed beneficiary and independent company funds.',
    });
    const approved = await approvePayoutTransfer(database, sources.ctx('demo:packet:approve', String(packet.revision)), {
      packetId: packet.id, environment,
      reason: 'Approve the exact reviewed original fictional transfer and funding statement.',
    });
    const started = await startPayoutTransfer(database, sources.ctx('demo:packet:start', String(approved.revision)), {
      packetId: packet.id, environment,
      reason: 'Record the original fictional manual bank instruction as processing.',
    });
    const instruction = sqlite.prepare('SELECT started_at FROM payout_transfer_packets WHERE id=?').get(packet.id);
    assert.ok(instruction?.started_at);
    const paidContext = sources.ctx('demo:packet:paid', String(started.revision));
    const paidInput = {
      packetId: packet.id, environment, outcome: 'paid',
      amountPaisa: snapshot.makerEntitlementPaisa,
      bankAt: Number(instruction.started_at),
      transactionIdentity: 'FICTIONAL-ORIGINAL-DEMO-DEBIT',
      evidenceReference: 'FICTIONAL-INDEPENDENT-DEMO-BANK-PROOF',
      completedTransferConfirmed: true, exactBeneficiaryConfirmed: true,
      reason: 'Independently confirm the full fictional debit and the exact original beneficiary.',
    };
    const paid = await recordPayoutTransferOutcome(database, paidContext, paidInput);
    assert.deepEqual(await recordPayoutTransferOutcome(database, paidContext, paidInput), paid);

    const allocation = sqlite.prepare(`SELECT entitlement_id,amount_paisa,disposition
      FROM managed_payout_allocations WHERE payout_id=?`).all(payoutId);
    assert.equal(allocation.length, 1);
    assert.equal(allocation[0].entitlement_id, ids.entitlement);
    assert.equal(allocation[0].amount_paisa, snapshot.makerEntitlementPaisa);
    assert.equal(allocation[0].disposition, 'paid');
    const debit = sqlite.prepare(`SELECT packet_id,account_version_id,transaction_identity,amount_paisa
      FROM company_outgoing_bank_identities`).all();
    assert.equal(debit.length, 1);
    assert.equal(debit[0].packet_id, packet.id);
    assert.equal(debit[0].account_version_id, sources.accountVersionId);
    assert.equal(debit[0].transaction_identity, paidInput.transactionIdentity);
    assert.equal(debit[0].amount_paisa, snapshot.makerEntitlementPaisa);
    const packetProof = sqlite.prepare(`SELECT prepared_by,approved_by,started_by,recorded_by,state,
      funding_statement_id,beneficiary_version_id,evidence_reference
      FROM payout_transfer_packets WHERE id=? AND managed_payout_id=?`).get(packet.id, payoutId);
    assert.equal(packetProof.state, 'paid');
    for (const actor of [packetProof.prepared_by, packetProof.approved_by, packetProof.started_by, packetProof.recorded_by])
      assert.equal(actor, reviewer);
    assert.equal(packetProof.funding_statement_id, sources.fundingId);
    assert.ok(typeof packetProof.beneficiary_version_id === 'string');
    assert.equal(`BENEFICIARY:${packetProof.beneficiary_version_id}`, sources.beneficiaryReference);
    assert.equal(packetProof.evidence_reference, paidInput.evidenceReference);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE role='super_admin'").get().n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM managed_live_activation_decisions').get().n, 0);
    const original = sqlite.prepare('SELECT record_kind FROM managed_commercial_snapshots WHERE id=?').get(ids.snapshot);
    assert.equal(original.record_kind, 'simulation');

    const financeAfterPayout = await getManagedFinanceSummary(database, sellerId, paidContext.now);
    const payout = sqlite.prepare('SELECT payout_number,amount_paisa,status,simulation_label,record_kind FROM managed_payouts WHERE id=?').get(payoutId);
    const invoice = sqlite.prepare('SELECT invoice_number,status,simulation_label,record_kind FROM managed_invoice_groups WHERE order_id=?').get(ids.order);
    if (!payout || !invoice) throw new Error('The simulated payout and invoice evidence must exist.');
    assert.equal(payout.record_kind, 'simulation');
    assert.equal(invoice.record_kind, 'simulation');
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
    fixture.dispose();
  }
}
