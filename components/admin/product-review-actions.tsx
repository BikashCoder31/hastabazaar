'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
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
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const FORM_ID = 'staff.product-review';
const BASE_KEYS = ['action', 'reason', 'requestId', 'formVersion'];
// Hydrate the absent server snapshot; own attempt mutations rerender the client.
const subscribeToAttempt = () => () => undefined;

const definitions = {
  start_review: { label: 'Start review', title: 'Start reviewing this product?', description: 'The listing will move into active review.', variant: 'default', icon: SearchCheck },
  request_changes: { label: 'Request changes', title: 'Return this listing for changes?', description: 'The seller will see your review note and must correct the listing.', variant: 'outline', icon: FilePenLine },
  approve: { label: 'Approve product', title: 'Approve this product?', description: 'Approval confirms the listing meets HastaBazaar’s catalogue requirements. It remains private until published.', variant: 'default', icon: CheckCircle2 },
  publish: { label: 'Publish product', title: 'Publish this product?', description: 'The product will immediately become visible in the public HastaBazaar shop.', variant: 'default', icon: Globe2 },
  unpublish: { label: 'Unpublish product', title: 'Unpublish this product?', description: 'The product will leave the storefront and return to review. Existing orders remain unchanged.', variant: 'destructive', icon: XCircle },
  reject: { label: 'Reject product', title: 'Reject this product?', description: 'The listing will be closed with your reason in its permanent review history.', variant: 'destructive', icon: XCircle },
} as const;

type Definition = (typeof definitions)[keyof typeof definitions] & { action: ProductReviewAction };

export function ProductReviewActions({ productId, status, canUnpublish = false, canPublish = false }: { productId: string; status: string; canUnpublish?: boolean; canPublish?: boolean }) {
  const router = useRouter();
  const catalog = usePublishedFormConfig(FORM_ID);
  const formRef = useRef<HTMLFormElement>(null);
  const fingerprint = useRef<string | null>(null);
  const attemptKey = sessionAttemptKey(FORM_ID, productId);
  const [, setAttemptRevision] = useState(0);
  const attemptPresent = useSyncExternalStore(subscribeToAttempt,
    () => hasSessionAttempt(attemptKey), () => false);
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
          ? (canPublish ? ['publish'] : [])
          : status === 'published' && canUnpublish ? ['unpublish'] : [];

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
    if (!catalog.canSubmit || !catalog.config || !formRef.current) {
      setError(catalog.message || 'Form configuration is unavailable.'); return;
    }
    setPending(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
      const payload = { action: selected.action, reason,
        ...configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS) };
      const currentFingerprint = JSON.stringify(payload);
      if (fingerprint.current && fingerprint.current !== currentFingerprint)
        throw new Error('This differs from the prior attempt. Check its outcome, then explicitly start a new attempt.');
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setAttemptRevision((revision) => revision + 1); fingerprint.current = currentFingerprint;
      const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId }),
      });
      const result = (await response.json().catch(() => null)) as { status?: unknown; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error || 'Product review failed.');
      const expectedStatus = { start_review: 'under_review', request_changes: 'needs_changes',
        approve: 'approved', publish: 'published', unpublish: 'under_review', reject: 'rejected' }[selected.action];
      if (result?.status !== expectedStatus)
        throw new Error('The response could not confirm this product action. Retry the same attempt.');
      clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); fingerprint.current = null;
      setSelected(null);
      setReason('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product review failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} data-form-id={FORM_ID} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      {status !== 'submitted' ? (
        <div className="space-y-2"><label htmlFor="product-review-note" className="text-sm font-semibold">Review note</label><Textarea id="product-review-note" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={5} placeholder={status === 'approved' ? 'Record why this approved product is ready for publication.' : 'Record the checks completed and reason for the decision.'} /><p className="text-xs text-muted-foreground">This note becomes part of the permanent audit history.</p></div>
      ) : null}
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
      {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
      {attemptPresent ? <p className="text-xs text-muted-foreground">A prior product decision may have succeeded. Retry only identical details, or check its status before starting a new attempt.</p> : null}
      {attemptPresent ? <Button type="button" variant="outline" disabled={pending}
        onClick={() => { if (window.confirm('A product decision may already have succeeded. Check its status first. Start a new request reference?')) {
          clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); fingerprint.current = null; setError('');
          if (catalog.status === 'stale') catalog.refresh();
        } }}>Start a new attempt</Button> : null}
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => { const definition = definitions[action]; const Icon = definition.icon; return <Button key={action} type="button" variant={definition.variant} disabled={pending || !catalog.canSubmit} onClick={() => prepare(action)}><Icon />{definition.label}</Button>; })}
      </div>
      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{selected?.title}</AlertDialogTitle><AlertDialogDescription>{selected?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction variant={selected?.variant === 'destructive' ? 'destructive' : 'default'} disabled={pending || !catalog.canSubmit} onClick={submit}>{pending ? 'Saving…' : selected?.label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
