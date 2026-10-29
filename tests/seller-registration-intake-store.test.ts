import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { createSellerApplication, reviewSellerApplication, getSellerParticipationProfile } from '../lib/db/repositories/seller-applications';
import { optionalRegistrationInput } from '../lib/sellers/registration-intake';
import { readRegistration, saveRegistration } from '../lib/sellers/registration-store';
import { getManagedMakerApplicationTerms } from '../lib/db/repositories/managed-maker-details';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../lib/sellers/managed-identity';
import { managedIdentityFields } from './helpers/managed-identity-fixture';
import { getManagedMakerAuthority } from '../lib/managed-commerce/maker-authority';
import { validateSellerFormSubmission } from '../lib/forms/submission';

void test('an empty registration creates an account-owned pending application and never grants approval', async () => {
  const f = await companyStoreMakerFixture();
  try {
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES ('partial-user','partial-user','partial@local.hastabazaar.test','Fictional applicant','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('partial-user','customer',1);
      INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('partial-user','partial@local.hastabazaar.test',1);`);
    await createSellerApplication(f.db, { userId: 'partial-user', existingAccount: true, sellerId: 'partial-seller', applicationReference: 'PARTIAL-TEST',
      input: optionalRegistrationInput({}, 'partial@local.hastabazaar.test'), documents: [], now: f.now,
      intake: { ready: false, answersJson: '{}', documentsJson: '{}' } });
    const saved = await readRegistration(f.db, 'partial-user'); assert.equal(saved?.ready, false);
    assert.equal((await getSellerParticipationProfile(f.db, 'partial-seller'))?.applicationStage, 'submitted');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='partial-user' AND role='seller'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM managed_maker_application_details WHERE seller_id='partial-seller'").get()?.n, 0);
    await reviewSellerApplication(f.db, { sellerId: 'partial-seller', actorId: 'reviewer', action: 'start_review', reason: 'Review fictional incomplete application', requestId: 'start-partial', now: f.now });
    await assert.rejects(reviewSellerApplication(f.db, { sellerId: 'partial-seller', actorId: 'reviewer', action: 'approve_for_activation', reason: 'Attempt incomplete approval', requestId: 'approve-partial', now: f.now + 1 }), /missing registration details/);
  } finally { f.sqlite.close(); }
});

void test('partial registration can be completed from the dashboard; missing configured answers do not block submission, and stale edits roll back', async () => {
  const f = await companyStoreMakerFixture();
  try {
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES ('partial-user','partial-user','partial@local.hastabazaar.test','Fictional applicant','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('partial-user','customer',1);
      INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('partial-user','partial@local.hastabazaar.test',1);`);
    const fields = [{ id: 'background', key: 'background', type: 'short_text', label: 'Background', required: true, order: 0, status: 'active' },
      { id: 'contact_later', key: 'contact_later', type: 'checkbox', label: 'Contact later', required: true, order: 1, status: 'active' }];
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('intake-v1','seller.application',1,1,'published',?,'Fixture','reviewer',1,'reviewer',1,'reviewer',1,'publish-intake')`)
      .run(JSON.stringify({ formId: 'seller.application', fields }));
    const validated = await validateSellerFormSubmission(f.db, 'seller.application', 1, [{fieldId:'contact_later',value:false}], undefined, {}, { optionalRegistration: true });
    const base = { userId: 'partial-user', email: 'partial@local.hastabazaar.test', sellerId: 'partial-seller', documents: {}, newDocuments: [],
      now: f.now, form: { versionId: validated.versionId, answers: validated.answers } };
    const first = await saveRegistration(f.db, { ...base, previous: null, answers: {}, requestId: 'submit-incomplete', digest: 'first' });
    assert.ok(first.missing.length);
    const previous = (await readRegistration(f.db, base.userId))!;
    assert.equal((await getManagedMakerAuthority(f.db, base.userId, f.now)).stage, 'submitted', 'applicant has private product workspace authority');
    const terms = await getManagedMakerApplicationTerms(f.db, f.now, MANAGED_SUPPLIER_AGREEMENT_VERSION);
    const answers = Object.fromEntries(Object.entries({ hasBusinessTaxRegistration: 'no', applicantType: 'individual', legalName: 'Fictional Applicant', tradingName: 'Fictional Crafts',
      phone: '1234567890', phoneCountry: 'NP', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional workshop',
      pickupAddress: 'Fictional workshop address', returnAddress: 'Fictional return address', applicationAcknowledgement: 'yes', ...managedIdentityFields(),
      personalPan: '123456789', managedAgreementVersion: MANAGED_SUPPLIER_AGREEMENT_VERSION, managedAgreementContext: terms.context }).map(([key,value]) => [key,[value]]));
    const documents = Object.fromEntries([['representativeIdentity','representative_identity'],['personalPanCertificate','pan_certificate']].map(([field,kind]) => [field, {
      id: crypto.randomUUID(), kind: kind as 'representative_identity' | 'pan_certificate', objectKey: `private/seller-documents/partial-seller/${crypto.randomUUID()}`,
      originalName:'fictional.pdf',mimeType:'application/pdf',sizeBytes:20 }]));
    const completed = await saveRegistration(f.db, { ...base, previous, answers, documents, newDocuments: Object.values(documents), requestId: 'complete-intake', digest: 'second', now: f.now + 1 });
    assert.deepEqual(completed.missing, []);
    assert.equal((await readRegistration(f.db, base.userId))?.ready, true);
    await assert.rejects(saveRegistration(f.db, { ...base, previous, answers: {}, requestId: 'stale-update', digest: 'third', now: f.now + 2 }), /guard|CHECK/i);
    assert.equal((await readRegistration(f.db, base.userId))?.ready, true);
    await reviewSellerApplication(f.db, { sellerId: base.sellerId, actorId: 'reviewer', action: 'start_review', reason: 'Review completed fictional details', requestId: 'review-completed', now: f.now + 3 });
    const approve = { sellerId: base.sellerId, actorId: 'reviewer', action: 'approve_for_activation' as const, reason: 'Review fictional documents', requestId: 'approve-completed', now: f.now + 4 };
    f.setBeforeBatch(() => { f.sqlite.prepare("UPDATE seller_documents SET status='rejected' WHERE id=?").run(documents.personalPanCertificate.id); });
    await assert.rejects(reviewSellerApplication(f.db, approve), /changed|guard|CHECK/i);
    assert.equal((await getSellerParticipationProfile(f.db, base.sellerId))?.applicationStage, 'under_review');
    f.sqlite.prepare("UPDATE seller_documents SET status='pending' WHERE id=?").run(documents.personalPanCertificate.id);
    f.setBeforeBatch(() => { f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='reviewer' AND role='super_admin'"); });
    await assert.rejects(reviewSellerApplication(f.db, approve), /changed|guard|CHECK/i);
    f.sqlite.exec("UPDATE user_roles SET role='super_admin' WHERE user_id='reviewer' AND role='admin'");
    await reviewSellerApplication(f.db, approve);
    assert.equal((await getSellerParticipationProfile(f.db, base.sellerId))?.applicationStage, 'approved_for_activation');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='partial-user' AND role='seller'").get()?.n, 0);
  } finally { f.sqlite.close(); }
});

void test('concurrent incomplete submissions return the persisted winning reference', async () => {
  const f = await companyStoreMakerFixture();
  try {
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES ('race-user','race-user','race@local.hastabazaar.test','Fictional applicant','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('race-user','customer',1);
      INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('race-user','race@local.hastabazaar.test',1);
      INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('race-v1','seller.application',1,1,'published','{"formId":"seller.application","fields":[]}','Fixture','reviewer',1,'reviewer',1,'reviewer',1,'publish-race');`);
    const options = {userId:'race-user',email:'race@local.hastabazaar.test',sellerId:'loser',previous:null,answers:{},documents:{},newDocuments:[],now:f.now,requestId:'race-request',digest:'same-content',
      form:{versionId:'race-v1',answers:{formId:'seller.application',version:1,answers:[]}}};
    let winnerReference = '';
    f.setBeforeBatch(async () => { winnerReference = (await saveRegistration(f.db,{...options,sellerId:'winner'})).reference; });
    const result = await saveRegistration(f.db,options);
    assert.equal(result.reference,winnerReference);
    assert.equal((await readRegistration(f.db,'race-user'))?.sellerId,'winner');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_profiles WHERE user_id='race-user'").get()?.n,1);
  } finally {f.sqlite.close();}
});
