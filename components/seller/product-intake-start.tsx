'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, FileText, Package, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { sellerMoney } from '@/lib/seller/presentation';

type RecentProduct = {
  id: string;
  name: string;
  categoryName: string | null;
  pricePaisa: number | null;
  coverMediaId: string | null;
  coverSrc?: string | null;
};
type UnfinishedDraft = { id: string; title: string; updatedAt: number };
const startCard = 'block min-w-0 space-y-2.5 rounded-2xl border border-[#E4DACA] bg-white p-5 text-left shadow-sm';
const simpleAction = 'inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-[#D7C4A9] bg-white px-3 text-sm font-semibold hover:border-[#14213D] disabled:opacity-50';
const draftHref = (id: string) => '/seller/products/new?draftId=' + encodeURIComponent(id);

export function ProductIntakeStart({ actorId, recentProducts, unfinishedDrafts }: {
  actorId: string;
  recentProducts: readonly RecentProduct[];
  unfinishedDrafts: readonly UnfinishedDraft[];
}) {
  const [copying, setCopying] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const firstCopy = useRef<HTMLButtonElement>(null);
  const copyInFlight = useRef(false);

  async function copyProduct(productId: string) {
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    const key = sessionAttemptKey('copy-product', JSON.stringify([actorId, productId]));
    setCopying(productId);
    setNotice('');
    try {
      const response = await fetch('/api/seller/product-intakes/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
        body: JSON.stringify({ action: 'copy', productId, expectedRevision: null, requestId: getOrCreateSessionAttempt(key) }),
      });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || 'The copy could not be confirmed. Try copying this product again.');
      clearSessionAttempt(key);
      window.location.assign(draftHref(data.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The copy could not be confirmed. Try again.');
      copyInFlight.current = false;
      setCopying(null);
    }
  }

  return <div className="min-w-0 space-y-5 text-[#14213D]">
    <header className="flex items-center gap-2 border-b border-[#E4DACA] pb-3">
      <Link href="/seller/products" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-[#EBE2D0]" aria-label="Back to products"><ArrowLeft className="size-5" aria-hidden="true" /></Link>
      <h1 className="font-heading text-[1.65rem] font-semibold">New product</h1>
    </header>
    <div className="max-w-[860px] space-y-4">
      <section aria-labelledby="what-adding" className="space-y-2">
        <h2 id="what-adding" className="font-heading text-[1.8rem] font-semibold leading-tight">What are you adding?</h2>
        <p className="text-sm text-[#46536F]">Your draft saves as you go. Hastabazaar checks it before it goes live.</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/seller/products/new?start=new" className={startCard + ' hover:border-[#A8232E]'}>
          <span className="grid size-11 place-items-center rounded-xl bg-[#F7DFDE] text-[#A8232E]"><Plus className="size-5" aria-hidden="true" /></span>
          <span className="block text-lg font-bold">A new product</span>
          <span className="block text-sm leading-relaxed text-[#46536F]">Start with photos. We’ll guide you through the details and send it for review.</span>
        </Link>
        <button type="button" className={startCard + ' hover:border-[#14213D]'} onClick={() => {
          if (firstCopy.current) firstCopy.current.focus();
          else setNotice('There are no recent products to copy yet. You can start a new product.');
        }}>
          <span className="grid size-11 place-items-center rounded-xl bg-[#E2E8F4] text-[#284779]"><FileText className="size-5" aria-hidden="true" /></span>
          <span className="block text-lg font-bold">Like one I already sell</span>
          <span className="block text-sm leading-relaxed text-[#46536F]">Copy details, price and delivery from one of your products. Add new photos, a name and stock.</span>
        </button>
      </div>
      {notice ? <p role="alert" className="rounded-lg border border-[#E4DACA] bg-white p-3 text-sm text-[#A8232E]">{notice}</p> : null}
      <section aria-labelledby="recent-products" className={startCard}>
        <h2 id="recent-products" className="font-bold">Your recent products</h2>
        {recentProducts.length ? <ul className="divide-y divide-[#EEE5D5] border-t border-[#EEE5D5]">
          {recentProducts.map((product, index) => {
            const cover = product.coverSrc ?? (product.coverMediaId ? '/api/product-media/' + encodeURIComponent(product.coverMediaId) : null);
            return <li key={product.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2 sm:gap-3">
              {cover ? <Image data-media-mode="contain" src={cover} alt="" width={44} height={44} unoptimized className="size-11 rounded-md border border-[#EEE5D5] object-contain" /> :
                <span className="grid size-11 place-items-center rounded-md bg-[#F7F3EC]"><Package className="size-4" aria-hidden="true" /></span>}
              <div className="min-w-0 text-sm">
                <p className="wrap-anywhere font-semibold">{product.name}</p>
                <p className="wrap-anywhere text-[#46536F]">{[product.pricePaisa == null ? null : sellerMoney(product.pricePaisa), product.categoryName].filter(Boolean).join(' · ')}</p>
              </div>
              <button ref={index === 0 ? firstCopy : undefined} type="button" className={simpleAction}
                aria-label={`Copy this one: ${product.name}`} disabled={copying !== null} onClick={() => void copyProduct(product.id)}>
                {copying === product.id ? 'Copying…' : 'Copy this one'}
              </button>
            </li>;
          })}
        </ul> : <p className="text-sm text-[#46536F]">Products you can copy appear here.</p>}
      </section>
      <section aria-labelledby="unfinished-drafts" className={startCard}>
        <h2 id="unfinished-drafts" className="font-bold">Unfinished drafts</h2>
        {unfinishedDrafts.length ? <ul className="divide-y divide-[#EEE5D5] border-t border-[#EEE5D5]">
          {unfinishedDrafts.map(draft => <li key={draft.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 wrap-anywhere text-sm font-semibold">{draft.title}</span>
            <Link href={draftHref(draft.id)} className={simpleAction} aria-label={`Continue: ${draft.title}`}>Continue</Link>
          </li>)}
        </ul> : <p className="text-sm text-[#46536F]">You have no unfinished drafts.</p>}
      </section>
    </div>
  </div>;
}
