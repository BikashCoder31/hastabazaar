/** Sanitized observations only: never recipient identities, provider responses or secrets. */
export interface ServiceHealthObservation {
  evidenceScope?:string|null;
  id: string;
  serviceKey: string;
  runKey: string;
  observedAt: number;
  successful: boolean;
  functionalSuccess: boolean;
  eligibleBacklog: number;
  oldestEligibleAt: number | null;
  progressCount: number;
  failureCategory:
    | 'provider'
    | 'recipient'
    | 'configuration'
    | 'unknown'
    | 'worker'
    | null;
  sourceKind: 'sender' | 'evaluator' | 'watchdog';
}
export type ServiceHealthState =
  | 'healthy'
  | 'degraded'
  | 'action_needed'
  | 'unknown';
const overdueMs = 5 * 60_000;
const ordered = (
  observations: readonly ServiceHealthObservation[],
  now = Number.MAX_SAFE_INTEGER,
) =>
  observations
    .filter((o) => o.observedAt <= now)
    .slice()
    .sort((a, b) => a.observedAt - b.observedAt || a.id.localeCompare(b.id));
export function classifyServiceHealth(
  observations: readonly ServiceHealthObservation[],
  expectedSince: number | null,
  now: number,
  observationMode:'scheduled'|'event'='scheduled',
  evidenceScope?:string|null,
): {
  state: ServiceHealthState;
  reason: string;
  lastSuccessfulAt: number | null;
} {
  if (
    observationMode==='scheduled' && expectedSince !== null &&
    (!Number.isSafeInteger(expectedSince) ||
      expectedSince <= 0 ||
      expectedSince > now)
  )
    expectedSince = null;
  const rows = ordered(observations, now),
    last = rows.at(-1),
    success = rows
      .filter(
        (o) =>
          o.successful ||
          (o.functionalSuccess && o.failureCategory === 'recipient'),
      )
      .at(-1);
  const base = {
    lastSuccessfulAt:
      rows.filter((o) => o.successful).at(-1)?.observedAt ?? null,
  };
  if (
    observationMode==='scheduled' && expectedSince !== null &&
    now - Math.max(expectedSince, success?.observedAt ?? expectedSince) >
      overdueMs
  )
    return { ...base, state: 'action_needed', reason: 'heartbeat_overdue' };
  if (!last) return { ...base, state: 'unknown', reason: 'no_observation' };
  if(typeof evidenceScope==='string'&&(last.evidenceScope??null)!==evidenceScope)return{...base,state:'unknown',reason:'evidence_scope_unverified'};
  if (
    last.oldestEligibleAt !== null &&
    last.eligibleBacklog > 0 &&
    now - last.oldestEligibleAt > overdueMs
  )
    return { ...base, state: 'action_needed', reason: 'first_attempt_overdue' };
  if (!last.successful) {
    if (last.failureCategory === 'unknown')
      return { ...base, state: 'unknown', reason: 'outcome_unknown' };
    if (last.failureCategory === 'recipient')
      return { ...base, state: 'degraded', reason: 'recipient_correction' };
    const previous = rows.at(-2);
    return {
      ...base,
      state:
        previous &&
        !previous.successful &&
        previous.failureCategory !== 'recipient'
          ? 'action_needed'
          : 'degraded',
      reason:
        last.failureCategory === 'configuration'
          ? 'configuration_correction'
          : 'run_failed',
    };
  }
  // Explicit null means the required current release is unmapped. Keep actual
  // failures/backlog above, but never use unversioned successes as recovery proof.
  if(evidenceScope===null)return{...base,state:'unknown',reason:'evidence_scope_unverified'};
  if (now - last.observedAt > overdueMs)
    return { ...base, state: 'unknown', reason: 'observation_stale' };
  if (!last.functionalSuccess)
    return { ...base, state: 'unknown', reason: 'functional_unverified' };
  if (observationMode==='scheduled' && expectedSince === null)
    return { ...base, state: 'unknown', reason: 'expectation_unmapped' };
  return { ...base, state: 'healthy', reason: 'recent_success' };
}
export function hasServiceRecoveryEvidence(
  observations: readonly ServiceHealthObservation[],
  incidentAt: number,
): boolean {
  const rows = ordered(observations).filter((o) => o.observedAt > incidentAt),
    last = rows.at(-1);
  if (!last?.successful || !last.functionalSuccess) return false;
  let first = last;
  for (let i = rows.length - 2; i >= 0; i--) {
    if (!rows[i].successful || !rows[i].functionalSuccess || (rows[i].evidenceScope??null)!==(last.evidenceScope??null)) break;
    first = rows[i];
  }
  if (
    last.observedAt - first.observedAt < 60_000 ||
    last.runKey === first.runKey
  )
    return false;
  return (
    last.eligibleBacklog === 0 ||
    (last.eligibleBacklog < first.eligibleBacklog && last.progressCount > 0)
  );
}
