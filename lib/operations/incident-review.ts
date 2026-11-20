import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import type { CommandContext } from '../workflows/contracts';
import {incidentCommandAuthority,incidentCommandReceipt as commandReceipt,type IncidentCommandContext} from './incident-command-recovery';
import { hasServiceRecoveryEvidence } from './service-health';
import {
  readServiceHealth,
  type HealthEnvironment,
  type ServiceHealthIncident,
  type HealthTransition,
} from './service-health-repository';
import {
  can,
  validateAdminPermissions,
  type Permission,
} from '../marketplace/permissions';
import type {
  OperationalSourceDescriptor,
  SourceOperationalEvent,
  CurrentOperationalNotice,
} from './financial-notice-sources';
import { operationalNotificationRequestId } from './event-catalog';
import { readDatabaseHealthScope } from '../db/health-context';

export class IncidentConflict extends Error {}
export class IncidentBeforeWriteConflict extends IncidentConflict {}
type Severity = 'critical' | 'high' | 'routine';
type Impact = 'ordinary' | 'privacy' | 'security' | 'financial_integrity';
const environments = ['production', 'development', 'local_staging', 'test'];
const linkedPermissions: Record<string, Permission> = {
  order: 'order.manage',
  seller: 'seller.application.review',
  payment: 'payment.receipt.verify',
  refund: 'refund.approve.standard',
  return_request: 'support.manage',
  complaint: 'support.manage',
  incident: 'system.health.view',
};
const targets = (severity: Severity) =>
  severity === 'critical'
    ? { ack: 900_000, plan: 3_600_000, update: 3_600_000 }
    : severity === 'high'
      ? { ack: 3_600_000, plan: 14_400_000, update: 14_400_000 }
      : { ack: 86_400_000, plan: 86_400_000, update: 86_400_000 };
const identity = (value: unknown) => {
  if (typeof value !== 'string' || !/^[-a-zA-Z0-9_.:]{1,160}$/.test(value))
    throw new IncidentBeforeWriteConflict('Use a valid source reference.');
  return value;
};
const summary = (value: unknown, label = 'Technical summary', minimum = 8) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < minimum ||
    value.length > 2000 ||
    Array.from(value).some(character=>{const code=character.charCodeAt(0);return code<=8||code===11||code===12;}) ||
    /(?:bearer\s+[a-z0-9]|password\s*[:=]|BEGIN (?:RSA )?PRIVATE KEY|\b\d{9,}\b|[^\s@]+@[^\s@]+\.[a-z]{2})/i.test(
      value,
    )
  )
    throw new IncidentBeforeWriteConflict(
      `${label} must be a safe technical summary without credentials or personal data.`,
    );
  return value.trim();
};
const guard = (db: D1Database, predicate: string, values: unknown[]) => {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO service_health_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM service_health_guards WHERE id=?').bind(id),
  ];
};
const projection = `SELECT h.id,h.environment,h.service_key AS serviceKey,h.episode,h.state,h.severity,h.first_seen_at AS firstSeenAt,h.last_seen_at AS lastSeenAt,h.resolved_at AS resolvedAt,h.revision AS healthRevision,
 g.incident_id AS governedId,COALESCE(g.title,'Service incident') AS title,COALESCE(g.impact_class,'ordinary') AS impactClass,COALESCE(g.impact_summary,'Impact not yet assessed') AS impactSummary,g.failure_signature AS failureSignature,g.release_reference AS releaseReference,g.configuration_reference AS configurationReference,g.owner_id AS ownerId,g.backup_id AS backupId,g.acknowledged_at AS acknowledgedAt,g.acknowledged_by AS acknowledgedBy,g.plan_text AS plan,g.plan_at AS planAt,g.first_review_at AS firstReviewAt,g.next_action AS nextAction,g.next_update_at AS nextUpdateAt,g.acknowledge_due_at AS storedAckDue,g.plan_due_at AS storedPlanDue,g.update_interval_ms AS updateInterval,COALESCE(g.closure_required,0) AS closureRequired,g.resolution_cause AS resolutionCause,g.merged_into AS mergedInto,g.legacy_incident_id AS legacyIncidentId,g.prior_incident_id AS priorIncidentId,COALESCE(g.revision,0) AS governanceRevision FROM service_health_incidents h LEFT JOIN service_incident_governance g ON g.incident_id=h.id`;
