import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { updateOfferCartLine } from '../lib/cart/offer-cart';
import { checkoutCommitClock } from '../lib/checkout/commit-policy-guards';
import { parseCheckoutInput } from '../lib/checkout/validation';
import { getCart } from '../lib/db/repositories/cart';
import { transitionSellerFulfillment } from '../lib/db/repositories/fulfillment';
import {
  getRegisteredSellerTerms,
  prepareSellerCommissionAcceptance,
} from '../lib/db/repositories/marketplace-settings';
import {
  createManualBankOrder,
  getOrderReceipt,
} from '../lib/db/repositories/orders';
import {
  accrueExistingDeliveredEarnings,
  prepareSellerPayout,
} from '../lib/db/repositories/payouts';
import { getPublishedProductBySlug } from '../lib/db/repositories/products';
import {
  createCustomerReturnRequest,
  getCustomerReturnDetail,
  reviewReturnAsAdmin,
  ReturnConflictError,
  type ReturnResponsibility,
} from '../lib/db/repositories/returns';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import {
  listParcels,
  operateParcel,
  prepareSellerParcels,
} from '../lib/operations/parcels';
import {
  allocateBankReceipt,
  recordBankReceipt,
} from '../lib/payments/manual-receipts';
import { getRefundObligation } from '../lib/payments/refund-obligations';
import { readSellerRecoverySource } from '../lib/payments/seller-recovery';
import { getProductWorkspace } from '../lib/products/intake-workspace';
import {
  getProductPublicationReview,
  reviewProductPublication,
  submitProductPriceRevision,
} from '../lib/products/publication';
import {
  VARIANT_PRICING_CAPABILITY,
  VARIANT_PRICING_RULE_VERSION,
} from '../lib/products/variant-pricing';
import { originalReturnDelivery } from '../lib/returns/delivery-allocation';
import {
  getReturnHandling,
  recordReturnHandling,
} from '../lib/returns/handling';
import {
  reviewSellerBankDetails,
  sellerBankState,
  submitSellerBankDetails,
} from '../lib/sellers/bank-details';
import { cataloguePayoutPacket } from './helpers/catalogue-payout-execution';
import { withCheckoutAcceptanceTerms } from './helpers/checkout-acceptance-bindings';
import { executeFixtureRefund } from './helpers/execute-fixture-refund';
import { legacyPayoutCapital } from './helpers/legacy-payout-capital';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';

type CheckoutFixture = Awaited<ReturnType<typeof publicCheckoutFixture>>;

const voluntaryDisclosure = {
  version: 'disclosed_voluntary_delivery_v1',
  legalAuthorityReference: 'FICTIONAL-ORIGINAL-APPROVED-VOLUNTARY-TERMS',
  disclosureVersion: 'fictional-checkout-disclosure-v1',
  disclosedAtCheckout: true,
  outboundRefundPromised: false,
  reversePaidByBuyer: true,
};

const reviewerCommand = (
  requestId: string,
  expectedRevision: string | null = null,
) => ({
  actorId: 'reviewer',
  requestId,
  expectedRevision,
  now: Date.now(),
});

async function approvePrice(
  f: CheckoutFixture,
  current: CheckoutFixture['approved'],
  price: string,
) {
  const workspace = await getProductWorkspace(
    f.db,
    'registered-owner',
    f.attached.id,
  );
  assert.ok(workspace.case);
  const sent = await submitProductPriceRevision(
    f.db,
    {
      actorId: 'registered-owner',
      requestId: `priced-return-proposal-${price}`,
      expectedRevision: String(current.revision),
      now: Date.now(),
    },
    {
      draftId: workspace.id,
      baseVersionId: current.versionId,
      expectedDraftRevision: String(workspace.revision),
      expectedCaseId: workspace.case.caseId,
      expectedCaseRevision: String(workspace.case.revision),
      replaceVersionId: workspace.case.versionId,
      offerId: 'medium',
      price,
      note: 'Publish the revised price for the same fictional cup size.',
    },
  );
  const review = await getProductPublicationReview(
    f.db,
    'reviewer',
    sent.caseId,
  );
  return reviewProductPublication(
    f.db,
    reviewerCommand(`priced-return-approval-${price}`, String(review.revision)),
    {
      caseId: sent.caseId,
      versionId: review.candidate.versionId,
      expectedCaseRevision: String(review.caseRevision),
      action: 'approve_and_publish',
      reason: 'Review the fictional cup and its exact current selling price.',
      checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] },
    },
  );
}

