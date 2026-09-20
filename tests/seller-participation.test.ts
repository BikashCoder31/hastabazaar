import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applicationCapabilities,
  managedMakerDisplayName,
  parseCraftExperience,
} from '../lib/sellers/participation';
import {
  parseSellerApplication,
  sellerDocumentsForApplication,
} from '../lib/sellers/application';

function baseForm(answer: 'yes' | 'no'): FormData {
  const form = new FormData();
  const values = {
    hasBusinessTaxRegistration: answer,
    applicantType: answer === 'yes' ? 'company' : 'individual',
    legalName: answer === 'yes' ? 'Fictional Clay Works Pvt Ltd' : 'Sita Test Maker',
    tradingName: 'Fictional Clay Studio',
    representativeName: answer === 'yes' ? 'Sita Test Maker' : '',
    email: 'sita.maker@example.test',
    phone: '9800000000',
    province: 'Madhesh',
    district: 'Parsa',
    municipality: 'Birgunj',
    locality: 'Private test workshop',
    publicCity: 'Birgunj',
    businessDescription: 'Fictional handmade clay products.',
    productCategories: 'Clay work',
    experienceCraft: 'Clay work',
    experienceBand: 'less_than_one_year',
    instagramUrl: 'https://instagram.com/fictional-maker',
    applicationAcknowledgement: 'yes',
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

void test('Yes selects Registered Seller and distinguishes PAN-only from VAT evidence', () => {
  const pan = baseForm('yes');
  pan.set('taxStatus', 'business_pan_only');
  pan.set('taxRegistrationNumber', '123456789');
  pan.set('registrationAuthority', 'Fictional Registration Office');
  pan.set('registrationNumber', 'TEST-REG-1');
  pan.set('acceptedTerms', 'yes');
  const parsedPan = parseSellerApplication(pan);
  assert.ok(parsedPan.input);
  assert.equal(parsedPan.input.participationRoute, 'registered_seller');
  assert.equal(parsedPan.input.taxMode, 'PAN');
  assert.deepEqual(
    sellerDocumentsForApplication(parsedPan.input)
      .filter((document) => document.required)
      .map((document) => document.kind),
    ['business_registration', 'pan_certificate'],
  );

  const vat = baseForm('yes');
  vat.set('taxStatus', 'vat_registered');
  vat.set('taxRegistrationNumber', '123456789');
  vat.set('registrationAuthority', 'Fictional Registration Office');
  vat.set('registrationNumber', 'TEST-REG-2');
  vat.set('acceptedTerms', 'yes');
  const parsedVat = parseSellerApplication(vat);
  assert.ok(parsedVat.input);
  assert.equal(parsedVat.input.taxMode, 'VAT');
  assert.deepEqual(
    sellerDocumentsForApplication(parsedVat.input)
      .filter((document) => document.required)
      .map((document) => document.kind),
    ['business_registration', 'vat_certificate'],
  );
});

void test('No opens Managed Maker without fake tax or registration identifiers', () => {
  const form = baseForm('no');
  const parsed = parseSellerApplication(form);
  assert.ok(parsed.input, parsed.errors.join('\n'));
  assert.equal(parsed.input.participationRoute, 'managed_maker');
  assert.equal(parsed.input.taxMode, 'NONE');
  assert.equal(parsed.input.taxRegistrationNumber, '');
  assert.equal(parsed.input.registrationNumber, '');
  assert.deepEqual(
    sellerDocumentsForApplication(parsed.input)
      .filter((document) => document.required)
      .map((document) => document.kind),
    [],
  );

  for (const [field, value] of [
    ['taxRegistrationNumber', 'N/A'],
    ['registrationNumber', 'PLATFORM-PAN'],
    ['taxStatus', 'business_pan_only'],
  ]) {
    const tampered = baseForm('no');
    tampered.set(field, value);
    assert.equal(parseSellerApplication(tampered).input, undefined);
  }
});

void test('shared maker profile keeps city public, address private, and optional fields optional', () => {
  const minimal = baseForm('no');
  minimal.delete('experienceCraft');
  minimal.delete('experienceBand');
  minimal.delete('instagramUrl');
  const parsedMinimal = parseSellerApplication(minimal);
  assert.ok(parsedMinimal.input, parsedMinimal.errors.join('\n'));
  assert.equal(parsedMinimal.input.publicCity, 'Birgunj');
  assert.equal(parsedMinimal.input.locality, 'Private test workshop');
  assert.deepEqual(parsedMinimal.input.craftExperience, []);
  assert.deepEqual(parsedMinimal.input.socialLinks, {});

  const parsedExperience = parseCraftExperience('Clay work', 'beginner');
  assert.deepEqual(parsedExperience, [{ craft: 'Clay work', band: 'beginner' }]);
  assert.throws(() => parseCraftExperience('Clay work', '20'));
  assert.throws(() => parseCraftExperience('', 'less_than_one_year'));
});

void test('pending routes may edit profiles and prepare drafts but cannot publish or sell', () => {
  for (const stage of [
    'draft',
    'submitted',
    'under_review',
    'changes_requested',
    'approved_for_activation',
  ] as const) {
    const capabilities = applicationCapabilities(stage, 'applications_only');
    assert.equal(capabilities.editProfile, true);
    assert.equal(capabilities.prepareProductDrafts, true);
    assert.equal(capabilities.publishProducts, false);
    assert.equal(capabilities.acceptOrders, false);
  }
  const activeButApplicationsOnly = applicationCapabilities('active', 'applications_only');
  assert.equal(activeButApplicationsOnly.publishProducts, false);
  assert.equal(activeButApplicationsOnly.acceptOrders, false);
});

void test('managed public identity retains the maker name without obscuring the seller role', () => {
  assert.equal(
    managedMakerDisplayName('Fictional Clay Studio'),
    'Fictional Clay Studio — Managed by Hastabazaar',
  );
});
