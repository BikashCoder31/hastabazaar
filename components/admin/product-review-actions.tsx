'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FilePenLine, Globe2, SearchCheck, XCircle } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import type { ProductReviewAction } from '@/lib/db/repositories/products';

const definitions = {
  start_review: { label: 'Start review', title: 'Start reviewing this product?', description: 'The listing will move into active review.', variant: 'default', icon: SearchCheck },
  request_changes: { label: 'Request changes', title: 'Return this listing for changes?', description: 'The seller will see your review note and must correct the listing.', variant: 'outline', icon: FilePenLine },
  approve: { label: 'Approve product', title: 'Approve this product?', description: 'Approval confirms the listing meets Hathkriti’s catalogue requirements. It remains private until published.', variant: 'default', icon: CheckCircle2 },
  publish: { label: 'Publish product', title: 'Publish this product?', description: 'The product will immediately become visible in the public Hathkriti shop.', variant: 'default', icon: Globe2 },
  reject: { label: 'Reject product', title: 'Reject this product?', description: 'The listing will be closed with your reason in its permanent review history.', variant: 'destructive', icon: XCircle },
} as const;

type Definition = (typeof definitions)[keyof typeof definitions] & { action: ProductReviewAction };

export function ProductReviewActions({ productId, status }: { productId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Definition | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const actions: ProductReviewAction[] =
    status === 'submitted'
      ? ['start_review']
      : status === 'under_review'
        ? ['request_changes', 'approve', 'reject']
        : status === 'approved'
          ? ['publish']
          : [];

  if (actions.length === 0) return <p className="text-sm leading-6 text-muted-foreground">No review action is available for this product status.</p>;

  function prepare(action: ProductReviewAction) {
    setError('');
    if (action !== 'start_review' && reason.trim().length < 8) {
      setError('Add a clear review note of at least 8 characters first.');
      return;
    }
    setSelected({ action, ...definitions[action] });
  }

  async function submit() {
    if (!selected) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: selected.action, reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Product review failed.');
      setSelected(null);
      setReason('');
      router.refresh();
    } catch (caught) {
      setSelected(null);
      setError(caught instanceof Error ? caught.message : 'Product review failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {status !== 'submitted' ? (
        <div className="space-y-2"><label htmlFor="product-review-note" className="text-sm font-semibold">Review note</label><Textarea id="product-review-note" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={5} placeholder={status === 'approved' ? 'Record why this approved product is ready for publication.' : 'Record the checks completed and reason for the decision.'} /><p className="text-xs text-muted-foreground">This note becomes part of the permanent audit history.</p></div>
      ) : null}
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => { const definition = definitions[action]; const Icon = definition.icon; return <Button key={action} variant={definition.variant} disabled={pending} onClick={() => prepare(action)}><Icon />{definition.label}</Button>; })}
      </div>
      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{selected?.title}</AlertDialogTitle><AlertDialogDescription>{selected?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction variant={selected?.variant === 'destructive' ? 'destructive' : 'default'} disabled={pending} onClick={submit}>{pending ? 'Saving…' : selected?.label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
