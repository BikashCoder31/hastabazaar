import assert from 'node:assert/strict';
import {
  evaluateServiceHealth,
  recordServiceHealthObservation,
} from '../../lib/operations/service-health-repository';
import { healthTransitionNotificationStatements } from '../../lib/operations/service-health-notifications';
import { deliverBusinessEmails } from '../../lib/operations/business-notifications';
import { getNotificationPanel } from '../../lib/operations/notification-panel';
export async function healthNotificationJourney(
  db: D1Database,
  readBell: (id: string) => Promise<Response>,
) {
  const now = 2_000_000_000_000;
  for (const [id, role] of [
    ['health-sa', 'super_admin'],
    ['health-admin', 'admin'],
  ] as const) {
    await db
      .prepare(
        "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'Fictional health responder','active',1,1)",
      )
      .bind(id, id, id + '@local.hastabazaar.test')
      .run();
    await db
      .prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,1)')
      .bind(id, role)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES('health-sa','admin',1)",
    )
    .run();
  const scope = {
    environment: 'test' as const,
    serviceKey: 'email.sender',
    expectedSince: now - 400000,
    now,
  };
  const evaluate = (at: number) =>
    evaluateServiceHealth(
      db,
      { ...scope, now: at },
      healthTransitionNotificationStatements,
    );
  const record = (runKey: string, at: number) =>
    recordServiceHealthObservation(db, {
      environment: 'test',
      serviceKey: 'email.sender',
      runKey,
      observedAt: at,
      successful: true,
      functionalSuccess: true,
      eligibleBacklog: 0,
      oldestEligibleAt: null,
      progressCount: 0,
      failureCategory: null,
      sourceKind: 'sender',
    });
  const outage = await evaluate(now);
  assert.equal(outage.incident?.state, 'detected');
  await evaluate(now + 1);
  const all = () =>
    db
      .prepare(
        "SELECT id,recipient_user_id userId,channel,subject_en subject,status,read_at readAt,request_id requestId FROM notification_messages WHERE template_key='business.system.email_health' ORDER BY created_at,id",
      )
      .all<{
        id: string;
        userId: string;
        channel: string;
        subject: string;
        status: string;
        readAt: number | null;
        requestId: string;
      }>();
  let rows = (await all()).results;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.userId === 'health-sa'));
  assert.deepEqual(rows.map((r) => r.channel).sort(), ['email', 'in_app']);
  const panel = await getNotificationPanel(db, {
    userId: 'health-sa',
    audience: 'staff',
    staff: { role: 'super_admin' },
  });
  assert.equal(panel.unreadCount, 1);
  const bell = rows.find((r) => r.channel === 'in_app')!;
  assert.equal((await readBell(bell.id)).status, 200);
  assert.equal(
    (
      await getNotificationPanel(db, {
        userId: 'health-sa',
        audience: 'staff',
        staff: { role: 'super_admin' },
      })
    ).unreadCount,
    0,
  );
  assert.equal(
    (await evaluate(now + 2)).incident?.state,
    'detected',
    'Reading the existing bell never resolves the service',
  );
  await record('functional-one', now + 10);
  assert.equal((await evaluate(now + 10)).incident?.state, 'monitoring');
  await record('functional-too-soon', now + 30010);
  assert.equal((await evaluate(now + 30010)).incident?.state, 'monitoring');
  await record('functional-two', now + 60010);
  assert.equal((await evaluate(now + 60010)).incident?.state, 'resolved');
  await evaluate(now + 60011);
  rows = (await all()).results;
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((r) => r.requestId)).size, 4);
  assert.equal(
    rows.filter((r) => r.subject === 'Email delivery recovered').length,
    2,
  );
  const recoveredPanel = await getNotificationPanel(db, {
    userId: 'health-sa',
    audience: 'staff',
    staff: { role: 'super_admin' },
  });
  assert.equal(recoveredPanel.unreadCount, 1);
  assert.equal(recoveredPanel.items[0].subjectEn, 'Email delivery recovered');
  const handedOff: string[] = [];
  const result = await deliverBusinessEmails(
    db,
    {
      handoffAware: true,
      transport: 'capture',
      async send(message, context) {
        await context!.beforeHandoff();
        handedOff.push(message.subject);
        return {
          outcome: 'captured',
          transport: 'capture',
          receipt: 'fictional-health-capture',
        };
      },
    },
    'https://local.hastabazaar.test',
    { now: now + 60012, limit: 6 },
  );
  assert.equal(result.accepted, 1);
  assert.equal(handedOff.length, 1);
  assert.match(handedOff[0], /Email delivery recovered$/);
  rows = (await all()).results;
  assert.equal(
    rows.find(
      (r) =>
        r.channel === 'email' && r.subject === 'Email delivery needs attention',
    )!.status,
    'cancelled',
    'Resolved outage mail is suppressed before any handoff',
  );
  await deliverBusinessEmails(
    db,
    {
      async send() {
        throw Error('Captured accepted work must never replay');
      },
    },
    'https://local.hastabazaar.test',
    { now: now + 60013, limit: 6 },
  );
  assert.equal((await all()).results.length, 4);
  return { incidentId: outage.incident!.id };
}
