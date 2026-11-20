import {
  classifyServiceHealth,
  hasServiceRecoveryEvidence,
  type ServiceHealthObservation,
} from './service-health';
export type HealthEnvironment =
  | 'production'
  | 'development'
  | 'local_staging'
  | 'test';
export interface HealthScope {
  observationMode?:'scheduled'|'event';
  /** Server-owned detector policy; never accepted from a diagnostic request body. */
  detectionSeverity?:'critical'|'high'|'routine';
  evidenceScope?:string|null;
  environment: HealthEnvironment;
  serviceKey: string;
  expectedSince: number | null;
  now: number;
}
export interface ServiceHealthIncident {
  id: string;
  environment: HealthEnvironment;
  serviceKey: string;
  episode: number;
  state: 'detected' | 'assigned' | 'working' | 'monitoring' | 'resolved';
  severity: 'critical' | 'high' | 'routine';
  firstSeenAt: number;
  lastSeenAt: number;
  resolvedAt: number | null;
  failureCategory: string | null;
  revision: number;
}
export interface HealthTransition {
  incidentId: string;
  environment: HealthEnvironment;
  serviceKey: string;
  episode: number;
  transition: 'outage' | 'recovery';
  observedAt: number;
}
export type HealthTransitionStatements = (
  db: D1Database,
  transition: HealthTransition,
) => Promise<D1PreparedStatement[]>;
/** Internal evidence retention shares the guarded incident/notice transaction.
 * Returning null defers the whole decision when the caller's budget expires. */
