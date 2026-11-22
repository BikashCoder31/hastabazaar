import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { healthNotificationJourney } from './helpers/service-health-notification-journey';
import {
  installHealthNoticeRouteFixture,
  actualHealthBellRead,
} from './helpers/service-health-route-fixture';
installHealthNoticeRouteFixture();
void test('common health notices preserve one outage and one functional recovery per channel after bell reading', async () => {
  const f = await incentiveReportDatabase();
  globalThis.healthNoticeDb = f.db;
  try {
    await healthNotificationJourney(f.db, actualHealthBellRead);
  } finally {
    f.dispose();
  }
});
import assert from 'node:assert/strict';
import {
  evaluateServiceHealth,
  recordServiceHealthObservation,
} from '../lib/operations/service-health-repository';
import {
  healthTransitionNotificationStatements,
  isCurrentHealthNotice,
} from '../lib/operations/service-health-notifications';
void test('a queued prior recovery is obsolete when the same service has a newer outage episode', async () => {
  const f = await incentiveReportDatabase();
  try {
    f.sqlite.exec(
      "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('later-sa','later-sa','later-sa@local.hastabazaar.test','Fictional later reviewer','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('later-sa','super_admin',1);",
    );
    const start = 2_000_000_000_000,
      scope = {
        environment: 'test' as const,
        serviceKey: 'email.sender',
        expectedSince: start - 400000,
        now: start,
      };
    await evaluateServiceHealth(
      f.db,
      scope,
      healthTransitionNotificationStatements,
    );
    for (const at of [start + 1, start + 60001])
      await recordServiceHealthObservation(f.db, {
        environment: 'test',
        serviceKey: 'email.sender',
        runKey: 'functional-' + at,
        observedAt: at,
        successful: true,
        functionalSuccess: true,
        eligibleBacklog: 0,
        oldestEligibleAt: null,
        progressCount: 0,
        failureCategory: null,
        sourceKind: 'sender',
      });
    await evaluateServiceHealth(
      f.db,
      { ...scope, now: start + 60001 },
      healthTransitionNotificationStatements,
    );
    const recovery = f.sqlite
      .prepare(
        "SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE subject_en='Email delivery recovered' AND channel='email'",
      )
      .get() as Parameters<typeof isCurrentHealthNotice>[1];
    assert.equal(await isCurrentHealthNotice(f.db, recovery), true);
    await evaluateServiceHealth(
      f.db,
      { ...scope, now: start + 400002 },
      healthTransitionNotificationStatements,
    );
    assert.equal(
      await isCurrentHealthNotice(f.db, recovery),
      false,
      'Previous recovery cannot claim current sending is repaired during a new outage',
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!
        .n,
      2,
    );
    const before = f.sqlite
      .prepare('SELECT COUNT(*) n FROM notification_messages')
      .get()!.n;
    await evaluateServiceHealth(
      f.db,
      { ...scope, serviceKey: 'checkout', now: start + 400002 },
      healthTransitionNotificationStatements,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!.n,
      before,
      'Non-email service observations cannot fabricate email-service notices',
    );
  } finally {
    f.dispose();
  }
});
