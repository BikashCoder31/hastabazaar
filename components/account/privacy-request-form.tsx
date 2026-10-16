'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfiguredFields, focusConfiguredField } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';

const BASE_KEYS = ['requestType', 'detail', 'requestId', 'customerId'] as const;

export function PrivacyRequestForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);
  const { config, status, message: configMessage, canSubmit, refresh, handleSubmissionResponse } = usePublishedFormConfig('account.privacy-request');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || !canSubmit || !config) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    let payload: ReturnType<typeof configuredJsonPayload>;
    try {
      const { answers } = readConfiguredSubmission(form, config, BASE_KEYS);
      payload = configuredJsonPayload(config, answers, BASE_KEYS);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Review your form answers.');
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    setMessage('');
    setFieldErrors({});
    try {
      const response = await fetch('/api/account/privacy', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: formData.get('requestType'),
          detail: formData.get('detail'),
          requestId: requestId.current,
          ...payload,
        }) });
      const result = await response.json().catch(() => null) as { error?: unknown; code?: unknown; fieldId?: unknown } | null;
      if (!response.ok) {
        if (response.status === 409 && result?.code === 'stale_version') handleSubmissionResponse(response);
        else if (response.status === 400 || response.status === 409) requestId.current = null;
        const explanation = typeof result?.error === 'string' ? result.error : 'Request could not be submitted.';
        if (typeof result?.fieldId === 'string') {
          setFieldErrors({ [result.fieldId]: explanation });
          focusConfiguredField(form, result.fieldId);
        }
        throw new Error(explanation);
      }
      requestId.current = null;
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
      data-form-id="account.privacy-request"
      onSubmit={submit}
      onChange={() => { if (!busy) requestId.current = null; }}
      className="customer-form space-y-4 rounded-2xl border bg-card p-6"
    >
      <FormGuide formId="account.privacy-request" />

<p className="text-xs text-muted-foreground">* Required field</p>

      <h2 className="font-heading text-2xl">New privacy request</h2>
      {config ? <ConfiguredFields config={config} baseKeys={BASE_KEYS} errors={fieldErrors} /> : null}
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
      {status !== 'ready' ? <div>
        <output className="text-sm text-muted-foreground">{status === 'loading' ? 'Form configuration is loading.' : configMessage}</output>
        {status !== 'loading' ? <button type="button" onClick={refresh} className="ml-3 rounded-lg border px-3 py-2 text-sm">Refresh form</button> : null}
      </div> : null}
      <button
        disabled={busy || !canSubmit}
        className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit request'}
      </button>
      {message ? <output className="block text-sm">{message}</output> : null}
    </form>
  );
}
