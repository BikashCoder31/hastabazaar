'use client';

import { PackageCheck, PackageOpen } from 'lucide-react';
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
import type { ItemFulfillmentStatus, SellerFulfillmentAction } from '@/lib/db/repositories/fulfillment';

const definitions = {
  start_packing: {
    title: 'Start packing these items?',
    description: 'Hastabazaar operations will see that preparation is underway.',
    label: 'Start packing',
    icon: PackageOpen,
  },
  ready_for_pickup: {
    title: 'Are all items packed and ready?',
    description: 'Only confirm when the parcel is sealed, labelled, and ready for carrier collection.',
    label: 'Mark ready for pickup',
    icon: PackageCheck,
  },
} as const;

export function SellerOrderFulfillmentActions({
  orderId,
  itemStatuses,
}: {
  orderId: string;
  itemStatuses: readonly ItemFulfillmentStatus[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SellerFulfillmentAction | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const uniform = itemStatuses.length > 0 && itemStatuses.every((status) => status === itemStatuses[0])
    ? itemStatuses[0]
    : null;
  const action: SellerFulfillmentAction | null = uniform === 'confirmed'
    ? 'start_packing'
    : uniform === 'packing'
      ? 'ready_for_pickup'
      : null;
  if (!action) return <p className="text-sm leading-6 text-muted-foreground">No seller action is currently required.</p>;
  const definition = definitions[action];
  const Icon = definition.icon;

  async function submit() {
    if (!selected) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(orderId)}/fulfillment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: selected }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Status could not be updated.');
      setSelected(null);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status could not be updated.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button onClick={() => setSelected(action)}><Icon />{definition.label}</Button>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
      <AlertDialog open={selected !== null} onOpenChange={(open) => { if (!open && !pending) setSelected(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{definition.title}</AlertDialogTitle><AlertDialogDescription>{definition.description}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={pending}>Go back</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); void submit(); }}>{pending ? 'Updating…' : definition.label}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