interface Row extends Omit<ServiceHealthIncident, 'revision'> {
  healthRevision: number;
  governedId: string | null;
  title: string;
  impactClass: Impact;
  impactSummary: string;
  failureSignature: string | null;
  releaseReference: string | null;
  configurationReference: string | null;
  ownerId: string | null;
  backupId: string | null;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  plan: string | null;
  planAt: number | null;
  firstReviewAt: number | null;
  nextAction: string | null;
  nextUpdateAt: number | null;
  storedAckDue: number | null;
  storedPlanDue: number | null;
  updateInterval: number | null;
  closureRequired: number;
  resolutionCause: string | null;
  mergedInto: string | null;
  legacyIncidentId: string | null;
  priorIncidentId: string | null;
  governanceRevision: number;
}
async function current(db: D1Database, id: string) {
  const row = await db
    .prepare(`${projection} WHERE h.id=?`)
    .bind(id)
    .first<Row>();
  if (!row) throw new IncidentConflict('Incident was not found.');
  return row;
}
const version = (row: Row) => `${row.healthRevision}:${row.governanceRevision}`;
async function eligible(db: D1Database, id: string | null) {
  if (!id) return false;
  try {
    await staffMutationGuard(
      db,
      id,
      'system.incidents.manage',
      IncidentConflict,
    );
    return true;
  } catch (error) {
    if (error instanceof IncidentConflict) return false;
    throw error;
  }
}
async function recovery(db: D1Database, row: Row, now: number) {
  const runtime = readDatabaseHealthScope(db);
  let evidenceScope: string | null =
    runtime?.environment === row.environment ? runtime.releaseId : null;
  if (evidenceScope && row.serviceKey.startsWith('form.'))
    try {
      const formId = row.serviceKey.slice(5),
        config = await (
          await import('../forms/runtime')
        ).resolvePublishedForm(db, formId);
      evidenceScope = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(
              JSON.stringify([runtime!.releaseId, formId, config.version]),
            ),
          ),
        ),
        (v) => v.toString(16).padStart(2, '0'),
      ).join('');
    } catch {
      evidenceScope = null;
    }
  const evidence = await readServiceHealth(db, {
    environment: row.environment,
    serviceKey: row.serviceKey,
    expectedSince: row.firstSeenAt,
    observationMode: /^(form|forms|file|files)\./.test(row.serviceKey)
      ? 'event'
      : 'scheduled',
    evidenceScope,
    now,
  });
  return {
    ready:
      evidenceScope !== null &&
      evidence.state === 'healthy' &&
      hasServiceRecoveryEvidence(evidence.observations, row.firstSeenAt),
    observations: evidence.observations,
    latestId: evidence.observations[0]?.id ?? null,
  };
}
async function projected(db: D1Database, row: Row, now: number) {
  const timing = targets(row.severity),
    ownerId = (await eligible(db, row.ownerId)) ? row.ownerId : null,
    backupId =
      row.backupId !== ownerId && (await eligible(db, row.backupId))
        ? row.backupId
        : null;
  return {
    ...row,
    version: version(row),
    ownerId,
    backupId,
    coverageGap: !ownerId,
    acknowledgeDueAt: row.storedAckDue ?? row.firstSeenAt + timing.ack,
    planDueAt: row.storedPlanDue ?? row.firstSeenAt + timing.plan,
    recoveryReady: (await recovery(db, row, now)).ready,
  };
}
async function incidentReadAccess(db: D1Database, actorId: string) {
  const actor = await db
    .prepare(
      "SELECT r.role,p.permissions_json AS profile FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(actorId)
    .first<{ role: 'admin' | 'super_admin'; profile: string | null }>();
  let permissions: Permission[] | undefined;
  if (actor?.profile !== null && actor?.profile !== undefined)
    try {
      permissions = validateAdminPermissions(JSON.parse(actor.profile));
    } catch {
      permissions = [];
    }
  if (!actor)
    throw new IncidentConflict('Current incident read permission is required.');
  const all = can({ role: actor.role, permissions }, 'system.health.view');
  if (
    !all &&
    !can({ role: actor.role, permissions }, 'system.incidents.manage')
  )
    throw new IncidentConflict('Current incident read permission is required.');
  return { all, role: actor.role, profile: actor.profile };
}
async function proveIncidentRead(
  db: D1Database,
  actorId: string,
  access: Awaited<ReturnType<typeof incidentReadAccess>>,
  rows: Row[],
  environment: string,
) {
  const authority =
    "EXISTS(SELECT 1 FROM users reader JOIN user_roles reader_role ON reader_role.user_id=reader.id LEFT JOIN staff_permission_profiles reader_profile ON reader_profile.user_id=reader.id WHERE reader.id=? AND reader.status='active' AND reader_role.role=?" +
    (access.role === 'super_admin'
      ? ')'
      : access.profile === null
        ? ' AND reader_profile.user_id IS NULL)'
        : ' AND reader_profile.permissions_json=?)');
  const values: unknown[] = [
    actorId,
    access.role,
    ...(access.role === 'admin' && access.profile !== null
      ? [access.profile]
      : []),
    environment,
    ...(access.all ? [] : [actorId, actorId]),
  ];
  const sources = rows.length
    ? rows
        .map((row) => {
          values.push(row.id, row.healthRevision, row.governanceRevision);
          return `(h.id=? AND h.revision=? AND COALESCE(g.revision,0)=? AND g.incident_id IS ${row.governedId ? 'NOT ' : ''}NULL)`;
        })
        .join(' OR ')
    : '0';
  const proof = await db
    .prepare(
      `SELECT CASE WHEN ${authority} THEN (SELECT COUNT(*) FROM service_health_incidents h LEFT JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.environment=? ${access.all ? '' : 'AND (g.owner_id=? OR g.backup_id=?)'} AND (${sources})) ELSE -1 END AS matched`,
    )
    .bind(...values)
    .first<{ matched: number }>();
  if (proof?.matched !== rows.length)
    throw new IncidentConflict(
      'Incident permission, assigned scope or source changed while reading. Refresh before continuing.',
    );
}
export async function listIncidents(
  db: D1Database,
  actorId: string,
  environment: string,
  now = Date.now(),
  options: { limit?: number } = {},
) {
  const access = await incidentReadAccess(db, actorId);
  if (!environments.includes(environment)) return [];
  const rows = await db
    .prepare(
      `${projection} WHERE h.environment=? ${access.all ? '' : 'AND (g.owner_id=? OR g.backup_id=?)'} ORDER BY CASE h.state WHEN 'resolved' THEN 1 ELSE 0 END,h.first_seen_at,h.id LIMIT ?`,
    )
    .bind(
      environment,
      ...(access.all ? [] : [actorId, actorId]),
      Math.max(1, Math.min(options.limit ?? 100, 100)),
    )
    .all<Row>();
  const result = await Promise.all(
    rows.results.map((row) => projected(db, row, now)),
  );
  await proveIncidentRead(db, actorId, access, rows.results, environment);
  return result;
}
export async function readIncident(
  db: D1Database,
  actorId: string,
  id: string,
  environment: string,
  now = Date.now(),
) {
  const access = await incidentReadAccess(db, actorId),
    row = await current(db, id);
  if (!access.all && row.ownerId !== actorId && row.backupId !== actorId)
    throw new IncidentConflict(
      'Only currently assigned incident scope is available.',
    );
  if (row.environment !== environment)
    throw new IncidentConflict('Incident is outside this environment.');
  const history = await db
    .prepare(
      'SELECT id,actor_id AS actorId,action,from_revision AS fromRevision,to_revision AS toRevision,facts_json AS factsJson,occurred_at AS occurredAt FROM service_incident_events WHERE incident_id=? ORDER BY occurred_at,id LIMIT 200',
    )
    .bind(id)
    .all<{
      id: string;
      actorId: string | null;
      action: string;
      fromRevision: string | null;
      toRevision: string;
      factsJson: string;
      occurredAt: number;
    }>();
  const links = await db
    .prepare(
      'SELECT source_type AS sourceType,source_id AS sourceId,linked_at AS linkedAt FROM service_incident_links WHERE incident_id=? ORDER BY linked_at,source_type,source_id LIMIT 100',
    )
    .bind(id)
    .all<{ sourceType: string; sourceId: string; linkedAt: number }>();
  const roots: Record<string, string> = {
    order: '/admin/orders/',
    seller: '/admin/sellers/',
    payment: '/admin/payments?order=',
    refund: '/admin/payments/refunds?obligation=',
    return_request: '/admin/cases/returns/',
    complaint: '/admin/cases/complaints/',
    incident: '/admin/system-health/incidents?incident=',
  };
  const visibleLinks = [];
  for (const link of links.results)
    try {
      await staffMutationGuard(
        db,
        actorId,
        linkedPermissions[link.sourceType],
        IncidentConflict,
      );
      const target =
        link.sourceType === 'payment'
          ? (
              await db
                .prepare(
                  'SELECT order_id AS orderId FROM manual_payment_claims WHERE id=?',
                )
                .bind(link.sourceId)
                .first<{ orderId: string }>()
            )?.orderId
          : link.sourceId;
      if (target)
        visibleLinks.push({
          ...link,
          href: roots[link.sourceType] + encodeURIComponent(target),
        });
    } catch (error) {
      if (!(error instanceof IncidentConflict)) throw error;
    }
  const result = {
    ...(await projected(db, row, now)),
    history: history.results,
    links: visibleLinks,
  };
  await proveIncidentRead(db, actorId, access, [row], environment);
  return result;
}
function event(
  db: D1Database,
  context: { actorId: string | null; requestId: string; now: number },
  id: string,
  action: string,
  from: string | null,
  to: string,
  facts: unknown,
  eventId = crypto.randomUUID(),
) {
  return db
    .prepare(
      'INSERT INTO service_incident_events(id,incident_id,request_id,actor_id,action,from_revision,to_revision,governance_revision,facts_json,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      eventId,
      id,
      `${context.actorId ?? 'system'}:${context.requestId}:${id}`,
      context.actorId,
      action,
      from,
      to,
      Number(to.split(':')[1]),
      JSON.stringify(facts),
      context.now,
    );
}
async function notices(
  db: D1Database,
  eventId: string,
  actorId: string | null,
  now: number,
  status: string,
) {
  return (
    await import('./business-notifications')
  ).operationalBusinessNotificationStatements(db, {
    kind: 'system.incident',
    sourceId: eventId,
    eventId,
    actorId: actorId ?? '',
    now,
    status,
    detail:
      'A system incident changed. Open the authorized incident workspace for its current state and next action.',
  });
}
async function batchOrReplay<T>(
  db: D1Database,
  statements: D1PreparedStatement[],
  result: T,
  reload: () => Promise<{ replayed: boolean; result?: unknown }>,
): Promise<T> {
  try {
    await db.batch(statements);
    return result;
  } catch (error) {
    const receipt = await reload();
    if (receipt.replayed) return receipt.result as T;
    throw error;
  }
}
function sourceGuard(db: D1Database, row: Row) {
  return guard(
    db,
    `EXISTS(SELECT 1 FROM service_health_incidents WHERE id=? AND revision=? AND state=?) AND ${row.governedId ? 'EXISTS(SELECT 1 FROM service_incident_governance WHERE incident_id=? AND revision=?)' : 'NOT EXISTS(SELECT 1 FROM service_incident_governance WHERE incident_id=?)'}`,
    [
      row.id,
      row.healthRevision,
      row.state,
      row.id,
      ...(row.governedId ? [row.governanceRevision] : []),
    ],
  );
}
function adopt(db: D1Database, row: Row, now: number, closureRequired = 1) {
  const timing = targets(row.severity);
  return db
    .prepare(
      'INSERT OR IGNORE INTO service_incident_governance(incident_id,failure_signature,acknowledge_due_at,plan_due_at,update_interval_ms,next_update_at,closure_required,updated_at,prior_incident_id) VALUES(?,?,?,?,?,?,?,?,(SELECT previous.id FROM service_health_incidents previous WHERE previous.environment=? AND previous.service_key=? AND previous.episode<? ORDER BY previous.episode DESC LIMIT 1))',
    )
    .bind(
      row.id,
      row.serviceKey,
      row.firstSeenAt + timing.ack,
      row.firstSeenAt + timing.plan,
      timing.update,
      row.firstSeenAt + timing.update,
      closureRequired,
      now,
      row.environment,
      row.serviceKey,
      row.episode,
    );
}

export interface NewIncident {
  environment: HealthEnvironment;
  serviceKey: string;
  failureSignature: string;
  title: string;
  impactSummary: string;
  impactClass: Impact;
  severity: Severity;
  releaseReference?: string;
  configurationReference?: string;
}
export async function createIncident(
  db: D1Database,
  context: IncidentCommandContext,
  input: NewIncident,
  extraStatements: (
    incidentId: string,
  ) => readonly D1PreparedStatement[] = () => [],
) {
  const actor = await incidentCommandAuthority(db,context,IncidentConflict);
  if (
    context.expectedRevision !== null ||
    !environments.includes(input.environment) ||
    !/^[-a-z0-9_.]{1,80}$/.test(input.serviceKey) ||
    !['critical', 'high', 'routine'].includes(input.severity) ||
    !['ordinary', 'privacy', 'security', 'financial_integrity'].includes(
      input.impactClass,
    )
  )
    throw new IncidentBeforeWriteConflict('Valid incident scope and impact are required.');
  const title = summary(input.title, 'Title', 4),
    impactSummary = summary(input.impactSummary, 'Impact'),
    signature = identity(input.failureSignature);
  const receipt = await commandReceipt(
    db,
    context,
    {
      action: 'system.incident.create',
      subjectType: 'system_incident',
      subjectId: `${input.environment}:${input.serviceKey}`,
    },
    input,
  );
  if (receipt.replayed)
    return receipt.result as {
      incidentId: string;
      version: string;
      state: string;
    };
  const existing = await db
    .prepare(
      "SELECT id FROM service_health_incidents WHERE environment=? AND service_key=? AND state<>'resolved'",
    )
    .bind(input.environment, input.serviceKey)
    .first<{ id: string }>();
  if (existing)
    throw new IncidentBeforeWriteConflict(
      'This failure already has an open incident; update that retained episode.',
    );
  const prior = await db
    .prepare(
      'SELECT id,episode FROM service_health_incidents WHERE environment=? AND service_key=? ORDER BY episode DESC LIMIT 1',
    )
    .bind(input.environment, input.serviceKey)
    .first<{ id: string; episode: number }>();
  const id = crypto.randomUUID(),
    eventId = crypto.randomUUID(),
    timing = targets(input.severity),
    result = { incidentId: id, version: '0:0', state: 'detected', eventId };
  const ownerId = actor.role === 'super_admin' ? null : context.actorId,
    claimGuards: D1PreparedStatement[] = [];
  if (ownerId) {
    const { teamUserAvailable, teamAvailabilityGuards } =
      await import('./team-governance');
    if (!(await teamUserAvailable(db, ownerId, context.now)))
      throw new IncidentBeforeWriteConflict(
        'Only a currently available responder may record and claim this incident.',
      );
    claimGuards.push(...teamAvailabilityGuards(db, ownerId));
  }
  return batchOrReplay(
    db,
    [
      ...actor.statements,
      ...claimGuards,
      ...guard(
        db,
        "NOT EXISTS(SELECT 1 FROM service_health_incidents WHERE environment=? AND service_key=? AND state<>'resolved')",
        [input.environment, input.serviceKey],
      ),
      db
        .prepare(
          "INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,resolved_at,failure_category,revision) VALUES(?,?,?,?,'detected',?,?,?,NULL,'worker',0)",
        )
        .bind(
          id,
          input.environment,
          input.serviceKey,
          (prior?.episode ?? 0) + 1,
          input.severity,
          context.now,
          context.now,
        ),
      db
        .prepare(
          'INSERT INTO service_incident_governance(incident_id,title,impact_class,impact_summary,failure_signature,release_reference,configuration_reference,acknowledge_due_at,plan_due_at,update_interval_ms,next_update_at,closure_required,prior_incident_id,updated_at,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)',
        )
        .bind(
          id,
          title,
          input.impactClass,
          impactSummary,
          signature,
          input.releaseReference ? identity(input.releaseReference) : null,
          input.configurationReference
            ? identity(input.configurationReference)
            : null,
          context.now + timing.ack,
          context.now + timing.plan,
          timing.update,
          context.now + timing.update,
          prior?.id ?? null,
          context.now,
          ownerId,
        ),
      event(
        db,
        context,
        id,
        'created',
        null,
        '0:0',
        {
          title,
          impactClass: input.impactClass,
          severity: input.severity,
          impactSummary,
          ownerId,
        },
        eventId,
      ),
      ...(await notices(db, eventId, context.actorId, context.now, 'created')),
      ...extraStatements(id),
      receipt.insert(result),
    ],
    result,
    () =>
      commandReceipt(
        db,
        context,
        {
          action: 'system.incident.create',
          subjectType: 'system_incident',
          subjectId: `${input.environment}:${input.serviceKey}`,
        },
        input,
      ),
  );
}

async function responderGuards(
  db: D1Database,
  row: Row,
  actorId: string,
  role: string,
  now: number,
  claim: boolean,
) {
  if (role === 'super_admin') return [];
  const { teamUserAvailable, teamAvailabilityGuards } =
    await import('./team-governance');
  if (!(await teamUserAvailable(db, actorId, now)))
    throw new IncidentBeforeWriteConflict(
      'Current available responder authority is required.',
    );
  if (
    row.ownerId !== actorId &&
    row.backupId !== actorId &&
    !(claim && row.ownerId === null)
  )
    throw new IncidentBeforeWriteConflict(
      'Only the currently assigned owner or eligible backup may act within this incident scope.',
    );
  return teamAvailabilityGuards(db, actorId);
}
export interface IncidentCommand {
  incidentId: string;
  action:
    | 'assign'
    | 'acknowledge'
    | 'plan'
    | 'update'
    | 'monitor'
    | 'resolve'
    | 'severity'
    | 'impact'
    | 'link'
    | 'merge';
  reason: string;
  ownerId?: string | null;
  backupId?: string | null;
  plan?: string;
  nextAction?: string;
  nextUpdateAt?: number;
  cause?: string;
  severity?: Severity;
  impactClass?: Impact;
  impactSummary?: string;
  sourceType?:
    | 'order'
    | 'seller'
    | 'payment'
    | 'refund'
    | 'return_request'
    | 'complaint'
    | 'incident';
  sourceId?: string;
  targetIncidentId?: string;
}
export async function executeIncidentCommand(
  db: D1Database,
  context: IncidentCommandContext,
  input: IncidentCommand,
  extraGuards: readonly D1PreparedStatement[] = [],
  commandMetadata: {
    reviewTaskId: string;
    reviewTaskRevision: number;
  } | null = null,
) {
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'incidentId',
          'action',
          'reason',
          'ownerId',
          'backupId',
          'plan',
          'nextAction',
          'nextUpdateAt',
          'cause',
          'severity',
          'impactClass',
          'impactSummary',
          'sourceType',
          'sourceId',
          'targetIncidentId',
        ].includes(key),
    )
  )
    throw new IncidentBeforeWriteConflict('Unexpected incident command field.');
  const actor = await incidentCommandAuthority(db,context,IncidentConflict),
    reason = summary(input.reason, 'Reason');
  const row = await current(db, identity(input.incidentId));
  if (
    context.environment !== undefined &&
    context.environment !== row.environment
  )
    throw new IncidentBeforeWriteConflict('Incident is outside this environment.');
  const receipt = await commandReceipt(
    db,
    context,
    {
      action: `system.incident.${input.action}`,
      subjectType: 'system_incident',
      subjectId: row.id,
    },
    { command: input, metadata: commandMetadata },
  );
  if (receipt.replayed)
    return receipt.result as {
      incidentId: string;
      version: string;
      state: string;
    };
  if (context.expectedRevision !== version(row))
    throw new IncidentBeforeWriteConflict('Incident changed. Refresh before saving.');
  if (row.state === 'resolved' || row.mergedInto)
    throw new IncidentBeforeWriteConflict(
      'This incident is already closed or linked to its canonical episode.',
    );
  const explicitClaim =
    (input.action === 'assign' && input.ownerId === context.actorId) ||
    input.action === 'acknowledge';
  const assignedGuards = await responderGuards(
    db,
    row,
    context.actorId,
    actor.role,
    context.now,
    explicitClaim,
  );
  const updates: Record<string, unknown> = {},
    statements: D1PreparedStatement[] = [
      ...actor.statements,
      ...assignedGuards,
      ...extraGuards,
      ...sourceGuard(db, row),
      adopt(db, row, context.now),
    ];
  let state: ServiceHealthIncident['state'] = row.state,
    severity = row.severity;
  if (input.action === 'assign') {
    if (
      actor.role !== 'super_admin' &&
      (row.ownerId !== null ||
        input.ownerId !== context.actorId ||
        (input.backupId !== undefined && input.backupId !== row.backupId))
    )
      throw new IncidentBeforeWriteConflict(
        'Only Super Admin can reassign an owned incident; an available responder may explicitly claim unassigned work.',
      );
    const ownerId = input.ownerId ?? null,
      backupId =
        actor.role === 'super_admin'
          ? (input.backupId ?? null)
          : row.backupId === ownerId
            ? null
            : row.backupId;
    if (ownerId && backupId === ownerId)
      throw new IncidentBeforeWriteConflict(
        'The owner cannot be their own absence backup.',
      );
    const { teamUserAvailable, teamAvailabilityGuards } =
      await import('./team-governance');
    for (const id of [ownerId, backupId])
      if (id) {
        if (!(await teamUserAvailable(db, id, context.now)))
          throw new IncidentBeforeWriteConflict(
            'The selected responder is currently unavailable.',
          );
        statements.push(...teamAvailabilityGuards(db, id));
      }
    if (ownerId)
      statements.push(
        ...(
          await staffMutationGuard(
            db,
            identity(ownerId),
            'system.incidents.manage',
            IncidentConflict,
          )
        ).statements,
      );
    if (backupId)
      statements.push(
        ...(
          await staffMutationGuard(
            db,
            identity(backupId),
            'system.incidents.manage',
            IncidentConflict,
          )
        ).statements,
      );
    updates.owner_id = ownerId;
    updates.backup_id = backupId;
    if (row.state === 'detected') state = 'assigned';
  } else if (input.action === 'acknowledge') {
    if (
      row.ownerId &&
      row.ownerId !== context.actorId &&
      row.backupId !== context.actorId &&
      actor.role !== 'super_admin'
    )
      throw new IncidentBeforeWriteConflict(
        'The current owner must acknowledge this incident.',
      );
    if (row.acknowledgedAt === null) {
      updates.acknowledged_at = context.now;
      updates.acknowledged_by = context.actorId;
    }
    updates.owner_id = row.ownerId ?? context.actorId;
    if (row.ownerId === null && row.backupId === context.actorId)
      updates.backup_id = null;
    state = 'working';
  } else if (input.action === 'plan' || input.action === 'update') {
    const interval = row.updateInterval ?? targets(severity).update;
    if (
      !Number.isSafeInteger(input.nextUpdateAt) ||
      input.nextUpdateAt! <= context.now ||
      input.nextUpdateAt! > context.now + interval
    )
      throw new IncidentBeforeWriteConflict(
        'Set a future promised update within the incident update allowance.',
      );
    updates.next_action = summary(input.nextAction, 'Next action');
    updates.next_update_at = input.nextUpdateAt;
    if (input.action === 'plan') {
      updates.plan_text = summary(input.plan, 'Containment plan');
      updates.plan_at = row.planAt ?? context.now;
      updates.first_review_at = row.firstReviewAt ?? context.now;
    }
    state = 'working';
  } else if (input.action === 'severity') {
    if (
      !input.severity ||
      !['critical', 'high', 'routine'].includes(input.severity)
    )
      throw new IncidentBeforeWriteConflict('Select a supported severity.');
    const rank = { routine: 0, high: 1, critical: 2 };
    if (
      rank[input.severity] < rank[row.severity] &&
      actor.role !== 'super_admin'
    )
      throw new IncidentBeforeWriteConflict(
        'Only Super Admin can lower incident severity with an impact reason.',
      );
    severity = input.severity;
    const timing = targets(severity);
    updates.acknowledge_due_at = Math.min(
      row.storedAckDue ?? row.firstSeenAt + targets(row.severity).ack,
      row.firstSeenAt + timing.ack,
    );
    updates.plan_due_at = Math.min(
      row.storedPlanDue ?? row.firstSeenAt + targets(row.severity).plan,
      row.firstSeenAt + timing.plan,
    );
    updates.update_interval_ms = timing.update;
  } else if (input.action === 'impact') {
    if (
      !input.impactClass ||
      !['ordinary', 'privacy', 'security', 'financial_integrity'].includes(
        input.impactClass,
      )
    )
      throw new IncidentBeforeWriteConflict('Select the actual impact classification.');
    if (
      row.impactClass !== 'ordinary' &&
      input.impactClass === 'ordinary' &&
      actor.role !== 'super_admin'
    )
      throw new IncidentBeforeWriteConflict(
        'Only Super Admin can remove a sensitive incident classification.',
      );
    updates.impact_class = input.impactClass;
    updates.impact_summary = summary(input.impactSummary, 'Impact');
    updates.closure_required = 1;
  } else if (input.action === 'link') {
    if (
      !input.sourceType ||
      ![
        'order',
        'seller',
        'payment',
        'refund',
        'return_request',
        'complaint',
        'incident',
      ].includes(input.sourceType)
    )
      throw new IncidentBeforeWriteConflict(
        'Select a supported authoritative source type.',
      );
    statements.push(
      ...(
        await staffMutationGuard(
          db,
          context.actorId,
          linkedPermissions[input.sourceType],
          IncidentConflict,
        )
      ).statements,
    );
    const sourceId = identity(input.sourceId);
    const sourceTable = {
      order: 'orders',
      seller: 'seller_profiles',
      payment: 'manual_payment_claims',
      refund: 'refund_obligations',
      return_request: 'return_requests',
      complaint: 'complaints',
      incident: 'service_health_incidents',
    }[input.sourceType];
    if (
      !(await db
        .prepare(`SELECT 1 FROM ${sourceTable} WHERE id=?`)
        .bind(sourceId)
        .first())
    )
      throw new IncidentBeforeWriteConflict('The linked source is unavailable.');
    statements.push(
      ...guard(db, `EXISTS(SELECT 1 FROM ${sourceTable} WHERE id=?)`, [
        sourceId,
      ]),
      db
        .prepare(
          'INSERT OR IGNORE INTO service_incident_links(incident_id,source_type,source_id,linked_by,linked_at) VALUES(?,?,?,?,?)',
        )
        .bind(row.id, input.sourceType, sourceId, context.actorId, context.now),
    );
  } else if (input.action === 'merge') {
    const target = await current(db, identity(input.targetIncidentId));
    if (
      target.id === row.id ||
      target.environment !== row.environment ||
      target.state === 'resolved' ||
      target.mergedInto ||
      !row.failureSignature ||
      target.failureSignature !== row.failureSignature ||
      target.releaseReference !== row.releaseReference ||
      target.configurationReference !== row.configurationReference
    )
      throw new IncidentBeforeWriteConflict(
        'Merge only verified duplicate reports of the same failure and environment.',
      );
    if (row.impactClass !== 'ordinary' && actor.role !== 'super_admin')
      throw new IncidentBeforeWriteConflict(
        'Super Admin must confirm sensitive duplicate mapping.',
      );
    const rank = { routine: 0, high: 1, critical: 2 };
    if (
      target.firstSeenAt > row.firstSeenAt ||
      rank[target.severity] < rank[row.severity] ||
      target.impactClass !== row.impactClass ||
      (target.storedAckDue ??
        target.firstSeenAt + targets(target.severity).ack) >
        (row.storedAckDue ?? row.firstSeenAt + targets(row.severity).ack) ||
      (target.storedPlanDue ??
        target.firstSeenAt + targets(target.severity).plan) >
        (row.storedPlanDue ?? row.firstSeenAt + targets(row.severity).plan)
    )
      throw new IncidentBeforeWriteConflict(
        'Choose the oldest canonical episode with matching impact and at least the same severity and original response targets.',
      );
    statements.push(
      ...sourceGuard(db, target),
      ...(await responderGuards(
        db,
        target,
        context.actorId,
        actor.role,
        context.now,
        false,
      )),
    );
    for (const [from, to] of [
      [row.id, target.id],
      [target.id, row.id],
    ])
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO service_incident_links(incident_id,source_type,source_id,linked_by,linked_at) VALUES(?,'incident',?,?,?)",
          )
          .bind(from, to, context.actorId, context.now),
      );
    updates.merged_into = target.id;
    updates.next_action = 'Continue response in the linked canonical incident';
    state = 'monitoring';
  } else if (input.action === 'monitor' || input.action === 'resolve') {
    if (
      input.action === 'resolve' &&
      row.impactClass !== 'ordinary' &&
      actor.role !== 'super_admin'
    )
      throw new IncidentBeforeWriteConflict(
        'Super Admin must confirm sensitive or financial-integrity incident closure.',
      );
    const proof = await recovery(db, row, context.now);
    if (!proof.ready)
      throw new IncidentBeforeWriteConflict(
        'Two current functional observations at least one minute apart and clear or progressing work are required.',
      );
    statements.push(
      ...guard(
        db,
        '(SELECT id FROM service_health_observations WHERE environment=? AND service_key=? ORDER BY observed_at DESC,id DESC LIMIT 1)=?',
        [row.environment, row.serviceKey, proof.latestId],
      ),
    );
    state = input.action === 'resolve' ? 'resolved' : 'monitoring';
    if (input.action === 'resolve') {
      updates.closed_by = context.actorId;
      updates.closure_authorized_revision = row.healthRevision + 1;
      updates.resolution_cause = summary(
        input.cause,
        'Cause or explicitly unknown cause',
        3,
      );
      updates.recovery_last_observation_id = proof.latestId;
      const latest = proof.observations[0];
      updates.recovery_first_observation_id =
        [...proof.observations]
          .reverse()
          .find(
            (item) =>
              item.observedAt > row.firstSeenAt &&
              item.successful &&
              item.functionalSuccess &&
              (item.evidenceScope ?? null) === (latest.evidenceScope ?? null),
          )?.id ?? null;
    }
  } else throw new IncidentBeforeWriteConflict('Unsupported incident action.');
  const fields = Object.keys(updates);
  statements.push(
    db
      .prepare(
        `UPDATE service_incident_governance SET ${fields.map((field) => `${field}=?`).join(',')}${fields.length ? ',' : ''}revision=revision+1,updated_at=? WHERE incident_id=? AND revision=?`,
      )
      .bind(
        ...fields.map((field) => updates[field]),
        context.now,
        row.id,
        row.governanceRevision,
      ),
  );
  statements.push(
    db
      .prepare(
        'UPDATE service_health_incidents SET state=?,severity=?,resolved_at=?,revision=revision+1 WHERE id=? AND revision=?',
      )
      .bind(
        state,
        severity,
        state === 'resolved' ? context.now : null,
        row.id,
        row.healthRevision,
      ),
  );
  const eventId = crypto.randomUUID(),
    result = {
      incidentId: row.id,
      version: `${row.healthRevision + 1}:${row.governanceRevision + 1}`,
      state,
      eventId,
    };
  statements.push(
    event(
      db,
      context,
      row.id,
      input.action,
      version(row),
      result.version,
      {
        ...updates,
        state,
        severity,
        reason,
        ...(input.sourceType ? { sourceType: input.sourceType } : {}),
        ...(input.targetIncidentId
          ? { canonicalIncidentId: input.targetIncidentId }
          : {}),
      },
      eventId,
    ),
    ...(await (input.action === 'resolve' &&
    /^email\.(sender|evaluator)$/.test(row.serviceKey)
      ? (
          await import('./service-health-notifications')
        ).healthTransitionNotificationStatements(db, {
          environment: row.environment,
          serviceKey: row.serviceKey,
          incidentId: row.id,
          episode: row.episode,
          transition: 'recovery',
          observedAt: context.now,
        })
      : notices(db, eventId, context.actorId, context.now, input.action))),
    receipt.insert(result),
  );
  return batchOrReplay(db, statements, result, () =>
    commandReceipt(
      db,
      context,
      {
        action: `system.incident.${input.action}`,
        subjectType: 'system_incident',
        subjectId: row.id,
      },
      { command: input, metadata: commandMetadata },
    ),
  );
}

