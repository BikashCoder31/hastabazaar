import assert from 'node:assert/strict';
import test from 'node:test';
import { addOfferCartLine } from '../lib/cart/offer-cart';
import { getCheckoutPolicyContext } from '../lib/checkout/policy-context';
import { getDeliveryEstimate } from '../lib/checkout/validation';
import { getCart } from '../lib/db/repositories/cart';
import { getDeliveryRates } from '../lib/db/repositories/delivery-rates';
import { publishFormDraft, saveFormDraft } from '../lib/db/repositories/form-catalog';
import { createManualBankOrder } from '../lib/db/repositories/orders';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';
import { accrueExistingDeliveredEarnings, prepareSellerPayout } from '../lib/db/repositories/payouts';
import { createCustomerReturnRequest, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { listParcels, operateParcel, prepareSellerParcels } from '../lib/operations/parcels';
import { allocateBankReceipt, recordBankReceipt } from '../lib/payments/manual-receipts';
import { approvePayoutTransfer, preparePayoutTransfer, recordPayoutTransferOutcome, startPayoutTransfer } from '../lib/payments/payout-transfers';
import { recordRefundFundingStatement } from '../lib/payments/refund-funding';
import { getPublicOfferSet } from '../lib/products/public-offers';
import { VARIANT_PRICING_CAPABILITY } from '../lib/products/variant-pricing';
import { getReturnHandling, recordReturnHandling } from '../lib/returns/handling';
import { reviewSellerBankDetails, sellerBankState, submitSellerBankDetails } from '../lib/sellers/bank-details';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { sellerRecoveryFixture } from './helpers/seller-recovery-fixture';

type Fixture = Awaited<ReturnType<typeof manualOrderFixture>>;
const ctx = (requestId: string, expectedRevision: string | null = null) => ({
  actorId: 'reviewer', requestId, expectedRevision, now: Date.now(),
});
const note = 'Keep the damaged fictional cup separately while custody and title are reviewed.';

async function placePricedOrder(f: Fixture) {
  Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: true });
  const cartHash = 'damaged-custody-cart';
  const set = await getPublicOfferSet(f.db, f.productId);
  const offer = set?.offers.find((line) => line.id === 'medium');
  assert.ok(set && offer?.orderable);
  await addOfferCartLine(f.db, cartHash, {
    productId: f.productId, offerId: offer.id, versionId: set.versionId,
    publicVersionId: set.publicVersionId, pricePaisa: offer.pricePaisa,
    quantity: 1, requestId: 'custody-priced-cart',
  }, Date.now());
  const cart = await getCart(f.db, cartHash);
  const [line] = cart.items;
  assert.ok(line.offerId && line.offerVersionId && line.publicVersionId && line.selectedOffer?.pricingRuleVersion);
  assert.ok(typeof line.revision === 'number' && typeof line.pricePaisa === 'number');
  const rates = await getDeliveryRates(f.db);
  const delivery = getDeliveryEstimate(f.input.address.district, [line.preparationDays], rates, 1);
  assert.ok(delivery);
  const serviceFee = await getPlatformServiceFee(f.db);
  const order = await createManualBankOrder(f.db, cartHash, 'custody-priced-receipt', {
    ...f.input, idempotencyKey: 'fixture-custody-priced-checkout', deliveryRateVersion: rates.version,
    reviewedQuote: {
      lines: [{ id: line.id, sellerId: line.sellerId, pricePaisa: line.pricePaisa, quantity: 1,
        offerId: line.offerId, offerVersionId: line.offerVersionId, publicVersionId: line.publicVersionId,
        revision: line.revision, pricingRuleVersion: line.selectedOffer.pricingRuleVersion }],
      deliveryPaisa: delivery.chargePaisa, walletPaisa: 0, referralPaisa: 0, promoPaisa: 0,
      payablePaisa: cart.itemSubtotalPaisa + delivery.chargePaisa + serviceFee.chargedPaisa,
      policyContext: await getCheckoutPolicyContext(), referralCampaign: null, serviceFee,
    },
  }, Date.now(), 'customer');
  const orderId = f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)?.id;
  assert.equal(typeof orderId, 'string');
  return { ...order, id: String(orderId) };
}

