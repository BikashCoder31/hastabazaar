'use client';
import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ShippingJobRow } from '@/lib/db/repositories/operations';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const requestBaseKeys = ['orderId', 'direction', 'note', 'sellerId', 'requestId',
  'formVersion', 'customAnswers', 'sourceFormId'];
const actionBaseKeys = ['jobId', 'action', 'note', 'sellerId', 'labelReference',
  'trackingCode', 'claimReference', 'reconciliationStatus', 'requestId',
  'formVersion', 'customAnswers', 'sourceFormId'];

interface OrderOption {
  id: string;
  orderNumber: string;
}
export function ShippingConsole({
  jobs,
  orders = [],
  admin = false,
}: {
  jobs: readonly ShippingJobRow[];
  orders?: readonly OrderOption[];
  admin?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAttempts, setPendingAttempts] = useState<Record<string, boolean>>({});
  const [requestOrderId, setRequestOrderId] = useState('');
  const requestCatalog = usePublishedFormConfig('shipping.console-request', { enabled: !admin });
  const actionFormId = admin ? 'shipping.console-action-staff' : 'shipping.console-action-seller';
  const actionCatalog = usePublishedFormConfig(actionFormId);
  const requestAttempt = requestOrderId ? sessionAttemptKey('shipping.console-request', requestOrderId) : null;
  useEffect(() => {
    const timeout = window.setTimeout(() => setPendingAttempts((current) => ({ ...current,
      ...Object.fromEntries(jobs.map((job) => {
        const key = sessionAttemptKey(actionFormId, job.id);
        return [key, hasSessionAttempt(key)];
      })),
    })), 0);
    return () => window.clearTimeout(timeout);
  }, [actionFormId, jobs]);
  function resetAttempt(key: string, kind: 'request' | 'action') {
    if (!window.confirm(`A previous shipping ${kind} may already have succeeded. Check its answer history first. Starting a new attempt can create a duplicate ${kind} record. Start a new attempt anyway?`)) return;
    try { sessionStorage.removeItem(key); }
    catch { setError('Browser session storage is unavailable. Please enable it before submitting.'); return; }
    setPendingAttempts((current) => ({ ...current, [key]: false }));
    const catalog = kind === 'request' ? requestCatalog : actionCatalog;
    if (catalog.status === 'stale') catalog.refresh();
    setError(`New shipping ${kind} attempt ready.`);
  }
  async function requestJob(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (busy || !requestCatalog.canSubmit || !requestCatalog.config) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(element, requestCatalog.config, requestBaseKeys);
      const orderId = form.get('orderId');
      if (typeof orderId !== 'string') throw new Error('Select an order.');
      const attempt = sessionAttemptKey('shipping.console-request', orderId);
      const requestId = getOrCreateSessionAttempt(attempt);
      setPendingAttempts((current) => ({ ...current, [attempt]: true }));
      const response = await fetch('/api/seller/shipping', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          orderId: form.get('orderId'), direction: form.get('direction'), note: form.get('note'),
          requestId, sourceFormId: 'shipping.console-request',
          ...configuredJsonPayload(requestCatalog.config, configured.answers, requestBaseKeys),
        }) });
      const body = (await response.json().catch(() => null)) as { id?: unknown; error?: string; code?: string } | null;
      if (body?.code === 'stale_version') requestCatalog.handleSubmissionResponse(response, body.code);
      if (!response.ok) throw new Error(body?.error ?? 'Shipping request failed.');
      if (typeof body?.id !== 'string' || !body.id.trim() || body.error)
        throw new Error('The response could not confirm this shipping request. Retry with the same request.');
      clearSessionAttempt(attempt);
      setPendingAttempts((current) => ({ ...current, [attempt]: false }));
      element.reset();
      router.refresh();
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Shipping request failed.'} The request may already have succeeded. Check request answers and retry unchanged details before starting a new attempt.`);
    } finally { setBusy(false); }
  }
  async function act(id: string, event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (busy || !actionCatalog.canSubmit || !actionCatalog.config) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError('');
    const endpoint = admin
      ? `/api/admin/shipping/${id}`
      : `/api/seller/shipping/${id}`;
    try {
    const configured = readConfiguredSubmission(element, actionCatalog.config, actionBaseKeys);
    const attempt = sessionAttemptKey(actionFormId, id);
    const requestId = getOrCreateSessionAttempt(attempt);
    setPendingAttempts((current) => ({ ...current, [attempt]: true }));
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: form.get('action'),
        note: form.get('note'),
        labelReference: form.get('labelReference') || undefined,
        trackingCode: form.get('trackingCode') || undefined,
        claimReference: form.get('claimReference') || undefined,
        reconciliationStatus: form.get('reconciliationStatus') || undefined,
        requestId,
        ...(!admin ? { sourceFormId: actionFormId } : {}),
        ...configuredJsonPayload(actionCatalog.config, configured.answers, actionBaseKeys),
      }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: unknown; error?: string; code?: string } | null;
    if (body?.code === 'stale_version') actionCatalog.handleSubmissionResponse(response, body.code);
    if (!response.ok) throw new Error(body?.error ?? 'Shipping action failed.');
    if (body?.ok !== true || body.error)
      throw new Error('The response could not confirm this shipping action. Retry with the same request.');
    clearSessionAttempt(attempt);
    setPendingAttempts((current) => ({ ...current, [attempt]: false }));
    element.reset();
    router.refresh();
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Shipping action failed.'} The action may already have succeeded. Check action answers and retry unchanged details before starting a new attempt.`);
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      {!admin ? <nav aria-label="Shipping console answer history" className="flex gap-4 text-sm">
        <Link className="underline" href="/seller/form-history?kind=console-request">Request answers</Link>
        <Link className="underline" href="/seller/form-history?kind=console-action">Action answers</Link>
      </nav> : null}
      {!admin ? (
        <form
          onSubmit={requestJob}
          data-form-id="shipping.console-request"
          className="grid gap-3 rounded-2xl border bg-card p-5 md:grid-cols-4"
        >
      <FormGuide formId="shipping.console-request" />

          <select
            name="orderId"
            required
            onChange={(event) => {
              setRequestOrderId(event.target.value);
              if (event.target.value) {
                const key = sessionAttemptKey('shipping.console-request', event.target.value);
                setPendingAttempts((current) => ({ ...current, [key]: hasSessionAttempt(key) }));
              }
            }}
            className="rounded-lg border bg-background p-3"
          >
            <option value="">Select order</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber}
              </option>
            ))}
          </select>
          <select
            name="direction"
            className="rounded-lg border bg-background p-3"
          >
            <option value="outbound">Customer delivery</option>
            <option value="return">Return pickup</option>
          </select>
          <input
            name="note"
            required
            minLength={8}
            placeholder="Pickup note"
            className="rounded-lg border bg-background p-3"
          />
          {requestCatalog.config ? <ConfiguredFields config={requestCatalog.config} baseKeys={requestBaseKeys} /> : null}
          <button
            disabled={busy || !requestCatalog.canSubmit}
            className="rounded-lg bg-primary p-3 font-semibold text-primary-foreground"
          >
            Request coordination
          </button>
          {requestAttempt && pendingAttempts[requestAttempt] ? <div className="space-y-2 text-sm md:col-span-4">
            <p>A previous request may already have succeeded. Check request answers, then retry unchanged details with the saved reference.</p>
            <button type="button" disabled={busy} className="underline" onClick={() => resetAttempt(requestAttempt, 'request')}>
              Start a new shipping request attempt
            </button>
          </div> : null}
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {jobs.length ? (
        jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{job.orderNumber}</strong>
                <p className="text-sm text-muted-foreground">
                  {job.sellerName} · {job.direction.replace('_', ' ')}
                </p>
              </div>
              <span className="capitalize">
                {job.status.replaceAll('_', ' ')}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>Tracking: {job.trackingCode ?? 'Pending'}</div>
              <div>Label: {job.labelReference ?? 'Pending'}</div>
              <div>Reconciliation: {job.reconciliationStatus}</div>
            </dl>
            <form
              onSubmit={(event) => act(job.id, event)}
              data-form-id={admin ? 'shipping.console-action-staff' : 'shipping.console-action-seller'}
              className="mt-4 grid gap-2 md:grid-cols-3"
            >
      <FormGuide formId={admin ? 'shipping.console-action-staff' : 'shipping.console-action-seller'} />

              {admin ? (
                <>
                  <select
                    name="action"
                    className="rounded-lg border bg-background p-2 text-sm"
                  >
                    <option value="record_label">Record label</option>
                    <option value="schedule_pickup">Schedule pickup</option>
                    <option value="picked_up">Picked up</option>
                    <option value="in_transit">In transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="open_claim">Open claim</option>
                    <option value="resolve_claim">Resolve claim</option>
                    <option value="reconcile">Reconcile</option>
                  </select>
                  <input
                    name="labelReference"
                    placeholder="Label reference"
                    className="rounded-lg border bg-background p-2 text-sm"
                  />
                  <input
                    name="trackingCode"
                    placeholder="Tracking code"
                    className="rounded-lg border bg-background p-2 text-sm"
                  />
                  <input
                    name="claimReference"
                    placeholder="Claim reference"
                    className="rounded-lg border bg-background p-2 text-sm"
                  />
                  <select
                    name="reconciliationStatus"
                    className="rounded-lg border bg-background p-2 text-sm"
                  >
                    <option value="">No reconciliation change</option>
                    <option value="matched">Matched</option>
                    <option value="variance">Variance</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </>
              ) : (
                <input type="hidden" name="action" value="picked_up" />
              )}
              <input
                name="note"
                required
                minLength={8}
                placeholder="Operational note"
                className="rounded-lg border bg-background p-2 text-sm"
              />
              {actionCatalog.config ? <ConfiguredFields config={actionCatalog.config} baseKeys={actionBaseKeys} /> : null}
              <button
                disabled={busy || !actionCatalog.canSubmit}
                className="rounded-lg border p-2 text-sm font-semibold"
              >
                {admin ? 'Apply action' : 'Confirm carrier pickup'}
              </button>
              {pendingAttempts[sessionAttemptKey(actionFormId, job.id)] ? <div className="space-y-2 text-sm md:col-span-3">
                <p>A previous action may already have succeeded. Check action answers, then retry unchanged details with the saved reference.</p>
                <button type="button" disabled={busy} className="underline"
                  onClick={() => resetAttempt(sessionAttemptKey(actionFormId, job.id), 'action')}>
                  Start a new shipping action attempt
                </button>
              </div> : null}
            </form>
          </article>
        ))
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          No shipping coordination records.
        </p>
      )}
      {requestCatalog.message || actionCatalog.message ?
        <p className="text-sm text-destructive">{requestCatalog.message || actionCatalog.message}</p> : null}
    </div>
  );
}
