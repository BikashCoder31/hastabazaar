'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
export function ReviewReplyForm({
  reviewId,
  version,
  initialBody,
  status,
}: {
  reviewId: string;
  version: number;
  initialBody: string;
  status: string | undefined;
}) {
  const [body, setBody] = useState(initialBody),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const router = useRouter();
  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await sendJson(
        `/api/seller/reviews/${encodeURIComponent(reviewId)}/reply`,
        'POST',
        { body, version, idempotencyKey: requestId.current },
        'Reply could not be saved.',
      );
      setMessage('Your reply is awaiting moderation.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 border-t pt-5">
      <label className="text-sm font-semibold" htmlFor={`reply-${reviewId}`}>
        {version ? 'Edit your reply' : 'Reply to this customer'}
      </label>
      {status ? (
        <p className="mt-2 text-xs capitalize">Reply status: {status}</p>
      ) : null}
      <textarea
        id={`reply-${reviewId}`}
        required
        minLength={10}
        maxLength={2000}
        disabled={busy}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          requestId.current = crypto.randomUUID();
        }}
        className="mt-3 min-h-28 w-full rounded-xl border bg-background p-3 text-sm"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Keep it helpful and avoid personal information. New and edited replies
        appear after approval; editing removes the previous reply from public
        view while it is reviewed.
      </p>
      <button
        disabled={busy}
        className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? 'Submitting…' : 'Submit reply'}
      </button>
      <output className="block mt-3 text-sm">
        {message}
      </output>
    </form>
  );
}
