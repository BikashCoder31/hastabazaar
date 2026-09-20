'use client';
import { useState } from 'react';
export function CustomerRiderCode({
  orderNumber,
  jobs,
}: {
  orderNumber: string;
  jobs: readonly { id: string }[];
}) {
  const [codes, setCodes] = useState<
      Record<string, { code: string; expiresAt: number }>
    >({}),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState('');
  async function issue(jobId: string) {
    setBusy(jobId);
    setError('');
    try {
      const response = await fetch(
        '/api/orders/' + encodeURIComponent(orderNumber) + '/rider-code',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
        },
      );
      const data = (await response.json()) as {
        code: string;
        expiresAt: number;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Code unavailable.');
        return;
      }
      setCodes((current) => ({ ...current, [jobId]: data }));
    } catch {
      setError(
        'Connection interrupted. A code may already be active; wait ten minutes before requesting another.',
      );
    } finally {
      setBusy(null);
    }
  }
  if (!jobs.length) return null;
  return (
    <section className="mb-6 rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Prepaid delivery handover code</h2>
      <p className="mt-2 text-sm">
        Request a code when your assigned rider arrives. Share it at handover.
        It expires after ten minutes and does not replace delivery proof or
        staff confirmation.
      </p>
      {jobs.map((job, index) => (
        <div key={job.id} className="mt-4">
          <p className="text-sm font-medium">Parcel {index + 1}</p>
          {codes[job.id] ? (
            <output className="block">
              <strong className="my-2 block text-2xl tracking-widest">
                {codes[job.id].code}
              </strong>
              <span className="text-sm">
                Expires at{' '}
                {new Date(codes[job.id].expiresAt).toLocaleTimeString()}. Keep
                this page open; the code is not sent by email or SMS.
              </span>
            </output>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              onClick={() => issue(job.id)}
            >
              {busy === job.id ? 'Requesting…' : 'Show handover code'}
            </button>
          )}
        </div>
      ))}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
export function RiderCodeVerification({
  jobId,
  version,
}: {
  jobId: string;
  version: number;
}) {
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [verified, setVerified] = useState(false);
  async function verify(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/rider/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, version, code }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      setVerified(response.ok);
      setMessage(data.message ?? data.error ?? 'Unable to verify.');
      setCode('');
    } catch {
      setMessage(
        'Verification could not be completed. Refresh the current assignment before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border p-4">
      <h4 className="font-semibold">Prepaid handover code</h4>
      <p className="mt-1 text-sm">
        Ask the customer for the code from their protected order receipt. Do not
        record it in a proof photo or note.
      </p>
      {verified ? (
        <output className="mt-2 block">{message}</output>
      ) : (
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={verify}>
          <label className="text-sm">
            Six-digit code<span aria-hidden="true"> *</span>
            <input
              required
              pattern="[0-9]{6}"
              maxLength={6}
              inputMode="numeric"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 block rounded border bg-background p-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            {busy ? 'Checking…' : 'Verify code'}
          </button>
        </form>
      )}
      {message && !verified ? (
        <p role="alert" className="mt-2 text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
