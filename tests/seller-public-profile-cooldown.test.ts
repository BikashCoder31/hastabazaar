import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { getSellerParticipationProfile, updateSellerParticipationPublicProfile } from '../lib/db/repositories/seller-applications';
import { getEditableSellerProfile, updateSellerProfile } from '../lib/db/repositories/seller-profile';
import {publicProfileEditableAt} from '../lib/sellers/public-profile';

void test('old public writers cannot bypass review even after 168 hours; operational edits leave presentation untouched', async () => {
  const f = await completeVersionFixture();
  try {
    const profile = (await getSellerParticipationProfile(f.db, 'maker'))!;
    const input = { sellerId: 'maker', actorId: f.actorId, expectedVersion: profile.version, publicName: profile.publicName,
      publicCity: profile.publicCity, craftExperience: [], socialLinks: { facebook: 'https://www.facebook.com/fictional-maker' }, requestId: 'profile-first', now: f.now };
    await assert.rejects(updateSellerParticipationPublicProfile(f.db,input),/review|draft/i);
    await assert.rejects(updateSellerParticipationPublicProfile(f.db,{...input,now:f.now+168*60*60_000}),/review|draft/i);
    const sellerId = 'registered';
    const actorId = f.roles.registered;
    const shop = await getEditableSellerProfile(f.db, sellerId);
    assert.ok(shop);
    const publicState = () => f.sqlite.prepare('SELECT * FROM seller_public_profile_states WHERE seller_id=?')
      .get(sellerId);
    const before = publicState();
    assert.ok(before);
    for (const changed of [{tradingName:'Another editor name'},{businessDescription:'Unreviewed story'},{productCategories:'Unreviewed specialty'}]) {
      await assert.rejects(updateSellerProfile(f.db, {
        sellerId, actorId, input: {...shop, ...changed},
        requestId: `bypass-${Object.keys(changed)[0]}`, now: f.now + 1,
      }), /review|draft/i);
    }
    const municipality = 'Operational location';
    await updateSellerProfile(f.db, {
      sellerId, actorId, input: {...shop, municipality}, requestId: 'operational-location', now: f.now + 2,
    });
    assert.equal((await getEditableSellerProfile(f.db, sellerId))?.municipality, municipality);
    assert.deepEqual(publicState(), before);
    assert.equal(await publicProfileEditableAt(f.db, sellerId), 0);
  } finally { f.dispose(); }
});

void test('legacy save provenance is retained while normal publication supplies the authoritative cooldown clock',async()=>{
  const f=await companyStoreMakerFixture();try{
    f.sqlite.prepare("UPDATE seller_public_profile_states SET legacy_saved_at=? WHERE seller_id='maker'").run(f.now);
    assert.equal(await publicProfileEditableAt(f.db,'maker'),f.now+168*60*60_000);
    f.sqlite.prepare("UPDATE seller_public_profile_states SET last_normal_publication_at=? WHERE seller_id='maker'").run(f.now+1000);
    assert.equal(await publicProfileEditableAt(f.db,'maker'),f.now+1000+168*60*60_000);
  }finally{f.sqlite.close();}
});
