'use client';

import Link from 'next/link';
import { Check, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function AddToCart({ productId, available }: { productId: string; available: number }) {
  const maximum = Math.min(10, available);
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<'idle' | 'adding' | 'added'>('idle');
  const [error, setError] = useState('');

  async function add() {
    setState('adding');
    setError('');
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not add this product.');
      setState('added');
    } catch (reason) {
      setState('idle');
      setError(reason instanceof Error ? reason.message : 'Could not add this product.');
    }
  }

  if (available < 1) {
    return <Button disabled className="mt-7 h-12 w-full rounded-full">Currently unavailable</Button>;
  }

  return (
    <div className="mt-7">
      <div className="flex gap-3">
        <label className="sr-only" htmlFor="product-quantity">Quantity</label>
        <select
          id="product-quantity"
          value={quantity}
          onChange={(event) => { setQuantity(Number(event.target.value)); setState('idle'); }}
          className="h-12 rounded-full border bg-background px-4 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Array.from({ length: maximum }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <Button onClick={add} disabled={state === 'adding'} className="h-12 flex-1 rounded-full text-base">
          {state === 'added' ? <><Check /> Added to cart</> : <><ShoppingBag /> {state === 'adding' ? 'Adding…' : 'Add to cart'}</>}
        </Button>
      </div>
      {state === 'added' ? <Link href="/cart" className="mt-3 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline">View cart and checkout</Link> : null}
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
