import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFingerprint } from '../lib/email/delivery-attempts';
import { readFailedAddresses } from '../lib/operations/admin-message-history';
import { completeVersionFixture } from './helpers/complete-version-fixture';

void test('Today groups permanent rejections per person and drops a task after their saved address changes', async () => {
  const f = await completeVersionFixture();
  try {
    const now = f.now + 600_000;
    const fingerprint = await deliveryFingerprint('registered-owner@local.hastabazaar.test');
    for (const [index, id] of ['rejected-one', 'rejected-two'].entries()) {
      const saved = now - 30_000 + index;
      f.sqlite.prepare(`INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,
        template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,
        business_event_key,delivery_attempts) VALUES(?,'registered-owner','seller','email','business.seller.restriction',
        'A seller update','','','','seller_restriction','registered','failed',?,?,'business.seller.restriction',1)`)
        .run(id, id + ':email', saved);
      f.sqlite.prepare(`INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,
        phase,message_id,started_at,completed_at,failure_category,failure_code,recipient_fingerprint)
        VALUES(?,'business',?,?,1,'not_accepted',?,? ,?,'permanent_recipient','recipient_rejected',?)`)
        .run('attempt-'+id, id, 'claim-'+id, id, saved, saved+1, fingerprint);
    }
    const result = await readFailedAddresses(f.db, 'reviewer', now);
    assert.deepEqual(result, { people: [{
      key: 'registered-owner', name: 'Fictional Shop', href: '/admin/sellers/registered', failedAt: now - 29_998,
    }], partial: false });
    assert.doesNotMatch(JSON.stringify(result), /@local|recipientFingerprint/);
    await assert.rejects(readFailedAddresses(f.db, 'delegate', now), { status: 403 });
    f.sqlite.exec("UPDATE users SET email='corrected@local.hastabazaar.test' WHERE id='registered-owner'");
    assert.deepEqual(await readFailedAddresses(f.db, 'reviewer', now), { people: [], partial: false });
  } finally { f.dispose(); }
});
