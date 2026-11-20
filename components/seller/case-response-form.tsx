'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const caseBaseKeys = ['response', 'recommendation', 'locale', 'idempotencyKey',
  'returnRequestId', 'complaintId', 'sellerId', 'actorId'];

export function SellerCaseResponseForm({
  kind,
  id,
  disabled,
}: {
  kind: 'return' | 'complaint';
  id: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const formId = kind === 'return' ? 'seller.case-return-response' : 'seller.case-complaint-response';
  const published = usePublishedFormConfig(formId);
  const inputId = useId();
  const [response, setResponse] = useState('');
  const [recommendation, setRecommendation] = useState('accept');
  const attemptKey = sessionAttemptKey(formId, id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (disabled)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No further response is requested at this stage. Hastabazaar operations
        makes the final decision.
      </p>
    );
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    if (!published.canSubmit || !published.config) {
      setError(published.message || 'Response form is unavailable.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(event.currentTarget, published.config, caseBaseKeys);
      const endpoint =
        kind === 'return'
          ? `/api/seller/returns/${encodeURIComponent(id)}/response`
          : `/api/seller/complaints/${encodeURIComponent(id)}/response`;
      const resultBody = {
        response,
        idempotencyKey: getOrCreateSessionAttempt(attemptKey),
        ...(kind === 'return' ? { recommendation, locale: 'en-NP' } : {}),
        ...configuredJsonPayload(published.config, configured.answers, caseBaseKeys),
      };
      const saved = await fetch(endpoint, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(resultBody) });
      const decoded: unknown = await saved.json().catch(() => null);
      const result = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown> : null;
      if (!saved.ok) {
        if (saved.status === 409 && result?.code === 'stale_version')
          published.handleSubmissionResponse(saved, 'stale_version');
        throw new Error(typeof result?.error === 'string' ? result.error : 'Response could not be saved.');
      }
      if (result?.ok !== true)
        throw new Error('The result could not be confirmed. Retry this same response to check its result.');
      clearSessionAttempt(attemptKey);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Response could not be saved.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form data-form-id={kind === 'return' ? 'seller.case-return-response' : 'seller.case-complaint-response'} onSubmit={submit} className="seller-form space-y-4">
      <FormGuide formId={kind === 'return' ? 'seller.case-return-response' : 'seller.case-complaint-response'} />

      {kind === 'return' ? (
        <div className="space-y-2">
          <Label htmlFor={inputId + '-recommendation'}>Recommendation</Label>
          <select
            id={inputId + '-recommendation'}
            disabled={pending}
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="accept">Accept</option>
            <option value="contest">Contest with evidence</option>
            <option value="request_information">Request information</option>
          </select>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={inputId}>Response for the investigation</Label>
        <Textarea
          id={inputId}
          disabled={pending}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          minLength={20}
          maxLength={2000}
          placeholder="Provide factual item, packing, and fulfilment details. Do not include unrelated customer data."
        />
      </div>
      {published.config ? <ConfiguredFields config={published.config} baseKeys={caseBaseKeys} /> : null}
      {!published.canSubmit ? <output>{published.message || 'Loading response form…'}</output> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || response.trim().length < 20 || !published.canSubmit}
      >
        {pending ? 'Saving…' : 'Submit response'}
      </Button>
    </form>
  );
}
