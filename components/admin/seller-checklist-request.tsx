'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useDenyStaffReview } from '@/components/admin/staff-review-access-boundary';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

const control = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#D7C4A9] bg-white px-3 text-center text-sm font-semibold text-[#14213D] hover:bg-[#F4EFE5] focus-visible:outline-2 focus-visible:outline-offset-2';

export function SellerChecklistRequest({ sellerId, actorId, itemId, label, note, remind }: {
  sellerId: string; actorId: string; itemId: string; label: string; note: string; remind: boolean;
}) {
  const router = useRouter();
  const denyReview = useDenyStaffReview();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const previous = useRef<{ note: string; requestId: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; failed?: boolean }>();

  async function submit(form: HTMLFormElement) {
    const noteEntry = new FormData(form).get('note');
    if (typeof noteEntry !== 'string') return;
    const updatedNote = noteEntry.trim();
    const requestId = previous.current?.note === updatedNote ? previous.current.requestId : crypto.randomUUID();
    previous.current = { note: updatedNote, requestId };
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/sellers/' + encodeURIComponent(sellerId) + '/checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
          body: JSON.stringify({ itemId, note: updatedNote, remind, requestId }),
        });
        if ((response.status === 401 || response.status === 403) && denyReview) {
          denyReview();
          return;
        }
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) {
          setFeedback({ text: result.error ?? 'The message could not be confirmed. Try again.', failed: true });
          return;
        }
        previous.current = null;
        setFeedback({ text: 'Message queued.' });
        if (disclosure.current) disclosure.current.open = false;
        router.refresh();
      } catch {
        setFeedback({ text: 'The message could not be confirmed. Try again.', failed: true });
      }
    });
  }

  return <div className="min-w-0">
    <details ref={disclosure} className="min-w-0 sm:min-w-32">
      <summary className={control + ' w-full cursor-pointer list-none'}>{label}</summary>
      <form className="mt-2 grid min-w-0 gap-2" onSubmit={event => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}>
        <label className="grid min-w-0 gap-1 text-sm font-semibold">Note to the seller
          <textarea className="min-h-11 w-full min-w-0 rounded-lg border border-[#D7C4A9] p-2 text-sm font-normal"
            name="note" defaultValue={note} minLength={8} maxLength={1000} required rows={3} disabled={pending} />
        </label>
        <button type="submit" disabled={pending} className={control}>{pending ? 'Queuing…' : 'Send message'}</button>
      </form>
    </details>
    {feedback ? <p role={feedback.failed ? 'alert' : 'status'} className="mt-1 text-xs">{feedback.text}</p> : null}
  </div>;
}