async function acceptTwelvePercent(f: CheckoutFixture) {
  const now = Date.now();
  const id = 'priced-return-twelve-percent';
  f.sqlite
    .prepare(`INSERT INTO business_setting_versions(
    id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id
  ) VALUES (?,'independent_seller_commission_bps',2,'1200','published',1,'controlled',?,
    'Original fixture commission','reviewer',?,?)`)
    .run(id, now, now, id);
  const terms = await getRegisteredSellerTerms(f.db, now);
  assert.equal(terms.basisPoints, 1_200);
  const acceptance = await prepareSellerCommissionAcceptance(f.db, {
    sellerId: 'registered',
    actorId: 'registered-owner',
    context: terms.context,
    requestId: 'priced-return-original-commission-acceptance',
    now,
    mode: 'approved_seller',
  });
  await f.db.batch(acceptance.statements);
}

async function placePricedOrder(
  f: CheckoutFixture,
  quantity: number,
  disclosure?: typeof voluntaryDisclosure,
) {
  Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: true });
  const [old] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(typeof old.revision === 'number' && old.currentChoice?.orderable);
  await updateOfferCartLine(
    f.db,
    f.cartHash,
    {
      itemId: old.id,
      quantity,
      revision: old.revision,
      requestId: 'priced-return-current-cart',
      refresh: {
        versionId: old.currentChoice.versionId,
        publicVersionId: old.currentChoice.publicVersionId,
        pricePaisa: old.currentChoice.pricePaisa,
      },
    },
    Date.now(),
  );
  const cart = await getCart(f.db, f.cartHash);
  const [line] = cart.items;
  assert.equal(line.pricePaisa, 24_000);
  assert.equal(
    line.selectedOffer?.pricingRuleVersion,
    VARIANT_PRICING_RULE_VERSION,
  );
  assert.equal(cart.hasUnavailableItems, false);
  const parsed = parseCheckoutInput({
    ...f.body,
    reviewedQuote: {
      ...f.body.reviewedQuote,
      payablePaisa: 24_000 * quantity + 15_000,
      lines: [
        {
          id: line.id,
          sellerId: line.sellerId,
          offerId: line.offerId,
          offerVersionId: line.offerVersionId,
          publicVersionId: line.publicVersionId,
          revision: line.revision,
          quantity: line.quantity,
          pricePaisa: line.pricePaisa,
          pricingRuleVersion: line.selectedOffer?.pricingRuleVersion,
        },
      ],
    },
  });
  assert.ok(parsed.value, parsed.errors.join('\n'));
  const input = { ...parsed.value, customerAuthSubject: 'customer' };
  const form = await validateSellerFormSubmission(
    f.db,
    'commerce.checkout',
    f.body.formVersion,
    f.body.customAnswers,
    parsed.value.idempotencyKey,
  );
  const submit = (database = f.db) =>
    createManualBankOrder(
      database,
      f.cartHash,
      'priced-return-receipt',
      input,
      Date.now(),
      'customer',
      { versionId: form.versionId, answers: form.answers },
    );
  if (!disclosure) return submit();

  // This isolated fixture retains fictional disclosure in the original purchase transaction.
  f.sqlite
    .exec(`CREATE TEMP TABLE fixture_voluntary_terms (terms TEXT NOT NULL);
    CREATE TEMP TRIGGER fixture_voluntary_purchase AFTER INSERT ON main.orders
    WHEN NEW.receipt_token_hash='priced-return-receipt'
    BEGIN
      UPDATE orders SET return_policy_snapshot_json=json_set(return_policy_snapshot_json,
        '$.voluntaryDelivery',json((SELECT terms FROM fixture_voluntary_terms))) WHERE id=NEW.id;
    END;`);
  f.sqlite
    .prepare('INSERT INTO fixture_voluntary_terms VALUES (?)')
    .run(JSON.stringify(disclosure));
  try {
    return await submit(withCheckoutAcceptanceTerms(f.db, (terms) => ({
      ...terms,
      returns: {
        ...(terms.returns as Record<string, unknown>),
        voluntaryDelivery: disclosure,
      },
    })));
  } finally {
    f.sqlite.exec(
      'DROP TRIGGER fixture_voluntary_purchase; DROP TABLE fixture_voluntary_terms;',
    );
  }
}

