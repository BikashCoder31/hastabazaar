import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { sellerBankState, submitSellerBankDetails, reviewSellerBankDetails } from '../lib/sellers/bank-details';
import { prepareSellerPayout } from '../lib/db/repositories/payouts';

void test('bank details stay pending until independently reviewed and stale/foreign writes fail', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const seller = f.sqlite.prepare("SELECT user_id AS userId FROM seller_profiles WHERE id='maker'").get() as { userId: string };
    f.sqlite.exec("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='maker'");
    const initial = await sellerBankState(f.db, 'maker');
    assert.equal(initial.status, 'missing');
    f.sqlite.exec("UPDATE seller_profiles SET status='approved' WHERE id='maker'");
    const payout = { sellerId:'maker', actorId:'reviewer', actorRole:'super_admin' as const, note:'Fictional payout gate test',requestId:'no-bank-payout',now:f.now };
    await assert.rejects(prepareSellerPayout(f.db, payout), /verified payout destination/);
    const input = { sellerId: 'maker', actorId: seller.userId, revision: initial.revision, now: f.now,
      details: { payoutBeneficiary: 'Fictional Maker', bankName: 'Fictional Bank', bankBranch: 'Test branch', bankAccountNumber: '123456789' },
      document: { id: 'new-bank-doc', kind: 'bank_verification' as const, objectKey: 'private/seller-documents/maker/new-bank-doc', originalName: 'proof.png', mimeType: 'image/png', sizeBytes: 20 } };
    await assert.rejects(submitSellerBankDetails(f.db, { ...input, actorId: 'another-user' }));
    await submitSellerBankDetails(f.db, input);
    const pending = await sellerBankState(f.db, 'maker'); assert.equal(pending.status, 'pending');
    await assert.rejects(prepareSellerPayout(f.db, payout), /verified payout destination/);
    await assert.rejects(submitSellerBankDetails(f.db, input), /changed/);
    await assert.rejects(reviewSellerBankDetails(f.db, { sellerId: 'maker', actorId: seller.userId, revision: pending.revision, reference: 'REVIEW-1', reason: 'Independently checked fictional evidence', now: f.now }));
    await reviewSellerBankDetails(f.db, { sellerId: 'maker', actorId: 'reviewer', revision: pending.revision, reference: 'REVIEW-1', reason: 'Independently checked fictional evidence', now: f.now });
    assert.equal((await sellerBankState(f.db, 'maker')).status, 'verified');
    const audit = f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action LIKE 'seller.bank_details.%'").all();
    assert.doesNotMatch(JSON.stringify(audit), /123456789|Fictional Bank/);
  } finally { f.sqlite.close(); }
});