export type HealthIncidentEvidenceStatements = (
  db: D1Database,
  incident: {id:string;episode:number;firstSeenAt:number},
  observations: readonly ServiceHealthObservation[],
) => Promise<D1PreparedStatement[] | null>;
const observationSelect = `SELECT id,service_key AS serviceKey,run_key AS runKey,observed_at AS observedAt,successful,functional_success AS functionalSuccess,eligible_backlog AS eligibleBacklog,oldest_eligible_at AS oldestEligibleAt,progress_count AS progressCount,failure_category AS failureCategory,source_kind AS sourceKind,evidence_scope AS evidenceScope FROM service_health_observations`;
const incidentSelect = `SELECT id,environment,service_key AS serviceKey,episode,state,severity,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,resolved_at AS resolvedAt,failure_category AS failureCategory,revision FROM service_health_incidents`;
function validateScope(environment: string, serviceKey: string) {
  if (
    !['production', 'development', 'local_staging', 'test'].includes(
      environment,
    ) ||
    !/^[-a-z0-9_.]{1,80}$/.test(serviceKey)
  )
    throw new Error('Invalid health observation scope.');
}
export async function recordServiceHealthObservation(
  db: D1Database,
  input: Omit<ServiceHealthObservation, 'id' | 'functionalSuccess'> & {
    environment: HealthEnvironment;
    functionalSuccess?: boolean;
  },
) {
  validateScope(input.environment, input.serviceKey);
  const functionalSuccess = input.functionalSuccess ?? input.progressCount > 0;
  if (
    (input.evidenceScope!==undefined&&input.evidenceScope!==null&&(!/^[-a-zA-Z0-9_.:]{1,191}$/.test(input.evidenceScope))) || !input.runKey ||
    input.runKey.length > 160 ||
    !Number.isSafeInteger(input.observedAt) ||
    input.observedAt < 0 ||
    !Number.isSafeInteger(input.eligibleBacklog) ||
    input.eligibleBacklog < 0 ||
    !Number.isSafeInteger(input.progressCount) ||
    input.progressCount < 0 ||
    typeof input.successful !== 'boolean' ||
    typeof functionalSuccess !== 'boolean' ||
    (functionalSuccess &&
      !input.successful &&
      input.failureCategory !== 'recipient') ||
    (input.oldestEligibleAt !== null &&
      (!Number.isSafeInteger(input.oldestEligibleAt) ||
        input.oldestEligibleAt > input.observedAt)) ||
    !['sender', 'evaluator', 'watchdog'].includes(input.sourceKind) ||
    ![
      null,
      'provider',
      'recipient',
      'configuration',
      'unknown',
      'worker',
    ].includes(input.failureCategory) ||
    (input.successful && input.failureCategory !== null)
  )
    throw new Error('Invalid health observation.');
  const values = [
    input.environment,
    input.serviceKey,
    input.runKey,
    input.observedAt,
    input.successful ? 1 : 0,
    input.eligibleBacklog,
    input.oldestEligibleAt,
    input.progressCount,
    input.failureCategory,
    input.sourceKind,
    functionalSuccess ? 1 : 0,
    input.evidenceScope??null,
  ];
  const guardId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO service_health_observations(id,environment,service_key,run_key,observed_at,successful,eligible_backlog,oldest_eligible_at,progress_count,failure_category,source_kind,functional_success,evidence_scope) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(crypto.randomUUID(), ...values),
    db
      .prepare(
        `INSERT INTO service_health_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM service_health_observations WHERE environment=? AND service_key=? AND run_key=? AND observed_at=? AND successful=? AND eligible_backlog=? AND (oldest_eligible_at=? OR (oldest_eligible_at IS NULL AND ? IS NULL)) AND progress_count=? AND (failure_category=? OR (failure_category IS NULL AND ? IS NULL)) AND source_kind=? AND functional_success=? AND (evidence_scope=? OR (evidence_scope IS NULL AND ? IS NULL))) THEN 1 ELSE 0 END`,
      )
      .bind(
        guardId,
        input.environment,
        input.serviceKey,
        input.runKey,
        input.observedAt,
        input.successful ? 1 : 0,
        input.eligibleBacklog,
        input.oldestEligibleAt,
        input.oldestEligibleAt,
        input.progressCount,
        input.failureCategory,
        input.failureCategory,
        input.sourceKind,
        functionalSuccess ? 1 : 0,
        input.evidenceScope??null,input.evidenceScope??null,
      ),
    db.prepare('DELETE FROM service_health_guards WHERE id=?').bind(guardId),
  ]);
}
export async function readServiceHealth(db: D1Database, scope: HealthScope) {
  validateScope(scope.environment, scope.serviceKey);
  const result = await db
    .prepare(
      `${observationSelect} WHERE environment=? AND service_key=? AND observed_at<=? ORDER BY observed_at DESC,id DESC LIMIT 100`,
    )
    .bind(scope.environment, scope.serviceKey, scope.now)
    .all<ServiceHealthObservation>();
  const observations = result.results.map((o) => ({
    ...o,
    successful: !!o.successful,
    functionalSuccess: !!o.functionalSuccess,
  }));
  const incident = await db
    .prepare(
      `${incidentSelect} WHERE environment=? AND service_key=? ORDER BY episode DESC LIMIT 1`,
    )
    .bind(scope.environment, scope.serviceKey)
    .first<ServiceHealthIncident>();
  const classification = classifyServiceHealth(
    observations,
    scope.expectedSince,
    scope.now,
    scope.observationMode??'scheduled',
    scope.evidenceScope,
  );
  return {
    ...classification,
    incident,
    observations,
    lastObservedAt: observations[0]?.observedAt ?? null,
    lastFunctionalAt:
      observations.find((o) => o.functionalSuccess)?.observedAt ?? null,
    eligibleBacklog: observations[0]?.eligibleBacklog ?? null,
  };
}
/** Called by authenticated job/watchdog orchestration, never by page reads or acknowledgment. */
export async function evaluateServiceHealth(
  db: D1Database,
  scope: HealthScope,
  transitionStatements?: HealthTransitionStatements,
  evidenceStatements?: HealthIncidentEvidenceStatements,
) {
  const current = await readServiceHealth(db, scope),
    open = current.incident?.state !== 'resolved' ? current.incident : null;
  const shouldOpen = current.state === 'action_needed';
  const governance=open?await db.prepare('SELECT closure_required AS closureRequired,impact_class AS impactClass,revision FROM service_incident_governance WHERE incident_id=?').bind(open.id).first<{closureRequired:number;impactClass:string;revision:number}>():null;
  const automaticClosure=governance?governance.closureRequired===0&&governance.impactClass==='ordinary':/^email\.(sender|evaluator)$/.test(scope.serviceKey);
  const recovered = automaticClosure &&
    !!open &&
    current.state === 'healthy' &&
    hasServiceRecoveryEvidence(current.observations, open.firstSeenAt);
  if (!open && !shouldOpen) return current;
  const incidentId = open?.id ?? crypto.randomUUID(),
    episode = open?.episode ?? (current.incident?.episode ?? 0) + 1;
  const state = recovered
    ? 'resolved'
    : open
      ? current.state === 'healthy'
        ? 'monitoring'
        : open.state
      : 'detected';
  const guardId = crypto.randomUUID(),
    lastId = current.observations[0]?.id ?? null;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO service_health_guards(id,valid) SELECT ?,CASE WHEN (SELECT id FROM service_health_observations WHERE environment=? AND service_key=? ORDER BY observed_at DESC,id DESC LIMIT 1)=? OR (? IS NULL AND NOT EXISTS(SELECT 1 FROM service_health_observations WHERE environment=? AND service_key=?)) THEN 1 ELSE 0 END`,
      )
      .bind(
        guardId,
        scope.environment,
        scope.serviceKey,
        lastId,
        lastId,
        scope.environment,
        scope.serviceKey,
      ),
    db.prepare('DELETE FROM service_health_guards WHERE id=?').bind(guardId),
  ];
  const revisionGuard = crypto.randomUUID();
  statements.push(
    db
      .prepare(
        `INSERT INTO service_health_guards(id,valid) SELECT ?,CASE WHEN ${open ? 'EXISTS(SELECT 1 FROM service_health_incidents WHERE id=? AND revision=? AND state=?)' : "NOT EXISTS(SELECT 1 FROM service_health_incidents WHERE environment=? AND service_key=? AND state<>'resolved')"} THEN 1 ELSE 0 END`,
      )
      .bind(
        revisionGuard,
        ...(open
          ? [open.id, open.revision, open.state]
          : [scope.environment, scope.serviceKey]),
      ),
    db
      .prepare('DELETE FROM service_health_guards WHERE id=?')
      .bind(revisionGuard),
  );
  if (open)
    statements.push(
      db
        .prepare(
          'UPDATE service_health_incidents SET state=?,last_seen_at=?,resolved_at=?,revision=revision+1 WHERE id=? AND revision=?',
        )
        .bind(
          state,
          scope.now,
          recovered ? scope.now : null,
          open.id,
          open.revision,
        ),
    );
  else
    statements.push(
      db
        .prepare(
          "INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,resolved_at,failure_category,revision) VALUES(?,?,?,?,'detected',?,?,?,NULL,?,0)",
        )
        .bind(
          incidentId,
          scope.environment,
          scope.serviceKey,
          episode,
          scope.detectionSeverity??(/^(application\.availability|database\.readiness|application\.readiness|availability|readiness)$/.test(scope.serviceKey)?'critical':'high'),
          scope.now,
          scope.now,
          current.observations[0]?.failureCategory ?? 'worker',
        ),
    );
  const transition: HealthTransition | null = !open
    ? {
        incidentId,
        environment: scope.environment,
        serviceKey: scope.serviceKey,
        episode,
        transition: 'outage',
        observedAt: scope.now,
      }
    : recovered
      ? {
          incidentId,
          environment: scope.environment,
          serviceKey: scope.serviceKey,
          episode,
          transition: 'recovery',
          observedAt: scope.now,
        }
      : null;
  if (evidenceStatements) {
    const evidence = await evidenceStatements(db, {id:incidentId,episode,firstSeenAt:open?.firstSeenAt??scope.now}, current.observations);
    if (evidence === null) return current;
    statements.push(...evidence);
  }
  if (transition && transitionStatements)
    statements.push(...(await transitionStatements(db, transition)));
  await db.batch(statements);
  return { ...(await readServiceHealth(db, scope)), transition };
}
