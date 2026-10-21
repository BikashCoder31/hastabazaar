import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCurrentSellerApplication, CURRENT_ONBOARDING_VERSION, pendingPayoutReference } from '../lib/sellers/onboarding';
import { sellerDocumentsForApplication } from '../lib/sellers/application';
import { managedIdentityFields } from './helpers/managed-identity-fixture';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../lib/sellers/managed-identity';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { getManagedMakerApplicationTerms } from '../lib/db/repositories/managed-maker-details';
import { createCurrentSellerApplication as createSellerApplication, reviewSellerApplication, updateSellerParticipationPublicProfile } from '../lib/db/repositories/seller-applications';
import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';
import { activateManagedMakerForSimulation } from '../lib/managed-commerce/activation';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { sellerDisclosure } from '../lib/sellers/disclosure';
import { getManagedTermsOffers } from '../lib/managed-commerce/accepted-terms';
import { validateSellerMultipartStructure } from '../lib/forms/submission';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';

function form(route: 'yes' | 'no' = 'no') {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    hasBusinessTaxRegistration: route, applicantType: 'individual', legalName: 'Fictional Maker', representativeName:'Fictional Representative',
    tradingName: 'Mithila Craft House', email: 'maker@example.test', phone: '9800000000',
    province: 'Madhesh', district: 'Parsa', municipality: 'Birgunj', locality: 'Fictional workshop',
    businessDescription: 'Handmade clay products', productCategories: 'Clay work',
    applicationAcknowledgement: 'yes', acceptedTerms: 'yes', ...managedIdentityFields(), personalPan: '123456789', managedAgreementVersion: MANAGED_SUPPLIER_AGREEMENT_VERSION,
    payoutBeneficiary: 'Fictional Maker', bankName: 'Fictional Bank', bankBranch: 'Birgunj', bankAccountNumber: '123456789012',
    pickupAddress: 'Fictional workshop, Birgunj 11, Parsa', returnAddress: 'Fictional returns, Birgunj 11, Parsa',
    registrationAuthority: route === 'yes' ? 'Private firm registration office' : '',
    registrationNumber: route === 'yes' ? 'FIRM-123' : '', taxStatus: route === 'yes' ? 'business_pan_only' : '',
    taxRegistrationNumber: route === 'yes' ? '987654321' : '',
  })) data.set(key, value);
  return data;
}

