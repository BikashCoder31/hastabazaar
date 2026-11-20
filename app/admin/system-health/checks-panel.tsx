'use client';

import { Check, CircleHelp, LockKeyhole, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { healthStatusLabels, healthTimestamp, type HealthCheck, type ManualCheckRun } from './check-model';

const appearance = {
  working: { icon: Check, ink: 'text-[#286747]', badge: 'bg-[#deebe1] text-[#286747]', banner: 'bg-[#deebe1]' },
  unchecked: { icon: CircleHelp, ink: 'text-[#675b4e]', badge: 'bg-[#ebe2d1] text-[#46536f]', banner: 'bg-[#e2e8f3]' },
  attention: { icon: TriangleAlert, ink: 'text-[#80520a]', badge: 'bg-[#f5e7c5] text-[#80520a]', banner: 'bg-[#f5e7c5]' },
  off: { icon: LockKeyhole, ink: 'text-[#675b4e]', badge: 'bg-[#ebe2d1] text-[#46536f]', banner: 'bg-[#ebe2d1]' },
} as const;

export function SystemHealthChecks({ actorId, initial, side }: {
  actorId: string;
  initial: HealthCheck[];
  side: React.ReactNode;
}) {
  const [manual, setManual] = useState<ManualCheckRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function runChecks() {
    if (activeRequest.current) return;
    const request = new AbortController();
    activeRequest.current = request;
    setRunning(true);
    setError('');
    try {
      const response = await fetch('/admin/system-health/checks', {
        cache: 'no-store',
        headers: { 'X-Hastabazaar-Actor': actorId },
        signal: request.signal,
      });
      if (!response.ok) throw new Error('Health checks are unavailable');
      const run = await response.json() as ManualCheckRun;
      if (!request.signal.aborted) setManual(run);
    } catch {
      if (!request.signal.aborted) {
        setManual(null);
        setError('The checks could not be completed. Refresh the page or try again.');
      }
    } finally {
      if (!request.signal.aborted) setRunning(false);
      activeRequest.current = null;
    }
  }

  const checks = manual?.checks ?? initial;
  const unchecked = checks.filter(check => check.status === 'unchecked').length;
  const attention = checks.filter(check => check.status === 'attention').length;
  const summaryStatus = error || attention ? 'attention' : unchecked ? 'unchecked' : 'working';
  const SummaryIcon = appearance[summaryStatus].icon;

  return <>
    <div className={`flex min-w-0 items-start gap-3 rounded-xl px-4 py-3.5 ${appearance[summaryStatus].banner}`}>
      <SummaryIcon className={`mt-0.5 size-[18px] shrink-0 ${appearance[summaryStatus].ink}`} aria-hidden="true" />
      <output className="block min-w-0 flex-1 text-sm text-[#293b60]" aria-live="polite">
        {error ? <span className="block">{error}</span> : <span className="block">
          {unchecked ? <strong className="text-[#14213d]">{unchecked} {unchecked === 1 ? 'check is' : 'checks are'} unverified. </strong> : null}
          {attention ? <strong className="text-[#14213d]">{attention} {attention === 1 ? 'check needs' : 'checks need'} attention. </strong> : null}
          {unchecked && !attention ? 'Current evidence is required to show a check as working.' : null}
          {!unchecked && !attention ? <strong className="text-[#14213d]">Everything checked is working.</strong> : null}
        </span>}
        {manual ? <span className="mt-1 block text-xs">Checked {healthTimestamp(manual.checkedAt)} Nepal time. Manual results stay on this page.</span> : null}
      </output>
      <button
        type="button"
        className="admin-button admin-primary min-h-11 w-[4.75rem] shrink-0 leading-tight disabled:opacity-70 sm:w-auto"
        disabled={running}
        onClick={() => void runChecks()}
      >
        {running ? 'Running…' : 'Run all checks'}
      </button>
    </div>
    <div className="grid min-w-0 gap-[18px] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
      <section aria-labelledby="system-checks-heading" aria-busy={running} className="min-w-0 rounded-[15px] border bg-card">
        <h2 id="system-checks-heading" className="px-[18px] py-3.5 font-bold">Checks</h2>
        <ul>
          {checks.map(check => {
            const style = appearance[check.status];
            const Icon = style.icon;
            const stack = check.status === 'unchecked' || check.status === 'attention';
            return <li
              key={check.id}
              data-health-check={check.id}
              data-health-status={check.status}
              className={`grid min-h-[71px] min-w-0 items-center gap-x-3.5 gap-y-2 border-t px-[18px] py-3.5 ${stack ? 'grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[18px_minmax(0,1fr)_auto]' : 'grid-cols-[18px_minmax(0,1fr)_auto]'}`}
            >
              <Icon className={`size-[18px] shrink-0 ${style.ink}`} aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="font-bold">{check.label}</h3>
                <p className="text-[13px] text-[#46536f]">{check.note}</p>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${stack ? 'col-span-2 sm:col-span-1' : ''} ${style.badge}`}>
                {healthStatusLabels[check.status]}
              </span>
            </li>;
          })}
        </ul>
      </section>
      {side}
    </div>
  </>;
}
