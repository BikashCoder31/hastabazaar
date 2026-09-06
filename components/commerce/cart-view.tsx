'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, PackageOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

interface CartItem {
  id: string;
  productId: string;
  slug: string;
  nameEn: string;
  tradingName: string;
  pricePaisa: number;
  quantity: number;
  inventoryQuantity: number;
  productStatus: string;
  primaryMediaId: string | null;
}

interface CartData {
  items: CartItem[];
  itemSubtotalPaisa: number;
  itemCount: number;
  hasUnavailableItems: boolean;
}

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export function CartView() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/cart', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cart could not be loaded.');
        const result = (await response.json()) as CartData;
        if (active) setCart(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Cart could not be loaded.');
      });
    return () => { active = false; };
  }, []);

  async function mutate(itemId: string, quantity?: number) {
    setBusy(itemId);
    setError('');
    try {
      const response = await fetch('/api/cart', {
        method: quantity === undefined ? 'DELETE' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(quantity === undefined ? { itemId } : { itemId, quantity }),
      });
      const result = (await response.json()) as CartData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Cart could not be updated.');
      setCart(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cart could not be updated.');
    } finally {
      setBusy(null);
    }
  }

  if (!cart && !error) return <div className="rounded-3xl border bg-card p-8 text-muted-foreground">Loading your cart…</div>;
  if (!cart) return <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">{error}</p>;
  if (cart.items.length === 0) {
    return (
      <div className="rounded-3xl border bg-card px-6 py-16 text-center">
        <PackageOpen className="mx-auto size-10 text-primary" />
        <h2 className="mt-5 font-heading text-3xl">Your cart is empty</h2>
        <p className="mt-3 text-muted-foreground">Browse work from verified makers across Nepal.</p>
        <Button render={<Link href="/shop" />} className="mt-7 rounded-full">Explore the collection</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {cart.items.map((item) => {
          const available = item.productStatus === 'published' && item.inventoryQuantity >= item.quantity;
          return (
            <article key={item.id} className="grid grid-cols-[6.5rem_1fr] gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-[8rem_1fr_auto]">
              <Link href={`/products/${item.slug}`} className="row-span-2 overflow-hidden rounded-xl bg-muted sm:row-span-1">
                {item.primaryMediaId ? <Image src={`/api/product-media/${item.primaryMediaId}`} alt="" width={240} height={300} unoptimized className="aspect-[4/5] h-full w-full object-cover" /> : null}
              </Link>
              <div>
                <p className="text-sm font-semibold text-primary">{item.tradingName}</p>
                <Link href={`/products/${item.slug}`} className="mt-1 block text-base font-semibold hover:underline">{item.nameEn}</Link>
                <p className="mt-2 font-heading text-xl">{money(item.pricePaisa)}</p>
                {!available ? <p className="mt-2 text-sm font-semibold text-destructive">Availability changed — reduce or remove this item.</p> : null}
              </div>
              <div className="col-start-2 flex items-center gap-2 self-end sm:col-start-3 sm:row-start-1 sm:self-center">
                <Button size="icon-sm" variant="outline" aria-label={`Decrease ${item.nameEn} quantity`} disabled={busy === item.id} onClick={() => void mutate(item.id, item.quantity - 1)}><Minus /></Button>
                <span className="min-w-7 text-center font-semibold" aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                <Button size="icon-sm" variant="outline" aria-label={`Increase ${item.nameEn} quantity`} disabled={busy === item.id || item.quantity >= Math.min(10, item.inventoryQuantity)} onClick={() => void mutate(item.id, item.quantity + 1)}><Plus /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${item.nameEn}`} disabled={busy === item.id} onClick={() => void mutate(item.id)}><Trash2 /></Button>
              </div>
            </article>
          );
        })}
        {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive">{error}</p> : null}
      </div>
      <aside className="h-fit rounded-2xl border bg-card p-6 lg:sticky lg:top-28">
        <h2 className="font-heading text-2xl">Order summary</h2>
        <div className="mt-6 flex justify-between text-sm"><span className="text-muted-foreground">Items ({cart.itemCount})</span><strong>{money(cart.itemSubtotalPaisa)}</strong></div>
        <div className="mt-3 flex justify-between text-sm"><span className="text-muted-foreground">Delivery</span><span>At checkout</span></div>
        <p className="mt-5 border-t pt-5 text-sm leading-6 text-muted-foreground">Cash on delivery is available nationwide. The delivery charge is calculated from your district.</p>
        <Button render={<Link href="/checkout" />} disabled={cart.hasUnavailableItems} className="mt-6 h-12 w-full rounded-full text-base">Continue to checkout</Button>
        {cart.hasUnavailableItems ? <p className="mt-3 text-sm text-destructive">Resolve unavailable items before checkout.</p> : null}
      </aside>
    </div>
  );
}
