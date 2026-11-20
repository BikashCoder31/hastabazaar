import type { DeliveryMailService } from '@/lib/email/delivery-attempts';
import { businessEmailQueue, businessEmailQueueSummary } from '@/lib/operations/business-notifications';
import { readEmailDeliveryOverview, readEmailHealthRuntimeConfig } from '@/lib/operations/email-delivery-overview';

/** All queue/health facts share the observation clock taken when this read starts. */
export async function readBusinessEmailPageEvidence(
  database: D1Database,
  actorId: string,
  bindings: Parameters<typeof readEmailHealthRuntimeConfig>[0] & { EMAIL?: DeliveryMailService },
  now = Date.now(),
) {
  const runtime = readEmailHealthRuntimeConfig(bindings, now);
  const [rows, summary, overview] = await Promise.all([
    businessEmailQueue(database),
    businessEmailQueueSummary(database, now, bindings.EMAIL),
    runtime.environment
      ? readEmailDeliveryOverview(database, {
          actorId, environment: runtime.environment, expectedSince: runtime.expectedSince, now,
        })
      : null,
  ]);
  return { rows, summary, overview };
}