async function prepareSellerSettlement(f: Fixture, order: Awaited<ReturnType<typeof placePricedOrder>>, outcome: 'paid' | 'uncertain') {
  const receipt = await recordBankReceipt(f.db, ctx('custody-customer-credit'), {
    accountVersionId: f.accountVersionId, transactionIdentity: 'FICTIONAL-CUSTODY-BUYER-CREDIT',
    bankAt: Date.now() - 1, amountMinor: order.grandTotalPaisa, currency: 'NPR',
    payerReference: 'Exact independent fictional order source', payerUserId: 'customer',
    evidenceReference: 'FICTIONAL-CUSTODY-BUYER-PROOF', completedCreditConfirmed: true,
    conflictUserIds: [], reason: 'Confirm the exact outstanding fictional bank order payment.',
  });
  await allocateBankReceipt(f.db, ctx('custody-customer-allocation', '0'), {
    receiptId: receipt.id, orderId: order.id, amountPaisa: order.grandTotalPaisa,
    expectedWindowRevision: 0, matchingBasis: 'Verified original payer and matched fictional order.', exceptionApproval: null,
  });
  await prepareSellerParcels(f.db, { orderId: order.id, actorId: 'reviewer', requestId: 'custody-parcel', now: Date.now() });
  for (const action of ['assign', 'dispatch', 'deliver']) {
    if (action === 'dispatch') f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=?").run(order.id);
    const [parcel] = await listParcels(f.db, order.id);
    await operateParcel(f.db, {
      jobId: parcel.id, actorId: 'reviewer', action, version: parcel.version,
      requestId: 'custody-parcel-' + action, now: Date.now(), note,
      ...(action === 'assign' ? { method: 'courier', courierName: 'Fictional Courier', trackingCode: 'CUSTODY-DELIVERY-1' } : {}),
    });
  }

  f.sqlite.prepare("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='registered'").run();
  const bank = await sellerBankState(f.db, 'registered');
  await submitSellerBankDetails(f.db, {
    sellerId: 'registered', actorId: 'registered-owner', revision: bank.revision, now: Date.now(),
    details: { payoutBeneficiary: 'Fictional Registered Company', bankName: 'Fictional Bank',
      bankBranch: 'Fictional branch', bankAccountNumber: 'TEST-CUSTODY-PAYOUT' },
    document: { id: 'fixture-custody-bank', kind: 'bank_verification',
      objectKey: 'private/seller-documents/registered/fixture-custody-bank', originalName: 'bank.png', mimeType: 'image/png', sizeBytes: 20 },
  });
  const pending = await sellerBankState(f.db, 'registered');
  await reviewSellerBankDetails(f.db, {
    sellerId: 'registered', actorId: 'reviewer', revision: pending.revision, now: Date.now(),
    reference: 'FICTIONAL-CUSTODY-BENEFICIARY', commandId: 'custody-bank-verify',
    reason: 'Independently verify the retained fictional seller and beneficiary.',
    ownershipBasis: 'same_legal_entity', identityEvidenceConfirmed: true, releaseBankHold: true,
  });
  await accrueExistingDeliveredEarnings(f.db, { actorId: 'reviewer', requestId: 'custody-seller-earned', now: Date.now() });
  const payout = await prepareSellerPayout(f.db, {
    sellerId: 'registered', actorId: 'reviewer', actorRole: 'super_admin',
    note: 'Pay original earned proceeds in this isolated fixture.', requestId: 'custody-seller-payout', now: Date.now(),
  });
  const paidPaisa = Number(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)?.amount_paisa);
  assert.ok(paidPaisa > 0);
  await recordRefundFundingStatement(f.db, ctx('custody-funding'), {
    accountVersionId: f.accountVersionId, statementIdentity: 'FICTIONAL-CUSTODY-CAPITAL',
    asOf: Date.now() - 1000, cashPaisa: 200_000, restrictedPaisa: 50_000,
    evidenceReference: 'FICTIONAL-CUSTODY-BALANCE', restrictionsReference: 'FICTIONAL-CUSTODY-RESTRICTED',
    availableFundsConfirmed: true, reason: 'Verify actual fictional company funds before recording the seller debit.',
  });
  const packet = await preparePayoutTransfer(f.db, ctx('custody-packet'), {
    model: 'registered', payoutId: payout.id, accountVersionId: f.accountVersionId,
    reason: 'Retain the exact payable fictional seller earnings and verified source account.',
  });
  await approvePayoutTransfer(f.db, ctx('custody-packet-approve', '0'), { packetId: packet.id, reason: 'Approve the exact fictional source and seller.' });
  await startPayoutTransfer(f.db, ctx('custody-packet-start', '1'), { packetId: packet.id, reason: 'Record the single original fictional bank instruction.' });
  await recordPayoutTransferOutcome(f.db, ctx('custody-packet-outcome', '2'), {
    packetId: packet.id, outcome, evidenceReference: 'FICTIONAL-CUSTODY-SELLER-DEBIT-PROOF',
    reason: 'Record the original fictional seller transfer outcome and keep its evidence.',
    ...(outcome === 'paid' ? {
      amountPaisa: paidPaisa, bankAt: Date.now() - 1, transactionIdentity: 'FICTIONAL-CUSTODY-SELLER-DEBIT',
      completedTransferConfirmed: true, exactBeneficiaryConfirmed: true,
    } : {}),
  });
  return packet.id;
}