void test('new managed applications require personal PAN, payout beneficiary, bank and both operational addresses', () => {
  assert.ok(parseCurrentSellerApplication(form()).input);
  for (const field of ['personalPan', 'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'pickupAddress', 'returnAddress']) {
    const data = form(); data.delete(field);
    assert.equal(parseCurrentSellerApplication(data).input, undefined, field);
  }
  const parsed = parseCurrentSellerApplication(form()).input!;
  assert.equal(parsed.onboarding?.version, CURRENT_ONBOARDING_VERSION);
  assert.ok(pendingPayoutReference(parsed.onboarding!).startsWith('PENDING VERIFICATION:'));
  const required = sellerDocumentsForApplication(parsed).filter(d => d.required).map(d => d.kind);
  assert.deepEqual(required, ['pan_certificate', 'representative_identity', 'bank_verification']);
});

void test('new registered sole proprietors retain registration and require business PAN and representative/bank evidence', () => {
  const parsed = parseCurrentSellerApplication(form('yes')).input!;
  assert.ok(parsed);
  assert.equal(parsed.registrationNumber, 'FIRM-123');
  assert.equal(parsed.registrationAuthority, 'Private firm registration office');
  assert.deepEqual(sellerDocumentsForApplication(parsed).filter(d => d.required).map(d => d.kind),
    ['business_registration', 'pan_certificate', 'representative_identity', 'bank_verification']);
  for (const key of ['hasBusinessTaxRegistration', 'registrationNumber', 'registrationAuthority', 'taxRegistrationNumber']) {
    const data = form('yes'); data.delete(key);
    assert.equal(parseCurrentSellerApplication(data).input, undefined, key);
  }
  const vat = form('yes'); vat.set('taxStatus', 'vat_registered');
  assert.deepEqual(sellerDocumentsForApplication(parseCurrentSellerApplication(vat).input!).filter(d => d.required).map(d => d.kind),
    ['business_registration', 'pan_certificate', 'vat_certificate', 'representative_identity', 'bank_verification']);
});

void test('invalid bank account text is rejected and a beneficiary mismatch remains pending review', () => {
  const data = form(); data.set('bankAccountNumber', 'password <script>');
  assert.equal(parseCurrentSellerApplication(data).input, undefined);
  data.set('bankAccountNumber', '123456789012'); data.set('payoutBeneficiary', 'Different beneficiary');
  const parsed = parseCurrentSellerApplication(data).input!;
  assert.ok(parsed); // A mismatch is evidence for review, never an automatic rejection or approval.
  assert.match(pendingPayoutReference(parsed.onboarding!), /PENDING VERIFICATION/);
});

void test('public multipart intake rejects forged verification/clearance controls and duplicated protected values',()=>{
  for(const key of ['legalClearance','accountingCleared','bankVerified','payoutAccountReference']) {
    const data=form();data.set(key,'yes');assert.throws(()=>validateSellerMultipartStructure(data,'seller.application'),/Unknown form control/);
  }
  const data=form();data.append('personalPan','987654321');assert.throws(()=>validateSellerMultipartStructure(data,'seller.application'),/Duplicate/);
});

void test('prospective repository intake retains private evidence, queues review, and blocks both commercial models without clearance', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const retainedBefore=f.sqlite.prepare("SELECT * FROM managed_maker_application_details WHERE seller_id='maker'").all();
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,phone,display_name,status,created_at,updated_at)
      VALUES ('new-applicant','new-applicant','maker@example.test','9800000002','Fictional Maker','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('new-applicant','customer',1);
      INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('new-applicant','maker@example.test',1);
      INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES ('new-applicant','+9779800000002',1);`);
    const terms = await getManagedMakerApplicationTerms(f.db, f.now, MANAGED_SUPPLIER_AGREEMENT_VERSION);
    const data = form(); data.set('managedAgreementContext', terms.context); data.set('phone','9800000002');
    const input = parseCurrentSellerApplication(data).input!;
    const documents = sellerDocumentsForApplication(input).map(d => ({ id: crypto.randomUUID(), kind: d.kind,
      objectKey: 'private/seller-documents/new-seller/' + crypto.randomUUID(), originalName: 'fictional.pdf', mimeType: 'application/pdf', sizeBytes: 20 }));
    const options = {userId:'new-applicant',existingAccount:true,sellerId:'new-seller',applicationReference:'NEW-TEST-ONLY',input,documents,now:f.now};
    await assert.rejects(()=>createSellerApplication(f.db,{...options,input:{...input,onboarding:undefined}}),/Current onboarding/);
    await assert.rejects(() => createSellerApplication(f.db, {...options,documents:documents.filter(d=>d.kind!=='bank_verification')}), /Bank evidence/);
    f.sqlite.exec("DELETE FROM account_phone_verifications WHERE user_id='new-applicant'");
    await assert.rejects(() => createSellerApplication(f.db, options), /guard|CHECK/i);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_profiles WHERE id='new-seller'").get()?.n, 0);
    f.sqlite.exec("INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES ('new-applicant','+9779800000002',1)");
    for (const [mutation,restore] of [
      ["DELETE FROM user_roles WHERE user_id='new-applicant' AND role='customer'", "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('new-applicant','customer',1)"],
      ["UPDATE users SET auth_subject='rotated' WHERE id='new-applicant'", "UPDATE users SET auth_subject='new-applicant' WHERE id='new-applicant'"],
      ["UPDATE users SET status='disabled' WHERE id='new-applicant'", "UPDATE users SET status='active' WHERE id='new-applicant'"],
    ]) {
      f.setBeforeBatch(()=>{f.sqlite.exec(mutation);});
      await assert.rejects(()=>createSellerApplication(f.db,options),/guard|CHECK/i);
      f.sqlite.exec(restore);
      for (const table of ['seller_documents','seller_operational_addresses','managed_maker_application_details'])
        assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE seller_id='new-seller'`).get()?.n,0,table);
    }
    await createSellerApplication(f.db, options);
    assert.equal(f.sqlite.prepare("SELECT status FROM seller_profiles WHERE id='new-seller'").get()?.status, 'submitted');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='new-applicant' AND role='seller'").get()?.n,0);
    const audits = f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE subject_id='new-seller'").all();
    assert.ok(!JSON.stringify(audits).includes('123456789012'), 'bank details must never enter audit snapshots');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_operational_addresses WHERE seller_id='new-seller' AND purpose IN ('pickup','returns')").get()?.n,2);
    for (const model of ['managed_sale_linked_percentage_v1', 'managed_fixed_supplier_price_v1'] as const) {
      await assert.rejects(() => activateManagedMakerForSimulation(f.db, {sellerId:'new-seller',actorId:'reviewer',model,
        legalSellerReference:terms.account.entityReference,invoiceIssuerReference:terms.account.entityReference,payoutBeneficiaryReference:'SIM-VERIFIED-REFERENCE',
        agreementVersion:terms.version,agreementLanguage:'en',agreementAcceptedAt:f.now,requestId:'test-clearance-'+model,now:f.now,
        environment:resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',appOrigin:'http://localhost:3018'})}), /legal\/accounting clearance/);
    }
    assert.equal(f.sqlite.prepare("SELECT application_stage FROM seller_participation_profiles WHERE seller_id='new-seller'").get()?.application_stage,'submitted');
    assert.equal((await getManagedTermsOffers(f.db,'new-seller',f.now)).current.agreementVersion,MANAGED_SUPPLIER_AGREEMENT_VERSION);
    f.sqlite.exec("UPDATE seller_profiles SET status='needs_changes' WHERE id='new-seller'; UPDATE seller_participation_profiles SET application_stage='changes_requested' WHERE seller_id='new-seller'");
    const replacementDocuments=documents.map(document=>({...document,id:crypto.randomUUID(),objectKey:'private/seller-documents/new-seller/'+crypto.randomUUID()}));
    const correction={sellerId:'new-seller',actorId:'new-applicant',expectedVersion:1,publicName:'Mithila Craft House',publicCity:'Birgunj',
      craftExperience:[],socialLinks:{},requestId:'current-correction',now:f.now+1,
      managedCorrection:{identity:input.managedIdentity!,documents:replacementDocuments,onboarding:input.onboarding}};
    await assert.rejects(()=>updateSellerParticipationPublicProfile(f.db,{...correction,managedCorrection:{...correction.managedCorrection,onboarding:undefined}}),/current supplier contract/);
    await updateSellerParticipationPublicProfile(f.db,correction);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_documents WHERE seller_id='new-seller'").get()?.n,6,'corrections append documents and retain old evidence');
    assert.equal((await getManagedTermsOffers(f.db,'new-seller',f.now+1)).current.agreementVersion,MANAGED_SUPPLIER_AGREEMENT_VERSION);
    assert.deepEqual(f.sqlite.prepare("SELECT * FROM managed_maker_application_details WHERE seller_id='maker'").all(),retainedBefore,'historical v1 identity, agreement, rate and snapshot stay byte-for-byte unchanged');
  } finally { f.dispose(); }
});

