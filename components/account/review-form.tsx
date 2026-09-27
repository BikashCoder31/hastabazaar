'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';

const BASE_KEYS = ['rating', 'title', 'body', 'orderItemId', 'idempotencyKey', 'photos', 'customerId'] as const;

export function ReviewForm({
  productId,
  orderItemId,
  orderNumber,
}: {
  productId: string;
  orderItemId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestId = useRef(crypto.randomUUID());
  const { config, status, message: configMessage, canSubmit, refresh, handleSubmissionResponse } = usePublishedFormConfig('account.review');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || !canSubmit || !config) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage('');
    setFieldErrors({});
    const data = new FormData(event.currentTarget);
    try {
      const { answers } = readConfiguredSubmission(formElement, config, BASE_KEYS);
      const payload = configuredJsonPayload(config, answers, BASE_KEYS);
      data.set('formVersion', String(payload.formVersion));
      data.set('customAnswers', JSON.stringify(payload.customAnswers));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Review your form answers.');
      setBusy(false);
      return;
    }
    data.set('orderItemId', orderItemId);
    data.set('idempotencyKey', requestId.current);
    try {
      const files = data
        .getAll('photos')
        .filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length > 3 || files.some((f) => f.size > 5 * 1024 * 1024))
        throw new Error('Choose up to three photos, each no larger than 5 MB.');
      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/reviews`,
        { method: 'POST', body: data },
      );
      const result = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
        fieldId?: string;
      } | null;
      if (!response.ok || !result?.id)
      {
        if (response.status === 409 && (result as { code?: unknown } | null)?.code === 'stale_version') handleSubmissionResponse(response);
        else if (response.status === 400 || response.status === 409) requestId.current = crypto.randomUUID();
        const explanation = result?.error ?? 'Review could not be submitted. Please try again.';
        if (typeof result?.fieldId === 'string') {
          setFieldErrors({ [result.fieldId]: explanation });
          document.getElementById(`custom-${result.fieldId}`)?.focus();
        }
        throw new Error(explanation);
      }
      setMessage(
        'Thank you. Your verified-purchase review is awaiting moderation.',
      );
      formElement.reset();
      requestId.current = crypto.randomUUID();
      router.refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Review could not be submitted.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      data-form-id="account.review"
      onSubmit={submit}
      onChange={() => {
        if (!busy) requestId.current = crypto.randomUUID();
      }}
      className="customer-form mt-5 grid gap-4 rounded-2xl border bg-card p-5"
    >
<p className="text-xs text-muted-foreground">* Required field</p>

      <p className="text-sm text-muted-foreground">
        Delivered order {orderNumber}
      </p>
      <fieldset disabled={busy} className="grid gap-4">
        {config ? <ConfiguredFields config={config} baseKeys={BASE_KEYS} errors={fieldErrors} /> : null}
        <div className="space-y-2">
          <Label htmlFor="rating">Rating</Label>
          <select
            id="rating"
            name="rating"
            defaultValue="5"
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="5">5 — Excellent</option>
            <option value="4">4 — Good</option>
            <option value="3">3 — Okay</option>
            <option value="2">2 — Poor</option>
            <option value="1">1 — Very poor</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-title">Title (optional)</Label>
          <Input id="review-title" name="title" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-body">Your review <span aria-hidden="true">*</span></Label>
          <Textarea
            id="review-body"
            name="body"
            minLength={10}
            maxLength={2000}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`review-photos-${orderItemId}`}>
            Customer photos (optional)
          </Label>
          <input
            id={`review-photos-${orderItemId}`}
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-describedby={`photo-help-${orderItemId}`}
            className="block w-full rounded-lg border p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-2"
          />
          <p
            id={`photo-help-${orderItemId}`}
            className="text-xs leading-5 text-muted-foreground"
          >
            Up to 3 JPG, PNG or WebP photos, 5 MB each. Choose photos you own
            and are happy to share publicly. Avoid faces, addresses, receipts
            and location metadata. New photos are processed to remove embedded metadata before storage. Reviews and photos appear after moderation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status !== 'ready' ? <div>
            <output className="text-sm text-muted-foreground">{status === 'loading' ? 'Form configuration is loading.' : configMessage}</output>
            {status !== 'loading' ? <Button type="button" variant="outline" onClick={refresh}>Refresh form</Button> : null}
          </div> : null}
          <Button type="submit" disabled={busy || !canSubmit}>
            {busy ? 'Submitting…' : 'Submit review'}
          </Button>
          {message ? (
            <output className="text-sm text-muted-foreground">{message}</output>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