async function payAndDeliver(
  f: CheckoutFixture,
  orderId: string,
  amountPaisa: number,
) {
  assert.ok(f.accountVersionId);
  const nativeTime = await f.db
    .prepare(`SELECT ${checkoutCommitClock(f.db)} AS now`)
    .first<{ now: number }>();
  assert.ok(nativeTime);
  const receipt = await recordBankReceipt(
    f.db,
    reviewerCommand('priced-return-incoming-bank'),
    {
      accountVersionId: f.accountVersionId,
      transactionIdentity: 'FICTIONAL-PRICED-RETURN-PAYMENT',
      bankAt: nativeTime.now,
      amountMinor: amountPaisa,
      currency: 'NPR',
      payerReference: 'Verified original fictional customer',
      payerUserId: 'customer',
      evidenceReference: 'FICTIONAL-VERIFIED-ORIGINAL-BANK-CREDIT',
      completedCreditConfirmed: true,
      conflictUserIds: [],
      reason: 'Verify the original customer payment for this disposable order.',
    },
  );
  await allocateBankReceipt(
    f.db,
    reviewerCommand('priced-return-incoming-allocation', '0'),
    {
      receiptId: receipt.id,
      orderId,
      amountPaisa,
      expectedWindowRevision: 0,
      matchingBasis:
        'Verified fictional original payer and exact order reference.',
      exceptionApproval: null,
    },
  );
  const preparation = {
    orderId,
    sellerId: 'registered',
    actorId: 'registered-owner',
    note: 'Prepare the exact fictional cup for the original delivery.',
    now: Date.now(),
  };
  await transitionSellerFulfillment(f.db, {
    ...preparation,
    action: 'start_packing',
    requestId: 'priced-return-pack',
  });
  await transitionSellerFulfillment(f.db, {
    ...preparation,
    action: 'ready_for_pickup',
    requestId: 'priced-return-ready',
  });
  await prepareSellerParcels(f.db, {
    orderId,
    actorId: 'reviewer',
    requestId: 'priced-return-parcel',
    now: Date.now(),
  });
  for (const action of ['assign', 'dispatch', 'deliver'] as const) {
    const [parcel] = await listParcels(f.db, orderId);
    assert.ok(parcel);
    await operateParcel(f.db, {
      jobId: parcel.id,
      actorId: 'reviewer',
      action,
      version: parcel.version,
      now: Date.now(),
      note: 'Retain actual fictional delivery evidence for the original customer.',
      requestId: `priced-return-parcel-${action}`,
      ...(action === 'assign' && {
        method: 'courier',
        courierName: 'Fictional Courier',
        trackingCode: 'FIXTURE-PRICED-RETURN',
      }),
    });
  }
  const row = f.sqlite
    .prepare('SELECT status,payment_status AS payment FROM orders WHERE id=?')
    .get(orderId);
  assert.deepEqual({ ...row }, { status: 'delivered', payment: 'paid' });
  await accrueExistingDeliveredEarnings(f.db, {
    actorId: 'reviewer',
    requestId: 'priced-return-earnings',
    now: Date.now(),
  });
}

