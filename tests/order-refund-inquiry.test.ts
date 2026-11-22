import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpaqueToken, hashOpaqueToken } from '../lib/cart/session';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { checkoutCommitClock } from '../lib/checkout/commit-policy-guards';
import { createCustomerReturnRequest, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { listParcels, operateParcel } from '../lib/operations/parcels';
import { recordCustomerRefundReversal, retainCustomerRefundRecovery } from '../lib/payments/customer-refund-reversal';
import { allocateBankReceipt, recordBankReceipt } from '../lib/payments/manual-receipts';
import { readOrderRefundInquiry } from '../lib/payments/order-refund-inquiry';
import { getSellerRecoveryReview } from '../lib/payments/seller-recovery';
import { commerceOrderFixture } from './helpers/commerce-order-fixture';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { refundFundingFixture } from './helpers/refund-funding-fixture';
import { approvedSellerRecoveryFixture } from './helpers/seller-recovery-fixture';

async function deliverSeller(fixture: Awaited<ReturnType<typeof commerceOrderFixture>>, sellerId: string) {
  const parcel = (await listParcels(fixture.database, fixture.orderId)).find(item => item.sellerId === sellerId);
  assert.ok(parcel);
  fixture.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=? AND seller_id=?")
    .run(fixture.orderId, sellerId);
  for (const [index, action] of ['assign', 'dispatch', 'deliver'].entries()) {
    await operateParcel(fixture.database, {
      jobId: parcel.id,
      actorId: 'owner',
      action,
      version: parcel.version + index,
      requestId: `inquiry-${sellerId}-${action}`,
      now: Date.now(),
      note: 'Record the actual isolated fixture delivery.',
      ...(action === 'assign' ? { method: 'courier', courierName: 'Fictional Courier', trackingCode: `TEST-${sellerId}` } : {}),
    });
  }
  return (await listParcels(fixture.database, fixture.orderId)).find(item => item.id === parcel.id)!;
}

async function approveFirstSellerReturn(fixture: Awaited<ReturnType<typeof commerceOrderFixture>>, receiptTokenHash?: string) {
  const line = fixture.sqlite.prepare("SELECT id,line_total_paisa AS amount FROM order_items WHERE order_id=? AND seller_id='seller-a'")
    .get(fixture.orderId)!;
  const request = await createCustomerReturnRequest(fixture.database, {
    orderNumber: fixture.placed.orderNumber,
    customerId: receiptTokenHash ? null : 'checkout-buyer',
    receiptTokenHash: receiptTokenHash ?? null,
    orderItemId: String(line.id), quantity: 1, reason: 'defective', requestedResolution: 'refund',
    detail: 'An independently verified defect was reported against the original delivered item.',
    locale: 'en-NP', idempotencyKey: 'inquiry-return', evidence: [], now: Date.now(),
  });
  await reviewReturnAsAdmin(fixture.database, {
    returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin', action: 'approve',
    responsibility: 'platform', outcome: 'refund', itemRefundPaisa: Number(line.amount),
    note: 'Approve the exact original fixture customer refund.',
    publicMessageEn: 'Your refund has been approved.', publicMessageNe: 'फिर्ता रकम स्वीकृत भयो।',
    requestId: 'inquiry-return-approved', now: Date.now(),
  });
  return Number(fixture.sqlite.prepare('SELECT amount_paisa FROM refunds WHERE return_request_id=?').get(request.id)!.amount_paisa);
}

void test('refund inquiry requires the active original account or the exact legacy guest receipt', async () => {
  const fixture = await commerceOrderFixture();
  try {
    const orderNumber = fixture.placed.orderNumber;
    const receiptTokenHash = await hashOpaqueToken(createOpaqueToken());
    fixture.sqlite.prepare('UPDATE orders SET receipt_token_hash=? WHERE id=?').run(receiptTokenHash, fixture.orderId);
    const guest = { kind: 'guest' as const, receiptTokenHash };
    const owner = { kind: 'account' as const, customerId: 'checkout-buyer' };
    const readAs = (viewer: typeof guest | typeof owner, number = orderNumber) => readOrderRefundInquiry(fixture.database, number, viewer);
    assert.deepEqual(await readAs(owner), { state: 'no_cash_refund', amountPaisa: 0 });
    assert.equal(await readAs(guest), null);
    assert.equal(await readAs({ ...owner, customerId: 'owner' }), null);
    fixture.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='checkout-buyer'").run();
    assert.equal(await readAs(owner), null);
    fixture.sqlite.prepare('UPDATE orders SET customer_id=NULL WHERE id=?').run(fixture.orderId);
    assert.deepEqual(await readAs(guest), { state: 'no_cash_refund', amountPaisa: 0 });
    assert.equal(await readAs({ ...guest, receiptTokenHash: '0'.repeat(64) }), null);
    assert.equal(await readAs(guest, orderNumber + '-other'), null);
    assert.equal(await readAs(owner), null);
  } finally { await fixture.dispose(); }
});

void test('verified courier collection is owed to the guest before company remittance', async () => {
  const fixture = await commerceOrderFixture();
  try {
    const receiptTokenHash = await hashOpaqueToken(createOpaqueToken());
    fixture.sqlite.prepare('UPDATE orders SET customer_id=NULL,receipt_token_hash=? WHERE id=?').run(receiptTokenHash, fixture.orderId);
    const parcel = await deliverSeller(fixture, 'seller-a');
    await fixture.operate('collect', { amountPaisa: parcel.codDuePaisa, reference: 'FICTIONAL-GUEST-COLLECTION', now: Date.now() });
    const amount = await approveFirstSellerReturn(fixture, receiptTokenHash);
    const before = fixture.sqlite.prepare('SELECT total_changes() AS changes').get();
    assert.equal(fixture.sqlite.prepare('SELECT remitted_paisa FROM shipping_parcels WHERE shipping_job_id=?').get(parcel.id)!.remitted_paisa, 0);
    assert.deepEqual(await readOrderRefundInquiry(fixture.database, fixture.placed.orderNumber, { kind: 'guest', receiptTokenHash }),
      { state: 'owed', amountPaisa: amount });
    assert.deepEqual(fixture.sqlite.prepare('SELECT total_changes() AS changes').get(), before);
  } finally { await fixture.dispose(); }
});

void test('a saved uncollected COD cancellation carries no cash refund', async () => {
  const fixture = await commerceOrderFixture();
  try {
    const preview = await cancellationPreview(fixture.database, fixture.access, ['seller-a']);
    await cancelSelectedParcels(fixture.database, fixture.access, {
      sellerIds: ['seller-a'], fingerprint: preview.fingerprint, requestId: 'inquiry-uncollected-cancellation',
      note: 'Cancel the fictional order before any courier collection.', now: Date.now(),
    });
    assert.equal(fixture.sqlite.prepare('SELECT cash_paisa FROM cancellation_refund_sources WHERE order_id=?').get(fixture.orderId)!.cash_paisa, 0);
    assert.deepEqual(await readOrderRefundInquiry(fixture.database, fixture.placed.orderNumber, { kind: 'account', customerId: 'checkout-buyer' }),
      { state: 'no_cash_refund', amountPaisa: 0 });
  } finally { await fixture.dispose(); }
});

void test('a missing delivered COD record stays in reconciliation even if another seller posted collection', async () => {
  const fixture = await commerceOrderFixture(true);
  try {
    await deliverSeller(fixture, 'seller-a');
    const other = await deliverSeller(fixture, 'seller-b');
    await operateParcel(fixture.database, { jobId: other.id, actorId: 'owner', action: 'collect', version: other.version,
      note: 'Record original collection for the other seller shipment.', requestId: 'inquiry-other-collection',
      now: Date.now(), amountPaisa: other.codDuePaisa, reference: 'FICTIONAL-OTHER-SELLER-COLLECTION' });
    await approveFirstSellerReturn(fixture);
    assert.deepEqual(await readOrderRefundInquiry(fixture.database, fixture.placed.orderNumber, { kind: 'account', customerId: 'checkout-buyer' }),
      { state: 'needs_reconciliation', amountPaisa: null });
  } finally { await fixture.dispose(); }
});

void test('an approved bank refund shows the actual cash balance after original shopping credit', async () => {
  const fixture = await refundFundingFixture(20000);
  try {
    const amounts = fixture.sqlite.prepare('SELECT amount_paisa AS gross,wallet_credit_paisa AS wallet FROM refunds WHERE id=?')
      .get(fixture.refundId)!;
    assert.equal(amounts.wallet, 20000);
    assert.deepEqual(await readOrderRefundInquiry(fixture.db, fixture.order.orderNumber, { kind: 'account', customerId: 'customer' }),
      { state: 'owed', amountPaisa: Number(amounts.gross) - Number(amounts.wallet) });
  } finally { fixture.dispose(); }
});

void test('an apparently approved cash refund without its original approval needs reconciliation', async () => {
  const fixture = await refundFundingFixture();
  try {
    fixture.sqlite.prepare('UPDATE refunds SET approved_at=NULL WHERE id=?').run(fixture.refundId);
    assert.deepEqual(await readOrderRefundInquiry(fixture.db, fixture.order.orderNumber, { kind: 'account', customerId: 'customer' }),
      { state: 'needs_reconciliation', amountPaisa: null });
  } finally { fixture.dispose(); }
});

void test('a historical service fee refund recorded only in the exact order audit needs reconciliation', async () => {
  const fixture = await manualOrderFixture({ serviceFee: true });
  try {
    const orderId = fixture.orderId;
    const amount = fixture.order.grandTotalPaisa;
    const ctx = (requestId: string, expectedRevision: string | null = null) => ({
      actorId: 'reviewer', requestId, expectedRevision, now: Date.now(),
    });
    const receipt = await recordBankReceipt(fixture.db, ctx('historical-fee-receipt'), {
      accountVersionId: fixture.accountVersionId, transactionIdentity: 'FICTIONAL-HISTORICAL-FEE-CREDIT',
      bankAt: fixture.now, amountMinor: amount, currency: 'NPR', payerReference: 'Original fictional buyer',
      payerUserId: 'customer', evidenceReference: 'FICTIONAL-VERIFIED-FEE-CREDIT', completedCreditConfirmed: true,
      conflictUserIds: [], reason: 'Verify the original fictional checkout payment including its service fee.',
    });
    await allocateBankReceipt(fixture.db, ctx('historical-fee-allocation', '0'), {
      receiptId: receipt.id, orderId, amountPaisa: amount, expectedWindowRevision: 0,
      matchingBasis: 'Match the exact original fictional order and payment.', exceptionApproval: null,
    });
    const fee = Number(fixture.sqlite.prepare('SELECT buyer_platform_fee_paisa FROM orders WHERE id=?')
      .get(orderId)!.buyer_platform_fee_paisa);
    assert.ok(fee > 0);
    const recordHistoricalFee = (subjectId: string, id: string, executionPacketId?: unknown) => fixture.sqlite.prepare(`INSERT INTO audit_logs
      (id,actor_id,action,subject_type,subject_id,next_json,request_id,created_at)
      VALUES(?,'reviewer','platform_service_fee.refunded','order',?,?,?,?)`).run(id, subjectId, JSON.stringify({
      kind: 'lawful_platform_service_fee_refund_v1', status: 'paid', liability: 'platform', executionPacketId,
      request: { orderId: subjectId, amountPaisa: fee, paymentReference: 'FICTIONAL-OLD-FEE-REFERENCE' },
    }), id, Date.now());
    const inquiry = (customerId = 'customer') => readOrderRefundInquiry(
      fixture.db, fixture.order.orderNumber, { kind: 'account', customerId },
    );
    recordHistoricalFee(orderId + '-other', 'unrelated-historical-fee');
    recordHistoricalFee(orderId, 'modern-fee-audit', 'FICTIONAL-MODERN-EXECUTION-PACKET');
    assert.deepEqual(await inquiry(), { state: 'no_cash_refund', amountPaisa: 0 });
    const historicalAudit = 'legacy-audit-only-fee';
    recordHistoricalFee(orderId, historicalAudit);
    assert.deepEqual(await inquiry(), { state: 'needs_reconciliation', amountPaisa: null });
    for (const marker of [{}, [], 0, false, null, '', '   ']) {
      fixture.sqlite.prepare("UPDATE audit_logs SET next_json=? WHERE id=?")
        .run(JSON.stringify({ executionPacketId: marker }), historicalAudit);
      assert.deepEqual(await inquiry(), { state: 'needs_reconciliation', amountPaisa: null }, JSON.stringify(marker));
    }
    assert.equal(await inquiry('reviewer'), null);
  } finally { fixture.dispose(); }
});

void test('only the verified bank-return amount remains due until its exact linked retry settles', async () => {
  const fixture = await approvedSellerRecoveryFixture();
  try {
    const read = () => readOrderRefundInquiry(fixture.db, fixture.order.orderNumber, { kind: 'account', customerId: 'customer' });
    assert.deepEqual(await read(), { state: 'settled', amountPaisa: 0 });
    const packet = fixture.sqlite.prepare("SELECT id,revision,bank_at FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'")
      .get(fixture.obligationId)!;
    const amount = 10000;
    const receipt = await recordBankReceipt(fixture.db, fixture.ctx('inquiry-original-credit'), {
      accountVersionId: fixture.accountVersionId, transactionIdentity: 'FICTIONAL-INQUIRY-BANK-RETURN',
      bankAt: Math.max(Date.now() - 1, Number(packet.bank_at) + 1), amountMinor: amount, currency: 'NPR',
      payerReference: 'Original buyer', payerUserId: 'customer', evidenceReference: 'FICTIONAL-ORIGINAL-BANK-CREDIT',
      completedCreditConfirmed: true, conflictUserIds: [], reason: 'Verify the original independently recorded bank credit.',
    });
    assert.deepEqual(await read(), { state: 'settled', amountPaisa: 0 });
    const reversal = await recordCustomerRefundReversal(fixture.db, fixture.ctx('inquiry-link-bank-return', String(packet.revision)), {
      packetId: String(packet.id), receiptId: receipt.id, receiptRevision: 0, amountPaisa: amount,
      actualReversalConfirmed: true, evidenceReference: 'FICTIONAL-INQUIRY-EXACT-RETURN',
      reason: 'Independently verify the exact returned part of the original customer payment.',
    });
    assert.deepEqual(await read(), { state: 'owed', amountPaisa: amount });

    const retry = await fixture.m.openRefundObligation(fixture.db, fixture.ctx('inquiry-open-retry'), {
      kind: 'receipt_return', sourceId: receipt.id, reason: 'Open the exact returned cash refund for the original customer.',
    });
    const review = await getSellerRecoveryReview(fixture.db, 'reviewer', fixture.recoveryId);
    await retainCustomerRefundRecovery(fixture.db, fixture.ctx('inquiry-retain-retry', String(review.case.revision)), {
      caseId: fixture.recoveryId, reversalId: reversal.id, retryObligationId: retry.id, reviewDigest: review.reviewDigest,
      stillValidObligationConfirmed: true, evidenceReference: 'FICTIONAL-EXACT-CONTINUING-REFUND',
      reason: 'Retain the exact original obligation for the returned cash.', publicMessage: 'Finance will return the original cash owed.',
    });
    const destination = await fixture.m.submitRefundDestination(fixture.db, {
      ...fixture.ctx('inquiry-retry-destination'), actorId: 'customer', sessionHash: 'FICTIONAL-PACKET-SESSION',
    }, {
      obligationId: retry.id, relationship: 'own_account',
      details: { holder: 'Fictional Buyer', bank: 'Fictional Bank', branch: 'Fictional Branch', accountNumber: 'TEST-INQUIRY-RETURN', currency: 'NPR' },
      authorization: 'I authorize my original refund to this exact bank destination.', evidenceReference: 'FICTIONAL-INQUIRY-DESTINATION',
      reason: 'Retain the actual fictional buyer destination for this isolated retry.',
    });
    await fixture.m.verifyRefundDestination(fixture.db, fixture.ctx('inquiry-verify-retry', '0'), {
      versionId: destination.id, ownershipConfirmed: true, relationshipConfirmed: true,
      verificationReference: 'FICTIONAL-VERIFIED-INQUIRY-DESTINATION', reason: 'Verify exact original customer ownership.',
    });
    const fundingRevision = fixture.sqlite.prepare(`SELECT a.revision FROM company_funding_accounts a
      JOIN company_payment_account_versions v ON v.account_id=a.account_id WHERE v.id=?`).get(fixture.accountVersionId)!.revision;
    const now = async () => (await fixture.db.prepare(`SELECT ${checkoutCommitClock(fixture.db)} AS now`).first<{ now: number }>())!.now;
    const funding = await fixture.m.recordRefundFundingStatement(fixture.db, fixture.ctx('inquiry-retry-funding', String(fundingRevision)), {
      accountVersionId: fixture.accountVersionId, statementIdentity: 'FICTIONAL-INQUIRY-FUNDING', asOf: await now(),
      cashPaisa: 200000, restrictedPaisa: 50000, evidenceReference: 'FICTIONAL-PROVEN-COMPANY-FUNDING',
      restrictionsReference: 'FICTIONAL-PROTECTED-FUNDS', availableFundsConfirmed: true,
      reason: 'Independently verify available fictional company funds.',
    });
    const attempt = await fixture.m.prepareRefundPacket(fixture.db, fixture.ctx('inquiry-retry-packet', '0'), {
      obligationId: retry.id, destinationVersionId: destination.id, fundingStatementId: funding.id,
      reason: 'Prepare only the returned original customer refund cash.',
    });
    await fixture.m.approveRefundPacket(fixture.db, fixture.ctx('inquiry-approve-retry', '0'), {
      packetId: attempt.id, reason: 'Approve the exact customer payment and funding.',
    });
    await fixture.m.startRefundPacket(fixture.db, fixture.ctx('inquiry-start-retry', '1'), {
      packetId: attempt.id, reason: 'Record start against this exact returned credit.',
    });
    assert.deepEqual(await read(), { state: 'owed', amountPaisa: amount });
    await fixture.m.recordRefundPacketOutcome(fixture.db, fixture.ctx('inquiry-settle-retry', '2'), {
      packetId: attempt.id, outcome: 'paid', amountPaisa: amount, bankAt: await now(),
      transactionIdentity: 'FICTIONAL-INQUIRY-COMPLETED-RETRY', evidenceReference: 'FICTIONAL-INQUIRY-EXACT-RETRY-PROOF',
      completedTransferConfirmed: true, exactBeneficiaryConfirmed: true, reason: 'Confirm independently verified fictional settlement.',
    });
    assert.deepEqual(await read(), { state: 'settled', amountPaisa: 0 });
  } finally { fixture.dispose(); }
});