async function quarantineForm(f: Fixture) {
  const formId = 'staff.return-case-action';
  const facts = { custody_condition: 'Cracked handle', custody_custodian: 'Fictional storekeeper', custody_location: 'Fictional cage C2' };
  const now = Date.now();
  const expectedVersion = Number(f.sqlite.prepare("SELECT COALESCE(MAX(version),0) AS n FROM form_config_versions WHERE form_id=? AND status='published'").get(formId)?.n);
  const draft = await saveFormDraft(f.db, {
    formId, actorId: 'reviewer', actorRole: 'super_admin', expectedPublishedVersion: expectedVersion,
    config: { formId, fields: Object.keys(facts).map((key, order) => ({ id: key, key, label: key.replaceAll('_', ' '),
      type: 'short_text' as const, required: false, order, status: 'active' as const })) },
    reason: 'Retain fictional optional private inspection fields.', requestId: 'custody-inspection-form-draft', now,
  });
  const published = await publishFormDraft(f.db, {
    formId, draftId: draft.id, actorId: 'reviewer', actorRole: 'super_admin', expectedDraftRevision: draft.revision,
    expectedPublishedVersion: expectedVersion, reason: 'Review the fictional inspection fields.', requestId: 'custody-inspection-form-publish', now,
  });
  return validateSellerFormSubmission(f.db, formId, published.version,
    Object.entries(facts).map(([fieldId, value]) => ({ fieldId, value })), 'custody-inspected');
}

