import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverBusinessEmails } from '../lib/operations/business-notifications';
import { auditManualEmailProcessing } from '../lib/operations/manual-email-audit';
import { emailDeliveryWarning, emailSenderStatus, readAdminMessages, readMessageResendTarget } from '../lib/operations/admin-message-history';
import { operationalNotificationRequestId } from '../lib/operations/event-catalog';
import { MailDeliveryError, type DeliveryMailService } from '../lib/email/delivery-attempts';
import { completeVersionFixture } from './helpers/complete-version-fixture';

const now = 1_800_000_000_000;

void test('the email workspace preserves capture and failure evidence and scopes pairs to the exact record and recipient', async () => {
  const f = await completeVersionFixture(now - 20 * 60_000);
  const eventKey = 'business.seller.restriction';
  try {
    f.sqlite.exec("DELETE FROM notification_messages; UPDATE orders SET status='placed' WHERE id='legacy-order'");
    const insert = f.sqlite.prepare(`INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,
      template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,
      business_event_key,delivery_attempts,sent_at,read_at,delivery_next_attempt_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const [id, user, audience, role, owner, phase, failure, read] of [
      ['temporary', 'registered-owner', 'seller', 'seller_restriction', 'registered', 'not_accepted', 'temporary', now - 2000],
      ['permanent', 'customer', 'customer', 'order', 'legacy-order', 'not_accepted', 'permanent_recipient', null],
      ['captured', 'foreign', 'customer', 'unused', 'another-order', 'captured', null, null],
      ['waiting', 'maker-user', 'seller', 'seller_application', 'maker', null, null, null],
    ] as const) {
      const created = id === 'waiting' ? now - 11 * 60_000 : now - 50_000;
      for (const channel of ['in_app','email'] as const) {
        const requestId = await operationalNotificationRequestId(eventKey, id, user, channel);
        const email = channel === 'email';
        const sent = email && phase === 'captured';
        insert.run(id + '-' + channel, user, audience, channel, eventKey, 'Fixture ' + id, '', '', '',
          role, owner, sent ? 'sent' : email && failure ? 'failed' : 'queued', requestId, created, eventKey,
          email && phase ? 1 : 0, sent ? now - 2_000 : null, channel === 'in_app' ? read : null, now - 1_000);
        if (email && phase) f.sqlite.prepare(`INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,
          phase,message_id,started_at,completed_at,failure_category,failure_code,transport)
          VALUES (?,'business',?,?,1,?,?,?,?,?,?,?)`).run('a-' + id, id + '-' + channel, 'claim-' + id, phase,
            'message-' + id, created, created + 1, failure, failure ? 'delivery_failed' : null, phase === 'captured' ? 'capture' : null);
      }
    }
    // Two queued message ledgers coexist and the native projection marks outdated jobs as expired.
    f.sqlite.prepare("INSERT INTO order_email_jobs (id,order_id,order_status,created_at,status,next_attempt_at) VALUES('old-order-email','legacy-order','confirmed',?,'queued',?)").run(now - 15_000, now);
    f.sqlite.prepare("INSERT INTO order_email_jobs (id,order_id,order_status,created_at,status,next_attempt_at) VALUES('accepted-order-email','legacy-order','packing',?,'queued',?)").run(now - 17_000, now);
    f.sqlite.prepare(`INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,
      message_id,started_at,completed_at,transport,provider_receipt)
      VALUES('attempt-accepted','order','accepted-order-email','claim-accepted',1,'accepted','fictional-acceptance',?,?,'provider','fixture-only')`).run(now - 15_000, now - 14_000);
    f.sqlite.prepare(`INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,
      subject_ne,body_en,body_ne,status,request_id,created_at,business_event_key,delivery_attempts,delivery_lease_until)
      VALUES('leased-email','foreign','customer','email',?,'In progress','','','','queued','fixture:leased:email',?,?,1,?)`)
      .run(eventKey, now - 40_000, eventKey, now + 60_000);
    const all = await readAdminMessages(f.db, 'reviewer', { view: 'all', now });
    assert.deepEqual({ ...all.summary }, {
      total: 7, waiting: 2, failures: 2, sent: 2, deliveredToday: 1, capturedToday: 1, oldestWaitingAt: now - 11 * 60_000,
    });
    assert.equal(all.messages.find(row => row.id === 'leased-email')?.state, 'waiting');
    assert.equal(all.messages.find(row => row.id === 'accepted-order-email')?.sentAt, now - 14_000);
    const seller = await readAdminMessages(f.db, 'reviewer', { view: 'all', scope: { kind: 'seller', id: 'registered' }, now });
    assert.deepEqual(seller.messages.map(row => [row.id, row.readAt, row.resendAllowed]), [['temporary-email', now - 2_000, true]]);
    const order = await readAdminMessages(f.db, 'reviewer', { view: 'all', scope: { kind: 'order', id: 'legacy-order' }, now });
    assert.deepEqual(order.messages.map(row => [row.id, row.state, row.permanentAddressFailure]), [
      ['old-order-email','expired',false], ['accepted-order-email','delivered',false], ['permanent-email','failed',true],
    ]);
    assert.equal(order.messages[0].reason, 'Order moved on');
    assert.equal((await readMessageResendTarget(f.db, 'reviewer', 'business', 'permanent-email', now))?.resendAllowed, false);
    await assert.rejects(readAdminMessages(f.db, 'delegate', { now, view: 'all' }), { status: 403 });
    assert.equal(emailDeliveryWarning(emailSenderStatus(null, now), all.summary, all.messages, now)?.tone, 'red');
    const amber = emailDeliveryWarning(emailSenderStatus(null, now), { ...all.summary, oldestWaitingAt: now }, all.messages.filter(row => row.state === 'failed'), now);
    assert.match(amber?.message ?? '', /Fictional Shop/);
    assert.equal(emailSenderStatus({ expectedSince: now - 300_000, services: [] } as never, now).stopped, true);
  } finally { f.dispose(); }
});

void test('seller applications include the applicant’s account copy and order history follows recorded response events', async () => {
  const f = await completeVersionFixture(now - 60_000);
  try {
    const seller = await readAdminMessages(f.db, 'reviewer', { view: 'all', scope: { kind: 'seller', id: 'maker' }, now });
    assert.ok(seller.messages.some(row => row.inApp && row.audience === 'Seller' && row.href === '/admin/sellers/maker'));
    const eventId = 'order-response-fixture';
    f.sqlite.prepare(`INSERT INTO order_response_events(id,order_id,kind,scope_json,source_key,note,created_at)
      VALUES(?,'legacy-order','released','{}',?,'Fictional recorded response',?)`).run(eventId, eventId, now - 15_000);
    f.sqlite.prepare(`INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,
      template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key)
      VALUES('response-mail','registered-owner','seller','email','business.order.response','New order to prepare',
      '','','','order_response_event',?,'queued','fixture:response:email',?,'business.order.response')`).run(eventId, now - 15_000);
    const order = await readAdminMessages(f.db, 'reviewer', { view: 'all', scope: { kind: 'order', id: 'legacy-order' }, now });
    assert.ok(order.messages.some(row => row.id === 'response-mail' && row.href === '/admin/orders/legacy-order'));
    const other = await readAdminMessages(f.db, 'reviewer', { view: 'all', scope: { kind: 'order', id: 'other' }, now });
    assert.deepEqual(other.messages, []);
  } finally { f.dispose(); }
});

void test('targeted resend keeps other jobs and uses the original id with an audited capture', async () => {
  const f = await completeVersionFixture(now - 60_000);
  try {
    const fixture = f.sqlite.prepare("SELECT id FROM notification_messages WHERE channel='email' AND business_event_key=template_key AND template_key='business.seller_application.submitted' AND audience_role='staff'").get() as { id: string } | undefined;
    assert.ok(fixture, 'fixture publishes a business notification');
    const temporaryFailure: DeliveryMailService = { transport: 'capture', async send() {
      throw new MailDeliveryError('temporary', 'delivery_failed');
    } };
    const failure = await deliverBusinessEmails(f.db, temporaryFailure, 'http://localhost:3018', { jobId: fixture.id, limit: 1, now });
    assert.equal(failure.failed, 1);
    const original = await readMessageResendTarget(f.db, 'reviewer', 'business', fixture.id, now);
    assert.equal(original?.resendAllowed, true);
    assert.ok(original.nextAt > now);
    const mode: DeliveryMailService = { transport: 'capture', async send(_message, context) {
      await context?.beforeHandoff();
      return { outcome: 'captured', transport: 'capture', receipt: 'fixture-only' };
    } };
    const early = await deliverBusinessEmails(f.db, mode, 'http://localhost:3018', { jobId: fixture.id, limit: 1, now });
    assert.equal(early.accepted, 0);
    const attempts = await auditManualEmailProcessing(f.db, 'reviewer', () => deliverBusinessEmails(
      f.db, mode, 'http://localhost:3018', { jobId: fixture.id, limit: 1, now: original.nextAt },
    ), 'capture-one', () => now, 'business', fixture.id);
    assert.equal(attempts.accepted, 1);
    const sent = f.sqlite.prepare("SELECT queue_id AS id FROM email_delivery_attempts WHERE phase='captured'").all();
    assert.deepEqual(sent.map(row => row.id), [fixture.id]);
    const again = await deliverBusinessEmails(f.db, mode, 'http://localhost:3018', { jobId: fixture.id, limit: 1, now: original.nextAt });
    assert.equal(again.accepted, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE subject_id=? AND request_id LIKE 'capture-one:%'").get(fixture.id)?.n, 2);
  } finally { f.dispose(); }
});
