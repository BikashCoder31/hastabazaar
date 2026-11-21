'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { HttpResponseError } from '@/lib/http/client-request';
import type { CustomerDelayQuestion } from '@/lib/orders/customer-delay-answer';
import { customerDate } from '@/lib/orders/customer-parcel-state';

type AffectedItem = { name: string; mediaId: string | null };

export function CustomerPreparationQuestion({ question, actorId, item }: { question: CustomerDelayQuestion; actorId: string; item?: AffectedItem }) {
  const scope = useOwnedFormScope(JSON.stringify([actorId, question.id, question.proposedReadyAt]));
  return <Question key={scope.key} question={question} actorId={actorId} item={item} isCurrent={scope.isCurrent} />;
}

function Question({ question, actorId, item, isCurrent }: { question: CustomerDelayQuestion; actorId: string; item?: AffectedItem; isCurrent: () => boolean }) {
  const router = useRouter();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const acted = kept || question.answered;
  const date = customerDate(question.proposedReadyAt);
  async function answer() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const fallback = 'Your answer couldn’t be confirmed. Retry this same choice.';
      const response = await fetch(`/account/order-responses/${encodeURIComponent(question.id)}/keep`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
        body: JSON.stringify({ revision: question.revision, proposedReadyAt: question.proposedReadyAt }),
      });
      const result = await response.json().catch(() => null) as { kept?: boolean; proposedReadyAt?: number; error?: string } | null;
      if (!response.ok) throw new HttpResponseError(result?.error ?? fallback, response.status);
      if (!result?.kept || result.proposedReadyAt !== question.proposedReadyAt) throw new Error(fallback);
      if (!isCurrent()) return;
      setKept(true);
      router.refresh();
    } catch (failure) {
      if (!isCurrent()) return;
      if (failure instanceof HttpResponseError && [401, 403, 404].includes(failure.status)) {
        setDenied(true);
        router.refresh();
        return;
      }
      setError(failure instanceof Error ? failure.message : 'Review the current question and try again.');
    } finally {
      sending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  if (denied) return <p role="alert" className="rounded-xl border bg-white p-4">This question is unavailable. Reload the order to check its latest status.</p>;
  const cancel = `/orders/${encodeURIComponent(question.orderNumber)}?cancel=1&parcel=${encodeURIComponent(question.sellerId)}`;
  return (
    <section aria-label="Seller question" className="min-w-0 rounded-[15px] border-2 border-[#14213D] bg-[#FDFAF5] p-5 sm:p-6">
      {item?.mediaId ? <Image src={`/api/product-media/${encodeURIComponent(item.mediaId)}`} alt="" width={72} height={72} unoptimized
        className="mb-3 size-18 rounded-xl border border-[#E3D6C3] object-cover sm:float-right sm:mb-2 sm:ml-4" /> : null}
      <CustomerActingChip actor={acted ? 'seller' : 'you'} yourTurn={!acted} />
      <h2 className="mt-2 text-xl font-bold text-[#14213D]">{question.sellerName} needs until {date} to get your parcel ready</h2>
      {item ? <p className="mt-2 text-sm font-medium text-[#465573]">{item.name}</p> : null}
      {question.publicMessage ? <p className="mt-2 text-sm leading-relaxed text-[#465573]">{question.publicMessage}</p> : null}
      <p className="mt-2 text-sm text-[#465573]">This question is about this seller’s parcel. Your other parcels keep moving.</p>
      {acted ? <output className="mt-4 block rounded-xl bg-[#DDECE3] px-4 py-3 font-semibold text-[#205D42]">Your choice is saved. You chose to keep the parcel.</output> : (
        <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
          <button type="button" onClick={() => void answer()} disabled={busy}
            className="min-h-11 rounded-[9px] bg-[#14213D] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60">
            {busy ? 'Saving your answer…' : `Keep it — I’ll wait until ${date}`}
          </button>
          <Link href={cancel} className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#D4C1A6] px-4 py-2 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">Review cancelling this parcel</Link>
        </div>
      )}
      {error ? <p role="alert" className="mt-3 text-sm text-[#A8232E]">{error}</p> : null}
    </section>
  );
}