void test('new sole proprietor approval requires Super Admin, a reviewed payout reference and evidence that remains valid at commit', async () => {
  const f=await companyStoreMakerFixture();
  try {
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,phone,display_name,status,created_at,updated_at)
      VALUES ('business-user','business-user','business@example.test','9800000003','Fictional proprietor','active',1,1),
      ('ordinary','ordinary','staff@example.test',NULL,'Fictional staff','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('business-user','customer',1),('ordinary','admin',1);
      INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('business-user','business@example.test',1);
      INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES ('business-user','+9779800000003',1);`);
    const data=form('yes');data.set('email','business@example.test');data.set('phone','9800000003');data.set('taxStatus','vat_registered');
    await startSellerRegistration(f.db,{userId:'business-user',requestId:'business-registration-start',now:f.now});
    const input=parseCurrentSellerApplication(data).input!;
    const terms=await getRegisteredSellerTerms(f.db,f.now);
    const documents=sellerDocumentsForApplication(input).map(d=>({id:'business-'+d.kind,kind:d.kind,
      objectKey:'private/seller-documents/business-seller/'+d.kind,originalName:'fictional.pdf',mimeType:'application/pdf',sizeBytes:20}));
    await createSellerApplication(f.db,{sellerId:'business-seller',userId:'business-user',existingAccount:true,registeredAgreementContext:terms.context,
      applicationReference:'BUSINESS-TEST',input,documents,now:f.now});
    await reviewSellerApplication(f.db,{sellerId:'business-seller',actorId:'reviewer',action:'start_review',reason:'Review fictional business evidence',requestId:'business-start',now:f.now+1});
    const approval={sellerId:'business-seller',actorId:'reviewer',action:'approve' as const,reason:'Review all fictional required evidence independently',
      payoutAccountReference:'VERIFIED-BUSINESS-BENEFICIARY',settlementTermsReference:'WRITTEN-BUSINESS-TERMS',requestId:'business-approve',now:f.now+2};
    await assert.rejects(()=>reviewSellerApplication(f.db,{...approval,actorId:'ordinary'}),/Super Admin/);
    await assert.rejects(()=>reviewSellerApplication(f.db,{...approval,payoutAccountReference:pendingPayoutReference(input.onboarding!)}),/pending/i);
    for(const document of documents) {
      f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE seller_documents SET status='rejected' WHERE id=?").run(document.id);});
      await assert.rejects(()=>reviewSellerApplication(f.db,approval),/changed|guard|CHECK/i);
      assert.equal(f.sqlite.prepare("SELECT status FROM seller_profiles WHERE id='business-seller'").get()?.status,'under_review');
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='business-user' AND role='seller'").get()?.n,0);
      f.sqlite.prepare("UPDATE seller_documents SET status='pending' WHERE id=?").run(document.id);
    }
    await reviewSellerApplication(f.db,approval);
    assert.equal(f.sqlite.prepare("SELECT status FROM seller_profiles WHERE id='business-seller'").get()?.status,'approved');
    assert.equal(f.sqlite.prepare("SELECT payout_account_reference FROM seller_profiles WHERE id='business-seller'").get()?.payout_account_reference,approval.payoutAccountReference);
  } finally {f.dispose();}
});

void test('disclosure names the recorded company only when supplied and keeps registered sellers distinct', () => {
  assert.deepEqual(sellerDisclosure({managed:true,supplierName:'Mithila Craft House',legalSellerName:'Hasta Bazaar Private Limited'}),
    ['Supplied by Mithila Craft House','Sold and invoiced by Hasta Bazaar Private Limited']);
  assert.match(sellerDisclosure({managed:true,supplierName:'Mithila Craft House'})[1], /require review/);
  assert.deepEqual(sellerDisclosure({managed:false,supplierName:'Mithila Craft House'}), ['Sold by Mithila Craft House','Through HastaBazaar']);
});
