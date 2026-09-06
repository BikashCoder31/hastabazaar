'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function PayoutRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(form: FormData) {
    setError('');
    const response = await fetch(`/api/admin/payout-requests/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: form.get('action'),
        note: form.get('note'),
        requestId: crypto.randomUUID(),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) return setError(body.error ?? 'Action failed.');
    router.refresh();
  }
  return (
    <form action={submit} className="mt-3 flex flex-wrap gap-2">
      <select name="action" className="rounded-lg border p-2">
        <option value="prepare">Prepare payout</option>
        <option value="reject">Reject request</option>
      </select>
      <input
        name="note"
        required
        minLength={8}
        placeholder="Review note"
        className="min-w-56 flex-1 rounded-lg border p-2"
      />
      <button className="rounded-lg border px-3 py-2 font-semibold">
        Apply
      </button>
      {error ? (
        <output className="w-full text-sm text-destructive">{error}</output>
      ) : null}
    </form>
  );
}
