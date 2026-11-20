import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { getEditableSellerProfile, updateSellerProfile } from '../lib/db/repositories/seller-profile';
import { validateSellerFormSubmission, formRequestReplay } from '../lib/forms/submission';

void test('actual private seller profile core receipt maps its known parent type without weakening actor, parent, action or digest replay', async () => {
  const f = await completeVersionFixture();
  try {
    const profile = await getEditableSellerProfile(f.db, 'registered'); assert.ok(profile);
    const checked = await validateSellerFormSubmission(f.db, 'seller.profile', 1, []);
    const requestId = 'native-private-profile-replay';
    const input = { sellerId: 'registered', actorId: 'registered-owner', requestId, now: f.now,
      input: { ...profile, locality: 'Fictional original private workshop' },
      form: { requestId, versionId: checked.versionId, answers: checked.answers } };
    await updateSellerProfile(f.db, input);
    await updateSellerProfile(f.db, input);
    const audit = f.sqlite.prepare("SELECT next_json,subject_type FROM audit_logs WHERE request_id=? AND action='seller.profile.updated'").get(requestId);
    assert.equal(audit?.subject_type, 'seller_profile');
    const digest = (JSON.parse(String(audit?.next_json)) as { catalogDigest: string }).catalogDigest;
    const replay = { formId: 'seller.profile', requestId, actorId: input.actorId, action: 'seller.profile.updated', subjectId: 'registered', digest };
    assert.equal(await formRequestReplay(f.db, replay), 'registered');
    for (const mismatch of [{ actorId: 'customer' }, { subjectId: 'maker' }, { action: 'seller.other_action' }, { digest: '0'.repeat(64) }, { formId: 'seller.inventory' }])
      await assert.rejects(formRequestReplay(f.db, { ...replay, ...mismatch }), /different content|already used/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND action='seller.profile.updated'").get(requestId)?.n, 1);
  } finally { f.dispose(); }
});
