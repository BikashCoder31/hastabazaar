'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';

export function PrivacyRequestForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      await sendJson(
        '/api/account/privacy',
        'POST',
        {
          requestType: formData.get('requestType'),
          detail: formData.get('detail'),
          requestId: crypto.randomUUID(),
        },
        'Request could not be submitted.',
      );
      setMessage('Request submitted.');
      form.reset();
      router.refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Request could not be submitted.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="customer-form space-y-4 rounded-2xl border bg-card p-6"
    >
<p className="text-xs text-muted-foreground">* Required field</p>

      <h2 className="font-heading text-2xl">New privacy request</h2>
      <label className="block text-sm font-semibold">
        Request type
         <span aria-hidden="true">*</span><select
          name="requestType"
          className="mt-2 w-full rounded-lg border bg-background p-3"
          required
        >
          <option value="access">Access my data</option>
          <option value="correction">Correct my data</option>
          <option value="deletion">Delete eligible data</option>
          <option value="retention_objection">Object to retention</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Details
         <span aria-hidden="true">*</span><textarea
          name="detail"
          minLength={20}
          maxLength={2000}
          required
          className="mt-2 min-h-28 w-full rounded-lg border bg-background p-3"
        />
      </label>
      <button
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit request'}
      </button>
      {message ? <output className="block text-sm">{message}</output> : null}
    </form>
  );
}
