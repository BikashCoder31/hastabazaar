'use client';

import Link from 'next/link';
import { Check, ShoppingBag, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function AddToCart({
  productId,
  available,
}: {
  productId: string;
  available: number;
}) {
  const router = useRouter();
  const maximum = Math.min(10, available);
  const [quantity, setQuantity] = useState(1);
  const [pendingAction, setPendingAction] = useState<
    'add_to_cart' | 'buy_now' | null
  >(null);
  const [addedQuantity, setAddedQuantity] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function submit(action: 'add_to_cart' | 'buy_now') {
    if (pendingAction) return;
    if (action === 'buy_now' && addedQuantity === quantity) {
      setPendingAction('buy_now');
      router.push('/checkout');
      return;
    }

    setPendingAction(action);
    setError('');
    let openingCheckout = false;
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Could not add this product.');
      if (action === 'buy_now') {
        openingCheckout = true;
        router.push('/checkout');
        return;
      }
      setAddedQuantity(quantity);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not add this product.',
      );
    } finally {
      if (!openingCheckout) setPendingAction(null);
    }
  }

  if (available < 1) {
    return (
      <Button disabled className="mt-7 h-12 w-full rounded-full">
        Currently unavailable
      </Button>
    );
  }

  return (
    <div className="mt-7 space-y-3">
      <div>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="product-quantity"
        >
          Quantity
        </label>
        <select
          id="product-quantity"
          value={quantity}
          disabled={pendingAction !== null}
          onChange={(event) => {
            setQuantity(Number(event.target.value));
            setAddedQuantity(null);
          }}
          className="h-12 w-full rounded-full border bg-background px-4 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Array.from({ length: maximum }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="grid gap-3">
        <Button
          type="button"
          onClick={() => void submit('add_to_cart')}
          disabled={pendingAction !== null}
          className="h-12 w-full rounded-full text-base"
        >
          {addedQuantity === quantity ? (
            <>
              <Check /> Added to cart
            </>
          ) : (
            <>
              <ShoppingBag />{' '}
              {pendingAction === 'add_to_cart' ? 'Adding…' : 'Add to cart'}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void submit('buy_now')}
          disabled={pendingAction !== null}
          className="h-12 w-full rounded-full border-primary text-base text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Zap />
          {pendingAction === 'buy_now' ? 'Opening checkout…' : 'Buy now'}
        </Button>
      </div>
      {addedQuantity === quantity ? (
        <div className="mt-4 rounded-xl bg-secondary p-4">
          <output className="block text-sm font-semibold text-primary">
            Your selection is in the cart.
          </output>
          <Link
            href="/cart"
            className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary underline underline-offset-4"
          >
            View cart and checkout →
          </Link>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
