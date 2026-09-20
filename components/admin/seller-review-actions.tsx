'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FilePenLine, SearchCheck, XCircle } from 'lucide-react';

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
import type { SellerReviewAction } from '@/lib/db/repositories/seller-applications';

interface ActionDefinition {
  action: SellerReviewAction;
  label: string;
  title: string;
  description: string;
  variant: 'default' | 'outline' | 'destructive';
  icon: typeof CheckCircle2;
}

const definitions: Record<SellerReviewAction, ActionDefinition> = {
  start_review: {
    action: 'start_review',
    label: 'Start review',
    title: 'Start reviewing this application?',
    description:
      'The application will move into the review queue and the action will be recorded.',
    variant: 'default',
    icon: SearchCheck,
  },
  request_changes: {
    action: 'request_changes',
    label: 'Request changes',
    title: 'Send this application back for changes?',
    description:
      'The seller will need to correct the issues in your review note before resubmitting.',
    variant: 'outline',
    icon: FilePenLine,
  },
  approve_for_activation: {
    action: 'approve_for_activation',
    label: 'Approve for activation',
    title: 'Approve this maker for activation readiness?',
    description:
      'This records maker readiness only. It does not enable selling, assign a legal seller or invoice issuer, publish products, or activate an unreviewed commercial model.',
    variant: 'default',
    icon: CheckCircle2,
  },
  approve: {
    action: 'approve',
    label: 'Approve seller',
    title: 'Approve this seller?',
    description:
      'Documents will be marked verified and the account will receive seller access.',
    variant: 'default',
    icon: CheckCircle2,
  },
  reject: {
    action: 'reject',
    label: 'Reject application',
    title: 'Reject this application?',
    description:
      'This closes the current application. The reason is retained in the audit history.',
    variant: 'destructive',
    icon: XCircle,
  },
};

export function SellerReviewActions({
  sellerId,
  status,
  participationRoute,
  applicationStage,
}: {
  sellerId: string;
  status: string;
  participationRoute?: 'registered_seller' | 'managed_maker' | null;
  applicationStage?: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<ActionDefinition | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [payoutAccountReference, setPayoutAccountReference] = useState('');
  const [settlementTermsReference, setSettlementTermsReference] = useState('');

  const available = applicationStage === 'approved_for_activation'
    ? []
    : status === 'submitted'
      ? [definitions.start_review]
      : status === 'under_review'
        ? participationRoute === 'managed_maker' ? [
            definitions.request_changes,
            definitions.approve_for_activation,
            definitions.reject,
          ] : [
            definitions.request_changes,
            definitions.approve,
            definitions.reject,
          ]
        : [];

  if (available.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No review action is available for this application status.
      </p>
    );
  }

  function prepare(definition: ActionDefinition) {
    setError('');
    if (definition.action !== 'start_review' && reason.trim().length < 8) {
      setError('Add a clear review note of at least 8 characters first.');
      return;
    }
    setSelected(definition);
  }

  async function submit() {
    if (!selected) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/seller-applications/${encodeURIComponent(sellerId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: selected.action,
            reason,
            payoutAccountReference,
            settlementTermsReference,
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Review action failed.');
      setSelected(null);
      setReason('');
      router.refresh();
    } catch (caught) {
      setSelected(null);
      setError(caught instanceof Error ? caught.message : 'Review action failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {status === 'under_review' ? (
        <div className="space-y-2">
          <label htmlFor="review-note" className="text-sm font-semibold">
            Review note
          </label>
          <Textarea
            id="review-note"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="Record the documents checked and the reason for this decision."
          />
          <p className="text-xs text-muted-foreground">
            This note becomes part of the permanent moderation history.
          </p>
          {participationRoute !== 'managed_maker' ? <><label htmlFor="payout-account-reference" className="block text-sm font-semibold">
            Verified receiving-account reference
          </label>
          <input
            id="payout-account-reference"
            value={payoutAccountReference}
            onChange={(event) => setPayoutAccountReference(event.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Internal verification record reference"
          />
          <label htmlFor="settlement-terms-reference" className="block text-sm font-semibold">
            Written payout method and settlement schedule reference
          </label>
          <input
            id="settlement-terms-reference"
            value={settlementTermsReference}
            onChange={(event) => setSettlementTermsReference(event.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Signed agreement or approved record reference"
          />
          <p className="text-xs text-muted-foreground">
            Both references and bank evidence are required only when approving a seller. Do not enter full bank credentials here.
          </p>
          </> : <p className="text-xs text-muted-foreground">Managed Maker approval records maker readiness only. Commercial model, legal seller, invoice issuer, supplier/payment requirements, and the reviewed agreement remain separate activation conditions.</p>}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {available.map((definition) => {
          const Icon = definition.icon;
          return (
            <Button
              key={definition.action}
              variant={definition.variant}
              disabled={pending}
              onClick={() => prepare(definition)}
            >
              <Icon />
              {definition.label}
            </Button>
          );
        })}
      </div>

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={selected?.variant === 'destructive' ? 'destructive' : 'default'}
              disabled={pending}
              onClick={submit}
            >
              {pending ? 'Saving…' : selected?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
