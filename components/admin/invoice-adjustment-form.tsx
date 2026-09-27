'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const BASE_KEYS = ['invoiceId', 'kind', 'amount', 'amountPaisa', 'reasonCode', 'note', 'requestId'];
const ATTEMPT_KEY = sessionAttemptKey('staff.invoice-adjustment', 'issue');

type InvoiceOption = Readonly<{
  id: string;
  invoiceNumber: string;
  issuerReference: string;
  adjustmentCount: number;
}>;

function parseNprToPaisa(value: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paisa = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paisa) && paisa > 0 ? paisa : null;
}

export function InvoiceAdjustmentForm({
  invoices,
  reasonCodes,
}: {
  invoices: readonly InvoiceOption[];
  reasonCodes: readonly string[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fingerprint = useRef<string | null>(null);
  const [attemptPresent, setAttemptPresent] = useState(() => hasSessionAttempt(ATTEMPT_KEY));
  const catalog = usePublishedFormConfig('staff.invoice-adjustment');
  if (!invoices.length) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !catalog.config || !catalog.canSubmit) return;
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const submission = readConfiguredSubmission(event.currentTarget, catalog.config, BASE_KEYS);
      configured = configuredJsonPayload(catalog.config, submission.answers, BASE_KEYS);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review the configured fields.'); return; }
    const formData = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = formData.get(name);
      return typeof value === 'string' ? value : '';
    };
    const invoiceId = text('invoiceId');
    const amountPaisa = parseNprToPaisa(text('amount'));
    if (!amountPaisa) {
      setMessage('Enter a positive amount with no more than two decimal places.');
      return;
    }
    const payload = { kind: text('kind'), amountPaisa, reasonCode: text('reasonCode'),
      note: text('note'), ...configured };
    const currentFingerprint = JSON.stringify({ invoiceId, ...payload });
    if (fingerprint.current && fingerprint.current !== currentFingerprint) {
      setMessage('This differs from the prior attempt. Check its outcome, then explicitly start a new attempt.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const requestId = getOrCreateSessionAttempt(ATTEMPT_KEY);
      setAttemptPresent(true);
      fingerprint.current = currentFingerprint;
      const response = await fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/adjustments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; id?: unknown; adjustmentNumber?: unknown; created?: boolean; simulation?: boolean; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error || 'Correction document was not issued.');
      if (typeof result?.id !== 'string' || !result.id || typeof result.adjustmentNumber !== 'string' || !result.adjustmentNumber || typeof result.created !== 'boolean' || result.simulation !== true)
        throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(ATTEMPT_KEY); setAttemptPresent(false); fingerprint.current = null;
      setMessage(`${result.adjustmentNumber} was issued as a simulated append-only document.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Correction document was not issued.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form data-form-id="staff.invoice-adjustment" onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-xl border p-4">
      <p className="text-sm font-semibold">Issue simulated correction document</p>
      <a className="text-sm underline" href="/admin/staff-form-history?kind=invoice-adjustment">View correction form history</a>
      <p className="text-xs leading-5 text-muted-foreground">
        This creates an immutable credit/debit document. It does not edit the invoice, refund a customer, change a settlement, or move money. Record the matching financial event in its own approved workflow.
      </p>
      <label className="block text-sm">Invoice
        <select name="invoiceId" required className="mt-1 block w-full rounded border p-2">
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.issuerReference} · {invoice.adjustmentCount} corrections</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Document kind
          <select name="kind" required className="mt-1 block w-full rounded border p-2"><option value="credit_note">Credit note</option><option value="debit_note">Debit note</option></select>
        </label>
        <label className="block text-sm">Amount (NPR)
          <input name="amount" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" className="mt-1 block w-full rounded border p-2" />
        </label>
      </div>
      <label className="block text-sm">Approved reason
        <select name="reasonCode" required className="mt-1 block w-full rounded border p-2">{reasonCodes.map((reason) => <option key={reason} value={reason}>{reason.replaceAll('_', ' ')}</option>)}</select>
      </label>
      <label className="block text-sm">Review note
        <textarea name="note" required minLength={12} maxLength={500} className="mt-1 block min-h-24 w-full rounded border p-2" />
      </label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
      {!catalog.canSubmit ? <output className="block text-sm">{catalog.message || 'Form configuration is loading.'}</output> : null}
      {attemptPresent ? <p className="text-xs text-muted-foreground">A prior correction may have been issued. Retry only identical details, or check the invoice before starting a new attempt.</p> : null}
      {attemptPresent ? <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm"
        onClick={() => { if (window.confirm('A correction may already have been issued. Check the invoice first. Start a new request reference?')) {
          clearSessionAttempt(ATTEMPT_KEY); setAttemptPresent(false); fingerprint.current = null; setMessage('');
        } }}>Start a new attempt</button> : null}
      {message ? <output className="block text-sm font-medium">{message}</output> : null}
      <button disabled={busy || !reasonCodes.length || !catalog.canSubmit} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Issuing…' : 'Issue simulated document'}</button>
    </form>
  );
}