export async function incidentFollowupFacts(
  db: D1Database,
  id: string,
  now = Date.now(),
) {
  const row = await current(db, id),
    timing = targets(row.severity),
    ackDue = row.storedAckDue ?? row.firstSeenAt + timing.ack,
    planDue = row.storedPlanDue ?? row.firstSeenAt + timing.plan,
    active = row.state !== 'resolved' && !row.mergedInto;
  return {
    incidentId: row.id,
    environment: row.environment,
    revision: version(row),
    governanceRevision: row.governanceRevision,
    milestoneKeys: {
      acknowledge: `${row.id}:ack:${ackDue}`,
      plan: `${row.id}:plan:${planDue}`,
      update: `${row.id}:update:${row.governanceRevision}:${row.nextUpdateAt ?? 'none'}`,
    },
    severity: row.severity,
    ownerId: (await eligible(db, row.ownerId)) ? row.ownerId : null,
    backupId: (await eligible(db, row.backupId)) ? row.backupId : null,
    acknowledgedAt: row.acknowledgedAt,
    midpointAt: row.firstSeenAt + (ackDue - row.firstSeenAt) / 2,
    acknowledgeDueAt: ackDue,
    planDueAt: planDue,
    nextUpdateAt: row.nextUpdateAt,
    midpoint:
      active &&
      row.acknowledgedAt === null &&
      now >= row.firstSeenAt + (ackDue - row.firstSeenAt) / 2 &&
      now < ackDue,
    acknowledgeOverdue: active && row.acknowledgedAt === null && now >= ackDue,
    planOverdue: active && row.planAt === null && now >= planDue,
    updateOverdue:
      active && row.nextUpdateAt !== null && now >= row.nextUpdateAt,
  };
}
export async function incidentReviewSource(
  db: D1Database,
  id: string,
  now = Date.now(),
) {
  const row = await current(db, id),
    facts = await incidentFollowupFacts(db, id, now);
  return {
    revision: row.id,
    ownerId: '',
    startedAt: row.firstSeenAt,
    dueAt: facts.acknowledgeDueAt,
    hasDeadline: row.acknowledgedAt === null,
    initialReviewerId: facts.ownerId,
    allowedStaffIds:
      row.ownerId || row.backupId
        ? [row.ownerId, row.backupId].filter((id): id is string => !!id)
        : undefined,
    backupId: facts.backupId,
    triagedAt: row.acknowledgedAt,
    nextUpdateAt: row.nextUpdateAt,
    status: row.state,
    permission: 'system.incidents.manage' as const,
    reserved: false,
    needsAction: row.state !== 'resolved' && !row.mergedInto,
    nextActor: 'Technical responder',
    priority: row.severity === 'critical',
    predicate: `EXISTS(SELECT 1 FROM service_health_incidents h LEFT JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.id=? AND h.revision=? AND h.state=? AND COALESCE(g.revision,0)=? AND COALESCE(g.impact_class,'ordinary')=?)`,
    values: [
      row.id,
      row.healthRevision,
      row.state,
      row.governanceRevision,
      row.impactClass,
    ],
  };
}
export async function assignIncidentFromReviewTask(
  db: D1Database,
  context: CommandContext,
  input: {
    incidentId: string;
    ownerId: string | null;
    reason: string;
    reviewTaskId?: string;
    reviewTaskRevision?: number;
  },
  extraGuards: readonly D1PreparedStatement[] = [],
) {
  const { reviewTaskId, reviewTaskRevision, ...command } = input;
  if (
    (reviewTaskId === undefined) !== (reviewTaskRevision === undefined) ||
    (reviewTaskRevision !== undefined &&
      (!Number.isSafeInteger(reviewTaskRevision) || reviewTaskRevision < 0))
  )
    throw new IncidentConflict(
      'The original task identity and version are required together.',
    );
  return executeIncidentCommand(
    db,
    context,
    { ...command, action: 'assign' },
    extraGuards,
    reviewTaskId
      ? {
          reviewTaskId: identity(reviewTaskId),
          reviewTaskRevision: reviewTaskRevision!,
        }
      : null,
  );
}
export async function currentIncidentOperationalNotice(
  db: D1Database,
  input: {
    relatedId: string | null;
    requestId?: string;
    userId?: string;
    requiredPermission?: string | null;
  },
) {
  if (!input.relatedId) return false;
  const row = await current(db, input.relatedId);
  if (input.userId && !(await eligible(db, input.userId))) return false;
  return row.state !== 'resolved' && !row.mergedInto;
}
export function incidentOperationalSource(
  db: D1Database,
  e: SourceOperationalEvent,
): OperationalSourceDescriptor {
  return {
    guard: `EXISTS(SELECT 1 FROM service_incident_events native_event JOIN service_health_incidents h ON h.id=native_event.incident_id JOIN service_incident_governance g ON g.incident_id=h.id WHERE native_event.id=? AND native_event.id=? AND native_event.governance_revision=g.revision AND (h.state<>'resolved' OR native_event.action='resolve') AND (g.merged_into IS NULL OR native_event.action='merge'))`,
    guardValues: [e.sourceId, e.eventId],
    ownerSql: null,
    ownerValues: [],
    audience: 'staff',
    staffPermission: 'system.incidents.manage',
    relatedType: 'service_incident_event',
    subject: 'System incident updated',
    staffGuard: `EXISTS(SELECT 1 FROM service_incident_events native_event JOIN service_incident_governance g ON g.incident_id=native_event.incident_id WHERE native_event.id=? AND (((g.owner_id=u.id OR g.backup_id=u.id) AND COALESCE((SELECT a.available FROM team_availability a WHERE a.user_id=u.id AND a.starts_at<=${checkoutCommitClock(db)} AND a.ends_at>${checkoutCommitClock(db)} ORDER BY a.revision DESC LIMIT 1),1)=1) OR EXISTS(SELECT 1 FROM user_roles incident_role WHERE incident_role.user_id=u.id AND incident_role.role='super_admin')))`,
    staffGuardValues: [e.sourceId],
  };
}
export async function isCurrentIncidentNotice(
  db: D1Database,
  notice: CurrentOperationalNotice,
  now = Date.now(),
) {
  if (
    notice.relatedType !== 'service_incident_event' ||
    !notice.relatedId ||
    !notice.userId ||
    notice.audience !== 'staff'
  )
    return false;
  if (!(await eligible(db, notice.userId))) return false;
  const row = await db
    .prepare(
      `SELECT e.id,e.incident_id AS incidentId,e.action,e.governance_revision AS eventRevision,h.state,g.revision,g.owner_id AS ownerId,g.backup_id AS backupId,g.merged_into AS mergedInto FROM service_incident_events e JOIN service_health_incidents h ON h.id=e.incident_id JOIN service_incident_governance g ON g.incident_id=h.id WHERE e.id=?`,
    )
    .bind(notice.relatedId)
    .first<{
      id: string;
      incidentId: string;
      action: string;
      eventRevision: number;
      state: string;
      revision: number;
      ownerId: string | null;
      backupId: string | null;
      mergedInto: string | null;
    }>();
  if (
    !row ||
    row.eventRevision !== row.revision ||
    (row.state === 'resolved' && row.action !== 'resolve') ||
    (row.mergedInto && row.action !== 'merge')
  )
    return false;
  const sa = !!(await db
    .prepare(
      "SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin'",
    )
    .bind(notice.userId)
    .first());
  if (
    !sa &&
    ((row.ownerId !== notice.userId && row.backupId !== notice.userId) ||
      !(await (
        await import('./team-governance')
      ).teamUserAvailable(db, notice.userId, now)))
  )
    return false;
  return (
    notice.requestId ===
    (await operationalNotificationRequestId(
      'business.system.incident',
      row.id,
      notice.userId,
      notice.channel,
    ))
  );
}

