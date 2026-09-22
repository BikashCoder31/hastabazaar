'use client';

import { useEffect, useState } from 'react';

import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import type { RecentlyViewedPolicy } from '@/lib/configuration/types';
import type { RecentlyViewedProduct } from '@/lib/db/repositories/recently-viewed';
import { mediaSizes } from '@/lib/media/responsive-media';
import { normalizeGuestHistory, recordGuestProductView } from '@/lib/recently-viewed/history';

const storageKey = 'hastabazaar.recently-viewed.v1';

function readLocal(now: number, policy: RecentlyViewedPolicy) {
  try { return normalizeGuestHistory(JSON.parse(localStorage.getItem(storageKey) ?? '[]'), now, policy); }
  catch { return []; }
}

export function RecentlyViewed({
  currentProductId,
  authenticated,
}: {
  currentProductId: string;
  authenticated: boolean;
}) {
  const [products, setProducts] = useState<readonly RecentlyViewedProduct[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const policyResponse = await fetch('/api/recently-viewed', { cache: 'no-store' });
      if (!policyResponse.ok) return;
      const initial = await policyResponse.json() as { products: RecentlyViewedProduct[]; policy: RecentlyViewedPolicy };
      if (!active) return;
      if (authenticated) {
        // Never merge browser-local guest activity into an identified account.
        localStorage.removeItem(storageKey);
        await fetch('/api/recently-viewed', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'record', productId: currentProductId }),
        });
        const response = await fetch('/api/recently-viewed', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as { products: RecentlyViewedProduct[]; policy: RecentlyViewedPolicy };
        if (active) setProducts(data.products);
        return;
      }
      const now = Date.now();
      const history = recordGuestProductView(readLocal(now, initial.policy), currentProductId, now, initial.policy);
      localStorage.setItem(storageKey, JSON.stringify(history));
      const response = await fetch('/api/recently-viewed', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', productIds: history.map((entry) => entry.productId) }),
      });
      if (!response.ok) return;
      const data = await response.json() as { products: RecentlyViewedProduct[]; policy: RecentlyViewedPolicy };
      if (active) setProducts(data.products);
    }
    void load().catch(() => { if (active) setMessage('Recently Viewed is temporarily unavailable.'); });
    return () => { active = false; };
  }, [authenticated, currentProductId]);

  async function clear() {
    if (authenticated) {
      const response = await fetch('/api/recently-viewed', { method: 'DELETE' });
      if (!response.ok) { setMessage('History could not be cleared.'); return; }
    } else localStorage.removeItem(storageKey);
    setProducts([]);
    setMessage('Recently Viewed history cleared.');
  }

  const visible = products.filter((product) => product.id !== currentProductId);
  if (!products.length) return message ? <output className="mt-10 block text-sm text-muted-foreground">{message}</output> : null;
  return (
    <section className="mt-14 border-t pt-10" aria-labelledby="recently-viewed-heading">
      <div className="flex items-end justify-between gap-4">
        <div><p className="eyebrow">Continue exploring</p><h2 id="recently-viewed-heading" className="mt-2 font-heading text-3xl">Recently viewed</h2></div>
        <Button type="button" variant="outline" onClick={() => void clear()}>Clear history</Button>
      </div>
      {message ? <output className="mt-3 block text-sm text-muted-foreground">{message}</output> : null}
      {visible.length ? <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((product) => <div key={product.id}><ProductCard product={product} sizes={mediaSizes.productGrid} />{!product.available ? <p className="mt-2 text-sm font-semibold text-muted-foreground">Currently unavailable</p> : null}</div>)}
      </div> : <p className="mt-5 text-sm text-muted-foreground">This is the first product in this history.</p>}
    </section>
  );
}
