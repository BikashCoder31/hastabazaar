import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySellerChecklist, getSellerChecklist, sellerChecklistView } from '../lib/sellers/shop-checklist';
import { getSellerReadiness } from '../lib/sellers/readiness';
import { readyCheckoutSeller } from './helpers/checkout-contact';
import { deliverBusinessEmails } from '../lib/operations/business-notifications';
import { processReminderDispatch } from '../lib/operations/reminder-dispatch';
import { enqueueChecklistExpiry, requestSellerChecklistItem } from '../lib/sellers/shop-checklist-notices';
import { payoutTransferFixture } from './helpers/payout-transfer-fixture';

void test('a new seller sees their registration, payout evidence and shop details as missing', () => {
  const checklist = sellerChecklistView(emptySellerChecklist());
  assert.equal(checklist.canSell, false);
  assert.equal(checklist.canPay, false);
  assert.equal(checklist.shopLive, false);
  assert.equal(checklist.missingShop, 4);
  assert.equal(checklist.groups[0].items.find(item => item.id === 'application')?.status, 'missing');
  assert.equal(checklist.groups[1].items.find(item => item.id === 'representative_identity')?.status, 'missing');
  assert.equal(checklist.groups[1].items.find(item => item.id === 'bank')?.status, 'missing');
});

