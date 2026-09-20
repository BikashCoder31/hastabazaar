'use client';

import { Ban, CircleCheckBig, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AdminFulfillmentAction } from '@/lib/db/repositories/fulfillment';

const definitions = {
  dispatch: { label: 'Mark dispatched', title: 'Dispatch this order?', description: 'The customer will see the consignment as dispatched.', icon: Send, variant: 'default' },
  deliver: { label: 'Confirm delivery', title: 'Confirm delivery and COD collection?', description: 'This records the COD payment as collected and closes fulfilment.', icon: CircleCheckBig, variant: 'default' },
  cancel: { label: 'Cancel order', title: 'Cancel this complete order?', description: 'Eligible parcels close and reserved inventory is restored. Custom production already started requires a separate staff review. Readiness and revised amounts are checked before cancellation.', icon: Ban, variant: 'destructive' },
} as const;

export function AdminOrderFulfillmentActions({ orderId, status, initialTrackingCode }: { orderId: string; status: string; initialTrackingCode?: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdminFulfillmentAction | null>(null);
  const [note, setNote] = useState('');
  const [trackingCode, setTrackingCode] = useState(initialTrackingCode??'');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const actions: AdminFulfillmentAction[] = status === 'ready_for_pickup'
    ? ['dispatch', 'cancel']
    : status === 'dispatched'
      ? ['deliver']
      : ['confirmed', 'packing'].includes(status)
        ? ['cancel']
        : [];
  if (actions.length === 0) return <p className="text-sm leading-6 text-muted-foreground">No operations action is currently available.</p>;

  function prepare(action: AdminFulfillmentAction) {
    setError('');
    setSelected(action);
  }

  async function submit() {
    if (!selected) return;
    if (note.trim().length < 8) { setError('Add a clear operations note of at least 8 characters.'); return; }
    if (selected === 'dispatch' && (trackingCode.trim().length < 4 || trackingCode.trim().length > 80)) { setError('Enter a tracking or manual consignment reference.'); return; }
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/fulfillment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: selected, note, trackingCode }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Order could not be updated.');
      setSelected(null);
      setNote('');
      setTrackingCode('');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Order could not be updated.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">{actions.map((action) => { const definition = definitions[action]; const Icon = definition.icon; return <Button key={action} variant={definition.variant} onClick={() => prepare(action)}><Icon />{definition.label}</Button>; })}</div>
      {error && !selected ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
      <AlertDialog open={selected !== null} onOpenChange={(open) => { if (!open && !pending) setSelected(null); }}>
        <AlertDialogContent>
          {selected ? <><AlertDialogHeader><AlertDialogTitle>{definitions[selected].title}</AlertDialogTitle><AlertDialogDescription>{definitions[selected].description}</AlertDialogDescription></AlertDialogHeader><div className="space-y-4">{selected === 'dispatch' ? <div className="space-y-2"><Label htmlFor="trackingCode">Tracking or consignment reference</Label><Input id="trackingCode" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} maxLength={80} /></div> : null}<div className="space-y-2"><Label htmlFor="operationsNote">Operations note</Label><Textarea id="operationsNote" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Record the reason and any relevant details." /></div>{error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}</div><AlertDialogFooter><AlertDialogCancel disabled={pending}>Go back</AlertDialogCancel><AlertDialogAction variant={definitions[selected].variant} disabled={pending} onClick={(event) => { event.preventDefault(); void submit(); }}>{pending ? 'Updating…' : definitions[selected].label}</AlertDialogAction></AlertDialogFooter></> : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
