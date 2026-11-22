import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverBusinessEmails } from '../lib/operations/business-notifications';
import { reconcileObsoleteOperationalNotice } from '../lib/operations/obsolete-notices';
import { sellerPayoutRequestReadiness } from '../lib/payments/payout-request-readiness';
import { enqueuePayoutFixReadyReminder, isCurrentPayoutFixReminderNotice, payoutFixReminderSelectionSql } from '../lib/sellers/payout-fix-reminder-source';
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
    const rows = () => sqlite.prepare(`SELECT id,channel,body_en,body_ne,audience_role,recipient_user_id FROM notification_messages
      WHERE template_key='business.seller.payout_fix_ready' ORDER BY channel`).all();
    const first = rows();
    assert.deepEqual(first.map(row => row.channel), ['email', 'in_app']);
    assert.ok(first.every(row => row.audience_role === 'seller' && row.recipient_user_id === 'payout-owner'));
    assert.ok(first.every(row => row.body_en === 'NPR 275.50 is ready for you. Fix your PAN document to receive it.'
      && String(row.body_ne).includes('275.50')));

    const savedNotice = () => db.prepare(`SELECT id,related_id AS relatedId,related_type AS relatedType,recipient_user_id AS userId,
      audience_role AS audience,channel,request_id AS requestId FROM notification_messages
      WHERE template_key='business.seller.payout_fix_ready' AND channel='email'`)
      .first<Parameters<typeof isCurrentPayoutFixReminderNotice>[1] & { id: string }>();
    const original = await savedNotice();
    assert.ok(original);
    assert.equal(await isCurrentPayoutFixReminderNotice(db,original,now+1),true);
    sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
      VALUES('second-earnings',?,'sale',1000,?,'Later fictional earnings',?)`).run(sellerId,now+2,now);
    assert.equal(await isCurrentPayoutFixReminderNotice(db,original,now+2),false);
    sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES('fix-vat',?,'vat_certificate','private/seller-documents/test-vat','vat.pdf','application/pdf',60,'pending',?)`)
      .run(sellerId,now-1);
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES('opened-vat-fix','reviewer','seller.document.payout_fix_opened','seller_document','fix-vat',?,'{}',?)`)
      .run('Please show the complete VAT document.',now);
    sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_at,reviewed_by)
      VALUES('fixed-pan',?,'pan_certificate','private/seller-documents/fixed-test-pan','pan.pdf','application/pdf',60,'verified',?,?,'reviewer')`)
      .run(sellerId,now,now+1);
    assert.equal(await isCurrentPayoutFixReminderNotice(db,original,now+1),false);
    assert.equal((await reconcileObsoleteOperationalNotice(db,original.id,now+2)).cancelled,1);
    assert.equal((await candidate(now+2))?.id,sellerId);
    assert.equal(await enqueuePayoutFixReadyReminder(db,sellerId,now+2),1);
    assert.deepEqual(rows().map(row=>row.id),first.map(row=>row.id));
    assert.ok(rows().every(row=>row.body_en==='NPR 285.50 is ready for you. Fix your VAT document to receive it.'));

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
      const delivery = await deliverBusinessEmails(db, capture, 'http://localhost:3018', { now: now + 2, limit: 20 });
      if (delivery.accepted + delivery.failed + delivery.cancelled === 0) break;
    }
    assert.equal(email.length, 1, JSON.stringify(sqlite.prepare("SELECT status,failure_reason FROM notification_messages WHERE template_key='business.seller.payout_fix_ready' AND channel='email'").get()));
    assert.match(email[0].subject, /^Hastabazaar · Your earnings are ready/);
    assert.match(email[0].text ?? '', /NPR 285\.50 is ready for you/);
    assert.match(email[0].text ?? '', /\/seller\/registration#seller-payout-fixes/);
    assert.doesNotMatch(email[0].text ?? '', /TEST-PAYOUT-001/);

    sqlite.prepare('UPDATE notification_messages SET read_at=? WHERE id=?').run(now+2,first[1].id);
    sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
      VALUES('third-earnings',?,'sale',1500,?,'Later fictional earnings',?)`).run(sellerId,now+3,now);
    assert.equal(await candidate(now+3),null);
    assert.equal(await enqueuePayoutFixReadyReminder(db,sellerId,now+3),0);
    assert.ok(rows().every(row=>String(row.body_en).includes('NPR 285.50')));
  } finally {
    f.dispose();
  }
});