async function pricedReturnFixture(
  options: {
    immediateSellerSettlement?: boolean;
    quantity?: 1 | 2;
    disclosure?: typeof voluntaryDisclosure;
  } = {},
) {
  const f = await publicCheckoutFixture({ bank: true });
  try {
    const approved = await approvePrice(f, f.approved, '200');
    await acceptTwelvePercent(f);
    if (options.immediateSellerSettlement) {
      const at = Date.now() - 1;
      f.sqlite
        .prepare(`INSERT INTO business_setting_versions(
        id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id
      ) SELECT 'priced-return-zero-hold','seller_delivery_hold_days',COALESCE(MAX(version),0)+1,'0',
        'published',1,'controlled',?,'Fictional original zero-day seller settlement','reviewer',?,'priced-return-zero-hold'
      FROM business_setting_versions WHERE setting_key='seller_delivery_hold_days'`)
        .run(at, at);
    }
    const quantity = options.quantity ?? 1;
    const result = await placePricedOrder(f, quantity, options.disclosure);
    const originalPayable = quantity === 1 ? 39_000 : 63_000;
    assert.equal(result.grandTotalPaisa, originalPayable);
    const retained = f.sqlite
      .prepare(`SELECT o.id AS orderId,i.id AS orderItemId,i.line_total_paisa AS sellerBase,
      i.commission_bps AS commissionBps,i.commission_paisa AS commission
      FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.order_number=?`)
      .get(result.orderNumber);
    assert.ok(
      typeof retained?.orderId === 'string' &&
        typeof retained.orderItemId === 'string',
    );
    assert.equal(retained.sellerBase, 20_000 * quantity);
    assert.equal(retained.commissionBps, 1_200);
    assert.equal(retained.commission, 2_400 * quantity);
    if (options.disclosure) {
      const saved = f.sqlite
        .prepare(`SELECT json_extract(o.return_policy_snapshot_json,'$.voluntaryDelivery') AS orderTerms,
        json_extract(a.terms_snapshot_json,'$.returns.voluntaryDelivery') AS acceptedTerms
        FROM orders o JOIN order_policy_acceptances a ON a.order_id=o.id WHERE o.id=?`)
        .get(retained.orderId);
      assert.deepEqual(
        JSON.parse(String(saved?.orderTerms)),
        options.disclosure,
      );
      assert.deepEqual(
        JSON.parse(String(saved?.acceptedTerms)),
        options.disclosure,
      );
    }
    await payAndDeliver(f, retained.orderId, originalPayable);

    Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: false });
    await approvePrice(f, approved, '499');
    assert.equal(
      (await getPublishedProductBySlug(f.db, f.slug))?.pricePaisa,
      49_900,
    );
    const receipt = await getOrderReceipt(
      f.db,
      result.orderNumber,
      null,
      'customer',
    );
    assert.equal(receipt?.items[0].unitPricePaisa, 24_000);
    assert.equal(receipt?.deliveryChargePaisa, 15_000);
    return {
      ...f,
      orderNumber: result.orderNumber,
      orderItemId: retained.orderItemId,
      orderId: retained.orderId,
    };
  } catch (error) {
    f.dispose();
    throw error;
  }
}

type PricedFixture = Awaited<ReturnType<typeof pricedReturnFixture>>;

