'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { sendJson } from '@/lib/http/client-request';
import { Textarea } from '@/components/ui/textarea';

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
  const inputId = useId();
  const [response, setResponse] = useState('');
  const [recommendation, setRecommendation] = useState('accept');
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (disabled)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No further response is requested at this stage. HastaBazaar operations
        makes the final decision.
      </p>
    );
  async function submit() {
    if (pending || disabled) return;
    setPending(true);
    setError('');
    try {
      const endpoint =
        kind === 'return'
          ? `/api/seller/returns/${encodeURIComponent(id)}/response`
          : `/api/seller/complaints/${encodeURIComponent(id)}/response`;
      const resultBody = {
        response,
        idempotencyKey: requestId,
        ...(kind === 'return' ? { recommendation, locale: 'en-NP' } : {}),
      };
      await sendJson(
        endpoint,
        'POST',
        resultBody,
        'Response could not be saved.',
      );
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
    <div className="seller-form space-y-4">
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
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        onClick={() => void submit()}
        disabled={pending || response.trim().length < 20}
      >
        {pending ? 'Saving…' : 'Submit response'}
      </Button>
    </div>
  );
}
