import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import type { OperationalBusinessEvent } from './business-notifications';
import type { HealthTransition } from './service-health-repository';
import { operationalNotificationRequestId } from './event-catalog';
import type { Permission } from '../marketplace/permissions';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
class HealthNoticeAccessError extends Error {}

export async function healthOperationalSource(
  db: D1Database,
  event: OperationalBusinessEvent,
) {
  if (
    event.kind !== 'system.email_health' ||
    !['outage', 'recovery'].includes(event.status ?? '') ||
    event.eventId !== event.sourceId + ':' + event.status
  )
    throw new Error('Invalid email health transition.');
  return {
    guard: `EXISTS(SELECT 1 FROM service_health_incidents WHERE id=? AND service_key IN ('email.sender','email.evaluator') AND episode=(SELECT MAX(latest_scope.episode) FROM service_health_incidents latest_scope WHERE latest_scope.environment=service_health_incidents.environment AND latest_scope.service_key=service_health_incidents.service_key) AND ${event.status === 'outage' ? "state<>'resolved'" : "state='resolved'"}) AND (EXISTS(SELECT 1 FROM user_roles health_role WHERE health_role.user_id=u.id AND health_role.role='super_admin') OR EXISTS(SELECT 1 FROM service_incident_governance health_owner WHERE health_owner.incident_id=? AND (health_owner.owner_id=u.id OR health_owner.backup_id=u.id) AND COALESCE((SELECT a.available FROM team_availability a WHERE a.user_id=u.id AND a.starts_at<=${checkoutCommitClock(db)} AND a.ends_at>${checkoutCommitClock(db)} ORDER BY a.revision DESC LIMIT 1),1)=1))`,
    guardValues: [event.sourceId, event.sourceId],
    ownerSql: null,
    ownerValues: [],
    audience: 'staff' as const,
    staffPermission: 'system.incidents.manage' as Permission,
    relatedType: 'email_service_health',
    subject:
      event.status === 'outage'
        ? 'Email delivery needs attention'
        : 'Email delivery recovered',
  };
}
export async function healthTransitionNotificationStatements(
  db: D1Database,
  event: HealthTransition,
) {
  const { operationalBusinessNotificationStatements } =
    await import('./business-notifications');
  return operationalBusinessNotificationStatements(db, {
    kind: 'system.email_health',
    sourceId: event.incidentId,
    eventId: event.incidentId + ':' + event.transition,
    actorId: 'system',
    status: event.transition,
    now: event.observedAt,
    detail:
      event.transition === 'outage'
        ? 'Email automation needs attention. Open the linked incident for current status and the next safe action.'
        : 'Email automation has recovered with recorded successful runs and backlog progress. Open the linked incident for its retained history.',
  });
}
export async function isCurrentHealthNotice(
  db: D1Database,
  notice: {
    template: string;
    relatedId: string | null;
    relatedType?: string | null;
    userId: string | null;
    audience: string;
    channel: string;
    requestId: string;
  },
) {
  if (
    !notice.relatedId ||
    !notice.userId ||
    notice.audience !== 'staff' ||
    notice.relatedType !== 'email_service_health'
  )
    return false;
  try {
    await staffMutationGuard(
      db,
      notice.userId,
      'system.incidents.manage',
      HealthNoticeAccessError,
    );
  } catch (error) {
    if (error instanceof HealthNoticeAccessError) return false;
    throw error;
  }
  const recipient = await db
    .prepare(
      `SELECT 1 FROM users u WHERE u.id=? AND u.status='active' AND (EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin') OR EXISTS(SELECT 1 FROM service_incident_governance g WHERE g.incident_id=? AND (g.owner_id=u.id OR g.backup_id=u.id) AND COALESCE((SELECT a.available FROM team_availability a WHERE a.user_id=u.id AND a.starts_at<=${checkoutCommitClock(db)} AND a.ends_at>${checkoutCommitClock(db)} ORDER BY a.revision DESC LIMIT 1),1)=1))`,
    )
    .bind(notice.userId, notice.relatedId)
    .first();
  if (!recipient) return false;
  const incident = await db
    .prepare(
      "SELECT incident.state FROM service_health_incidents incident WHERE incident.id=? AND incident.service_key IN ('email.sender','email.evaluator') AND NOT EXISTS(SELECT 1 FROM service_health_incidents newer WHERE newer.environment=incident.environment AND newer.service_key=incident.service_key AND newer.episode>incident.episode)",
    )
    .bind(notice.relatedId)
    .first<{ state: string }>();
  if (!incident) return false;
  const transition = incident.state === 'resolved' ? 'recovery' : 'outage';
  return (
    notice.requestId ===
    (await operationalNotificationRequestId(
      'business.system.email_health',
      notice.relatedId + ':' + transition,
      notice.userId,
      notice.channel,
    ))
  );
}