export async function prepareIncidentOwnerChangeStatements(
  db: D1Database,
  context: CommandContext,
  input: {
    incidentId: string;
    ownerId: string | null;
    backupId?: string | null;
    reason: string;
    excludedUserIds?: string[];
  },
  options:{notify?:boolean}={},
): Promise<D1PreparedStatement[]> {
  const actor = await staffMutationGuard(
    db,
    context.actorId,
    'system.incidents.manage',
    IncidentConflict,
  );
  const row = await current(db, input.incidentId),
    scopeGuards = await responderGuards(
      db,
      row,
      context.actorId,
      actor.role,
      context.now,
      input.ownerId === context.actorId,
    );
  if (
    actor.role !== 'super_admin' &&
    ((row.ownerId !== null && row.ownerId !== input.ownerId) ||
      input.ownerId !== context.actorId ||
      (input.backupId !== undefined && input.backupId !== row.backupId))
  )
    throw new IncidentConflict(
      'Only Super Admin can reassign another incident owner.',
    );
  return [
    ...actor.statements,
    ...scopeGuards,
    ...(await ownerChangeStatements(db, context, input,options.notify!==false)),
  ];
}
async function ownerChangeStatements(
  db: D1Database,
  context: { actorId: string | null; requestId: string; now: number },
  input: {
    incidentId: string;
    ownerId: string | null;
    backupId?: string | null;
    reason: string;
    excludedUserIds?: string[];
  },
  notify=true,
): Promise<D1PreparedStatement[]> {
  const row = await current(db, input.incidentId);
  if (row.state === 'resolved' || row.mergedInto) return [];
  const excluded = input.excludedUserIds ?? [];
  if (input.ownerId && excluded.includes(input.ownerId))
    throw new IncidentBeforeWriteConflict(
      'A revoked person cannot remain the incident owner.',
    );
  const backupId =
    input.backupId !== undefined
      ? input.backupId
      : row.backupId &&
          row.backupId !== input.ownerId &&
          !excluded.includes(row.backupId)
        ? row.backupId
        : null;
  if (backupId === input.ownerId && backupId)
    throw new IncidentBeforeWriteConflict('The owner cannot be their own absence backup.');
  const statements = [
    ...sourceGuard(db, row),
    adopt(
      db,
      row,
      context.now,
      row.governedId
        ? row.closureRequired
        : /^email\.(sender|evaluator)$/.test(row.serviceKey)
          ? 0
          : 1,
    ),
  ];
  const { teamUserAvailable, teamAvailabilityGuards } =
    await import('./team-governance');
  for (const userId of [input.ownerId, backupId])
    if (userId) {
      if (!(await teamUserAvailable(db, userId, context.now)))
        throw new IncidentBeforeWriteConflict(
          'The selected responder is currently unavailable.',
        );
      statements.push(
        ...(
          await staffMutationGuard(
            db,
            userId,
            'system.incidents.manage',
            IncidentConflict,
          )
        ).statements,
        ...teamAvailabilityGuards(db, userId),
      );
    }
  const nextVersion = `${row.healthRevision + 1}:${row.governanceRevision + 1}`,
    eventId = crypto.randomUUID();
  statements.push(
    db
      .prepare(
        'UPDATE service_incident_governance SET owner_id=?,backup_id=?,revision=revision+1,updated_at=? WHERE incident_id=? AND revision=?',
      )
      .bind(
        input.ownerId,
        backupId,
        context.now,
        row.id,
        row.governanceRevision,
      ),
    db
      .prepare(
        'UPDATE service_health_incidents SET revision=revision+1 WHERE id=? AND revision=?',
      )
      .bind(row.id, row.healthRevision),
    event(
      db,
      context,
      row.id,
      'ownership_rerouted',
      version(row),
      nextVersion,
      {
        previousOwnerId: row.ownerId,
        ownerId: input.ownerId,
        backupId,
        reason: summary(input.reason, 'Ownership reason'),
      },
      eventId,
    ),
    ...(notify?await notices(db,eventId,context.actorId,context.now,'ownership_rerouted'):[]),
  );
  return statements;
}
/** Trusted maintenance preparation. Actual roster/source proofs accompany every native write. */
export async function prepareIncidentCoverageChangeStatements(db:D1Database,input:{incidentId:string;now:number;requestId:string}){
 const row=await current(db,input.incidentId),{readTeamDutyCoverage,teamUserAvailable,teamAvailabilityGuards}=await import('./team-governance');
 if(row.state==='resolved'||row.mergedInto)return{state:'stale' as const,ownerId:row.ownerId,changed:false,statements:[]as D1PreparedStatement[]};
 const available=async(id:string|null)=>!!id&&await eligible(db,id)&&await teamUserAvailable(db,id,input.now);
 const coverage=await readTeamDutyCoverage(db,'system_incidents',{now:input.now}),handoff=coverage.activeHandoff,handoffOwner=handoff?.fromUserId===row.ownerId&&coverage.activeOwnerId===handoff.userId?handoff.userId:null;
 if(await available(row.ownerId)&&!handoffOwner)return{state:'settled' as const,ownerId:row.ownerId,changed:false,statements:[...sourceGuard(db,row),...(await staffMutationGuard(db,row.ownerId!,'system.incidents.manage',IncidentConflict)).statements,...teamAvailabilityGuards(db,row.ownerId!)]};
 const ownerId=handoffOwner??(await available(row.backupId)?row.backupId:coverage.activeOwnerId),backupId=coverage.backupId!==ownerId?coverage.backupId:null;
 const changed=!row.governedId||row.ownerId!==ownerId||row.backupId!==backupId;
 const statements=[...coverage.guards,...(changed?await ownerChangeStatements(db,{actorId:null,requestId:input.requestId,now:input.now},{incidentId:row.id,ownerId,backupId,reason:'Automatic coverage reconciliation from current native authority and roster'},false):sourceGuard(db,row))];
 return{state:ownerId?'settled' as const:'gap' as const,ownerId,changed,statements};
}
export async function reconcileIncidentOwnership(
  db: D1Database,
  input: { environment: HealthEnvironment; now: number; limit?: number },
) {
  const { readTeamDutyCoverage, teamUserAvailable, teamAvailabilityGuards } =
      await import('./team-governance'),
    family = `incident-ownership:${input.environment}`,
    token = crypto.randomUUID(),
    limit = Math.max(1, Math.min(input.limit ?? 30, 100));
  if (!environments.includes(input.environment))
    throw new IncidentConflict(
      'Current incident scan environment is required.',
    );
  await db
    .prepare(
      "INSERT OR IGNORE INTO operational_reminder_cursors(family,`cursor`,revision) VALUES(?,'',0)",
    )
    .bind(family)
    .run();
  const cursor = await db
    .prepare(
      'SELECT `cursor`,revision,lease_until AS leaseUntil FROM operational_reminder_cursors WHERE family=?',
    )
    .bind(family)
    .first<{ cursor: string; revision: number; leaseUntil: number | null }>();
  if (!cursor)
    throw new IncidentConflict(
      'Incident ownership scan cursor is unavailable.',
    );
  if ((cursor.leaseUntil ?? 0) > input.now)
    return { scanned: 0, changed: 0, busy: true };
  const lease = await db
    .prepare(
      'UPDATE operational_reminder_cursors SET lease_token=?,lease_until=?,revision=revision+1 WHERE family=? AND revision=? AND (lease_until IS NULL OR lease_until<=?)',
    )
    .bind(token, input.now + 60_000, family, cursor.revision, input.now)
    .run();
  if (!lease.meta.changes) return { scanned: 0, changed: 0, busy: true };
  const checkpoint = (value: string) =>
    db
      .prepare(
        'UPDATE operational_reminder_cursors SET `cursor`=? WHERE family=? AND lease_token=? AND revision=?',
      )
      .bind(value, family, token, cursor.revision + 1);
  const leaseGuard = () =>
    guard(
      db,
      'EXISTS(SELECT 1 FROM operational_reminder_cursors WHERE family=? AND lease_token=? AND revision=?)',
      [family, token, cursor.revision + 1],
    );
  try {
    let after: [number, string] | null = null;
    if (cursor.cursor) {
      const parsed: unknown = JSON.parse(cursor.cursor);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        !Number.isSafeInteger(parsed[0]) ||
        typeof parsed[1] !== 'string'
      )
        throw new IncidentConflict(
          'Incident ownership scan cursor is invalid.',
        );
      after = [parsed[0] as number, identity(parsed[1])];
    }
    const page = (key: [number, string] | null) =>
      db
        .prepare(
          `${projection} WHERE h.environment=? AND h.state<>'resolved' AND g.merged_into IS NULL ${key ? 'AND (h.first_seen_at>? OR (h.first_seen_at=? AND h.id>?))' : ''} ORDER BY h.first_seen_at,h.id LIMIT ?`,
        )
        .bind(
          input.environment,
          ...(key ? [key[0], key[0], key[1]] : []),
          limit,
        )
        .all<Row>();
    let rows = await page(after);
    if (!rows.results.length && after) rows = await page(null);
    let changed = 0;
    for (const row of rows.results) {
      const value = JSON.stringify([row.firstSeenAt, row.id]),
        available = async (id: string | null) =>
          !!id &&
          (await eligible(db, id)) &&
          (await teamUserAvailable(db, id, input.now));
      if (await available(row.ownerId)) {
        if (!(await checkpoint(value).run()).meta.changes)
          throw new IncidentConflict('Incident ownership scan lease changed.');
        continue;
      }
      const coverage = await readTeamDutyCoverage(db, 'system_incidents', {
          now: input.now,
        }),
        ownerId = (await available(row.backupId))
          ? row.backupId
          : coverage.activeOwnerId,
        backupId =
          coverage.backupId && coverage.backupId !== ownerId
            ? coverage.backupId
            : null;
      if (
        row.governedId &&
        row.ownerId === ownerId &&
        row.backupId === backupId
      ) {
        if (!(await checkpoint(value).run()).meta.changes)
          throw new IncidentConflict('Incident ownership scan lease changed.');
        continue;
      }
      const statements = await ownerChangeStatements(
        db,
        {
          actorId: null,
          requestId: `incident-reroute:${row.id}:${row.governanceRevision}`,
          now: input.now,
        },
        {
          incidentId: row.id,
          ownerId,
          backupId,
          reason:
            'Current authority or availability requires eligible coverage',
        },
      );
      await db.batch([
        ...coverage.guards,
        ...leaseGuard(),
        ...(ownerId ? teamAvailabilityGuards(db, ownerId) : []),
        ...statements,
        checkpoint(value),
      ]);
      changed++;
    }
    if (!rows.results.length) await checkpoint('').run();
    return { scanned: rows.results.length, changed, busy: false };
  } finally {
    await db
      .prepare(
        'UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE family=? AND lease_token=?',
      )
      .bind(family, token)
      .run();
  }
}

