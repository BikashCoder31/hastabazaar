import assert from 'node:assert/strict';
import test from 'node:test';

import { managedActivationOutstanding } from '../lib/managed-commerce/activation';
import { buildManagedCommercialSnapshot } from '../lib/managed-commerce/snapshots';
import { resolveRuntimeEnvironment, SIMULATED_RECORD_LABEL } from '../lib/staging/environment';

const environment = resolveRuntimeEnvironment({
  runtimeEnvironment: 'local_staging',
  appOrigin: 'http://127.0.0.1:4173',
});

void test('program, maker, and product readiness all gate simulation activation', () => {
  const ready = {
    environment, actorId: 'reviewer', ownerId: 'maker', actorIsSuperAdmin: true,
    programMode: 'activation_enabled' as const,
    configuredModel: 'managed_sale_linked_percentage_v1' as const,
    makerStage: 'approved_for_activation', makerModel: 'managed_sale_linked_percentage_v1' as const,
    legalSellerReference: 'SIM-LEGAL-SELLER', invoiceIssuerReference: 'SIM-INVOICE-ISSUER',
    payoutBeneficiaryReference: 'SIM-MAKER-ACCOUNT', agreementVersion: 'SIM-MANAGED-2026-09',
    agreementAcceptedAt: 1_000, approvedProductCount: 1,
  };
  assert.deepEqual(managedActivationOutstanding(ready), []);
  assert.match(managedActivationOutstanding({...ready, approvedProductCount: 0}).join(' '), /approved product/i);
  assert.match(managedActivationOutstanding({...ready, makerStage: 'under_review'}).join(' '), /maker approval/i);
  assert.match(managedActivationOutstanding({...ready, programMode: 'applications_only'}).join(' '), /program activation/i);
});

void test('Admins, the seller owner, and production simulation cannot activate a Managed Maker', () => {
  const base = {
    environment, actorId: 'maker', ownerId: 'maker', actorIsSuperAdmin: false,
    programMode: 'activation_enabled' as const,
    configuredModel: 'managed_sale_linked_percentage_v1' as const,
    makerStage: 'approved_for_activation', makerModel: 'managed_sale_linked_percentage_v1' as const,
    legalSellerReference: 'legal', invoiceIssuerReference: 'issuer', payoutBeneficiaryReference: 'beneficiary',
    agreementVersion: 'agreement', agreementAcceptedAt: 1, approvedProductCount: 1,
  };
  assert.deepEqual(managedActivationOutstanding({ ...base, actorId: 'admin' }), ['Active Super Admin reviewer']);
  assert.deepEqual(managedActivationOutstanding({ ...base, actorIsSuperAdmin: true }),
    ['You cannot activate your own seller account']);
  assert.match(managedActivationOutstanding({...base, environment: resolveRuntimeEnvironment({runtimeEnvironment:'production'})}).join(' '), /simulation environment/i);
});

void test('checkout snapshot uses 9% platform retention and preserves all simulated commercial roles', () => {
  const snapshot = buildManagedCommercialSnapshot({
    sellerId: 'maker-seller', commercialModel: 'managed_sale_linked_percentage_v1',
    legalSellerReference: 'SIM-LEGAL-SELLER', invoiceIssuerReference: 'SIM-INVOICE-ISSUER',
    payoutBeneficiaryReference: 'SIM-MAKER-ACCOUNT', agreementVersion: 'SIM-MANAGED-2026-09',
    agreementLanguage: 'ne', termsSettingVersionId: 'setting-v1', productValuePaisa: 100_000,
    deliveryHoldDays: 7, holdSettingVersionId: 'hold-v1',
    makerFundedDiscountPaisa: 0, platformFundedDiscountPaisa: 5_000, platformRetentionBps: 900,
  });
  assert.equal(snapshot.platformRetainedPaisa, 9_000);
  assert.equal(snapshot.makerEntitlementPaisa, 91_000);
  assert.equal(snapshot.simulationLabel, SIMULATED_RECORD_LABEL);
  assert.equal(snapshot.invoiceIssuerReference, 'SIM-INVOICE-ISSUER');
});

void test('fixed-price customer-sale snapshots never create a second supplier obligation', () => {
  const snapshot = buildManagedCommercialSnapshot({
    sellerId: 'maker-seller', commercialModel: 'managed_fixed_supplier_price_v1',
    legalSellerReference: 'SIM-LEGAL-SELLER', invoiceIssuerReference: 'SIM-INVOICE-ISSUER',
    payoutBeneficiaryReference: 'SIM-MAKER-ACCOUNT', agreementVersion: 'SIM-FIXED-2026-09',
    agreementLanguage: 'en', termsSettingVersionId: 'setting-v2', productValuePaisa: 150_000,
    deliveryHoldDays: 7, holdSettingVersionId: 'hold-v1',
    makerFundedDiscountPaisa: 0, platformFundedDiscountPaisa: 0, platformRetentionBps: 900,
  });
  assert.equal(snapshot.platformRetentionBps, 0);
  assert.equal(snapshot.platformRetainedPaisa, 0);
  assert.equal(snapshot.makerEntitlementPaisa, 0);
  assert.equal(snapshot.eligibleBasePaisa, 0);
  assert.equal(snapshot.agreedSupplierAmountPaisa, null);
});
