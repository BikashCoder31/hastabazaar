'use client';

import Link from 'next/link';
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import type { OverviewHealthChecks } from './overview-health-model';

type Snapshot = OverviewHealthChecks | null | undefined;
const HealthContext = createContext<{
  checks: Snapshot;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);

export function OverviewHealthProvider({ initial, actorId, children }: {
  initial: Snapshot; actorId: string; children: ReactNode;
}) {
  const [updated, setUpdated] = useState<{ initial: Snapshot; checks: Snapshot } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  async function refresh() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError('');
    try {
      const response = await fetch('/api/admin/system-health/records?view=today-checks', {
        headers: { 'X-Hastabazaar-Actor': actorId }, cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Health observations are unavailable.');
      const result = await response.json() as { checks: OverviewHealthChecks };
      if (!controller.signal.aborted) setUpdated({ initial, checks: result.checks });
    } catch {
      if (!controller.signal.aborted) {
        setUpdated({ initial, checks: null });
        setError('Could not refresh recorded checks.');
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setRefreshing(false);
      }
    }
  }

  return <HealthContext.Provider value={{ checks: updated?.initial === initial && updated ? updated.checks : initial, refreshing, error, refresh }}>
    {children}
  </HealthContext.Provider>;
}

export function useOverviewHealthChecks(initial: Snapshot) {
  const context = useContext(HealthContext);
  return context ? context.checks : initial;
}

export function OverviewHealth({ checks: initial, returnTo = '/admin' }: {
  checks: Snapshot; returnTo?: string;
}) {
  const context = useContext(HealthContext);
  const checks = context ? context.checks : initial;
  if (checks === undefined) return null;
  return <section className="today-panel today-side-panel" aria-labelledby="today-system-heading">
    <div className="today-side-heading">
      <h2 id="today-system-heading">System checks</h2>
      <button type="button" className="today-button min-h-11!" disabled={!context || context.refreshing}
        onClick={() => void context?.refresh()}>{context?.refreshing ? 'Refreshing…' : 'Refresh checks'}</button>
    </div>
    {context?.error ? <output>{context.error}</output> : null}
    {checks === null ? <output>System health is unknown. Recorded checks are unavailable.</output> :
      <dl className="today-system-rows">
        {checks.map(row => <div key={row.label}>
          <dt>{row.label}</dt><dd><span className="today-check-status" data-tone={row.tone}>{row.text}</span></dd>
        </div>)}
      </dl>}
    <Link className="section-link" href={withAdminReturnTo('/admin/system-health', returnTo)}>Open System health</Link>
  </section>;
}
