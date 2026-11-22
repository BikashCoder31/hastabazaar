import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionOnboardingFixture, onboardingDocument } from './helpers/complete-version-onboarding-fixture';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '../lib/db/repositories/marketplace-settings';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { readRegistration, readRegistrationProgress, saveRegistration } from '../lib/sellers/registration-store';
import { verifySellerDocument } from '../lib/sellers/document-review';

void test('an approved registered owner can save partial details and explicitly accept settlement terms', async () => {
  const f = await completeVersionOnboardingFixture();
  try {
    const { db, sqlite, now } = f;
    const userId = 'applicant', sellerId = 'approved-intake', email = 'applicant@local.hastabazaar.test';
    await startSellerRegistration(db, { userId, requestId: 'start-approved-intake', now });
    const validated = await validateSellerFormSubmission(db, 'seller.application', 1, [], undefined, {}, { optionalRegistration: true });
    const base = { userId, email, sellerId, form: { versionId: validated.versionId, answers: validated.answers },
      documents: {}, newDocuments: [], now };
    const answers = { hasBusinessTaxRegistration: ['yes'], applicantType: ['individual'], taxStatus: ['business_pan_only'] };
    await saveRegistration(db, { ...base, previous: null, answers, requestId: 'initial-intake', digest: 'initial-intake' });
    sqlite.prepare("UPDATE seller_profiles SET status='approved', review_note='Retained review', approved_at=? WHERE id=?").run(now, sellerId);
    sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='active' WHERE seller_id=?").run(sellerId);
    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'seller',?)").run(userId, now);
    const previous = (await readRegistration(db, userId))!;
    const terms = await getRegisteredSellerTerms(db, now);
    const changed = { ...answers, sellerAgreementContext: [terms.context], locality: ['Fictional workshop'] };
    const save = (id: string, details: typeof changed & { acceptedTerms?: string[] }, prior = previous) =>
      saveRegistration(db, { ...base, previous: prior, answers: details, requestId: id, digest: id });
    const withoutConsent = await save('without-consent', changed);
    assert.ok(withoutConsent.missing.some(item => item.includes('Seller Marketplace Agreement')));
    assert.equal(sqlite.prepare('SELECT settlement_terms_reference FROM seller_profiles WHERE id=?').get(sellerId)?.settlement_terms_reference, null);
    const renewal = await prepareSellerCommissionAcceptance(db, { sellerId, actorId: userId,
      context: terms.context, requestId: 'seller-center-renewal', now: now - 1 });
    await db.batch(renewal.statements);
    const prior = (await readRegistration(db, userId))!;
    await save('with-consent', { ...changed, acceptedTerms: ['yes'] }, prior);
    assert.deepEqual({ ...sqlite.prepare(`SELECT s.status,s.review_note,s.locality,s.settlement_terms_reference,s.seller_agreement_accepted_at,p.application_stage
      FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=?`).get(sellerId) }, {
      status: 'approved', review_note: 'Retained review', locality: 'Fictional workshop',
      settlement_terms_reference: `registered-seller-agreement:${terms.context}`, seller_agreement_accepted_at: now - 1, application_stage: 'active',
    });
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM seller_agreement_acceptance_history WHERE seller_id=?').get(sellerId)?.n, 1);
    await assert.rejects(save('stale-intake', changed));
    const verifiedRegistration = onboardingDocument('business_registration');
    const documents = { businessRegistration: verifiedRegistration };
    await saveRegistration(db, { ...base, previous: (await readRegistration(db, userId))!,
      answers: { ...changed, acceptedTerms: ['yes'], registrationNumber: ['FICTIONAL-REGISTRATION'] }, documents,
      newDocuments: [verifiedRegistration], requestId: 'start-document', digest: 'start-document' });
    const withDocument = (await readRegistration(db, userId))!;
    assert.ok((await readRegistrationProgress(db, withDocument, email, now)).missing.some(item => item.includes('certificate') && item.includes('awaiting review')));
    await verifySellerDocument(db, { sellerId, documentId: verifiedRegistration.id, actorId: 'reviewer',
      reason: 'Verify this exact fictional business registration evidence.', commandId: 'verify-approved-registration', expectedReviewId: null, now });
    const reviewed = (await readRegistration(db, userId))!;
    await assert.rejects(saveRegistration(db, { ...base, previous: reviewed, documents,
      answers: { ...reviewed.answers, registrationNumber: ['UNAUTHORIZED'] },
      requestId: 'change-verified-registration', digest: 'change-verified-registration' }), /locked/);
    await assert.rejects(saveRegistration(db, { ...base, previous: reviewed, documents, email: 'customer@local.hastabazaar.test',
      answers: reviewed.answers, requestId: 'wrong-current-email', digest: 'wrong-current-email' }));
    assert.equal((await readRegistration(db, userId))?.version, reviewed.version);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM seller_agreement_acceptance_history WHERE seller_id=?').get(sellerId)?.n, 1);
  } finally { f.dispose(); }
});