async function approveReturn(
  f: PricedFixture,
  responsibility: ReturnResponsibility,
  reason: 'damaged' | 'change_of_mind',
  expected: {
    savedDeliveryPaisa?: number;
    refundDeliveryPaisa?: number;
    unitOrdinal?: number;
  } = {},
) {
  const savedDeliveryPaisa = expected.savedDeliveryPaisa ?? 15_000;
  const refundDeliveryPaisa =
    expected.refundDeliveryPaisa ?? savedDeliveryPaisa;
  const unitOrdinal = expected.unitOrdinal ?? 1;
  const requestTag = `priced-return-unit-${unitOrdinal}`;
  const evidenceId = `${requestTag}-retained-inspection`;
  const evidenceContent =
    'Fictional independently reviewed delivery and returned item evidence.';
  const request = await createCustomerReturnRequest(f.db, {
    orderNumber: f.orderNumber,
    customerId: 'customer',
    receiptTokenHash: null,
    orderItemId: f.orderItemId,
    quantity: 1,
    reason,
    requestedResolution: 'refund',
    originalSealIntact: reason === 'change_of_mind',
    detail: 'Review the original fictional delivered cup and supporting facts.',
    locale: 'en-NP',
    idempotencyKey: `${requestTag}-request`,
    now: Date.now(),
    evidence: [
      {
        id: evidenceId,
        objectKey: `private/fixture-priced-return/${evidenceId}.pdf`,
        originalName: 'fictional-inspection.pdf',
        mimeType: 'application/pdf',
        sizeBytes: Buffer.byteLength(evidenceContent),
        sha256: createHash('sha256').update(evidenceContent).digest('hex'),
      },
    ],
  });
  const delivery = await originalReturnDelivery(f.db, request.id);
  assert.equal(delivery.kind, 'ready');
  assert.equal(delivery.amountPaisa, savedDeliveryPaisa);
  const approval = {
    returnRequestId: request.id,
    actorId: 'reviewer',
    actorRole: 'super_admin' as const,
    action: 'approve' as const,
    responsibility,
    outcome: 'refund' as const,
    itemRefundPaisa: 24_000,
    decisionEvidenceReference: evidenceId,
    ...(responsibility === 'platform' || responsibility === 'carrier'
      ? { correctSellerFulfillment: true }
      : {}),
    note: 'Review the exact original fictional buyer entitlement and explicit responsibility.',
    publicMessageEn: 'Your return was approved.',
    publicMessageNe: 'तपाईंको फिर्ता स्वीकृत भयो।',
    requestId: `${requestTag}-review`,
    now: Date.now(),
  };
  if (reason === 'change_of_mind') {
    await assert.rejects(
      () =>
        reviewReturnAsAdmin(f.db, {
          ...approval,
          requestId: `${requestTag}-incorrect-delivery`,
          deliveryRefundPaisa:
            refundDeliveryPaisa === 0 ? savedDeliveryPaisa : 0,
        }),
      ReturnConflictError,
    );
  }
  if (responsibility === 'platform' || responsibility === 'carrier') {
    for (const [index, correctSellerFulfillment] of [
      false,
      undefined,
    ].entries()) {
      const attempted = {
        ...approval,
        correctSellerFulfillment,
        requestId: `${requestTag}-unconfirmed-fulfillment-${index}`,
      };
      await assert.rejects(
        () => reviewReturnAsAdmin(f.db, attempted),
        ReturnConflictError,
      );
    }
  }
  assert.equal(
    f.sqlite
      .prepare('SELECT 1 FROM refunds WHERE return_request_id=?')
      .get(request.id),
    undefined,
  );
  assert.equal(
    f.sqlite
      .prepare(
        'SELECT 1 FROM refund_variant_pricing_effects effect JOIN refunds r ON r.id=effect.refund_id WHERE r.return_request_id=?',
      )
      .get(request.id),
    undefined,
  );
  await reviewReturnAsAdmin(f.db, approval);
  const refund = f.sqlite
    .prepare(`SELECT id,item_amount_paisa AS goods,delivery_amount_paisa AS delivery,
    amount_paisa AS total,commission_base_refunded_paisa AS sellerCommissionBase
    FROM refunds WHERE return_request_id=?`)
    .get(request.id);
  assert.ok(typeof refund?.id === 'string');
  assert.equal(refund.goods, 24_000);
  assert.equal(refund.delivery, refundDeliveryPaisa);
  assert.equal(refund.total, 24_000 + refundDeliveryPaisa);
  const effects = f.sqlite
    .prepare(`SELECT policy_version AS policy, order_item_id AS item,
    quantity, unit_ordinals_json AS ordinals, gross_item_paisa AS gross,
    seller_principal_paisa AS sellerPrincipal, platform_addition_paisa AS addition,
    tax_paisa AS tax, unallocated_merchandise_paisa AS unallocated,
    saved_delivery_share_paisa AS savedDelivery, retained_outbound_paisa AS retainedOutbound,
    voluntary_policy_version AS voluntaryPolicy,
    decision_evidence_reference AS evidence, correct_seller_fulfillment AS sellerFulfillment, approved_by AS reviewer
    FROM refund_variant_pricing_effects WHERE refund_id=?`)
    .get(refund.id);
  assert.ok(effects);
  assert.equal(effects.policy, 'saved_variant_return_v1');
  assert.equal(effects.item, f.orderItemId);
  assert.equal(effects.quantity, 1);
  assert.deepEqual(JSON.parse(String(effects.ordinals)), [unitOrdinal]);
  assert.equal(effects.gross, 24_000);
  assert.equal(
    effects.sellerPrincipal,
    responsibility === 'seller' ? 20_000 : 0,
  );
  assert.equal(effects.addition, 4_000);
  assert.equal(effects.tax, 0);
  assert.equal(effects.unallocated, responsibility === 'seller' ? 4_000 : 0);
  assert.equal(effects.savedDelivery, savedDeliveryPaisa);
  assert.equal(
    effects.retainedOutbound,
    savedDeliveryPaisa - refundDeliveryPaisa,
  );
  assert.equal(
    effects.voluntaryPolicy,
    refundDeliveryPaisa < savedDeliveryPaisa
      ? voluntaryDisclosure.version
      : null,
  );
  assert.equal(effects.evidence, evidenceId);
  if (responsibility === 'platform' || responsibility === 'carrier')
    assert.equal(effects.sellerFulfillment, 1);
  assert.equal(effects.reviewer, 'reviewer');
  return {
    refundId: refund.id,
    returnId: request.id,
    sellerCommissionBase: refund.sellerCommissionBase,
  };
}

