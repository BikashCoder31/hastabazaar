import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { getSellerParticipationProfile, updateSellerParticipationPublicProfile } from '../lib/db/repositories/seller-applications';
import { getEditableSellerProfile, updateSellerProfile } from '../lib/db/repositories/seller-profile';

void test('public maker profile first save is allowed, then edits require seven days including across versions', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const profile = (await getSellerParticipationProfile(f.db, 'maker'))!;
    const input = { sellerId: 'maker', actorId: f.actorId, expectedVersion: profile.version, publicName: profile.publicName,
      publicCity: profile.publicCity, craftExperience: [], socialLinks: { facebook: 'https://www.facebook.com/fictional-maker' }, requestId: 'profile-first', now: f.now };
    await updateSellerParticipationPublicProfile(f.db, input);
    f.sqlite.exec("UPDATE seller_profiles SET status='approved' WHERE id='maker'");
    const shop = (await getEditableSellerProfile(f.db, 'maker'))!;
    await assert.rejects(updateSellerProfile(f.db, { sellerId:'maker',actorId:f.actorId,input:{...shop,tradingName:'Changed via another editor'},requestId:'bypass-name',now:f.now+1 }), /7 days/);
    await assert.rejects(updateSellerParticipationPublicProfile(f.db, { ...input, expectedVersion: profile.version + 1, requestId: 'profile-early', now: f.now + 1 }), /7 days|seven days|editable/i);
    await updateSellerParticipationPublicProfile(f.db, { ...input, expectedVersion: profile.version + 1, requestId: 'profile-next', now: f.now + 7 * 86400_000 });
  } finally { f.sqlite.close(); }
});
