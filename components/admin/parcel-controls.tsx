'use client';
import Link from 'next/link';
import { useRef, useState, useSyncExternalStore, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Parcel } from '@/lib/operations/parcels';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
const BASE_KEYS = ['jobId','version','action','note','method','riderEmail','courierName','trackingCode',
  'trackingUrl','reference','amount','amountPaisa','cashRecordId','requestId'];
// Hydrate the absent server snapshot; own attempt mutations rerender the client.
const subscribeToAttempt = () => () => undefined;
const money = (n: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    n / 100,
  );
type Cash = {
  id: string;
  jobId: string;
  kind: string;
  amountPaisa: number;
  reference: string;
  status: string;
  maker: string;
  dueAt: number | null;
  outstandingPaisa: number | null;
  riderId: string | null;
};
type Compensation = {
  id: string;
  jobId: string;
  riderId: string;
  outcome: string;
  ratePaisa: number;
  amountPaisa: number;
  status: string;
  createdAt: number;
};
export function ParcelControls({
  orderId,
  parcels,
  records,
  compensation,
  actorId,
  isSuperAdmin = false,
  canPrepare,
}: {
  orderId: string;
  parcels: Parcel[];
  records: Cash[];
  compensation: Compensation[];
  actorId: string;
  isSuperAdmin?: boolean;
  canPrepare: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function send(body: Record<string, unknown>): Promise<{ response: Response; code?: string; confirmed: boolean } | null> {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/parcels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, requestId: typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID() }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; code?: string; ok?: boolean } | null;
      if (!response.ok) {
        setMessage(result?.error ?? 'Update failed.');
        return { response, code: result?.code, confirmed: false };
      }
      if (result?.ok !== true) {
        setMessage('The response could not be verified. Retry with the same request.');
        return { response, code: result?.code, confirmed: false };
      }
      setMessage('Parcel record updated.');
      router.refresh();
      return { response, code: result.code, confirmed: true };
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Update failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-2xl">Seller parcels and COD</h2>
      <Link className="text-sm underline" href="/admin/staff-form-history?kind=parcel-control">View parcel form history</Link>
      <p className="text-sm">
        Each seller has one parcel. The order cash total is allocated
        proportionally; its saved delivery policy and recorded discounts remain
        authoritative. Delivery, customer cash collection and carrier remittance
        are separate records.
      </p>
      {!parcels.length ? (
        canPrepare ? (
          <button
            className="rounded-lg bg-primary p-3 text-primary-foreground"
            disabled={busy}
            onClick={() => void send({ action: 'setup' })}
          >
            Prepare seller parcels
          </button>
        ) : (
          <p>This historical order keeps its existing fulfillment records.</p>
        )
      ) : (
        parcels.map((p) => (
          <article className="space-y-3 rounded-xl border p-4" key={p.id}>
            <h3 className="font-semibold">
              {p.sellerName} · {p.status.replaceAll('_', ' ')}
            </h3>
            <Link className="text-sm underline" href={`/admin/staff-form-history?kind=parcel-control&id=${encodeURIComponent(p.id)}`}>View this parcel’s form history</Link>
            <p>
              Allocated COD: {money(p.codDuePaisa)} · Collected:{' '}
              {money(p.collectedPaisa)} · Remitted: {money(p.remittedPaisa)}
            </p>
            <p className="text-sm">
              Uncollected: {money(p.codDuePaisa - p.collectedPaisa)} · Held by
              carrier: {money(p.collectedPaisa - p.remittedPaisa)}
            </p>
            {p.method === 'own_rider' ? (
              <p className="text-sm">
                Open-box assignment:{' '}
                {p.openBoxRequired
                  ? 'required for this snapshotted parcel'
                  : 'not required for this snapshotted parcel'}
                .
              </p>
            ) : null}
            {['delivery_failed', 'returning', 'returned', 'cancelled'].includes(
              p.status,
            ) ? (
              <p role="alert">
                Delivery exception: review the order’s complaint/aftercare case
                before any refund or credit decision. Financial release remains
                on hold.
              </p>
            ) : null}
            <p className="text-sm">
              Actual courier costs: {money(p.courierCostPaisa)}. Operational
              expense only; customer total and seller settlement are unchanged.
            </p>
            <ParcelForm parcel={p} busy={busy} send={send} />
            {records
              .filter((r) => r.jobId === p.id)
              .map((r) => (
                <div key={r.id} className="rounded-lg bg-muted p-3 text-sm">
                  <p>
                    {r.kind} · {money(r.amountPaisa)} · {r.reference} ·{' '}
                    {r.status}
                  </p>
                  {r.dueAt !== null ? (
                    <p
                      className={
                        r.outstandingPaisa && r.dueAt < Date.now()
                          ? 'text-destructive'
                          : ''
                      }
                    >
                      Remittance expected by{' '}
                      {new Date(r.dueAt).toLocaleString('en-NP', {
                        timeZone: 'Asia/Kathmandu',
                      })}{' '}
                      · outstanding {money(r.outstandingPaisa ?? 0)}
                    </p>
                  ) : null}
                  {r.status === 'pending' ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        className="rounded border p-2"
                        disabled={busy || r.riderId === actorId || (r.maker === actorId && !isSuperAdmin)}
                        onClick={() =>
                          void send({
                            jobId: p.id,
                            version: p.version,
                            action: 'approve_remittance',
                            cashRecordId: r.id,
                            note: 'Staff verified remittance evidence.',
                          })
                        }
                      >
                        Approve remittance
                      </button>
                      <button
                        className="rounded border p-2"
                        disabled={busy || r.riderId === actorId || (r.maker === actorId && !isSuperAdmin)}
                        onClick={() =>
                          void send({
                            jobId: p.id,
                            version: p.version,
                            action: 'reject_remittance',
                            cashRecordId: r.id,
                            note: 'Staff review rejected the remittance evidence.',
                          })
                        }
                      >
                        Reject
                      </button>
                      {r.riderId === actorId || (r.maker === actorId && !isSuperAdmin) ? (
                        <span>
                          Another staff member must review this record.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            {compensation
              .filter((entry) => entry.jobId === p.id)
              .map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-dashed p-3 text-sm"
                >
                  <p>
                    Simulated rider compensation · {entry.outcome} ·{' '}
                    {money(entry.amountPaisa)} · {entry.status}
                  </p>
                  <p>
                    Separate ledger only; it does not offset COD, delivery
                    charges, or seller/maker balances.
                  </p>
                </div>
              ))}
          </article>
        ))
      )}
      <output className="block" aria-live="polite">
        {message}
      </output>
      <p className="text-sm text-muted-foreground">
        Record evidence from actual cash handover or an off-system transfer.
        These controls do not transfer money. Existing seller payout approval
        remains separate. Failed/returned parcels never automatically release
        money or rewards.
      </p>
    </section>
  );
}
function ParcelForm({
  parcel: p,
  busy,
  send,
}: {
  parcel: Parcel;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<{ response: Response; code?: string; confirmed: boolean } | null>;
}) {
  const [action, setAction] = useState('assign');
  const fingerprint = useRef<string | null>(null);
  const attemptKey = sessionAttemptKey('staff.parcel-control', p.id);
  const [, setAttemptRevision] = useState(0);
  const attemptPresent = useSyncExternalStore(subscribeToAttempt,
    () => hasSessionAttempt(attemptKey), () => false);
  const [localError, setLocalError] = useState('');
  const catalog = usePublishedFormConfig('staff.parcel-control');
  const field = (name: string) => p.id + '-' + name;
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !catalog.config || !catalog.canSubmit) return;
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const submission = readConfiguredSubmission(event.currentTarget, catalog.config, BASE_KEYS);
      configured = configuredJsonPayload(catalog.config, submission.answers, BASE_KEYS);
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'Review the configured fields.'); return; }
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const v = form.get(name);
      return typeof v === 'string' ? v : '';
    };
    const amount = value('amount');
    const payload = {
      jobId: p.id,
      version: p.version,
      action,
      note: value('note'),
      method: value('method'),
      riderEmail: value('riderEmail'),
      courierName: value('courierName'),
      trackingCode: value('trackingCode'),
      trackingUrl: value('trackingUrl'),
      reference: value('reference'),
      ...(amount ? { amountPaisa: Math.round(Number(amount) * 100) } : {}),
      ...configured,
    };
    const currentFingerprint = JSON.stringify(payload);
    if (fingerprint.current && fingerprint.current !== currentFingerprint) {
      setLocalError('This differs from the prior attempt. Check its outcome, then explicitly start a new attempt.');
      return;
    }
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setAttemptRevision((revision) => revision + 1); fingerprint.current = currentFingerprint; setLocalError('');
      const outcome = await send({ ...payload, requestId });
      if (outcome?.code === 'stale_version') catalog.handleSubmissionResponse(outcome.response, outcome.code);
      if (outcome?.confirmed) {
        clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); fingerprint.current = null;
      }
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'Parcel update failed.'); }
  }
  return (
    <form
      data-form-id="staff.parcel-control"
      onSubmit={(e) => void submit(e)}
      className="grid gap-3 sm:grid-cols-2"
    >
      <p className="text-xs text-muted-foreground">* Required field</p>
      <label htmlFor={field('action')}>
        Action
        <select
          id={field('action')}
          className="mt-1 block w-full rounded border bg-background p-2"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {Object.entries({
            record_cost: 'Record actual courier cost',
            assign: 'Assign or reassign',
            cancel: 'Cancel before handoff',
            dispatch: 'Dispatch prepared parcel',
            deliver: 'Record delivery',
            fail: 'Record failed delivery',
            retry: 'Retry delivery',
            return_to_origin: 'Return to origin',
            receive_return: 'Confirm return received',
            collect: 'Record customer COD collection',
            ...(p.method === 'own_rider'
              ? {}
              : { propose_remittance: 'Propose courier remittance' }),
          }).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {action === 'assign' ? (
        <>
          <label htmlFor={field('method')}>
            Delivery method
            <select
              name="method"
              id={field('method')}
              className="mt-1 block w-full rounded border bg-background p-2"
            >
              <option value="own_rider">Own rider</option>
              <option value="courier">Courier</option>
            </select>
          </label>
          {[
            ['riderEmail', 'Registered rider email'],
            ['courierName', 'Courier company'],
            ['trackingCode', 'Tracking / handover reference'],
            ['trackingUrl', 'Optional HTTPS tracking link'],
          ].map(([name, label]) => (
            <label key={name} htmlFor={field(name)}>
              {label}
              <input
                className="mt-1 block w-full rounded border p-2"
                id={field(name)}
                name={name}
                maxLength={name === 'trackingUrl' ? 500 : 120}
              />
            </label>
          ))}
        </>
      ) : null}
      {['collect', 'propose_remittance', 'record_cost'].includes(action) ? (
        <>
          <label htmlFor={field('amount')}>
            Amount in NPR <span aria-hidden="true">*</span>
            <input
              className="mt-1 block w-full rounded border p-2"
              id={field('amount')}
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label htmlFor={field('reference')}>
            Evidence reference <span aria-hidden="true">*</span>
            <input
              className="mt-1 block w-full rounded border p-2"
              id={field('reference')}
              name="reference"
              minLength={4}
              maxLength={120}
              required
            />
          </label>
        </>
      ) : null}
      <label className="sm:col-span-2" htmlFor={field('note')}>
        Operational note <span aria-hidden="true">*</span>
        <textarea
          className="mt-1 block w-full rounded border p-2"
          name="note"
          id={field('note')}
          minLength={8}
          maxLength={500}
          required
        />
      </label>
      {catalog.config ? <div className="sm:col-span-2"><ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /></div> : null}
      {!catalog.canSubmit ? <output className="sm:col-span-2 text-sm">{catalog.message || 'Form configuration is loading.'}</output> : null}
      {attemptPresent ? <p className="sm:col-span-2 text-xs text-muted-foreground">A prior parcel action may have succeeded. Retry only identical details, or check the parcel before starting a new attempt.</p> : null}
      {attemptPresent ? <button type="button" disabled={busy} className="rounded border p-2 text-sm"
        onClick={() => { if (window.confirm('A parcel action may already have succeeded. Check the parcel first. Start a new request reference?')) {
          clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); fingerprint.current = null; setLocalError('');
          if (catalog.status === 'stale') catalog.refresh();
        } }}>Start a new attempt</button> : null}
      {localError ? <p role="alert" className="sm:col-span-2 text-sm text-destructive">{localError}</p> : null}
      <button
        disabled={busy || !catalog.canSubmit}
        className="rounded-lg bg-primary p-3 text-primary-foreground"
      >
        Save parcel action
      </button>
    </form>
  );
}
