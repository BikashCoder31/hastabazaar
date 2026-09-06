'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PrivacyRequestForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(formData: FormData) {
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/account/privacy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestType: formData.get('requestType'),
        detail: formData.get('detail'),
        requestId: crypto.randomUUID(),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok)
      return setMessage(body.error ?? 'Request could not be submitted.');
    setMessage('Request submitted. / अनुरोध पेश भयो।');
    router.refresh();
  }
  return (
    <form action={submit} className="space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="font-heading text-2xl">
        New privacy request / नयाँ गोपनीयता अनुरोध
      </h2>
      <label className="block text-sm font-semibold">
        Request type
        <select
          name="requestType"
          className="mt-2 w-full rounded-lg border bg-background p-3"
          required
        >
          <option value="access">Access my data / डाटा हेर्न</option>
          <option value="correction">Correct my data / सच्याउन</option>
          <option value="deletion">Delete eligible data / मेटाउन</option>
          <option value="retention_objection">
            Object to retention / राखिएकोमा आपत्ति
          </option>
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Details / विवरण
        <textarea
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
        {busy ? 'Submitting…' : 'Submit request / अनुरोध पठाउनुहोस्'}
      </button>
      {message ? <output className="block text-sm">{message}</output> : null}
    </form>
  );
}
