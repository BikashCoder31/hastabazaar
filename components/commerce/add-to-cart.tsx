'use client';

import Link from 'next/link';
import { Check, Minus, Plus, ShoppingBag, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { sendJson } from '@/lib/http/client-request';
import { cn } from '@/lib/utils';

export function AddToCart({
  productId,
  available,
  productPage = false,
}: {
  productId: string;
  available: number;
  productPage?: boolean;
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
      await sendJson('/api/cart', 'POST', { productId, quantity },
        'We couldn’t add this product. Please try again.');
      window.dispatchEvent(new Event('cart:updated'));
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
    <div data-form-id="commerce.add-to-cart" className="mt-7 space-y-3">
      <div>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="product-quantity"
        >
          Quantity
        </label>
        {productPage ? <ProductQuantity id="product-quantity" value={quantity} maximum={maximum} disabled={pendingAction !== null}
          onChange={value => { setQuantity(value); setAddedQuantity(null); }} /> : <select
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
        </select>}
      </div>
      <div className="grid gap-3">
        <div
          data-product-mobile-add={productPage ? '' : undefined}
          className={productPage ? 'flex items-center gap-2' : undefined}
        >
          <Button
            type="button"
            onClick={() => void submit('add_to_cart')}
            disabled={pendingAction !== null}
            className={productPage ? 'min-h-11 min-w-0 flex-1 rounded-xl bg-[#a8232e] text-base text-white hover:bg-[#8c1c27] md:h-12' : 'h-12 w-full rounded-full text-base'}
          >
            {addedQuantity === quantity ? (
              <>
                <Check /> {productPage ? 'Added to bag' : 'Added to cart'}
              </>
            ) : (
              <>
                <ShoppingBag />{' '}
                {pendingAction === 'add_to_cart' ? 'Adding…' : productPage ? 'Add to bag' : 'Add to cart'}
              </>
            )}
          </Button>
          {productPage && addedQuantity === quantity ? <ProductBagLink /> : null}
          {productPage ? (
            <output className="sr-only">{addedQuantity === quantity ? 'Added to your bag.' : ''}</output>
          ) : null}
        </div>
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
      {!productPage && addedQuantity === quantity ? (
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

export function ProductBagLink() {
  return (
    <Link
      href="/cart"
      className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 rounded-xl border-primary px-4 text-primary md:h-12')}
    >
      View bag
    </Link>
  );
}

export function ProductQuantity({ id, value, maximum, disabled = false, onChange }: {
  id: string;
  value: number;
  maximum: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center rounded-xl border border-[#d9c8ae] bg-white text-[#14213d]">
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-l-xl focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40">
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input id={id} type="number" min="1" max={Math.max(1, maximum)} value={value} readOnly disabled={disabled}
        className="min-h-11 w-10 appearance-none border-0 bg-transparent p-0 text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= maximum}
        onClick={() => onChange(value + 1)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-r-xl focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40">
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
