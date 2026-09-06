'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function PayoutRequestForm() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/seller/payout-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        note: form.get('note'),
        requestId: crypto.randomUUID(),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    setMessage(
      response.ok
        ? 'Payout request submitted for Admin preparation.'
        : (body.error ?? 'Request failed.'),
    );
    if (response.ok) router.refresh();
  }
  return (
    <form
      action={submit}
      className="flex flex-wrap gap-2 rounded-2xl border bg-card p-5"
    >
      <input
        name="note"
        required
        minLength={8}
        placeholder="Payout request note"
        className="min-w-64 flex-1 rounded-lg border bg-background p-3"
      />
      <button
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground"
      >
        Request payout
      </button>
      {message ? <output className="w-full text-sm">{message}</output> : null}
    </form>
  );
}
