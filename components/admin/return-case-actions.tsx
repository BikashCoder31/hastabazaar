'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  id: string;
  status: string;
  outcome: string | null;
  refundStatus: string | null;
  role: 'admin' | 'super_admin';
  quantity: number;
};

const operationLabels: Record<string, string> = {
  mark_in_transit: 'Mark return in transit', mark_received: 'Mark return received',
  resolve_replacement: 'Complete replacement', resolve_return_to_origin: 'Complete return to origin',
  start_refund: 'Start refund processing', complete_refund: 'Mark refund paid', fail_refund: 'Mark refund failed',
};

export function ReturnCaseActions(props: Props) {
  const router = useRouter();
  const [action, setAction] = useState('request_changes');
  const [outcome, setOutcome] = useState('refund');
  const [responsibility, setResponsibility] = useState('seller');
  const [itemRefund, setItemRefund] = useState('');
  const [deliveryRefund, setDeliveryRefund] = useState('0');
  const [reference, setReference] = useState('');
  const [restockQuantity, setRestockQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [messageNe, setMessageNe] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const reviewable = ['requested', 'under_investigation', 'needs_customer_changes'].includes(props.status);
  const highValue = props.status === 'pending_high_value_approval' && props.role === 'super_admin';
  const operations = availableOperations(props.status, props.outcome, props.refundStatus);

  async function send(endpoint: string, body: Record<string, unknown>) {
    setPending(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, note, publicMessageEn: messageEn, publicMessageNe: messageNe, idempotencyKey: key }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The case could not be updated.');
      setKey(crypto.randomUUID()); setNote(''); setMessageEn(''); setMessageNe(''); setReference(''); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The case could not be updated.'); }
    finally { setPending(false); }
  }

  if (!reviewable && !highValue && operations.length === 0) return <p className="text-sm leading-6 text-muted-foreground">No administrative action is currently available.</p>;
  return <div className="space-y-5">
    {reviewable ? <>
      <Field label="Decision"><select value={action} onChange={(event) => setAction(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="request_changes">Request customer changes</option><option value="reject">Reject</option><option value="approve">Approve</option></select></Field>
      {action === 'approve' ? <><Field label="Outcome"><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="refund">Refund</option><option value="replacement">Replacement</option><option value="return_to_origin">Return to origin</option></select></Field><Field label="Responsible party"><select value={responsibility} onChange={(event) => setResponsibility(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="seller">Seller</option><option value="carrier">Carrier</option><option value="platform">Hathkriti</option><option value="buyer">Customer</option></select></Field>{outcome === 'refund' ? <div className="grid grid-cols-2 gap-3"><Field label="Item refund (NPR)"><Input type="number" min="0" step="0.01" value={itemRefund} onChange={(event) => setItemRefund(event.target.value)} /></Field><Field label="Delivery refund (NPR)"><Input type="number" min="0" step="0.01" value={deliveryRefund} onChange={(event) => setDeliveryRefund(event.target.value)} /></Field></div> : null}</> : null}
    </> : null}
    {highValue ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">This high-value refund needs a different Super Admin from the person who proposed it.</div> : null}
    {operations.length ? <Field label="Operation"><select value={operations.includes(action) ? action : operations[0]} onChange={(event) => setAction(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">{operations.map((value) => <option key={value} value={value}>{operationLabels[value]}</option>)}</select></Field> : null}
    {operations.some((value) => ['mark_in_transit', 'resolve_replacement', 'resolve_return_to_origin', 'complete_refund'].includes(value)) ? <Field label="Shipment, replacement, or payment reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></Field> : null}
    {operations.some((value) => ['resolve_replacement', 'resolve_return_to_origin', 'complete_refund'].includes(value)) ? <Field label={`Restock quantity (0–${props.quantity})`}><Input type="number" min={0} max={props.quantity} value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} /></Field> : null}
    <Field label="Internal investigation note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={8} maxLength={2000} /></Field>
    <Field label="Customer message (English)"><Textarea value={messageEn} onChange={(event) => setMessageEn(event.target.value)} minLength={8} maxLength={1000} /></Field>
    <Field label="Customer message (Nepali)"><Textarea value={messageNe} onChange={(event) => setMessageNe(event.target.value)} minLength={4} maxLength={1000} /></Field>
    {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
    {reviewable ? <Button disabled={pending || note.trim().length < 8 || messageEn.trim().length < 8 || messageNe.trim().length < 4} onClick={() => void send(`/api/admin/returns/${encodeURIComponent(props.id)}/review`, { action, outcome: action === 'approve' ? outcome : undefined, responsibility: action === 'approve' ? responsibility : undefined, itemRefundPaisa: Math.round(Number(itemRefund || 0) * 100), deliveryRefundPaisa: Math.round(Number(deliveryRefund || 0) * 100) })}>{pending ? 'Saving…' : 'Save decision'}</Button> : highValue ? <div className="flex gap-2"><Button disabled={pending || note.trim().length < 8 || messageEn.trim().length < 8 || messageNe.trim().length < 4} onClick={() => void send(`/api/admin/returns/${encodeURIComponent(props.id)}/high-value`, { decision: 'approve' })}>Approve high-value refund</Button><Button variant="destructive" disabled={pending || note.trim().length < 8 || messageEn.trim().length < 8 || messageNe.trim().length < 4} onClick={() => void send(`/api/admin/returns/${encodeURIComponent(props.id)}/high-value`, { decision: 'reject' })}>Reject</Button></div> : operations.length ? <Button disabled={pending || note.trim().length < 8 || messageEn.trim().length < 8 || messageNe.trim().length < 4} onClick={() => void send(`/api/admin/returns/${encodeURIComponent(props.id)}/operations`, { action: operations.includes(action) ? action : operations[0], reference, restockQuantity: Number(restockQuantity) })}>{pending ? 'Saving…' : operationLabels[operations.includes(action) ? action : operations[0]]}</Button> : null}
  </div>;
}

function availableOperations(status: string, outcome: string | null, refundStatus: string | null): string[] {
  if (status === 'approved' && outcome === 'refund' && refundStatus === 'approved') return ['mark_in_transit', 'start_refund'];
  if (status === 'approved' && outcome === 'replacement') return ['mark_in_transit', 'resolve_replacement'];
  if (status === 'approved' && outcome === 'return_to_origin') return ['mark_in_transit', 'resolve_return_to_origin'];
  if (status === 'in_transit') return ['mark_received'];
  if (status === 'received' && outcome === 'refund' && refundStatus === 'approved') return ['start_refund'];
  if (status === 'received' && outcome === 'replacement') return ['resolve_replacement'];
  if (status === 'received' && outcome === 'return_to_origin') return ['resolve_return_to_origin'];
  if (refundStatus === 'processing') return ['complete_refund', 'fail_refund'];
  if (['approved', 'received'].includes(status) && outcome === 'refund' && refundStatus === 'failed') return ['start_refund'];
  return [];
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
