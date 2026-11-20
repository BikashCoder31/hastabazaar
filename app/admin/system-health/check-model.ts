import type { SystemHealthOverview } from '@/lib/operations/system-health-workspace';

export const healthStatusLabels = {
  working: 'Working',
  unchecked: 'Not checked yet',
  attention: 'Needs attention',
  off: 'Off',
} as const;

type HealthStatus = keyof typeof healthStatusLabels;
type Service = SystemHealthOverview['services'][number];
type ProbeResult = boolean | null;

type OrderMailCheck = {
  pending: number;
  oldestAgeMinutes: number;
  overdueFirstAttempts: boolean;
  exhausted: number;
  uncertain: number;
  providerBlockedUntil: number | null;
};

type ManualChecks = {
  website: ProbeResult;
  database: ProbeResult;
  orderMail: OrderMailCheck | null;
};

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  note: string;
};

export type ManualCheckRun = { checks: HealthCheck[]; checkedAt: number };

const timestamp = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});

export function healthTimestamp(value: number) {
  return timestamp.format(value);
}

function observationStatus(service?: Service): HealthStatus {
  if (service?.state === 'degraded' || service?.state === 'action_needed') return 'attention';
  if (service?.state === 'healthy' && service.lastObservedAt != null) return 'working';
  return 'unchecked';
}

function observedCheck(id: string, label: string, observation?: Service): HealthCheck {
  const status = observationStatus(observation);
  const at = observation?.lastObservedAt;
  const note = at != null
    ? `Last observed ${healthTimestamp(at)}`
    : status === 'attention' ? 'Expected check is overdue' : healthStatusLabels.unchecked;
  return { id, label, status, note };
}

function withProbe(check: HealthCheck, probe: ProbeResult | undefined, passed: string, failed: string): HealthCheck {
  if (probe === undefined) return check;
  if (probe === false) return { ...check, status: 'attention', note: failed };
  if (check.status === 'attention') return check;
  if (probe === true) return { ...check, status: 'working', note: passed };
  return { ...check, status: 'unchecked', note: 'Check unavailable' };
}

function orderMailCheck(sender: HealthCheck, queue: OrderMailCheck | null | undefined): HealthCheck {
  const check: HealthCheck = { id: 'order-mail', label: 'Order emails', status: 'unchecked', note: healthStatusLabels.unchecked };
  if (!queue) return queue === null ? { ...check, note: 'Queue check unavailable' } : check;
  const pending = queue.pending ? `${queue.pending} waiting, oldest ${queue.oldestAgeMinutes} min` : 'No emails waiting';
  if (queue.overdueFirstAttempts) return { ...check, status: 'attention', note: `${pending} · first attempts overdue` };
  if (queue.exhausted > 0 || queue.uncertain > 0) return { ...check, status: 'attention', note: 'Delivery outcomes need review' };
  if (queue.providerBlockedUntil) return { ...check, status: 'attention', note: 'Mail provider is temporarily paused' };
  if (sender.status === 'working') return { ...check, status: 'working', note: pending };
  if (sender.status === 'attention') return { ...check, status: 'attention', note: `${pending} · sender needs attention` };
  return { ...check, note: `${pending} · sending unverified` };
}

export function systemHealthChecks(services: SystemHealthOverview['services'], manual?: ManualChecks): HealthCheck[] {
  const service = (key: string) => services.find(row => row.serviceKey === key);
  const website = observedCheck('website', 'Website', service('application.availability'));
  const database = observedCheck('database', 'Database and schema', service('database.readiness'));
  const sender = observedCheck('sender', 'Automatic sender', service('email.sender'));
  const privateFiles = observedCheck('photos', 'Photo storage', service('files.private'));
  const publicFiles = observedCheck('photos', 'Photo storage', service('files.public'));
  const fileIssue = [privateFiles, publicFiles].find(check => check.status === 'attention');
  const photoStorage: HealthCheck = fileIssue ?? (privateFiles.status === 'working' && publicFiles.status === 'working'
    ? { ...privateFiles, note: 'Public and private files accessible' }
    : { ...privateFiles, status: 'unchecked', note: healthStatusLabels.unchecked });
  return [
    withProbe(website, manual?.website, 'Local website handler responded', 'Local website handler check failed'),
    withProbe(database, manual?.database, 'Database and schema checks passed', 'Database or schema check failed'),
    orderMailCheck(sender, manual?.orderMail),
    photoStorage,
    sender,
    observedCheck('reminders', 'Due-reminder checks', service('email.evaluator')),
    { id: 'sms', label: 'SMS', status: 'off', note: 'Not built yet' },
  ];
}
