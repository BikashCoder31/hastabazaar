'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendJson } from '@/lib/http/client-request';

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
  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || disabled) return;
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
      await sendJson(
        '/api/seller/products/' + encodeURIComponent(productId) + '/inventory',
        'PATCH',
        { quantity: next, reason: 'Seller stock count update' },
        'Inventory update failed.',
      );
      setMessage('Stock saved.');
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
          disabled={busy || disabled || Number(value) === quantity}
          className="min-h-11 rounded-xl"
        >
          <Boxes />
          {busy ? 'Saving…' : 'Update stock'}
        </Button>
      </div>
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
