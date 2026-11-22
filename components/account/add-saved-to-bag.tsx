'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { OfferCartChoice } from '@/lib/cart/offer-cart';
import { HttpResponseError, sendJson } from '@/lib/http/client-request';

type Offer = Pick<OfferCartChoice, 'offerId' | 'versionId' | 'publicVersionId' | 'pricePaisa'>;

export function AddSavedToBag({ productId, href, offer, enabled, choose }: {
  productId: string; href: string; offer?: Offer; enabled: boolean; choose: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const control = 'inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#d8cbb8] px-2 py-2 text-center text-sm font-semibold text-[#14213d] hover:bg-[#ebe1d1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e] disabled:opacity-60';

  async function add() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const cart = await fetch('/api/cart', { cache: 'no-store' });
      if (!cart.ok) throw new Error('Couldn’t open your bag. Try again.');
      const payload = offer
        ? { productId, quantity: 1, ...offer, requestId: requestId.current ??= crypto.randomUUID() }
        : { productId, quantity: 1 };
      await sendJson('/api/cart', 'POST', payload, 'The bag could not be updated.');
      setAdded(true);
      requestId.current = undefined;
      window.dispatchEvent(new Event('cart:updated'));
    } catch (reason) {
      if (reason instanceof HttpResponseError && [400, 409].includes(reason.status)) requestId.current = undefined;
      setError(offer ? (reason instanceof Error ? reason.message : 'Try adding this item again.') : 'Open your bag to check whether the item was added.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!enabled || choose) return <Link className={control} href={href}>{enabled ? 'Choose options' : 'View item'}</Link>;
  if (added) return <Link className={control} href="/cart">Added · View bag</Link>;
  return <div className="space-y-2">
    <button type="button" className={control} onClick={() => void add()} disabled={busy || (!offer && Boolean(error))}>{busy ? 'Adding…' : 'Add to bag'}</button>
    {error ? <p role="alert" className="wrap-anywhere text-xs text-destructive">{error}{!offer ? <> <Link href="/cart" className="inline-flex min-h-11 items-center underline">View bag</Link></> : null}</p> : null}
  </div>;
}
