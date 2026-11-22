import { fakeProviderMail } from './helpers/fake-provider-mail';
import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { businessNotificationStatements, deliverBusinessEmails as actualDeliverBusinessEmails, operationalBusinessNotificationStatements } from '../lib/operations/business-notifications';
import { listNotifications } from '../lib/db/repositories/operations';

void test('superseded messages cannot crowd current work out of a limited inbox, including equal timestamps', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec('DELETE FROM notification_messages');
    await f.db.batch(await businessNotificationStatements(f.db, { sourceType: 'seller_application', sourceId: 'maker', eventId: 'maker',
      status: 'submitted', kind: 'submitted', actorId: 'maker-user', now: f.now }));
    for (let index = 0; index < 105; index++) {
      const eventId = `superseded-${index}`;
      f.sqlite.prepare("UPDATE staff_permission_profiles SET last_request_id=? WHERE user_id='delegate'").run(eventId);
      await f.db.batch(await operationalBusinessNotificationStatements(f.db, { kind: 'permissions.changed', sourceId: 'delegate', eventId, actorId: 'reviewer', now: f.now + 1 }));
    }
    f.sqlite.exec("UPDATE staff_permission_profiles SET last_request_id='later-event' WHERE user_id='delegate'");
    const inbox = await listNotifications(f.db, 'reviewer', 1, 'staff');
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].relatedId, 'maker');
    assert.equal((await listNotifications(f.db, 'reviewer', 0, 'staff')).length, 0);
  } finally { f.dispose(); }
});

void test('permission outcomes include actor-self Super Admin oversight and cancel superseded versions', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec("DELETE FROM notification_messages; UPDATE staff_permission_profiles SET last_request_id='permission-one' WHERE user_id='delegate'");
    const event = { kind: 'permissions.changed' as const, sourceId: 'delegate', eventId: 'permission-one', actorId: 'reviewer', now: f.now };
    await f.db.batch(await operationalBusinessNotificationStatements(f.db, event));
    await f.db.batch(await operationalBusinessNotificationStatements(f.db, event));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE recipient_user_id='reviewer'").get()?.n, 2);
    assert.equal((await deliverBusinessEmails(f.db, { send: async () => {} }, 'https://example.test', { now: f.now + 1 })).accepted, 2);
    f.sqlite.exec("UPDATE staff_permission_profiles SET last_request_id='permission-two' WHERE user_id='delegate'");
    assert.equal((await listNotifications(f.db, 'reviewer', 100, 'staff')).length, 0);
  } finally { f.dispose(); }
});

void test('Super Admin outcomes reach email and bell while earlier submissions and superseded outcomes disappear', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec('DELETE FROM notification_messages');
    await f.db.batch(await businessNotificationStatements(f.db, { sourceType: 'seller_application', sourceId: 'maker', eventId: 'maker', status: 'submitted', kind: 'submitted', actorId: 'maker-user', now: f.now }));
    f.sqlite.exec("UPDATE seller_profiles SET status='needs_changes',review_request_id='review-one' WHERE id='maker'; UPDATE seller_participation_profiles SET application_stage='changes_requested' WHERE seller_id='maker'");
    const outcome = { sourceType: 'seller_application' as const, sourceId: 'maker', eventId: 'review-one', reviewRequestId: 'review-one', status: 'needs_changes', kind: 'result' as const, actorId: 'reviewer', now: f.now + 1 };
    await f.db.batch(await businessNotificationStatements(f.db, outcome));
    assert.equal((await listNotifications(f.db, 'reviewer', 100, 'staff')).length, 1);
    const sent: string[] = [];
    const delivery = await deliverBusinessEmails(f.db, { send: async message => { sent.push(message.to); } }, 'https://example.test', { now: f.now + 1000 });
    assert.equal(delivery.accepted, 2);
    assert.equal(delivery.cancelled, 2);
    assert.equal(sent.length, 2);
    f.sqlite.exec("UPDATE seller_profiles SET review_request_id='review-two' WHERE id='maker'");
    await f.db.batch(await businessNotificationStatements(f.db, { ...outcome, eventId: 'review-two', reviewRequestId: 'review-two', now: f.now + 2000 }));
    assert.equal((await listNotifications(f.db, 'reviewer', 100, 'staff')).length, 1, 'earlier version is no longer actionable bell work');
    assert.equal((await deliverBusinessEmails(f.db, { send: async () => {} }, 'https://example.test', { now: f.now + 3000 })).accepted, 2);
  } finally { f.dispose(); }
});

void test('sole Super Admin receives actor-self submission and result oversight once per channel', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec('DELETE FROM notification_messages');
    for (const kind of ['submitted', 'result'] as const) {
      const event = { eventId: `oversight-${kind}`, sourceType: 'seller_application' as const, sourceId: 'maker', status: 'submitted', kind, actorId: 'reviewer', now: f.now };
      const first = await businessNotificationStatements(f.db, event);
      const second = await businessNotificationStatements(f.db, event);
      await f.db.batch(first); await f.db.batch(second);
      const rows = f.sqlite.prepare('SELECT recipient_user_id,channel,COUNT(*) n FROM notification_messages WHERE template_key=? GROUP BY recipient_user_id,channel ORDER BY recipient_user_id,channel').all(`business.seller_application.${kind}`);
      assert.deepEqual(rows.map(row => ({ ...row })), [
        { recipient_user_id: 'maker-user', channel: 'email', n: 1 },
        { recipient_user_id: 'maker-user', channel: 'in_app', n: 1 },
        { recipient_user_id: 'reviewer', channel: 'email', n: 1 },
        { recipient_user_id: 'reviewer', channel: 'in_app', n: 1 },
      ]);
    }
  } finally { f.dispose(); }
});

void test('overlapping roles do not duplicate oversight and transaction-time revocation suppresses delivery work', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec("DELETE FROM notification_messages; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)");
    const event = { eventId: 'overlap', sourceType: 'seller_application' as const, sourceId: 'maker', status: 'submitted', kind: 'submitted' as const, actorId: 'reviewer', now: f.now };
    await f.db.batch(await businessNotificationStatements(f.db, event));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE recipient_user_id='reviewer'").get()?.n, 2);
    const next = await businessNotificationStatements(f.db, { ...event, eventId: 'revoked' });
    f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
    await f.db.batch(next);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE recipient_user_id='reviewer'").get()?.n, 2);
  } finally { f.dispose(); }
});

// This test suite models an explicitly accepting fake provider.
const deliverBusinessEmails: typeof actualDeliverBusinessEmails = (db,mail,origin,options) => actualDeliverBusinessEmails(db,fakeProviderMail(mail),origin,options);