function sellerEntries(f: PricedFixture) {
  return f.sqlite
    .prepare(`SELECT type,amount_paisa AS amount FROM seller_ledger_entries
    WHERE order_item_id=? AND type IN ('sale','commission','refund','commission_reversal') ORDER BY type`)
    .all(f.orderItemId)
    .map((row) => ({ ...row }));
}

const originalSellerEntries = [
  { type: 'commission', amount: -2_400 },
  { type: 'sale', amount: 20_000 },
];

async function verifyOriginalSellerBeneficiary(f: PricedFixture) {
  const seller = f.sqlite
    .prepare(
      "SELECT legal_name AS holder FROM seller_profiles WHERE id='registered'",
    )
    .get();
  assert.ok(typeof seller?.holder === 'string');
  assert.equal(
    f.sqlite
      .prepare(
        "SELECT 1 FROM seller_beneficiary_versions WHERE seller_id='registered'",
      )
      .get(),
    undefined,
  );
  // This placeholder has no retained beneficiary history in the checkout fixture.
  f.sqlite
    .prepare(
      "UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='registered' AND payout_account_reference='FIX-BANK'",
    )
    .run();
  const before = await sellerBankState(f.db, 'registered');
  await submitSellerBankDetails(f.db, {
    sellerId: 'registered',
    actorId: 'registered-owner',
    revision: before.revision,
    now: Date.now(),
    details: {
      payoutBeneficiary: seller.holder,
      bankName: 'Fictional Seller Bank',
      bankBranch: 'Fictional branch',
      bankAccountNumber: 'TEST-PRICED-RETURN-SELLER',
    },
    document: {
      id: 'priced-return-bank-proof',
      kind: 'bank_verification',
      objectKey: 'private/seller-documents/registered/priced-return-bank-proof',
      originalName: 'fictional-seller-bank.png',
      mimeType: 'image/png',
      sizeBytes: 20,
    },
  });
  const proposed = await sellerBankState(f.db, 'registered');
  await reviewSellerBankDetails(f.db, {
    sellerId: 'registered',
    actorId: 'reviewer',
    revision: proposed.revision,
    now: Date.now(),
    reference: 'FICTIONAL-VERIFIED-SELLER-OWNERSHIP',
    reason:
      'Independently verify the seller legal entity and its original fictional beneficiary.',
    ownershipBasis: 'same_legal_entity',
    identityEvidenceConfirmed: true,
    releaseBankHold: true,
    commandId: 'priced-return-seller-bank-review',
  });
}

void test('a priced historical order retains the original favorable delivery refund on a voluntary return', async () => {
  const f = await pricedReturnFixture();
  try {
    await approveReturn(f, 'buyer', 'change_of_mind');
  } finally {
    f.dispose();
  }
});

void test('a saved disclosure preserves the favorable original delivery promise if the order promised it', async () => {
  const f = await pricedReturnFixture({
    disclosure: { ...voluntaryDisclosure, outboundRefundPromised: true },
  });
  try {
    await approveReturn(f, 'buyer', 'change_of_mind');
  } finally {
    f.dispose();
  }
});