export async function importLegacyOperationalIncident(
  db: D1Database,
  context: IncidentCommandContext,
  input: NewIncident & {
    legacyId: string;
    expectedLegacyUpdatedAt: number;
    targetIncidentId?: string;
  },
  extraStatements: (
    incidentId: string,
  ) => readonly D1PreparedStatement[] = () => [],
) {
  const actor = await incidentCommandAuthority(db,context,IncidentConflict),
    legacyId = identity(input.legacyId),
    eventId = crypto.randomUUID();
  const receipt = await commandReceipt(
    db,
    context,
    {
      action: 'system.incident.legacy_map',
      subjectType: 'operational_incident',
      subjectId: legacyId,
    },
    input,
  );
  if (receipt.replayed)
    return receipt.result as {
      incidentId: string;
      version: string;
      state: string;
    };
  const legacy = await db
    .prepare(
      'SELECT severity,status,created_at AS createdAt,updated_at AS updatedAt,resolved_at AS resolvedAt FROM operational_incidents WHERE id=?',
    )
    .bind(legacyId)
    .first<{
      severity: string;
      status: string;
      createdAt: number;
      updatedAt: number;
      resolvedAt: number | null;
    }>();
  if (!legacy || legacy.updatedAt !== input.expectedLegacyUpdatedAt)
    throw new IncidentBeforeWriteConflict(
      'The original legacy incident changed. Refresh its retained record.',
    );
  const mapped = await db
    .prepare(
      'SELECT incident_id AS id FROM service_incident_legacy_links WHERE legacy_incident_id=?',
    )
    .bind(legacyId)
    .first<{ id: string }>();
  if (mapped)
    throw new IncidentBeforeWriteConflict(
      'This legacy record is already mapped to its canonical incident.',
    );
  if (
    !environments.includes(input.environment) ||
    !/^[-a-z0-9_.]{1,80}$/.test(input.serviceKey) ||
    !['ordinary', 'privacy', 'security', 'financial_integrity'].includes(
      input.impactClass,
    )
  )
    throw new IncidentBeforeWriteConflict('Map the actual monitored scope and impact.');
  const severity: Severity =
      legacy.severity === 'critical'
        ? 'critical'
        : legacy.severity === 'high'
          ? 'high'
          : 'routine',
    timing = targets(severity),
    id = input.targetIncidentId ?? crypto.randomUUID(),
    title = summary(input.title, 'Title', 4),
    impact = summary(input.impactSummary, 'Impact'),
    signature = identity(input.failureSignature);
  const statements = [
    ...actor.statements,
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM operational_incidents WHERE id=? AND updated_at=? AND status=?) AND NOT EXISTS(SELECT 1 FROM service_incident_legacy_links WHERE legacy_incident_id=?)',
      [legacyId, legacy.updatedAt, legacy.status, legacyId],
    ),
  ];
  let result: { incidentId: string; version: string; state: string };
  if (input.targetIncidentId) {
    const target = await current(db, id);
    if (
      target.environment !== input.environment ||
      target.state === 'resolved' ||
      target.mergedInto ||
      context.expectedRevision !== version(target) ||
      target.failureSignature !== signature
    )
      throw new IncidentBeforeWriteConflict(
        'Select the current canonical incident for this same failure.',
      );
    statements.push(
      ...sourceGuard(db, target),
      db
        .prepare(
          'UPDATE service_incident_governance SET acknowledge_due_at=?,plan_due_at=?,closure_required=1,revision=revision+1,updated_at=? WHERE incident_id=? AND revision=?',
        )
        .bind(
          Math.min(
            target.storedAckDue ??
              target.firstSeenAt + targets(target.severity).ack,
            legacy.createdAt + timing.ack,
          ),
          Math.min(
            target.storedPlanDue ??
              target.firstSeenAt + targets(target.severity).plan,
            legacy.createdAt + timing.plan,
          ),
          context.now,
          id,
          target.governanceRevision,
        ),
      db
        .prepare(
          'UPDATE service_health_incidents SET revision=revision+1 WHERE id=? AND revision=?',
        )
        .bind(id, target.healthRevision),
    );
    result = {
      incidentId: id,
      version: `${target.healthRevision + 1}:${target.governanceRevision + 1}`,
      state: target.state,
    };
  } else {
    if (context.expectedRevision !== null)
      throw new IncidentBeforeWriteConflict(
        'A new legacy mapping requires the current unmapped state.',
      );
    const previous = await db
      .prepare(
        'SELECT id,episode FROM service_health_incidents WHERE environment=? AND service_key=? ORDER BY episode DESC LIMIT 1',
      )
      .bind(input.environment, input.serviceKey)
      .first<{ id: string; episode: number }>();
    statements.push(
      ...guard(
        db,
        "NOT EXISTS(SELECT 1 FROM service_health_incidents WHERE environment=? AND service_key=? AND state<>'resolved')",
        [input.environment, input.serviceKey],
      ),
      db
        .prepare(
          "INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,resolved_at,failure_category,revision) VALUES(?,?,?,?,'detected',?,?,?,NULL,'unknown',0)",
        )
        .bind(
          id,
          input.environment,
          input.serviceKey,
          (previous?.episode ?? 0) + 1,
          severity,
          legacy.createdAt,
          legacy.updatedAt,
        ),
      db
        .prepare(
          'INSERT INTO service_incident_governance(incident_id,title,impact_class,impact_summary,failure_signature,legacy_incident_id,acknowledge_due_at,plan_due_at,update_interval_ms,next_update_at,closure_required,prior_incident_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)',
        )
        .bind(
          id,
          title,
          input.impactClass,
          impact,
          signature,
          legacyId,
          legacy.createdAt + timing.ack,
          legacy.createdAt + timing.plan,
          timing.update,
          legacy.createdAt + timing.update,
          previous?.id ?? null,
          context.now,
        ),
    );
    result = { incidentId: id, version: '0:0', state: 'detected' };
  }
  statements.push(
    db
      .prepare(
        'INSERT INTO service_incident_legacy_links(legacy_incident_id,incident_id,mapped_by,mapped_at,legacy_status,legacy_updated_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        legacyId,
        id,
        context.actorId,
        context.now,
        legacy.status,
        legacy.updatedAt,
      ),
    event(
      db,
      context,
      id,
      'legacy_mapped',
      context.expectedRevision,
      result.version,
      {
        legacyIncidentId: legacyId,
        legacyStatus: legacy.status,
        legacyResolvedAt: legacy.resolvedAt,
        meaning:
          'Retained historical resolution is not current recovery evidence',
      },
      eventId,
    ),
    ...(await notices(
      db,
      eventId,
      context.actorId,
      context.now,
      'legacy_mapped',
    )),
    ...extraStatements(id),
    receipt.insert(result),
  );
  return batchOrReplay(db, statements, result, () =>
    commandReceipt(
      db,
      context,
      {
        action: 'system.incident.legacy_map',
        subjectType: 'operational_incident',
        subjectId: legacyId,
      },
      input,
    ),
  );
}
export async function listLegacyIncidentMappings(
  db: D1Database,
  actorId: string,
) {
  if (!(await incidentReadAccess(db, actorId)).all) return [];
  return (
    await db
      .prepare(
        'SELECT legacy.id,legacy.reference_number AS reference,legacy.severity,legacy.status,legacy.created_at AS createdAt,legacy.updated_at AS updatedAt,mapping.incident_id AS incidentId FROM operational_incidents legacy LEFT JOIN service_incident_legacy_links mapping ON mapping.legacy_incident_id=legacy.id ORDER BY legacy.created_at,legacy.id LIMIT 100',
      )
      .all<{
        id: string;
        reference: string;
        severity: string;
        status: string;
        createdAt: number;
        updatedAt: number;
        incidentId: string | null;
      }>()
  ).results;
}
export async function incidentResponderOptions(
  db: D1Database,
  actorId: string,
) {
  await staffMutationGuard(
    db,
    actorId,
    'system.incidents.manage',
    IncidentConflict,
  );
  const rows = await db
    .prepare(
      "SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY u.display_name,u.id LIMIT 200",
    )
    .all<{ id: string; name: string }>();
  const allowed = [];
  for (const row of rows.results)
    if (await eligible(db, row.id)) allowed.push(row);
  return allowed;
}
export async function incidentHealthTransitionStatements(
  db: D1Database,
  transition: HealthTransition,
): Promise<D1PreparedStatement[]> {
  const email = /^email\.(sender|evaluator)$/.test(transition.serviceKey);
  if (!email && transition.transition !== 'outage') return [];
  const { readTeamDutyCoverage } = await import('./team-governance'),
    coverage = await readTeamDutyCoverage(db, 'system_incidents', {
      now: transition.observedAt,
    }),
    eventId = crypto.randomUUID();
  const ack =
      "CASE h.severity WHEN 'critical' THEN 900000 WHEN 'high' THEN 3600000 ELSE 86400000 END",
    plan =
      "CASE h.severity WHEN 'critical' THEN 3600000 WHEN 'high' THEN 14400000 ELSE 86400000 END";
  const title = email
    ? 'Email automation incident'
    : transition.serviceKey === 'application.availability'
      ? 'Application availability incident'
      : transition.serviceKey === 'database.readiness'
        ? 'Database readiness incident'
        : transition.serviceKey.startsWith('form.')
          ? 'Form workflow incident'
          : 'Service workflow incident';
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb',
    nativeVersion = maria
      ? "CONCAT(CAST(h.revision AS CHAR),':',CAST(g.revision AS CHAR))"
      : "CAST(h.revision AS TEXT)||':'||CAST(g.revision AS TEXT)";
  const statements = [
    ...coverage.guards,
    db
      .prepare(
        `INSERT OR IGNORE INTO service_incident_governance(incident_id,title,impact_summary,failure_signature,owner_id,backup_id,acknowledge_due_at,plan_due_at,update_interval_ms,next_update_at,closure_required,updated_at,prior_incident_id) SELECT h.id,?,'The named workflow failed its supported check; actual user impact requires review.',h.service_key,?,?,h.first_seen_at+${ack},h.first_seen_at+${plan},${plan},h.first_seen_at+${plan},?,?,(SELECT previous.id FROM service_health_incidents previous WHERE previous.environment=h.environment AND previous.service_key=h.service_key AND previous.episode<h.episode ORDER BY previous.episode DESC LIMIT 1) FROM service_health_incidents h WHERE h.id=?`,
      )
      .bind(
        title,
        coverage.activeOwnerId,
        coverage.backupId,
        email ? 0 : 1,
        transition.observedAt,
        transition.incidentId,
      ),
    db
      .prepare(
        `INSERT INTO service_incident_events(id,incident_id,request_id,actor_id,action,from_revision,to_revision,governance_revision,facts_json,occurred_at) SELECT ?,h.id,?,NULL,?,NULL,${nativeVersion},g.revision,?,? FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.id=?`,
      )
      .bind(
        eventId,
        `health:${transition.incidentId}:${transition.transition}`,
        transition.transition === 'outage' ? 'detected' : 'automatic_recovery',
        JSON.stringify({
          serviceKey: transition.serviceKey,
          transition: transition.transition,
          meaning:
            'Actual persisted health evidence; review actual user impact separately',
        }),
        transition.observedAt,
        transition.incidentId,
      ),
  ];
  if (email)
    statements.push(
      ...(await (
        await import('./service-health-notifications')
      ).healthTransitionNotificationStatements(db, transition)),
    );
  else
    statements.push(
      ...(await notices(db, eventId, null, transition.observedAt, 'detected')),
    );
  return statements;
}
