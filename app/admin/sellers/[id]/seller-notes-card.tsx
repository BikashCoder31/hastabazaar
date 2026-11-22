'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useDenyStaffReview } from '@/components/admin/staff-review-access-boundary';
import { Button } from '@/components/ui/button';
import type { SellerNoteChange, SellerStaffNote } from '@/lib/admin/seller-notes';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

type RestrictionNote = { id: string; text: string; at: number; actor: string };

const timeFormat = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu',
});

export function SellerNotesCard({ actorId, sellerId, staffNotes, restrictionNotes }: {
  actorId: string;
  sellerId: string;
  staffNotes: readonly SellerStaffNote[] | null;
  restrictionNotes: readonly RestrictionNote[];
}) {
  const router = useRouter();
  const denyReview = useDenyStaffReview();
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const retry = useRef<{ payload: string; requestId: string } | null>(null);
  const busy = saving || refreshing;
  const timeline = [
    ...(staffNotes ?? []).map(note => ({
      kind: 'staff' as const, id: note.id, text: note.body, at: note.createdAt, actor: note.author, pinned: note.pinned,
    })),
    ...restrictionNotes.map(note => ({ ...note, kind: 'restriction' as const })),
  ].sort((a, b) => b.at - a.at || Number(b.kind === 'staff') - Number(a.kind === 'staff') || b.id.localeCompare(a.id));

  async function submit(change: SellerNoteChange) {
    const payload = JSON.stringify(change);
    const requestId = retry.current?.payload === payload ? retry.current.requestId : crypto.randomUUID();
    retry.current = { requestId, payload };
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/sellers/' + encodeURIComponent(sellerId) + '/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
        body: JSON.stringify({ ...change, requestId }),
      });
      if ((response.status === 401 || response.status === 403) && denyReview) {
        denyReview();
        return;
      }
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setFeedback({ text: result.error ?? 'The change could not be confirmed. Try again.', error: true });
        if (response.status === 409) startRefresh(() => router.refresh());
        return;
      }

      retry.current = null;
      if (change.action === 'add') setBody('');
      const text = change.action === 'add' ? 'Note added.' : change.pinned ? 'Note pinned.' : 'Note unpinned.';
      setFeedback({ text });
      startRefresh(() => router.refresh());
    } catch {
      setFeedback({ text: 'The change could not be confirmed. Try again.', error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="seller-notes" aria-labelledby="seller-notes-title" className="min-w-0 space-y-3 rounded-[14px] border border-[#E4D7C3] bg-[#FFFEFD] p-4">
      <h2 id="seller-notes-title" className="font-heading text-xl font-semibold">Notes</h2>
      {staffNotes !== null ? (
        <div className="grid min-w-0 gap-2">
          <label htmlFor="seller-staff-note-body" className="text-sm font-semibold">Private staff note</label>
          <textarea id="seller-staff-note-body" aria-describedby="seller-staff-note-privacy" rows={3} maxLength={2000}
            value={body} disabled={busy} onChange={event => setBody(event.currentTarget.value)}
            className="min-h-11 w-full min-w-0 resize-y rounded-lg border border-[#D4C3A8] bg-white p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" />
          <p id="seller-staff-note-privacy" className="text-xs leading-5 text-[#46536F]">Only authorized staff can see these notes. Up to 2,000 characters.</p>
          <Button type="button" disabled={busy || !body.trim()} className="min-h-11 w-fit"
            onClick={() => void submit({ action: 'add', body })}>Add note</Button>
        </div>
      ) : null}
      {feedback ? <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-sm text-[#A8232E]' : 'text-sm text-[#236548]'}>{feedback.text}</p> : null}
      {timeline.length ? (
        <ol className="divide-y divide-[#E4D7C3]">
          {timeline.map(note => (
            <li key={note.kind + ':' + note.id} className="space-y-1 py-3 text-sm text-[#46536F] last:pb-0">
              {note.kind === 'restriction' ? <p className="text-xs font-semibold">Restriction</p> : null}
              {note.kind === 'staff' && note.pinned ? <p className="text-xs font-semibold">Pinned</p> : null}
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[#14213D]">{note.text}</p>
              <p className="break-words text-xs leading-5">
                {note.actor} · <time dateTime={new Date(note.at).toISOString()}>{timeFormat.format(note.at)}</time>
              </p>
              {note.kind === 'staff' ? (
                <Button type="button" variant="outline" className="min-h-11" disabled={busy}
                  onClick={() => void submit({ action: 'pin', noteId: note.id, pinned: !note.pinned })}>
                  {note.pinned ? 'Unpin note' : 'Pin note'}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-[#46536F]">No private staff notes recorded.</p>}
    </section>
  );
}
