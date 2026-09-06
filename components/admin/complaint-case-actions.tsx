'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ComplaintCaseActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const actions = status === 'closed'
    ? []
    : status === 'resolved'
      ? ['close', 'reopen']
      : status === 'open'
        ? ['assign_to_me', 'investigate', 'escalate', 'resolve']
        : status === 'waiting_customer'
          ? ['investigate', 'escalate', 'resolve']
          : ['assign_to_me', 'investigate', 'request_customer', 'escalate', 'resolve'];
  const [action, setAction] = useState(actions[0] || 'investigate');
  const [note, setNote] = useState(''); const [messageEn, setMessageEn] = useState(''); const [messageNe, setMessageNe] = useState('');
  const [resolutionEn, setResolutionEn] = useState(''); const [resolutionNe, setResolutionNe] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID()); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  if (!actions.length) return <p className="text-sm text-muted-foreground">This complaint is closed.</p>;
  async function submit() {
    setPending(true); setError('');
    try { const response = await fetch(`/api/admin/complaints/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, note, publicMessageEn: messageEn, publicMessageNe: messageNe, resolutionEn, resolutionNe, idempotencyKey: key }) }); const result = (await response.json()) as { error?: string }; if (!response.ok) throw new Error(result.error || 'Complaint could not be updated.'); setKey(crypto.randomUUID()); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Complaint could not be updated.'); } finally { setPending(false); }
  }
  return <div className="space-y-4"><div className="space-y-2"><Label>Action</Label><select value={action} onChange={(event) => setAction(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">{actions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div><Field label="Internal case note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={8} maxLength={2000} /></Field><Field label="Customer message (English)"><Textarea value={messageEn} onChange={(event) => setMessageEn(event.target.value)} minLength={8} maxLength={1000} /></Field><Field label="Customer message (Nepali)"><Textarea value={messageNe} onChange={(event) => setMessageNe(event.target.value)} minLength={4} maxLength={1000} /></Field>{action === 'resolve' ? <><Field label="Resolution (English)"><Textarea value={resolutionEn} onChange={(event) => setResolutionEn(event.target.value)} minLength={8} /></Field><Field label="Resolution (Nepali)"><Textarea value={resolutionNe} onChange={(event) => setResolutionNe(event.target.value)} minLength={4} /></Field></> : null}{error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}<Button disabled={pending || note.trim().length < 8 || messageEn.trim().length < 8 || messageNe.trim().length < 4} onClick={() => void submit()}>{pending ? 'Saving…' : 'Apply action'}</Button></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
