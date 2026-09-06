'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ReviewModerationActions({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function act(action: 'publish' | 'reject' | 'hide') { setBusy(true); setError(''); const response = await fetch(`/api/admin/reviews/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, note, idempotencyKey: crypto.randomUUID() }) }); const result = await response.json() as { error?: string }; setBusy(false); if (!response.ok) return setError(result.error || 'Review action failed.'); setNote(''); router.refresh(); }
  return <div className="mt-4"><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required moderation note" minLength={8} maxLength={1000} />{error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}<div className="mt-3 flex flex-wrap gap-2">{status === 'pending' ? <><Button size="sm" disabled={busy || note.trim().length < 8} onClick={() => void act('publish')}>Publish</Button><Button size="sm" variant="destructive" disabled={busy || note.trim().length < 8} onClick={() => void act('reject')}>Reject</Button></> : <Button size="sm" variant="outline" disabled={busy || note.trim().length < 8} onClick={() => void act('hide')}>Hide</Button>}</div></div>;
}
