'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import type { CategoryRow, OccasionRow } from '@/lib/db/repositories/products';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';

const classificationBaseKeys = ['categoryId', 'occasionIds', 'idempotencyKey'];

export function ProductClassificationForm({
  productId,
  categoryId,
  occasionIds,
  categories,
  occasions,
}: {
  productId: string;
  categoryId: string;
  occasionIds: readonly string[];
  categories: readonly CategoryRow[];
  occasions: readonly OccasionRow[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retryPending, setRetryPending] = useState(false);
  const attemptKey = sessionAttemptKey('staff.product-classification', productId);
  useEffect(() => setRetryPending(hasSessionAttempt(attemptKey)), [attemptKey]);
  const catalog = usePublishedFormConfig('staff.product-classification');
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  async function save(body: Record<string, unknown>) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const idempotencyKey = getOrCreateSessionAttempt(attemptKey);
      setRetryPending(true);
      const response = await fetch('/api/admin/products/' + encodeURIComponent(productId) + '/classification', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey }),
      });
      const result = await response.json().catch(() => null) as { error?: string; code?: string; ok?: boolean } | null;
      if (!response.ok) {
        if (response.status === 409 && result?.code === 'stale_version')
          catalog.handleSubmissionResponse(response, result.code);
        throw new Error(result?.error || 'The classification could not be saved.');
      }
      if (result?.ok !== true) throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(attemptKey);
      setRetryPending(false);
      setMessage('Classification saved.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The classification could not be saved.');
    } finally { setPending(false); }
  }
  return (
    <form
      data-form-id="staff.product-classification"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage('');
        setValidation('');
        const data = new FormData(event.currentTarget);
        const chosen = data.getAll('occasionIds');
        if (chosen.length < 1 || chosen.length > 5) {
          setValidation('Choose between 1 and 5 gift occasions.');
          return;
        }
        if (!catalog.config || !catalog.canSubmit) { setValidation(catalog.message || 'Form configuration is unavailable.'); return; }
        let configured: ReturnType<typeof configuredJsonPayload>;
        try {
          const submission = readConfiguredSubmission(event.currentTarget, catalog.config, classificationBaseKeys);
          configured = configuredJsonPayload(catalog.config, submission.answers, classificationBaseKeys);
        } catch (cause) { setValidation(cause instanceof Error ? cause.message : 'Review the configured fields.'); return; }
        void save({ categoryId: data.get('categoryId'), occasionIds: chosen, ...configured });
      }}
      className="space-y-4"
    >
      <a className="text-sm underline" href={`/admin/staff-form-history?kind=product-classification&id=${encodeURIComponent(productId)}`}>View form history</a>
<p className="text-xs text-muted-foreground">* Required field</p>

      <fieldset disabled={pending || !catalog.canSubmit} className="space-y-4">
        <label className="grid gap-2 text-sm font-semibold">
          Category
           <span aria-hidden="true">*</span><select
            name="categoryId"
            defaultValue={
              categories.some((item) => item.id === categoryId)
                ? categoryId
                : ''
            }
            required
            className="w-full rounded-lg border bg-background px-3 py-2"
          >
            <option value="" disabled>
              Choose an active category
            </option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nameEn}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">
            Gift occasions (choose 1–5)
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {occasions.map((item) => (
              <label
                key={item.id}
                className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  name="occasionIds"
                  value={item.id}
                  defaultChecked={occasionIds.includes(item.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span>{item.nameEn}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={classificationBaseKeys} /> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save classification'}
        </Button>
      </fieldset>
      {!catalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p> : null}
      {validation || error ? (
        <p role="alert" className="text-sm text-destructive">
          {validation || error}
        </p>
      ) : null}
      {message ? (
        <output className="block text-sm text-muted-foreground">
          {message}
        </output>
      ) : null}
      {retryPending ? <div className="space-y-2 text-sm">
        <p>A previous save may have succeeded. Check the classification before starting a new attempt.</p>
        <Button type="button" variant="outline" disabled={pending} onClick={() => {
          if (!window.confirm('Starting a new attempt may duplicate a prior successful action. Check the saved classification first. Continue?')) return;
          clearSessionAttempt(attemptKey);
          setRetryPending(false);
          setError('');
          if (catalog.status === 'stale') catalog.refresh();
        }}>Start a new attempt</Button>
      </div> : null}
    </form>
  );
}
