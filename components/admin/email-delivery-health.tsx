import type { EmailDeliveryOverview } from '@/lib/operations/email-delivery-overview';
const time = (value: number | null | undefined) =>
  value == null
    ? 'No successful observation recorded'
    : new Date(value).toLocaleString('en-NP', {
        timeZone: 'Asia/Kathmandu',
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
const labels: Record<string, string> = {
  healthy: 'Working',
  degraded: 'Delayed',
  action_needed: 'Needs attention',
  unknown: 'Unknown / check overdue',
};
const reasons: Record<string, string> = {
  functional_unverified:
    'Worker liveness was observed, but the delivery or evaluator function has not been verified.',
  expectation_unmapped:
    'Automatic operation has not been mapped; a successful manual run does not verify a schedule.',
  evidence_scope_unverified:
    'The current release has not been verified by these observations. Keep the incident open until matching evidence is available.',
  heartbeat_overdue:
    'Expected successful heartbeat is more than five minutes overdue.',
  first_attempt_overdue:
    'An eligible first attempt is more than five minutes overdue.',
  no_observation: 'No actual run evidence is available.',
  observation_stale: 'The last observation is stale.',
  outcome_unknown: 'A run outcome is unknown; this is not confirmed recovery.',
  recipient_correction:
    'A recipient-specific problem needs correction; it does not establish a provider-wide outage.',
  configuration_correction: 'Email setup needs an authorized correction.',
  run_failed: 'A real run failed. Controlled automatic recovery continues.',
  recent_success: 'A successful real run was observed within the stated scope.',
};
export function EmailDeliveryHealth({
  overview,
}: {
  overview: EmailDeliveryOverview | null;
}) {
  return (
    <section
      aria-labelledby="delivery-health-title"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div>
        <h2 id="delivery-health-title" className="font-heading text-xl">
          Automatic email delivery
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Environment: {overview?.environment ?? 'Unknown'}. Observation times
          use Nepal time. Provider acceptance does not prove inbox delivery.
        </p>
      </div>
      {overview ? (
        <div className="grid gap-4 md:grid-cols-2">
          {overview.services.map((service) => (
            <article key={service.serviceKey} className="rounded-lg border p-4">
              <h3 className="font-semibold">
                {service.serviceKey === 'email.sender'
                  ? 'Automatic sender'
                  : 'Due-reminder evaluator'}
              </h3>
              <p className="mt-2 font-semibold">
                {labels[service.state] ?? 'Unknown'}
              </p>
              <p className="mt-1 text-sm leading-6">
                {reasons[service.reason] ?? 'Review the recorded observation.'}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Last successful run</dt>
                  <dd>{time(service.lastSuccessfulAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Last successful functional check
                  </dt>
                  <dd>{time(service.lastFunctionalAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Eligible backlog observed
                  </dt>
                  <dd>{service.eligibleBacklog ?? 'Unknown'}</dd>
                </div>
              </dl>
              {service.incident ? (
                <p className="mt-3 text-sm">
                  Episode {service.incident.episode}:{' '}
                  {service.incident.state === 'monitoring'
                    ? 'Monitoring recovery'
                    : service.incident.state === 'resolved'
                      ? 'Resolved with recorded recovery evidence'
                      : 'Needs attention'}
                  . First detected {time(service.incident.firstSeenAt)}.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p>
          Unknown: the runtime environment could not be verified. No other
          environment’s observations are shown.
        </p>
      )}
      {overview?.expectedSince === null ? (
        <p className="text-sm">
          Expected automatic operation has not been mapped. An empty queue does
          not verify a running scheduler.
        </p>
      ) : null}
      <p className="text-sm leading-6 text-muted-foreground">
        Recovery requires two real successful functional observations at least
        one minute apart and a progressing or clear eligible backlog. Reading or
        acknowledging an alert never resolves the incident. Recipient
        corrections remain separate.
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        Independent off-platform outage contact is not verified here. The
        application bell and a failing email service cannot be the only outage
        channels.
      </p>
    </section>
  );
}
