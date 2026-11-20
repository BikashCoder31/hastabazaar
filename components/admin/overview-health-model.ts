import type { SystemHealthOverview } from '@/lib/operations/system-health-workspace';

const checks = [
  ['Database', ['database.readiness']],
  ['Order emails', ['email.sender', 'email.evaluator']],
  ['Storage', ['files.public', 'files.private']],
] as const;

export function overviewHealthChecks(health: SystemHealthOverview) {
  return checks.map(([label, keys]) => {
    const observations = keys.map(key => health.services.find(row => row.serviceKey === key));
    const allObserved = observations.every(row => row?.lastObservedAt != null);
    const anyObserved = observations.some(row => row?.lastObservedAt != null);
    if (observations.some(row => ['degraded', 'outage', 'action_needed', 'unavailable'].includes(row?.state ?? ''))) {
      return { label, text: anyObserved ? 'Needs attention' : 'Not checked yet', tone: 'issue' };
    }
    if (!allObserved) return { label, text: 'Not checked yet', tone: 'unknown' };
    if (observations.every(row => row?.state === 'healthy')) return { label, text: 'Working', tone: 'good' };
    return { label, text: 'Check status unknown', tone: 'unknown' };
  });
}

export type OverviewHealthChecks = ReturnType<typeof overviewHealthChecks>;
