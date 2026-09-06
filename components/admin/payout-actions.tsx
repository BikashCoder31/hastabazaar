'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PayoutOperation, PayoutStatus } from '@/lib/db/repositories/payouts';

async function post(url: string, body: object): Promise<void> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'The payout action failed.');
}

export function AccrueEarningsButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setPending(true); setError('');
    try { await post('/api/admin/payouts/accrue', { idempotencyKey: crypto.randomUUID() }); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Earnings could not be accrued.'); }
    finally { setPending(false); }
  }
  return <div><Button variant="outline" disabled={pending} onClick={() => void run()}>{pending ? 'Checking…' : 'Accrue delivered earnings'}</Button>{error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}</div>;
}

export function PreparePayoutButton({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setPending(true); setError('');
    try { await post('/api/admin/payouts', { sellerId, note, idempotencyKey: crypto.randomUUID() }); setOpen(false); setNote(''); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Payout could not be prepared.'); }
    finally { setPending(false); }
  }
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Prepare payout</Button>;
  return <div className="min-w-72 space-y-2"><Label htmlFor={`note-${sellerId}`}>Preparation note</Label><Textarea id={`note-${sellerId}`} value={note} onChange={(event) => setNote(event.target.value)} minLength={8} maxLength={1000} placeholder="Confirm the payout period and reviewed balance." />{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<div className="flex gap-2"><Button size="sm" disabled={pending || note.trim().length < 8} onClick={() => void submit()}>{pending ? 'Preparing…' : 'Confirm'}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button></div></div>;
}

const actionLabels: Record<PayoutOperation, string> = {
  approve: 'Approve payout',
  reject: 'Reject payout',
  start_processing: 'Start processing',
  mark_paid: 'Mark paid',
  mark_failed: 'Mark failed',
};

function actionsFor(status: PayoutStatus): readonly PayoutOperation[] {
  if (status === 'prepared' || status === 'scheduled') return ['approve', 'reject'];
  if (status === 'approved' || status === 'failed') return ['start_processing'];
  if (status === 'processing') return ['mark_paid', 'mark_failed'];
  return [];
}

export function PayoutWorkflowActions({ payoutId, status, canApprove, canProcess }: { payoutId: string; status: PayoutStatus; canApprove: boolean; canProcess: boolean }) {
  const router = useRouter();
  const permitted = actionsFor(status).filter((action) => action === 'approve' || action === 'reject' ? canApprove : canProcess);
  const [action, setAction] = useState<PayoutOperation>(permitted[0] ?? 'approve');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (permitted.length === 0) return <p className="text-sm leading-6 text-muted-foreground">No payout action is available for your role at this stage.</p>;
  const effectiveAction = permitted.includes(action) ? action : permitted[0];
  async function submit() {
    setPending(true); setError('');
    try { await post(`/api/admin/payouts/${encodeURIComponent(payoutId)}`, { action: effectiveAction, note, providerReference: reference, idempotencyKey: crypto.randomUUID() }); setNote(''); setReference(''); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Payout could not be updated.'); }
    finally { setPending(false); }
  }
  return <div className="space-y-4"><div><Label htmlFor="payout-action">Action</Label><select id="payout-action" value={effectiveAction} onChange={(event) => setAction(event.target.value as PayoutOperation)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm">{permitted.map((item) => <option key={item} value={item}>{actionLabels[item]}</option>)}</select></div><div><Label htmlFor="payout-note">Operational note</Label><Textarea id="payout-note" className="mt-2" value={note} onChange={(event) => setNote(event.target.value)} minLength={8} maxLength={1000} /></div>{effectiveAction === 'mark_paid' ? <div><Label htmlFor="payout-reference">Verified provider or bank reference</Label><Input id="payout-reference" className="mt-2" value={reference} onChange={(event) => setReference(event.target.value)} minLength={4} maxLength={160} /></div> : null}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button disabled={pending || note.trim().length < 8 || (effectiveAction === 'mark_paid' && reference.trim().length < 4)} onClick={() => void submit()}>{pending ? 'Saving…' : actionLabels[effectiveAction]}</Button></div>;
}
