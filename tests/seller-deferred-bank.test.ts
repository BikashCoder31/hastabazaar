import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSellerOnboardingForm, pendingPayoutReference } from '../lib/sellers/onboarding';
import { sellerDocumentsForApplication } from '../lib/sellers/application';

void test('new intake needs collection addresses but defers all bank fields and bank evidence', () => {
  const data = new FormData(); data.set('pickupAddress', 'Fictional pickup address'); data.set('returnAddress', 'Fictional return address');
  const onboarding = parseSellerOnboardingForm(data, true);
  assert.equal(onboarding.bankDetailsDeferred, true);
  assert.throws(() => pendingPayoutReference(onboarding), /bank|payout/i);
  for (const participationRoute of ['registered_seller', 'managed_maker'] as const) {
    const documents = sellerDocumentsForApplication({ participationRoute, applicantType: 'individual', taxMode: 'PAN', onboarding });
    assert.equal(documents.some(file => file.kind === 'bank_verification'), false);
  }
  data.delete('pickupAddress');
  assert.throws(() => parseSellerOnboardingForm(data, true), /pickupAddress/);
});
