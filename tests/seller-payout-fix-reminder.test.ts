import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverBusinessEmails } from '../lib/operations/business-notifications';
import { sellerPayoutRequestReadiness } from '../lib/payments/payout-request-readiness';
import { enqueuePayoutFixReadyReminder, payoutFixReminderSelectionSql } from '../lib/sellers/payout-fix-reminder-source';
import { payoutTransferFixture } from './helpers/payout-transfer-fixture';

void test('the first unreserved balance with a payout fix queues one seller notice on each channel', async () => {
  const f = await payoutTransferFixture();
  try {
    const { db, sellerId, sqlite } = f;
    const now = Date.now();
    assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    assert.equal((await sellerPayoutRequestReadiness(db, sellerId, now)).ready, true);

    sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES('fix-pan',?,'pan_certificate','private/seller-documents/test-pan','pan.pdf','application/pdf',60,'pending',?)`)
      .run(sellerId, now - 5);
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES('opened-pan-fix','reviewer','seller.document.payout_fix_opened','seller_document','fix-pan',?,'{}',?)`)
      .run('Please scan the complete certificate.', now - 2);
    assert.match((await sellerPayoutRequestReadiness(db, sellerId, now)).blocker ?? '', /Payout on hold/);

    const candidate = (at: number) => db.prepare(payoutFixReminderSelectionSql()).bind('', at).first<{ id: string }>();
    assert.equal(await candidate(now), null, 'Reserved earnings do not trigger the reminder');
    sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
      VALUES('new-earnings',?,'sale',27550,?,'Fictional available earnings',?)`).run(sellerId, now + 1, now);
    assert.equal(await enqueuePayoutFixReadyReminder(db, sellerId, now), 0, 'Delivery hold still applies');
    assert.equal((await candidate(now + 1))?.id, sellerId);
    const inserted = await Promise.all([
      enqueuePayoutFixReadyReminder(db, sellerId, now + 1),
      enqueuePayoutFixReadyReminder(db, sellerId, now + 1),
    ]);
    assert.equal(inserted.reduce<number>((total, entry) => total + entry, 0), 1);
    assert.equal(await candidate(now + 1), null);
    const rows = sqlite.prepare(`SELECT channel,body_en,body_ne,audience_role,recipient_user_id FROM notification_messages
      WHERE template_key='business.seller.payout_fix_ready' ORDER BY channel`).all();
    assert.deepEqual(rows.map(row => row.channel), ['email', 'in_app']);
    assert.ok(rows.every(row => row.audience_role === 'seller' && row.recipient_user_id === 'payout-owner'));
    assert.ok(rows.every(row => row.body_en === 'NPR 275.50 is ready for you. Fix your PAN document to receive it.'
      && String(row.body_ne).includes('275.50')));

    const email: { subject: string; text?: string }[] = [];
    const capture = {
      transport: 'capture', transportKey: 'fictional-payout-fix-reminder',
      handoffAware: true, send: async (message, context) => {
        await context?.beforeHandoff?.();
        if (message.subject.includes('Your earnings are ready')) email.push(message);
        return { outcome: 'captured', transport: 'capture', receipt: 'fictional-fix-reminder' };
      },
    } satisfies Parameters<typeof deliverBusinessEmails>[1];
    for (let pass = 0; pass < 5 && !email.length; pass++) {
      const delivery = await deliverBusinessEmails(db, capture, 'http://localhost:3018', { now: now + 1, limit: 20 });
      if (delivery.accepted + delivery.failed + delivery.cancelled === 0) break;
    }
    assert.equal(email.length, 1, JSON.stringify(sqlite.prepare("SELECT status,failure_reason FROM notification_messages WHERE template_key='business.seller.payout_fix_ready' AND channel='email'").get()));
    assert.match(email[0].subject, /^Hastabazaar · Your earnings are ready/);
    assert.match(email[0].text ?? '', /NPR 275\.50 is ready for you/);
    assert.match(email[0].text ?? '', /\/seller\/registration#seller-payout-fixes/);
    assert.doesNotMatch(email[0].text ?? '', /TEST-PAYOUT-001/);
  } finally {
    f.dispose();
  }
});
