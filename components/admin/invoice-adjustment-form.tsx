'use client';

import { useState } from 'react';

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
  if (!invoices.length) return null;

  async function submit(formData: FormData) {
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
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/adjustments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: text('kind'),
          amountPaisa,
          reasonCode: text('reasonCode'),
          note: text('note'),
          requestId: crypto.randomUUID(),
        }),
      });
      const result = (await response.json()) as { error?: string; adjustmentNumber?: string };
      if (!response.ok) throw new Error(result.error || 'Correction document was not issued.');
      setMessage(`${result.adjustmentNumber} was issued as a simulated append-only document.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Correction document was not issued.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={(formData) => void submit(formData)} className="mt-4 space-y-3 rounded-xl border p-4">
      <p className="text-sm font-semibold">Issue simulated correction document</p>
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
      {message ? <output className="block text-sm font-medium">{message}</output> : null}
      <button disabled={busy || !reasonCodes.length} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Issuing…' : 'Issue simulated document'}</button>
    </form>
  );
}
