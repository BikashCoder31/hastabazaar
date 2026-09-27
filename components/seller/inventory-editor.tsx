'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendJson } from '@/lib/http/client-request';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';

const catalogBaseKeys = ['quantity', 'reason', 'requestId', 'productId', 'sellerId', 'formVersion', 'customAnswers'];

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
  const attemptId = useRef('');
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
      attemptId.current ||= crypto.randomUUID();
      await sendJson(
        '/api/seller/products/' + encodeURIComponent(productId) + '/inventory',
        'PATCH',
        { quantity: next, reason: 'Seller stock count update', requestId: attemptId.current,
          ...configuredJsonPayload(catalog.config, configured.answers, catalogBaseKeys) },
        'Inventory update failed.',
      );
      setMessage('Stock saved.');
      attemptId.current = '';
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
    <form onSubmit={save} className="min-w-0 space-y-2">
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
