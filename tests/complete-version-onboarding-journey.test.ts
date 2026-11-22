import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionOnboardingFixture, onboardingDocument} from './helpers/complete-version-onboarding-fixture';
import {startSellerRegistration} from '../lib/db/repositories/seller-commercial-access';
import {readSellerDraft, saveSellerDraft} from '../lib/sellers/draft-store';
import {readRegistration, saveRegistration} from '../lib/sellers/registration-store';
import {readOptionalRegistration} from '../lib/sellers/registration-intake';
import {reviewSellerApplication} from '../lib/db/repositories/seller-applications';
import {getRegisteredSellerTerms} from '../lib/db/repositories/marketplace-settings';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {verifySellerDocument} from '../lib/sellers/document-review';
import {sellerBankState, submitSellerBankDetails, reviewSellerBankDetails, privateBankWorkspace} from '../lib/sellers/bank-details';
import {publicationCategory, publicationSnapshot} from './helpers/product-publication-fixture';
import {publishCategoryContract} from '../lib/products/category-contracts';
import {saveProductWorkspace, submitProductIntake} from '../lib/products/intake-workspace';
import {getProductPublicationReview, reviewProductPublication} from '../lib/products/publication';
import {confirmOfferStock} from '../lib/products/offer-inventory';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {saveCompanyAccountDraft, submitCompanyAccountForReview, verifyCompanyAccount, publishCompanyReceivingAccount} from '../lib/payments/company-accounts';
import {companyDetails} from '../lib/content/company-details';
import {seedVerifiedCheckoutContact} from './helpers/checkout-contact';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {createManualBankOrder} from '../lib/db/repositories/orders';
import {recordBankReceipt, allocateBankReceipt} from '../lib/payments/manual-receipts';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
import {currentResponseNotice} from '../lib/orders/response-notifications';
import {transitionSellerFulfillment} from '../lib/db/repositories/fulfillment';
import {prepareSellerParcels, listParcels, operateParcel} from '../lib/operations/parcels';
import {accrueExistingDeliveredEarnings, requestSellerPayout, processPayoutRequest} from '../lib/db/repositories/payouts';
import {recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {preparePayoutTransfer, approvePayoutTransfer, startPayoutTransfer, recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {createCustomerReturnRequest, reviewReturnAsAdmin} from '../lib/db/repositories/returns';
import {executeFixtureRefund} from './helpers/execute-fixture-refund';
import {getCustomerRefundWorkspace} from '../lib/payments/refund-workspace';
import {openSellerRecovery, getSellerRecoveryReview, approveSellerRecovery, readOwnedSellerRecovery} from '../lib/payments/seller-recovery';

/** Same actual-schema/FK memory DB throughout. No browser, session login, upload transport or real bank claim. */
void test('optional applicant draft→seller approval→product review→verification→original payout/refund/recovery in one native memory journey', async () => {
  const f = await completeVersionOnboardingFixture(), realNow = Date.now;
  let now = f.now;
  const sellerId = 'journey-seller', ownerId = 'applicant', hour = 3_600_000;
  const ctx = (requestId: string, expectedRevision: string | null = null, actorId = 'reviewer') => ({actorId, requestId, expectedRevision, now});
  const advance = (value: number) => { now = value; };
  try {
    Date.now = () => now;
    f.sqlite.function('strftime', {varargs: true}, (...args) => String(args[0]) === '%s'
      ? String(Math.floor(now / 1000)) : (now % 60000 / 1000).toFixed(3).padStart(6, '0'));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_profiles').get()!.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE role='super_admin'").get()!.n, 1);

    await startSellerRegistration(f.db, {userId: ownerId, requestId: 'journey-start', now});
    const partialForm = new FormData(); partialForm.set('hasBusinessTaxRegistration', 'yes');
    const partial = readOptionalRegistration(partialForm);
    const bucket = {async put() { throw new Error('This journey does not upload files.'); }, async delete() {}} as unknown as R2Bucket;
    const draftInput = {revision: null, changeId: 'journey-private-draft', attemptId: 'journey-registration', formVersion: 1, answers: partial, files: {}};
    const draft = await saveSellerDraft(f.db, bucket, ownerId, draftInput, {}, now);
    assert.deepEqual(await saveSellerDraft(f.db, bucket, ownerId, draftInput, {}, now), draft);
    assert.deepEqual((await readSellerDraft(f.db, ownerId, now))?.answers, partial);
    assert.equal(await readSellerDraft(f.db, 'foreign', now), null);
    const validated = await validateSellerFormSubmission(f.db, 'seller.application', 1, [], undefined, {}, {optionalRegistration: true});
    const registrationBase = {userId: ownerId, email: 'applicant@local.hastabazaar.test', sellerId,
      form: {versionId: validated.versionId, answers: validated.answers}};
    const terms = await getRegisteredSellerTerms(f.db, now);
    const submitted = await saveRegistration(f.db, {...registrationBase, previous: null, documents: {}, newDocuments: [],
      answers: {...draft.answers, applicationAcknowledgement: ['yes'], acceptedTerms: ['yes'], sellerAgreementContext: [terms.context]},
      now, requestId: 'journey-partial-intake', digest: 'journey-partial-intake'});
    assert.ok(submitted.missing.length);
    assert.equal((await readRegistration(f.db, ownerId))?.ready, false);
    assert.equal(f.sqlite.prepare('SELECT accepted_by FROM seller_agreement_acceptance_history WHERE seller_id=?').get(sellerId)?.accepted_by, ownerId);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id=? AND role='seller'").get(ownerId)!.n, 0);
    await reviewSellerApplication(f.db, {sellerId, actorId: 'reviewer', action: 'start_review', reason: 'Review the actual incomplete fictional registration.', requestId: 'journey-review-partial', now});
    const approved = await reviewSellerApplication(f.db, {sellerId, actorId: 'reviewer', action: 'approve',
      reason: 'Approve the fictional seller to submit products while completing registration.', requestId: 'journey-seller-approved', now});
    assert.equal(approved.to, 'approved');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id=? AND role='seller'").get(ownerId)!.n, 1);
    assert.equal(f.sqlite.prepare('SELECT payout_account_reference FROM seller_profiles WHERE id=?').get(sellerId)!.payout_account_reference, null);
    assert.equal(f.sqlite.prepare('SELECT settlement_terms_reference FROM seller_profiles WHERE id=?').get(sellerId)!.settlement_terms_reference, `registered-seller-agreement:${terms.context}`);
    assert.deepEqual(f.sqlite.prepare("SELECT channel FROM notification_messages WHERE template_key='business.seller_application.result' AND related_id=? AND recipient_user_id=? ORDER BY channel").all(sellerId, ownerId).map(row => row.channel), ['email', 'in_app']);

    f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cups','journey-cups','Fictional Cups',1,0,1,1)");
    await publishCategoryContract(f.db, ctx('journey-category'), {categoryId: 'cups', contract: publicationCategory.contract, reason: 'Review actual preparation requirements for the fictional cup category.'});
    const snapshot = publicationSnapshot(); snapshot.answers.preparationDays = '2';
    snapshot.offers.axes = [{id: 'size', label: 'Size', values: [{id: 'medium', label: 'Medium'}, {id: 'large', label: 'Large'}]}];
    snapshot.offers.offers = ['medium', 'large'].map((id, index) => ({...snapshot.offers.offers[0], id, selection: {size: id},
      price: String(800 + index * 200), compareAt: '', stockFamilyKey: id, mediaId: id + '-photo', browseOnly: false}));
    const productInput = {...snapshot, formContext: null, sellerId, draftId: null, mediaIds: [] as string[]};
    const productDraft = await saveProductWorkspace(f.db, ctx('journey-product-draft', null, ownerId), productInput);
    // This fixture exercises ready-object ownership. The packaged browser lane verifies upload transport.
    for (const id of ['medium-photo', 'large-photo']) f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES(?,?,?,?,?,'image/png',100,'fictional-cup.png',?,'ready',?,?)")
      .run(id, productDraft.id, ownerId, 'journey-' + id, 'private/' + id + '.png', 'fictional-' + id, now, now);
    const attached = await saveProductWorkspace(f.db, ctx('journey-product-photos', String(productDraft.revision), ownerId), {...productInput, draftId: productDraft.id, mediaIds: ['medium-photo', 'large-photo']});
    const sent = await submitProductIntake(f.db, ctx('journey-product-submitted', String(attached.revision), ownerId), {draftId: productDraft.id, versionId: attached.versionId, intent: 'review', note: ''});
    const review = await getProductPublicationReview(f.db, 'reviewer', sent.caseId);
    assert.equal(review.candidate.workspaceVersionId, attached.versionId);
    assert.equal(await getPublicOfferSet(f.db, review.productId), null);

    const completedForm = new FormData();
    for (const [key, value] of Object.entries({hasBusinessTaxRegistration: 'yes', applicantType: 'company', legalName: 'Fictional Journey Company',
      tradingName: 'Fictional Journey Cups', representativeName: 'Fictional Representative', registrationAuthority: 'Fictional Registration Office',
      registrationNumber: 'FICTIONAL-JOURNEY-001', taxStatus: 'business_pan_only', taxRegistrationNumber: '987654321', phone: '9800000000', phoneCountry: 'NP',
      province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional workshop', publicCity: 'Kathmandu',
      pickupAddress: 'Fictional pickup address', returnAddress: 'Fictional return address', applicationAcknowledgement: 'yes', acceptedTerms: 'yes', sellerAgreementContext: terms.context})) completedForm.set(key, value);
    const answers = readOptionalRegistration(completedForm);
    const documents = {businessRegistration: onboardingDocument('business_registration'), panCertificate: onboardingDocument('pan_certificate'), representativeIdentity: onboardingDocument('representative_identity')};
    const previous = (await readRegistration(f.db, ownerId))!;
    const corrected = await saveRegistration(f.db, {...registrationBase, previous, answers, documents, newDocuments: Object.values(documents),
      now, requestId: 'journey-corrected-intake', digest: 'journey-corrected-intake'});
    assert.equal(corrected.reference, submitted.reference);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_profiles WHERE id=?').get(sellerId)!.status, 'approved');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents WHERE seller_id=? AND status=\'pending\'').get(sellerId)!.n, 3);
    assert.equal((await readRegistration(f.db, ownerId))?.version, previous.version + 1);
    for (const document of Object.values(documents)) await verifySellerDocument(f.db, {sellerId, documentId: document.id, actorId: 'reviewer',
      reason: 'Independently inspect this exact fictional company evidence.', commandId: 'journey-verify-' + document.kind, expectedReviewId: null, now});
    const verifiedDocuments = f.sqlite.prepare('SELECT * FROM seller_documents WHERE seller_id=? ORDER BY id').all(sellerId);
    await assert.rejects(saveRegistration(f.db, {...registrationBase, previous: (await readRegistration(f.db, ownerId))!,
      answers: {...answers, legalName: ['Unauthorized replacement name']}, documents, newDocuments: [], now,
      requestId: 'journey-locked-identity', digest: 'journey-locked-identity'}), /locked/);
    assert.throws(() => f.sqlite.prepare("UPDATE seller_documents SET object_key='private/changed' WHERE id=?").run(documents.representativeIdentity.id));
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_documents WHERE seller_id=? ORDER BY id').all(sellerId), verifiedDocuments);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_profiles WHERE id=?').get(sellerId)!.status, 'approved');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id=? AND role='seller'").get(ownerId)!.n, 1);
    assert.equal(f.sqlite.prepare('SELECT accepted_by FROM seller_agreement_acceptance_history WHERE seller_id=?').get(sellerId)!.accepted_by, ownerId);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM seller_agreement_acceptance_history WHERE seller_id=?').get(sellerId)!.count, 1);
    const bank = await sellerBankState(f.db, sellerId);
    await submitSellerBankDetails(f.db, {sellerId, actorId: ownerId, revision: bank.revision, commandId: 'journey-bank-submitted', now,
      details: {payoutBeneficiary: 'Fictional Journey Company', bankName: 'Fictional Bank', bankBranch: 'Fictional Branch', bankAccountNumber: 'TEST-JOURNEY-SELLER'}, document: onboardingDocument('bank_verification')});
    const pendingBank = await sellerBankState(f.db, sellerId);
    await reviewSellerBankDetails(f.db, {sellerId, actorId: 'reviewer', revision: pendingBank.revision, commandId: 'journey-bank-reviewed', now,
      reference: 'FICTIONAL-JOURNEY-OWNERSHIP', reason: 'Independently inspect the exact company beneficiary and bank evidence.', ownershipBasis: 'same_legal_entity', identityEvidenceConfirmed: true, releaseBankHold: true});
    assert.equal((await sellerBankState(f.db, sellerId)).status, 'verified');
    await assert.rejects(privateBankWorkspace(f.db, sellerId, 'foreign', 'owner', now));

    await reviewProductPublication(f.db, ctx('journey-product-published', String(review.revision)), {caseId: sent.caseId, versionId: review.candidate.versionId,
      expectedCaseRevision: String(review.caseRevision), action: 'approve_and_publish', reason: 'Review exact physical sizes, independent photos and original selling prices.', checks: {sameItem: true, accurateCover: true, eligibilityEvidence: []}});
    for (const id of ['medium', 'large']) await confirmOfferStock(f.db, ctx('journey-stock-' + id, null, ownerId), {offerId: id, available: 3, reason: 'Count actual independent fictional physical size stock.', independentStockConfirmed: true});
    const publicSet = (await getPublicOfferSet(f.db, review.productId))!; assert.ok(publicSet);

    const account = await saveCompanyAccountDraft(f.db, ctx('journey-company-bank'), {accountId: null, basedOnVersionId: null,
      details: {holder: companyDetails.legalName, bank: 'Fictional Company Bank', branch: 'Fictional Branch', accountNumber: 'TEST-JOURNEY-COMPANY', currency: 'NPR', purpose: 'both'},
      evidenceReference: 'FICTIONAL-JOURNEY-COMPANY-OWNERSHIP', conflictUserIds: [], reason: 'Record fictional company ownership for independent verification.'});
    await submitCompanyAccountForReview(f.db, ctx('journey-company-submit', '0'), {versionId: account.versionId, reason: 'Submit the exact fictional company account evidence.'});
    await verifyCompanyAccount(f.db, ctx('journey-company-verify', '1'), {versionId: account.versionId, ownershipConfirmed: true, currencyConfirmed: true, verificationReference: 'FICTIONAL-JOURNEY-COMPANY-VERIFIED', reason: 'Independently verify company ownership and currency.'});
    await publishCompanyReceivingAccount(f.db, ctx('journey-company-enable', '2'), {versionId: account.versionId, expectedReceivingRevision: 0, reason: 'Enable the exact verified fictional receiving account.'});
    await seedVerifiedCheckoutContact(f.db, 'customer', '9811111111', now);
    for (const [offerId, pricePaisa] of [['medium', 80000], ['large', 100000]] as const) await addOfferCartLine(f.db, 'journey-cart', {productId: review.productId, offerId,
      versionId: publicSet.versionId, publicVersionId: publicSet.publicVersionId, pricePaisa, quantity: 1, requestId: 'journey-cart-' + offerId}, now);
    const order = await createManualBankOrder(f.db, 'journey-cart', 'journey-receipt', {useWallet: false, customerAuthSubject: 'customer', customerEmail: 'customer@local.hastabazaar.test',
      customerPhone: '9811111111', locale: 'en-NP', termsAccepted: true, idempotencyKey: 'journey-checkout', address: {recipientName: 'Fictional Buyer', phone: '9811111111', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional locality'}}, now, 'customer');
    const orderId = String(f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!.id);
    const originals = f.sqlite.prepare('SELECT s.order_item_id,s.offer_id,s.snapshot_json,i.line_total_paisa FROM order_item_offer_snapshots s JOIN order_items i ON i.id=s.order_item_id WHERE i.order_id=? ORDER BY s.offer_id').all(orderId);
    const policy = f.sqlite.prepare('SELECT * FROM order_policy_acceptances WHERE order_id=?').all(orderId);
    assert.deepEqual(originals.map(row => [row.offer_id, row.line_total_paisa]), [['large', 100000], ['medium', 80000]]);
    const credit = await recordBankReceipt(f.db, ctx('journey-bank-credit'), {accountVersionId: account.versionId, transactionIdentity: 'FICTIONAL-JOURNEY-CREDIT', bankAt: now,
      amountMinor: order.grandTotalPaisa, currency: 'NPR', payerReference: 'Fictional exact customer', payerUserId: 'customer', evidenceReference: 'FICTIONAL-JOURNEY-COMPLETED-CREDIT', completedCreditConfirmed: true, conflictUserIds: [], reason: 'Independently verify the actual fictional incoming customer credit.'});
    const allocationInput = {receiptId: credit.id, orderId, amountPaisa: order.grandTotalPaisa, expectedWindowRevision: 0, matchingBasis: 'Match exact original customer, account, credit and order.', exceptionApproval: null};
    await allocateBankReceipt(f.db, ctx('journey-credit-allocation', '0'), allocationInput);
    const rows = f.sqlite.prepare('SELECT order_item_id id,released_at releasedAt FROM order_response_items WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?) ORDER BY order_item_id').all(orderId);
    assert.equal(rows.length, 2); const ids = rows.map(row => String(row.id)), releasedAt = Number(rows[0].releasedAt);
    const event = (kind: string) => f.sqlite.prepare('SELECT id,scope_json FROM order_response_events WHERE order_id=? AND kind=?').get(orderId, kind)!;
    const transition = (action: 'start_packing' | 'ready_for_pickup', itemIds: string[], requestId: string) => ({orderId, sellerId, actorId: ownerId, action, itemIds, note: 'PRIVATE-JOURNEY actual fictional preparation.', requestId, now});
    advance(releasedAt + 5 * hour); await assert.rejects(transitionSellerFulfillment(f.db, {...transition('start_packing', [ids[0]], 'journey-wrong-owner'), actorId: 'foreign'}));
    const firstPacking = transition('start_packing', [ids[0]], 'journey-packing-first'); await transitionSellerFulfillment(f.db, firstPacking); await transitionSellerFulfillment(f.db, firstPacking);
    advance(releasedAt + 6 * hour - 1); assert.equal((await processOrderResponseFollowup(f.db)).reminders, 0);
    advance(releasedAt + 6 * hour); assert.equal((await processOrderResponseFollowup(f.db)).reminders, 1); assert.equal((await processOrderResponseFollowup(f.db)).reminders, 0);
    assert.deepEqual(JSON.parse(String(event('reminder').scope_json)), [ids[1]]);
    advance(releasedAt + 12 * hour); assert.equal((await processOrderResponseFollowup(f.db)).escalations, 1); assert.equal((await processOrderResponseFollowup(f.db)).escalations, 0);
    for (const kind of ['released', 'reminder', 'escalation']) assert.deepEqual(f.sqlite.prepare("SELECT channel FROM notification_messages WHERE template_key='business.order.response' AND related_id=? AND recipient_user_id='reviewer' ORDER BY channel").all(String(event(kind).id)).map(row => row.channel), ['email', 'in_app']);
    const lateOrderNotices = f.sqlite.prepare(`SELECT recipient_user_id AS userId,channel,subject_en FROM notification_messages
      WHERE template_key='business.order.response' AND related_id=? AND audience_role='seller' ORDER BY channel`).all(String(event('escalation').id));
    assert.deepEqual(lateOrderNotices.map(row => [row.userId, row.channel, row.subject_en]), [
      [ownerId, 'email', 'Your order preparation is late'], [ownerId, 'in_app', 'Your order preparation is late'],
    ]);
    await transitionSellerFulfillment(f.db, transition('start_packing', [ids[1]], 'journey-packing-second'));
    await transitionSellerFulfillment(f.db, {...transition('ready_for_pickup', ids, 'journey-ready'), packedParcelWeightGrams: 500});
    assert.equal(await currentResponseNotice(f.db, String(event('reminder').id)), false); assert.equal(await currentResponseNotice(f.db, String(event('escalation').id)), false);
    await prepareSellerParcels(f.db, {orderId, actorId: 'reviewer', requestId: 'journey-parcel', now});
    for (const action of ['assign', 'dispatch', 'deliver']) { const parcel = (await listParcels(f.db, orderId))[0];
      await operateParcel(f.db, {jobId: parcel.id, actorId: 'reviewer', action, version: parcel.version, note: 'Record actual fictional original physical custody and progress.', requestId: 'journey-parcel-' + action, now,
        ...(action === 'assign' ? {method: 'courier', courierName: 'Fictional Journey Carrier', trackingCode: 'FICTIONAL-JOURNEY-DELIVERY'} : {})}); }
    const stages = f.sqlite.prepare("SELECT order_status FROM order_email_jobs WHERE order_id=? AND order_status IN ('dispatched','delivered') ORDER BY order_status").all(orderId);
    assert.deepEqual(stages.map(row => row.order_status), ['delivered', 'dispatched']);
    const progress = f.sqlite.prepare(`SELECT recipient_user_id,template_key,channel FROM notification_messages
      WHERE related_id=? AND template_key IN ('order.dispatched','order.delivered') ORDER BY template_key`).all(orderId);
    assert.deepEqual(progress.map(row => [row.recipient_user_id, row.template_key, row.channel]), [
      ['customer', 'order.delivered', 'in_app'], ['customer', 'order.dispatched', 'in_app'],
    ]);

    // Advance through the original seven-day settlement hold; never alter its snapshot to accelerate payment.
    await accrueExistingDeliveredEarnings(f.db, {actorId: 'reviewer', requestId: 'journey-earnings-held', now});
    const availableAt = Number(f.sqlite.prepare('SELECT MAX(available_at) at FROM seller_ledger_entries WHERE seller_id=?').get(sellerId)!.at);
    assert.ok(availableAt > now, 'The original delivery hold must remain effective.'); advance(availableAt + 1);
    await accrueExistingDeliveredEarnings(f.db, {actorId: 'reviewer', requestId: 'journey-earnings-mature', now});
    const requestInput = {sellerId, actorId: ownerId, note: '', requestId: 'journey-owner-payout-request', now};
    const payoutRequestId = await requestSellerPayout(f.db, requestInput);
    assert.equal(await requestSellerPayout(f.db, requestInput), payoutRequestId);
    const payoutRequest = f.sqlite.prepare('SELECT seller_note,purpose FROM payout_requests WHERE id=?').get(payoutRequestId)!;
    assert.equal(payoutRequest.seller_note, ''); assert.equal(payoutRequest.purpose, 'seller_earnings_payout');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_entries').get()!.n, 0);
    await processPayoutRequest(f.db, {id: payoutRequestId, actorId: 'reviewer', actorRole: 'super_admin', action: 'prepare', note: 'Prepare original matured fictional earnings after the recorded hold.', requestId: 'journey-payout', now});
    const payout = {id: String(f.sqlite.prepare('SELECT payout_id FROM payout_requests WHERE id=?').get(payoutRequestId)!.payout_id)};
    const payoutPaisa = Number(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa); assert.ok(payoutPaisa > 0);
    await recordRefundFundingStatement(f.db, ctx('journey-payout-funding'), {accountVersionId: account.versionId, statementIdentity: 'FICTIONAL-JOURNEY-CAPITAL', asOf: now, cashPaisa: 1000000, restrictedPaisa: order.grandTotalPaisa,
      evidenceReference: 'FICTIONAL-JOURNEY-ACTUAL-CAPITAL', restrictionsReference: 'FICTIONAL-JOURNEY-RESTRICTED-CREDIT', availableFundsConfirmed: true, reason: 'Independently verify fictional company capital and retained customer restrictions.'});
    const packet = await preparePayoutTransfer(f.db, ctx('journey-payout-packet'), {model: 'registered', payoutId: payout.id, accountVersionId: account.versionId, reason: 'Bind original matured earnings to the actual verified fictional beneficiary.'});
    await approvePayoutTransfer(f.db, ctx('journey-payout-approved', '0'), {packetId: packet.id, reason: 'One eligible Super Admin approves the exact original payout.'});
    await startPayoutTransfer(f.db, ctx('journey-payout-started', '1'), {packetId: packet.id, reason: 'Record one fictional manual bank instruction without a live transfer.'});
    const payoutOutcome = {packetId: packet.id, outcome: 'paid' as const, amountPaisa: payoutPaisa, bankAt: now, transactionIdentity: 'FICTIONAL-JOURNEY-SELLER-DEBIT', evidenceReference: 'FICTIONAL-JOURNEY-COMPLETED-SELLER-DEBIT', completedTransferConfirmed: true, exactBeneficiaryConfirmed: true, reason: 'Confirm the fictional completed original seller payment and exact beneficiary.'};
    const paidPayout = await recordPayoutTransferOutcome(f.db, ctx('journey-payout-paid', '2'), payoutOutcome);
    assert.deepEqual(await recordPayoutTransferOutcome(f.db, ctx('journey-payout-paid', '2'), payoutOutcome), paidPayout);

    const affected = originals[0];
    const returned = await createCustomerReturnRequest(f.db, {orderNumber: order.orderNumber, customerId: 'customer', receiptTokenHash: null, orderItemId: String(affected.order_item_id), quantity: 1,
      reason: 'defective', requestedResolution: 'refund', detail: 'The original delivered fictional cup has a documented defect.', locale: 'en-NP', idempotencyKey: 'journey-return', evidence: [], now});
    await reviewReturnAsAdmin(f.db, {returnRequestId: returned.id, actorId: 'reviewer', actorRole: 'super_admin', action: 'approve', responsibility: 'seller', outcome: 'refund', itemRefundPaisa: Number(affected.line_total_paisa),
      note: 'Approve only the original documented defect and actual entitlement.', publicMessageEn: 'Original refund approved; verified funding and payment remain separate.', publicMessageNe: 'फिर्ता रकम स्वीकृत भयो। भुक्तानी बाँकी छ।', requestId: 'journey-return-approved', now});
    const refundId = String(f.sqlite.prepare('SELECT id FROM refunds WHERE return_request_id=?').get(returned.id)!.id);
    const refunded = await executeFixtureRefund(f.db, {actorId: 'reviewer', kind: 'return_refund', sourceId: refundId, customerId: 'customer'});
    assert.equal((await getCustomerRefundWorkspace(f.db, 'customer')).find(row => row.id === refunded.obligationId)?.state, 'completed');
    assert.equal((await getCustomerRefundWorkspace(f.db, 'foreign')).some(row => row.id === refunded.obligationId), false);
    const recovery = await openSellerRecovery(f.db, ctx('journey-recovery-open'), {kind: 'refund', id: refundId, reason: 'Reconcile actual original paid earnings and the completed original customer refund.'});
    const recoveryReview = await getSellerRecoveryReview(f.db, 'reviewer', recovery.id);
    const recoveryInput = {caseId: recovery.id, reviewDigest: recoveryReview.reviewDigest, evidenceReference: 'FICTIONAL-JOURNEY-RESPONSIBILITY', reason: 'Approve only original paid seller responsibility after the customer refund.'};
    await approveSellerRecovery(f.db, ctx('journey-recovery-approved', '0'), recoveryInput);
    await approveSellerRecovery(f.db, ctx('journey-recovery-approved', '0'), recoveryInput);
    assert.ok(await readOwnedSellerRecovery(f.db, ownerId, recovery.id));
    await assert.rejects(readOwnedSellerRecovery(f.db, 'foreign', recovery.id));
    const recoveryRow = f.sqlite.prepare('SELECT state,confirmed_paisa,approved_cap_paisa,plan_json FROM seller_recovery_cases WHERE id=?').get(recovery.id)!;
    assert.equal(recoveryRow.state, 'open'); assert.ok(Number(recoveryRow.confirmed_paisa) > 0);
    assert.equal(recoveryRow.approved_cap_paisa, recoveryRow.confirmed_paisa); assert.equal(JSON.parse(String(recoveryRow.plan_json)).nettingAuthorized, false);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE case_id=? AND action='approved'").get(recovery.id)!.n, 1);
    assert.deepEqual(f.sqlite.prepare('SELECT packet_kind,COUNT(*) n FROM company_outgoing_bank_identities GROUP BY packet_kind ORDER BY packet_kind').all().map(row => [row.packet_kind, row.n]), [['payout', 1], ['refund', 1]]);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_allocations WHERE order_id=?').get(orderId)!.n, 1);
    assert.deepEqual(f.sqlite.prepare('SELECT template_key,request_id,recipient_user_id,channel,COUNT(*) n FROM notification_messages GROUP BY template_key,request_id,recipient_user_id,channel HAVING COUNT(*)>1').all(), []);
    assert.deepEqual(f.sqlite.prepare('SELECT s.order_item_id,s.offer_id,s.snapshot_json,i.line_total_paisa FROM order_item_offer_snapshots s JOIN order_items i ON i.id=s.order_item_id WHERE i.order_id=? ORDER BY s.offer_id').all(orderId), originals);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_policy_acceptances WHERE order_id=?').all(orderId), policy);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE body_en LIKE '%PRIVATE-JOURNEY%'").get()!.n, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_profiles').get()!.n, 1);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { Date.now = realNow; f.dispose(); }
});
