'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { XCircle } from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function CustomerOrderCancellation({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function cancel() {
    if (reason.trim().length < 8) { setError('Add a cancellation reason of at least 8 characters.'); return; }
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/orders/${encodeURIComponent(orderNumber)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Order could not be cancelled.');
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Order could not be cancelled.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button variant="outline" onClick={() => setOpen(true)}><XCircle />Cancel order</Button>
      <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Cancel this order?</AlertDialogTitle><AlertDialogDescription>Cancellation is free before packing begins. Reserved product quantities will be returned to stock.</AlertDialogDescription></AlertDialogHeader>
          <div className="space-y-2"><Label htmlFor="cancelReason">Reason</Label><Textarea id="cancelReason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Tell us why you need to cancel." />{error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}</div>
          <AlertDialogFooter><AlertDialogCancel disabled={pending}>Keep order</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => { event.preventDefault(); void cancel(); }}>{pending ? 'Cancelling…' : 'Cancel order'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