void test('the shared shop checklist follows readiness and exposes only seller-visible notes', async () => {
  const fixture = await payoutTransferFixture();
  const { db, sellerId, sqlite } = fixture;
  try {
    const now = Date.now();
    const read = () => getSellerChecklist(db, sellerId, { ownerId: 'payout-owner', audience: 'staff', actorId: 'reviewer', now });
    const before = await read();
    assert.equal(before.shopLive, false);
    assert.equal(before.groups[0].items.find(item => item.id === 'application')?.status, 'ok');
    await readyCheckoutSeller({ database: db, sqlite }, sellerId, 'payout-owner', 'reviewer', now - 20);
    sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
      producer,country_of_origin,materials,status,created_at,updated_at)
      SELECT 'checklist-product',?,category_id,'checklist-product','TEST-CL-PRODUCT','Fictional item','Fictional product',12000,3,
        'Fictional seller','NP','Clay','published',1,1 FROM products LIMIT 1`).run(sellerId);
    sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at)
      VALUES('checklist-balance',?,'sale',27000,?,'Fictional eligible earnings',?)`).run(sellerId, now - 20, now - 20);
    sqlite.prepare("UPDATE seller_profiles SET applicant_type='company' WHERE id=?").run(sellerId);
    const addDocument = sqlite.prepare(`INSERT INTO seller_documents
      (id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_at,reviewed_by,valid_until)
      VALUES(?,?,?,?,'certificate.pdf','application/pdf',42,?,?,?,?,?)`);
    const expiry = now + 5 * 86_400_000;
    addDocument.run('expiring-checklist-doc', sellerId, 'business_registration', 'fictional-registration', 'verified', now - 10000, now - 5000, 'reviewer', expiry);
    let result = await read();
    assert.deepEqual(result.groups.map(group => group.id), ['sell', 'payouts', 'shop']);
    assert.equal(result.groups[1].items.find(item => item.id === 'business_registration')?.status, 'expiring');
    assert.equal(result.shopLive, true);
    const readiness = await getSellerReadiness(db, sellerId, now);
    assert.equal(result.canSell, readiness.newOrders);
    assert.equal(result.canPay, readiness.payouts);
    assert.equal(result.payoutsUntil, readiness.payouts ? expiry : null);

    addDocument.run('checklist-pan', sellerId, 'pan_certificate', 'fictional-pan', 'pending', now - 10, null, null, null);
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES('checklist-fix','reviewer','seller.document.payout_fix_opened','seller_document','checklist-pan',?,'{}',?)`)
      .run('Please scan all corners of the certificate.', now - 5);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS seller_staff_notes (
      id TEXT PRIMARY KEY,seller_id TEXT,author_user_id TEXT,body TEXT,created_at INTEGER)`);
    sqlite.prepare(`INSERT INTO seller_staff_notes(id,seller_id,author_user_id,body,created_at)
      VALUES('checklist-private',?,'reviewer','PRIVATE TEST NOTE',?)`).run(sellerId, now - 5);
    addDocument.run('legacy-rejected-checklist-doc', sellerId, 'representative_identity', 'fictional-rejected', 'rejected', now - 10, now - 7, 'reviewer', null);
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES('legacy-rejected-audit','reviewer','seller.document.rejected','seller_document','legacy-rejected-checklist-doc',?,'{}',?)`)
      .run('PRIVATE LEGACY AUDIT NOTE', now - 7);
    sqlite.prepare("UPDATE seller_documents SET review_request_id='legacy-rejected-audit' WHERE id='legacy-rejected-checklist-doc'").run();
    result = await read();
    assert.equal(result.canPay, false);
    assert.equal(result.payoutFixes[0]?.status, 'wrong');
    const seller = sellerChecklistView(result);
    const serialized = JSON.stringify(seller);
    assert.match(serialized, /Please scan all corners/);
    assert.doesNotMatch(serialized, /PRIVATE TEST NOTE|PRIVATE LEGACY AUDIT NOTE|\/admin\/|actorId|reviewedBy|failureReason/);
    assert.equal(seller.payoutFixes[0]?.action?.label, 'Upload new file');
  } finally {
    fixture.dispose();
  }
});

void test('a checklist ask, daily reminder and scheduled expiry use the same captured email and in-app outbox', async () => {
  const fixture = await payoutTransferFixture();
  const { db, sellerId, sqlite } = fixture;
  try {
    const now = Date.now();
    sqlite.prepare("UPDATE users SET auth_subject='fictional-checklist-reviewer' WHERE id='reviewer'").run();
    sqlite.prepare("UPDATE seller_profiles SET applicant_type='company',tax_mode='PAN',support_phone='' WHERE id=?").run(sellerId);
    sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE id='payout-identity'").run(now + 3 * 86_400_000);
    const expires = now + 7 * 86_400_000;
    sqlite.prepare(`INSERT INTO seller_documents
      (id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_at,reviewed_by,valid_until)
      VALUES('fixture-expiring-doc',?,'business_registration','fictional-expiry','registration.pdf','application/pdf',
        42,'verified',?,?, 'reviewer',?)`).run(sellerId, now - 100, now - 90, expires);
    const withMissingPan = await getSellerChecklist(db, sellerId, { ownerId: 'payout-owner', audience: 'seller', now });
    const payoutItems = withMissingPan.groups[1].items;
    assert.equal(withMissingPan.canPay, false);
    assert.equal(payoutItems.find(item => item.id === 'pan_certificate')?.status, 'missing');
    assert.equal(payoutItems.find(item => item.id === 'business_registration')?.status, 'expiring');
    assert.equal(payoutItems.find(item => item.id === 'representative_identity')?.status, 'ok', 'An optional ID must not inherit the required PAN problem');
    const command = {
      sellerId, actorId: 'reviewer', authSubject: 'fictional-checklist-reviewer', itemId: 'pickup_phone',
      requestId: 'checklist-initial-ask', remind: false, now,
      note: 'Please add the number the courier should call to arrange pickup.',
    };
    await requestSellerChecklistItem(db, command);
    await requestSellerChecklistItem(db, command);
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,command_key,command_digest,command_result_json,created_at)
      VALUES('zz-checklist-legacy-command-receipt','reviewer','seller.checklist.requested','seller_checklist_item',?,?,?,'{}',?)`)
      .run(sellerId + ':pickup_phone', 'a'.repeat(64), 'b'.repeat(64), now);
    await assert.rejects(requestSellerChecklistItem(db, { ...command, requestId: 'too-soon', now: now + 10, remind: true }), /once every 24 hours/);
    const reminders = await processReminderDispatch(db, { now, deadlineMs: Date.now() + 30_000, limit: 50 });
    assert.deepEqual(reminders.failures.filter(failure => failure.family === 'seller_document_expiry'), []);
    assert.equal(await enqueueChecklistExpiry(db, 'fixture-expiring-doc', now), 0);

    sqlite.prepare(`INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,
      subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at)
      VALUES('checklist-private-notice','payout-owner','staff','in_app','business.seller.checklist_request',
        'PRIVATE STAFF NOTICE','PRIVATE STAFF NOTICE','PRIVATE STAFF NOTICE','PRIVATE STAFF NOTICE','seller_checklist_item',?,
        'queued','fixture-staff-only',?)`).run(sellerId + ':pickup_phone', now + 1);
    const checklist = sellerChecklistView(await getSellerChecklist(db, sellerId, { ownerId: 'payout-owner', audience: 'seller', now }));
    assert.doesNotMatch(JSON.stringify(checklist), /PRIVATE STAFF NOTICE/);
    const pickup = checklist.groups.find(group => group.id === 'shop')!.items.find(item => item.id === 'pickup_phone')!;
    assert.equal(pickup.note, command.note);
    assert.equal(pickup.message?.emailStatus, 'waiting');
    const notices = sqlite.prepare(`SELECT recipient_user_id AS recipient,channel,request_id AS requestId from notification_messages
      WHERE audience_role='seller' AND template_key IN ('business.seller.checklist_request','business.seller.document.expiring') ORDER BY template_key,channel`).all();
    assert.deepEqual(notices.map(notice => notice.channel), ['email', 'in_app', 'email', 'in_app']);
    assert.ok(notices.every(notice => notice.recipient === 'payout-owner'));
    assert.equal(String(notices[0].requestId).replace(/:email$/, ':in_app'), notices[1].requestId);
    assert.equal(String(notices[2].requestId).replace(/:email$/, ':in_app'), notices[3].requestId);

    const capture: { subject: string; text?: string }[] = [];
    const mailer = {
      transport: 'capture', transportKey: 'fixture-seller-checklist', handoffAware: true,
      send: async (message, context) => {
        await context?.beforeHandoff?.();
        if (/pickup contact phone|business registration certificate expires/i.test(message.subject)) capture.push(message);
        return { outcome: 'captured', transport: 'capture', receipt: 'fictional-checklist' };
      },
    } satisfies Parameters<typeof deliverBusinessEmails>[1];
    for (let pass = 0; pass < 6 && capture.length < 2; pass++) {
      await deliverBusinessEmails(db, mailer, 'http://localhost:3018', { now, limit: 30 });
    }
    assert.equal(capture.length, 2);
    const afterDelivery = await getSellerChecklist(db, sellerId, { ownerId: 'payout-owner', audience: 'seller', now });
    assert.equal(afterDelivery.groups[2].items.find(item => item.id === 'pickup_phone')?.message?.emailStatus, 'captured');
    assert.ok(capture.every(message => message.subject.endsWith(' · Hastabazaar') && message.subject.indexOf('Hastabazaar') === message.subject.lastIndexOf('Hastabazaar')));
    assert.match(capture.find(message => message.subject.includes('pickup contact phone'))?.text ?? '', /seller-checklist-pickup_phone/);

    const tomorrow = now + 86_400_000;
    const remindersTogether = await Promise.allSettled([
      requestSellerChecklistItem(db, { ...command, requestId: 'daily-reminder-1', now: tomorrow, remind: true }),
      requestSellerChecklistItem(db, { ...command, requestId: 'daily-reminder-2', now: tomorrow, remind: true }),
    ]);
    assert.equal(remindersTogether.filter(result => result.status === 'fulfilled').length, 1);
    const counts = sqlite.prepare(`SELECT COUNT(*) AS count FROM notification_messages WHERE audience_role='seller' AND template_key='business.seller.checklist_request'`).get();
    assert.equal(counts?.count, 4);
    sqlite.prepare(`INSERT INTO seller_documents
      (id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_at,reviewed_by,valid_until)
      VALUES('fixture-expiring-pan',?,'pan_certificate','fictional-expiry-pan','pan.pdf','application/pdf',42,'verified',?,?,'reviewer',?)`)
      .run(sellerId, now - 70, now - 60, now + 5 * 86_400_000);
    const withEarlierPan = await getSellerChecklist(db, sellerId, { ownerId: 'payout-owner', audience: 'seller', now });
    const nowExpiring = withEarlierPan.groups[1].items.filter(item => item.status === 'expiring').map(item => item.id);
    assert.deepEqual(nowExpiring, ['pan_certificate', 'business_registration']);
  } finally {
    fixture.dispose();
  }
});
