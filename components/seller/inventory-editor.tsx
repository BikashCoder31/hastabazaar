'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const catalogBaseKeys = ['quantity', 'reason', 'requestId', 'productId', 'sellerId', 'formVersion', 'customAnswers'];
// This component rerenders after its own attempt mutations; hydration starts with the server's absent snapshot.
const subscribeToAttempt = () => () => undefined;

export function InventoryEditor({
  productId,
  quantity,
  productName,
  disabled = false,
}: {
  productId: string;
  quantity: number;
  productName: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(quantity));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const attemptKey = sessionAttemptKey('seller.inventory', productId);
  const [, setAttemptRevision] = useState(0);
  const attemptPresent = useSyncExternalStore(subscribeToAttempt,
    () => hasSessionAttempt(attemptKey), () => false);
  const catalog = usePublishedFormConfig('seller.inventory');
  async function save(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (busy || disabled || !catalog.canSubmit || !catalog.config) return;
    const next = Number(value);
    if (
      !value.trim() ||
      !Number.isInteger(next) ||
      next < 0 ||
      next > 1000000
    ) {
      setError('Enter a whole number from 0 to 1,000,000.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const configured = readConfiguredSubmission(event.currentTarget, catalog.config, catalogBaseKeys);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setAttemptRevision((revision) => revision + 1);
      const response = await fetch('/api/seller/products/' + encodeURIComponent(productId) + '/inventory', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: next, reason: 'Seller stock count update', requestId,
          ...configuredJsonPayload(catalog.config, configured.answers, catalogBaseKeys) }),
      });
      const result = await response.json().catch(() => null) as { quantity?: unknown; message?: unknown; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error || 'Inventory update failed.');
      if (result?.quantity !== next || result.message !== 'Inventory updated.')
        throw new Error('The response could not be verified. Retry with the same request.');
      setMessage('Stock saved.');
      clearSessionAttempt(attemptKey);
      setAttemptRevision((revision) => revision + 1);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Inventory update failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form data-form-id="seller.inventory" onSubmit={save} className="min-w-0 space-y-2">
      <FormGuide formId="seller.inventory" />

      <Label htmlFor={'stock-' + productId}>
        Available stock<span className="sr-only"> for {productName}</span>
      </Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={'stock-' + productId}
          type="number"
          min={0}
          max={1000000}
          step={1}
          required
          value={value}
          disabled={busy || disabled}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage('');
          }}
          className="h-11 w-24 text-base"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || disabled || !catalog.canSubmit || Number(value) === quantity}
          className="min-h-11 rounded-xl"
        >
          <Boxes />
          {busy ? 'Saving…' : 'Update stock'}
        </Button>
      </div>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /> : null}
      {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
      {disabled ? (
        <p className="text-sm text-muted-foreground">
          Stock is locked for this listing status.
        </p>
      ) : null}
      {attemptPresent ? <p className="text-sm text-muted-foreground">A prior stock update may already have succeeded. Retry identical details, or check the stock before starting a new attempt.</p> : null}
      {attemptPresent ? <Button type="button" variant="outline" disabled={busy || disabled}
        onClick={() => { if (window.confirm('A stock update may already have succeeded. Check the stock first to avoid a duplicate update. Start a new request reference?')) {
          clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); setError(''); setMessage('');
          if (catalog.status === 'stale') catalog.refresh();
        } }}>Start a new attempt</Button> : null}
      {message ? (
        <output className="block text-sm text-primary">{message}</output>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-xs text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
