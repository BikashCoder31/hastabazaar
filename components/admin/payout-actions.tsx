'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
import { availablePayoutActions } from '@/lib/admin/payout-actions';
import type {
  PayoutOperation,
  PayoutStatus,
} from '@/lib/db/repositories/payouts';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const prepareBaseKeys = ['sellerId', 'note', 'idempotencyKey', 'formVersion', 'customAnswers'];
const actionBaseKeys = ['action', 'note', 'providerReference', 'idempotencyKey', 'formVersion', 'customAnswers'];

export function AccrueEarningsButton() {
  const { send, pending, error } = useAdminMutation();
  const [done, setDone] = useState(false);
  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          setDone(false);
          void send('/api/admin/payouts/accrue', {}, 'idempotencyKey').then(
            setDone,
          );
        }}
      >
        {pending ? 'Checking…' : 'Accrue delivered earnings'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <output aria-live="polite" className="block mt-2 text-sm text-muted-foreground">
          Delivered earnings checked and missing entries recorded.
        </output>
      ) : null}
    </div>
  );
}

export function PreparePayoutButton({
  sellerId,
  sellerName,
  amount,
  role = 'admin',
}: {
  sellerId: string;
  sellerName: string;
  amount: string;
  role?: 'admin' | 'super_admin';
}) {
  const directApproval = role === 'super_admin';
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const attemptKey = sessionAttemptKey('staff.payout-1', sellerId);
  useEffect(() => { const timer = window.setTimeout(() => setRetry(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const catalog = usePublishedFormConfig('staff.payout-1');
  const id = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        {directApproval ? 'Create approved payout' : 'Prepare payout'}
      </DialogTrigger>
      <DialogContent
        showCloseButton={!pending}
        className="admin-workspace max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{directApproval ? 'Create approved payout for ' : 'Prepare payout for '}{sellerName}</DialogTitle>
          <DialogDescription>
            The displayed eligible balance is {amount}. The server rechecks the
            available balance when saving. Preparation reserves entries; it does
            not send money. {directApproval ? 'Your payout is approved when saved. Payment recording remains a separate action.' : 'Super Admin approval is required.'}
          </DialogDescription>
        </DialogHeader>
        <form
          data-form-id="staff.payout-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!catalog.config || !catalog.canSubmit) return;
            let configured: ReturnType<typeof configuredJsonPayload>;
            try {
              const values = readConfiguredSubmission(event.currentTarget, catalog.config, prepareBaseKeys);
              configured = configuredJsonPayload(catalog.config, values.answers, prepareBaseKeys);
            } catch (cause) {
              setFormError(cause instanceof Error ? cause.message : 'Review the configured fields.');
              return;
            }
            setFormError('');
            setPending(true);
            setRetry(true);
            void (async () => {
              try {
                const idempotencyKey = getOrCreateSessionAttempt(attemptKey);
                const response = await fetch('/api/admin/payouts', { method: 'POST', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ sellerId, note, ...configured, idempotencyKey }) });
                const result = await response.json().catch(() => null) as { id?: string; duplicate?: boolean; error?: string; code?: string } | null;
                if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
                if (!response.ok) throw new Error(result?.error ?? 'Payout preparation failed. Retry the same request.');
                if (typeof result?.id !== 'string' || !result.id.trim() || typeof result.duplicate !== 'boolean') throw new Error('The response could not confirm preparation. Retry the same request.');
                clearSessionAttempt(attemptKey); setRetry(false); setOpen(false); setNote(''); router.refresh();
              } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payout preparation failed.'); }
              finally { setPending(false); }
            })();
          }}
          className="space-y-4"
        >
      <FormGuide formId="staff.payout-1" />

          <div>
            <Label htmlFor={id}>Preparation note</Label>
            <Textarea
              id={id}
              className="mt-2"
              value={note}
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
              required
              minLength={8}
              maxLength={1000}
              placeholder="Confirm the payout period and reviewed balance."
            />
          </div>
          <Link href="/admin/staff-form-history?kind=payout-preparation" className="block text-sm underline">View payout preparation form history</Link>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={prepareBaseKeys} /> : null}
          {!catalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p> : null}
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {retry ? <div className="space-y-2 text-xs text-muted-foreground"><p>A payout preparation may already have succeeded. Check its history before retrying. Changed details keep the same request reference and may conflict.</p><Button type="button" variant="outline" disabled={pending} onClick={() => {
            if (!window.confirm('A prior payout preparation may already have succeeded. Check the payout first. Starting a new attempt may duplicate it. Continue?')) return;
            clearSessionAttempt(attemptKey); setRetry(false); setError('');
            if (catalog.status === 'stale') catalog.refresh();
          }}>Start a new attempt</Button></div> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !catalog.canSubmit || note.trim().length < 8}>
              {pending ? 'Saving…' : directApproval ? 'Create approved payout' : 'Prepare for approval'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const actionLabels: Record<PayoutOperation, string> = {
  approve: 'Approve payout',
  reject: 'Reject payout',
  start_processing: 'Start processing',
  mark_paid: 'Record verified payment',
  mark_failed: 'Record payment failure',
};
const explanations: Record<PayoutOperation, string> = {
  approve:
    'Confirm that you reviewed the prepared balance and destination. This records approval; it does not transfer money.',
  reject:
    'This rejects the prepared payout and releases its reserved ledger entries. The decision and note are retained.',
  start_processing:
    'This records that manual payment processing has started. No bank or payment-provider request is made.',
  mark_paid:
    'Only continue after independently verifying that the transfer occurred. The reference and settlement will be recorded in the ledger. This action does not send money.',
  mark_failed:
    'This records an unsuccessful payment attempt. Include the actual failure reason in your note.',
};

export function PayoutWorkflowActions({
  payoutId,
  status,
  canApprove,
  canProcess,
  isPreparer,
}: {
  payoutId: string;
  status: PayoutStatus;
  canApprove: boolean;
  canProcess: boolean;
  isPreparer: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const catalog = usePublishedFormConfig('staff.payout-2');
  const permitted = availablePayoutActions(status, {
    canApprove,
    canProcess,
    isPreparer,
  });
  const [action, setAction] = useState<PayoutOperation>(
    permitted[0] ?? 'approve',
  );
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [configured, setConfigured] = useState<ReturnType<typeof configuredJsonPayload> | null>(null);
  const [formError, setFormError] = useState('');
  const id = useId();
  const effectiveAction = permitted.includes(action) ? action : (permitted[0] ?? 'approve');
  const attemptKey = sessionAttemptKey('staff.payout-2', payoutId + ':' + effectiveAction);
  useEffect(() => { const timer = window.setTimeout(() => setRetry(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  if (!permitted.length)
    return (
      <div className="space-y-2">
      <p className="rounded-xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
        {status === 'paid' || status === 'rejected' || status === 'reversed'
            ? 'This payout has no further actions at this stage. Its history remains available below.'
            : 'No payout action is available for your role at this stage. A Super Admin handles approval and payment recording.'}
      </p>
      <Link href={`/admin/staff-form-history?kind=${canApprove || canProcess ? 'payout-action' : 'payout-preparation'}&id=${encodeURIComponent(payoutId)}`} className="block text-sm underline">View payout form history</Link>
      </div>
    );
  return (
    <div className="space-y-4">
      <form
        data-form-id="staff.payout-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!catalog.config || !catalog.canSubmit) return;
          try {
            const values = readConfiguredSubmission(event.currentTarget, catalog.config, actionBaseKeys);
            setConfigured(configuredJsonPayload(catalog.config, values.answers, actionBaseKeys));
            setFormError('');
          } catch (cause) {
            setFormError(cause instanceof Error ? cause.message : 'Review the configured fields.');
            return;
          }
          setConfirm(true);
        }}
        className="space-y-4"
      >
      <FormGuide formId="staff.payout-2" />

        <fieldset disabled={pending} className="space-y-4">
          <div>
            <Label htmlFor={id + '-action'}>Next action</Label>
            <select
              id={id + '-action'}
              value={effectiveAction}
              onChange={(event) =>
                setAction(event.target.value as PayoutOperation)
              }
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
            >
              {permitted.map((item) => (
                <option key={item} value={item}>
                  {actionLabels[item]}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {explanations[effectiveAction]}
          </p>
          <div>
            <Label htmlFor={id + '-note'}>Operational note</Label>
            <Textarea
              id={id + '-note'}
              className="mt-2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              minLength={8}
              maxLength={1000}
            />
          </div>
          {effectiveAction === 'mark_paid' ? (
            <div>
              <Label htmlFor={id + '-reference'}>
                Verified bank or provider reference
              </Label>
              <Input
                id={id + '-reference'}
                className="mt-2"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                required
                minLength={4}
                maxLength={160}
              />
            </div>
          ) : null}
          <Link href={`/admin/staff-form-history?kind=payout-action&id=${encodeURIComponent(payoutId)}`} className="block text-sm underline">View payout action form history</Link>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={actionBaseKeys} /> : null}
          {!catalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p> : null}
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
          {error && !confirm ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {retry ? <div className="space-y-2 text-xs text-muted-foreground"><p>A payout action may already have succeeded. Check the payout before retrying. Changed details keep the same request reference and may conflict.</p><Button type="button" variant="outline" disabled={pending} onClick={() => {
            if (!window.confirm('A prior payout action may already have succeeded. Check the payout first. Starting a new attempt may duplicate it. Continue?')) return;
            clearSessionAttempt(attemptKey); setRetry(false); setError('');
            if (catalog.status === 'stale') catalog.refresh();
          }}>Start a new attempt</Button></div> : null}
          <Button
            type="submit"
            disabled={
              pending || !catalog.canSubmit ||
              note.trim().length < 8 ||
              (effectiveAction === 'mark_paid' && reference.trim().length < 4)
            }
          >
            Review decision
          </Button>
        </fieldset>
      </form>
      <ConfirmOperation
        open={confirm}
        onOpenChange={setConfirm}
        title={actionLabels[effectiveAction] + '?'}
        description={explanations[effectiveAction]}
        pending={pending}
        error={error}
        onConfirm={() => {
          if (!configured) return;
          setPending(true); setRetry(true); setError('');
          void (async () => {
            try {
              const idempotencyKey = getOrCreateSessionAttempt(attemptKey);
              const response = await fetch('/api/admin/payouts/' + encodeURIComponent(payoutId), { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: effectiveAction, note, providerReference: reference, ...configured, idempotencyKey }) });
              const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string } | null;
              if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
              if (!response.ok) throw new Error(result?.error ?? 'Payout action failed. Retry the same request.');
              if (result?.ok !== true) throw new Error('The response could not confirm this action. Retry the same request.');
              clearSessionAttempt(attemptKey); setRetry(false); setConfirm(false); setNote(''); setReference(''); setConfigured(null); router.refresh();
            } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payout action failed.'); }
            finally { setPending(false); }
          })();
        }}
      />
    </div>
  );
}