for (const outcome of ['paid', 'uncertain'] as const) void test(`priced seller goods stay quarantined when payout is ${outcome}`, async () => {
  const f = await manualOrderFixture({ immediateSettlement: true });
  try {
    const order = await placePricedOrder(f);
    const packetId = await prepareSellerSettlement(f, order, outcome);
    const line = f.sqlite.prepare('SELECT id FROM order_items WHERE order_id=?').get(order.id);
    assert.ok(line);
    const itemId = String(line.id);
    const returnCase = await createCustomerReturnRequest(f.db, {
      orderNumber: order.orderNumber, customerId: 'customer', receiptTokenHash: null, orderItemId: itemId,
      quantity: 1, reason: 'defective', requestedResolution: 'refund',
      detail: 'The fictional cup arrived with a verified split handle.', locale: 'en-NP',
      idempotencyKey: 'custody-return', evidence: [], now: Date.now(),
    });
    await reviewReturnAsAdmin(f.db, {
      returnRequestId: returnCase.id, actorId: 'reviewer', actorRole: 'super_admin', action: 'approve',
      responsibility: 'platform', outcome: 'refund', itemRefundPaisa: 88_000,
      decisionEvidenceReference: 'FICTIONAL-CUSTODY-REFUND-DECISION', correctSellerFulfillment: true,
      note, publicMessageEn: 'Your original return was approved for physical review.',
      publicMessageNe: 'तपाईंको फिर्ता स्वीकृत भएको छ।', requestId: 'custody-return-approved', now: Date.now(),
    });
    const beforeReceipt = await getReturnHandling(f.db, returnCase.id);
    assert.ok(beforeReceipt);
    const physical = {
      caseId: returnCase.id, occurredAt: beforeReceipt.now, quantity: 1,
      evidenceReference: 'FICTIONAL-EXACT-RETURN-RECEIPT', privateNote: note,
      publicMessage: 'One item was received for physical review.',
    };
    const received = await recordReturnHandling(f.db, ctx('custody-received', String(beforeReceipt.revision)), {
      ...physical, action: 'receive',
    });
    const bankProof = f.sqlite.prepare(`SELECT packet_kind AS kind FROM company_outgoing_bank_identities
      WHERE packet_id=?`).get(packetId);
    assert.equal(bankProof?.kind, outcome === 'paid' ? 'payout' : undefined);
    for (const disposition of ['scrap', 'restock'] as const) {
      await assert.rejects(recordReturnHandling(f.db, ctx('custody-block-' + disposition, String(received.revision)), {
        ...physical, action: 'inspect', disposition,
      }), /custody|quarantin|disposition authority/i);
    }
    assert.equal((await getReturnHandling(f.db, returnCase.id))?.inspectedQuantity, 0);
    const form = await quarantineForm(f);
    await recordReturnHandling(f.db, ctx('custody-inspected', String(received.revision)), {
      ...physical, action: 'inspect', disposition: 'quarantine',
    }, { versionId: form.versionId, answers: form.answers });
    const kept = await getReturnHandling(f.db, returnCase.id);
    assert.equal(kept?.inspectedQuantity, 1);
    assert.equal(kept?.restockedQuantity, 0);
    const inspection = f.sqlite.prepare("SELECT details_json AS details,public_message AS publicMessage FROM return_handling_events WHERE case_id=? AND action='inspect'").get(returnCase.id);
    assert.deepEqual(JSON.parse(String(inspection?.details)).custodyObservation, {
      condition: 'Cracked handle', custodian: 'Fictional storekeeper', location: 'Fictional cage C2',
    });
    assert.equal(inspection?.publicMessage, physical.publicMessage);
    assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(packetId)?.state, outcome);
    assert.equal(f.sqlite.prepare('SELECT status FROM refunds WHERE return_request_id=?').get(returnCase.id)?.status, 'approved');
  } finally {
    f.dispose();
  }
});

void test('legacy paid orders still record their existing inspection disposition', async () => {
  const f = await sellerRecoveryFixture(false, 'platform');
  try {
    const handling = await getReturnHandling(f.db, f.caseId);
    assert.ok(handling);
    const physical = {
      caseId: f.caseId, occurredAt: handling.now, quantity: 1,
      evidenceReference: 'FICTIONAL-LEGACY-RETURN-EVIDENCE', privateNote: note,
      publicMessage: 'One item was inspected under its original return terms.',
    };
    const received = await recordReturnHandling(f.db, ctx('legacy-custody-receipt', String(handling.revision)), {
      ...physical, action: 'receive',
    });
    await recordReturnHandling(f.db, ctx('legacy-custody-inspect', String(received.revision)), {
      ...physical, action: 'inspect', disposition: 'scrap',
    });
    assert.equal((await getReturnHandling(f.db, f.caseId))?.inspectedQuantity, 1);
  } finally {
    f.dispose();
  }
});
