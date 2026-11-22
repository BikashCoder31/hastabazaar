import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { readDatabaseHealthScope } from '../db/health-context';
import { resolveRuntimeEnvironment } from '../staging/environment';
import {
  readServiceHealth,
  type HealthEnvironment,
} from './service-health-repository';
export class EmailDeliveryOverviewError extends Error {
  readonly status = 403;
}
export function readEmailHealthRuntimeConfig(
  bindings: {
    HASTABAZAAR_RUNTIME_ENV?: string;
    NODE_ENV?: string;
    APP_ORIGIN?: string;
    EMAIL_AUTOMATION_EXPECTED_SINCE?: string | number;
  },
  now: number,
) {
  let environment: HealthEnvironment | null = null;
  try {
    if (!bindings.HASTABAZAAR_RUNTIME_ENV?.trim())
      throw new Error('Runtime environment is not mapped.');
    environment = resolveRuntimeEnvironment({
      runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
      nodeEnvironment: bindings.NODE_ENV,
      appOrigin: bindings.APP_ORIGIN,
    }).kind;
  } catch {
    /* Invalid runtime scope cannot read another environment's health. */
  }
  const raw = bindings.EMAIL_AUTOMATION_EXPECTED_SINCE;
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw)
        ? Number(raw)
        : NaN;
  return {
    environment,
    expectedSince:
      Number.isSafeInteger(value) && value > 0 && value <= now ? value : null,
  };
}
export async function readEmailDeliveryOverview(
  db: D1Database,
  input: {
    actorId: string;
    environment: HealthEnvironment;
    expectedSince: number | null;
    now: number;
  },
) {
  await staffMutationGuard(
    db,
    input.actorId,
    'email.delivery.manage',
    EmailDeliveryOverviewError,
    'super_admin',
  );
  const runtime = readDatabaseHealthScope(db);
  if (runtime && runtime.environment !== input.environment)
    throw new EmailDeliveryOverviewError('Health runtime scope differs.');
  const services = await Promise.all(
    (['email.sender', 'email.evaluator'] as const).map((serviceKey) =>
      readServiceHealth(db, {
        environment: input.environment,
        serviceKey,
        evidenceScope: runtime?.releaseId ?? null,
        expectedSince: input.expectedSince,
        now: input.now,
      }),
    ),
  );
  await staffMutationGuard(
    db,
    input.actorId,
    'email.delivery.manage',
    EmailDeliveryOverviewError,
    'super_admin',
  );
  return {
    environment: input.environment,
    observedAt: input.now,
    expectedSince: input.expectedSince,
    services: services.map((service, index) => ({
      serviceKey: index === 0 ? 'email.sender' : 'email.evaluator',
      state:
        service.incident &&
        service.incident.state !== 'resolved' &&
        service.state === 'healthy'
          ? 'degraded'
          : service.state,
      reason: service.reason,
      lastObservedAt: service.lastObservedAt,
      lastSuccessfulAt: service.lastSuccessfulAt,
      lastFunctionalAt: service.lastFunctionalAt,
      eligibleBacklog: service.eligibleBacklog,
      incident: service.incident
        ? {
            id: service.incident.id,
            episode: service.incident.episode,
            state: service.incident.state,
            severity: service.incident.severity,
            firstSeenAt: service.incident.firstSeenAt,
            resolvedAt: service.incident.resolvedAt,
          }
        : null,
    })),
    independentContactConfigured: false as const,
  };
}
export type EmailDeliveryOverview = Awaited<
  ReturnType<typeof readEmailDeliveryOverview>
>;
