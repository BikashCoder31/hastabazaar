'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

export function NcmReviewAction({ actorId, eventId }: { actorId: string; eventId: string }) {
  const router = useRouter();
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);
  const [state, setState] = useState<'idle' | 'pending' | 'reviewed' | 'error'>('idle');

  async function markReviewed() {
    if (pending.current || state === 'reviewed') return;
    pending.current = true;
    setState('pending');
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch('/api/admin/delivery-partners/ncm/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
        body: JSON.stringify({ eventId, requestId: requestId.current }),
      });
      const result = await response.json() as { ok?: boolean } | null;
      if (!response.ok || result?.ok !== true) throw new Error('NCM review was not recorded');
      setState('reviewed');
      router.refresh();
    } catch {
      setState('error');
    } finally {
      pending.current = false;
    }
  }

  return state === 'reviewed' ? <output className="text-sm font-semibold">Reviewed</output> : (
    <div className="space-y-1">
      <button type="button" onClick={markReviewed} disabled={state === 'pending'}
        className="inline-flex min-h-11 min-w-11 items-center rounded-lg border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
        {state === 'pending' ? 'Saving review…' : 'Mark reviewed'}
      </button>
      {state === 'error' ? <p role="alert" className="text-sm text-destructive">Couldn’t save the review. Try again.</p> : null}
    </div>
  );
}
