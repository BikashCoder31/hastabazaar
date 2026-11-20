'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
  const [recommendation, setRecommendation] = useState('');
  const count = response.trim().length;
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
    if (pending || disabled || count < 20 || (kind === 'return' && !recommendation)) return;
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
        <fieldset disabled={pending} className="space-y-2">
          <legend className="sr-only">Choose a reply</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { value: 'accept', label: 'Accept the return', hint: 'The item can come back.' },
              { value: 'contest', label: 'Disagree', hint: 'Explain why in your reply.' },
              { value: 'request_information', label: 'Ask a question', hint: 'Ask for the details you need.' },
            ].map(option => <label key={option.value}
              className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border p-3 has-checked:border-[#14213D] has-checked:bg-[#F4F6FA]">
              <input type="radio" name="recommendation" value={option.value} required
                checked={recommendation === option.value} onChange={() => setRecommendation(option.value)}
                aria-label={option.label} className="mt-0.5 size-4 shrink-0 accent-[#14213D]" />
              <span className="min-w-0"><strong className="block text-sm">{option.label}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.hint}</span>
              </span>
            </label>)}
          </div>
        </fieldset>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={inputId}>{kind === 'return' ? 'Explain what you know' : 'Response for the investigation'}</Label>
        <Textarea id={inputId} disabled={pending} value={response} rows={4} required
          onChange={(event) => setResponse(event.target.value)} minLength={20} maxLength={2000}
          aria-describedby={inputId + '-guidance'}
          placeholder={kind === 'return' ? 'For example: I checked both hooks before packing and used a padded box.' : 'Provide factual item, packing, and fulfilment details.'} />
        <div id={inputId + '-guidance'} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <p>Facts about the item and how you packed it. Hastabazaar reads this word for word.</p>
          <output aria-live="polite" className="tabular-nums">{count} / 20 min</output>
        </div>
      </div>
      {published.config ? <ConfiguredFields config={published.config} baseKeys={caseBaseKeys} /> : null}
      {!published.canSubmit ? <output>{published.message || 'Loading response form…'}</output> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {kind === 'return' ? <div className="flex gap-2.5 rounded-xl bg-[#E3E9F4] p-3 text-sm leading-relaxed text-[#25416F]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p><strong>Hastabazaar makes the final decision.</strong> Your reply helps us review the return. Money for this order is held until the case closes.</p>
      </div> : null}
      <Button type="submit" className="min-h-11 bg-[#A8232E] text-white hover:bg-[#8F1D27]"
        disabled={pending || count < 20 || !published.canSubmit || (kind === 'return' && !recommendation)}>
        {pending ? 'Saving…' : kind === 'return' ? 'Send reply to Hastabazaar' : 'Submit response'}
      </Button>
    </form>
  );
}