void test('saved voluntary terms retain one legacy delivery share and the later fault refund pays only its own share', async () => {
  const f = await pricedReturnFixture({
    quantity: 2,
    disclosure: voluntaryDisclosure,
  });
  try {
    const delivery = f.sqlite
      .prepare(`SELECT amount_paisa AS amount,original_quantity AS quantity,
      policy_version AS policy FROM order_delivery_allocations WHERE order_item_id=?`)
      .get(f.orderItemId);
    assert.deepEqual(
      { ...delivery },
      {
        amount: 15_000,
        quantity: 2,
        policy: 'original_seller_item_largest_remainder_v1',
      },
    );
    const voluntary = await approveReturn(f, 'buyer', 'change_of_mind', {
      savedDeliveryPaisa: 7_500,
      refundDeliveryPaisa: 0,
      unitOrdinal: 1,
    });
    const initialHandling = await getReturnHandling(f.db, voluntary.returnId);
    assert.ok(initialHandling);
    await recordReturnHandling(
      f.db,
      reviewerCommand(
        'priced-voluntary-instructions',
        String(initialHandling.revision),
      ),
      {
        caseId: voluntary.returnId,
        action: 'instructions',
        occurredAt: initialHandling.now,
        publicMessage:
          'Use the original approved voluntary return instructions.',
        privateNote:
          'Record the original saved disclosure and safe fictional handling evidence.',
        evidenceReference: 'priced-return-unit-1-retained-inspection',
        instructions: {
          destination: 'Fictional Kathmandu returns desk',
          method: 'Reviewed carrier return',
          packaging: 'Protect the ceramic item in its original packaging.',
          safeHandlingConfirmed: true,
        },
      },
    );
    const instructed = await getReturnHandling(f.db, voluntary.returnId);
    assert.ok(instructed?.instructionsJson);
    assert.equal(JSON.parse(instructed.instructionsJson).fundedBy, 'buyer');
    await recordReturnHandling(
      f.db,
      reviewerCommand('priced-voluntary-waiver', String(instructed.revision)),
      {
        caseId: voluntary.returnId,
        action: 'waive_return',
        occurredAt: instructed.now,
        quantity: 1,
        publicMessage: 'Reviewed evidence is sufficient for this unit.',
        privateNote:
          'The independent review waives physical return of this fictional unit.',
        evidenceReference: 'priced-return-unit-1-retained-inspection',
      },
    );
    const first = await executeFixtureRefund(f.db, {
      actorId: 'reviewer',
      kind: 'return_refund',
      sourceId: voluntary.refundId,
      customerId: 'customer',
    });
    assert.equal(
      (await getRefundObligation(f.db, first.obligationId))?.cashPaisa,
      24_000,
    );
    const closed = await getCustomerReturnDetail(
      f.db,
      voluntary.returnId,
      f.orderNumber,
      null,
      'customer',
    );
    assert.equal(closed?.status, 'resolved');
    assert.equal(closed.refundStatus, 'paid');

    const fault = await approveReturn(f, 'seller', 'damaged', {
      savedDeliveryPaisa: 7_500,
      unitOrdinal: 2,
    });
    const second = await executeFixtureRefund(f.db, {
      actorId: 'reviewer',
      kind: 'return_refund',
      sourceId: fault.refundId,
      customerId: 'customer',
    });
    assert.equal(
      (await getRefundObligation(f.db, second.obligationId))?.cashPaisa,
      31_500,
    );
    const totals = f.sqlite
      .prepare(`SELECT SUM(r.delivery_amount_paisa) AS paidDelivery,
      SUM(e.retained_outbound_paisa) AS retainedDelivery, SUM(r.amount_paisa) AS total
      FROM refunds r JOIN refund_variant_pricing_effects e ON e.refund_id=r.id
      WHERE r.order_id=? AND r.status='paid'`)
      .get(f.orderId);
    assert.deepEqual(
      { ...totals },
      { paidDelivery: 7_500, retainedDelivery: 7_500, total: 55_500 },
    );
  } finally {
    f.dispose();
  }
});

