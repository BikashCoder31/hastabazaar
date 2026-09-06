'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function InventoryEditor({ productId, quantity }: { productId: string; quantity: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(quantity));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) {
      setMessage('Enter a whole number of 0 or more.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/seller/products/${encodeURIComponent(productId)}/inventory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: next, reason: 'Seller stock count update' }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Inventory update failed.');
      setMessage('Saved');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Inventory update failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-56 items-center gap-2">
      <Input aria-label="Available quantity" type="number" min={0} max={1000000} step={1} value={value} onChange={(event) => setValue(event.target.value)} className="w-20" />
      <Button size="sm" variant="outline" disabled={busy} onClick={save}><Boxes /> {busy ? 'Saving…' : 'Update'}</Button>
      {message ? <span className="max-w-36 text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