for (const responsibility of ['seller', 'platform', 'carrier'] as const) {
  void test(`a ${responsibility}-fault return pays the captured buyer amount and applies the original seller economics`, async () => {
    const f = await pricedReturnFixture();
    try {
      assert.deepEqual(sellerEntries(f), originalSellerEntries);
      const { refundId, returnId, sellerCommissionBase } = await approveReturn(
        f,
        responsibility,
        'damaged',
      );
      assert.equal(
        sellerCommissionBase,
        responsibility === 'seller' ? 20_000 : 0,
      );
      const costs = f.sqlite
        .prepare(`SELECT component,party,seller_id AS sellerId,amount_paisa AS amount
        FROM refund_cost_allocations WHERE refund_id=? ORDER BY component`)
        .all(refundId);
      assert.deepEqual(
        costs.map((row) => ({ ...row })),
        [
          responsibility === 'seller'
            ? {
                component: 'merchandise',
                party: 'seller',
                sellerId: 'registered',
                amount: 20_000,
              }
            : {
                component: 'merchandise',
                party: responsibility,
                sellerId: null,
                amount: 24_000,
              },
          {
            component: 'original_delivery',
            party: 'platform',
            sellerId: null,
            amount: 15_000,
          },
        ],
      );
      const execution = await executeFixtureRefund(f.db, {
        actorId: 'reviewer',
        kind: 'return_refund',
        sourceId: refundId,
        customerId: 'customer',
        deferCompletion: true,
      });
      const bankDebits = f.sqlite.prepare(`SELECT amount_paisa AS amount
        FROM company_outgoing_bank_identities WHERE packet_kind='refund' AND packet_id=?`);
      const processing = await getRefundObligation(
        f.db,
        execution.obligationId,
      );
      assert.ok(processing);
      assert.equal(processing.state, 'processing');
      assert.equal(processing.cashPaisa, 39_000);
      assert.deepEqual(
        JSON.parse(processing.sourceSnapshotJson).variantPricingEffect,
        {
          policyVersion: 'saved_variant_return_v1',
          orderItemId: f.orderItemId,
          grossItemPaisa: 24_000,
          sellerPrincipalPaisa: responsibility === 'seller' ? 20_000 : 0,
          unallocatedMerchandisePaisa: responsibility === 'seller' ? 4_000 : 0,
          savedDeliverySharePaisa: 15_000,
          retainedOutboundPaisa: 0,
        },
      );
      assert.deepEqual(sellerEntries(f), originalSellerEntries);
      assert.equal(bankDebits.get(execution.packetId), undefined);

      const paid = await execution.complete();
      assert.deepEqual(await execution.complete(), paid);
      assert.equal(paid.state, 'paid');
      assert.deepEqual(
        bankDebits.all(execution.packetId).map((row) => row.amount),
        [39_000],
      );
      assert.equal(
        (await getRefundObligation(f.db, execution.obligationId))?.state,
        'completed',
      );
      const detail = await getCustomerReturnDetail(
        f.db,
        returnId,
        f.orderNumber,
        null,
        'customer',
      );
      assert.equal(detail?.refundAmountPaisa, 39_000);
      assert.equal(detail?.refundCashPaisa, 39_000);
      assert.equal(detail?.refundStatus, 'paid');
      if (responsibility === 'seller') {
        assert.deepEqual(sellerEntries(f), [
          { type: 'commission', amount: -2_400 },
          { type: 'commission_reversal', amount: 2_400 },
          { type: 'refund', amount: -20_000 },
          { type: 'sale', amount: 20_000 },
        ]);
      } else {
        assert.deepEqual(sellerEntries(f), originalSellerEntries);
      }
    } finally {
      f.dispose();
    }
  });
}

void test('seller fault traces precisely NPR 176 to a verified original seller payout', async () => {
  const f = await pricedReturnFixture({ immediateSellerSettlement: true });
  try {
    assert.deepEqual(sellerEntries(f), originalSellerEntries);
    await verifyOriginalSellerBeneficiary(f);
    f.sqlite
      .exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at)
      VALUES ('super-1','super-1','super-1@local.hastabazaar.test','Fictional company funding reviewer','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super-1','super_admin',1);`);
    const sources = await legacyPayoutCapital(f.db);
    const payout = await prepareSellerPayout(f.db, {
      sellerId: 'registered',
      actorId: 'reviewer',
      actorRole: 'super_admin',
      note: 'Prepare the original contractually earned fictional proceeds.',
      requestId: 'priced-return-original-seller-payout',
      now: Date.now(),
    });
    assert.equal(
      f.sqlite
        .prepare('SELECT amount_paisa AS amount FROM payouts WHERE id=?')
        .get(payout.id)?.amount,
      17_600,
    );
    const originalPayment = await cataloguePayoutPacket(f, {
      actorId: 'reviewer',
      model: 'registered',
      payoutId: payout.id,
      accountVersionId: sources.accountVersionId,
      amountPaisa: 17_600,
    });
    await originalPayment.complete();
    assert.equal(
      f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(payout.id)
        ?.status,
      'paid',
    );

    const { refundId } = await approveReturn(f, 'seller', 'damaged');
    await executeFixtureRefund(f.db, {
      actorId: 'reviewer',
      kind: 'return_refund',
      sourceId: refundId,
      customerId: 'customer',
    });
    const recovery = await readSellerRecoverySource(f.db, {
      kind: 'refund',
      id: refundId,
    });
    assert.equal(recovery.orderItemId, f.orderItemId);
    assert.equal(recovery.nativeDebitPaisa, 17_600);
    assert.equal(recovery.confirmedPaisa, 17_600);
    assert.deepEqual(recovery.originalPayoutIds, [payout.id]);
    assert.equal(recovery.blocker, null);
  } finally {
    f.dispose();
  }
});
