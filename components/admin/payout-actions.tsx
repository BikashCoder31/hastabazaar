'use client';
import { useId, useState } from 'react';
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
        <output className="block mt-2 text-sm text-muted-foreground">
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
}: {
  sellerId: string;
  sellerName: string;
  amount: string;
}) {
  const { send, pending, error } = useAdminMutation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const id = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        Prepare payout
      </DialogTrigger>
      <DialogContent
        showCloseButton={!pending}
        className="admin-workspace max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Prepare {sellerName}’s payout</DialogTitle>
          <DialogDescription>
            The displayed eligible balance is {amount}. The server rechecks the
            available balance when saving. Preparation reserves entries; it does
            not send money. A different Super Admin must approve.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(
              '/api/admin/payouts',
              { sellerId, note },
              'idempotencyKey',
            ).then((ok) => {
              if (ok) {
                setOpen(false);
                setNote('');
              }
            });
          }}
          className="space-y-4"
        >
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
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || note.trim().length < 8}>
              {pending ? 'Preparing…' : 'Prepare for approval'}
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
    'Confirm that you independently reviewed the prepared balance and destination. This records approval; it does not transfer money.',
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
  const { send, pending, error } = useAdminMutation();
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
  const id = useId();
  if (!permitted.length)
    return (
      <p className="rounded-xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
        {isPreparer && (status === 'prepared' || status === 'scheduled')
          ? 'You prepared this payout. A different Super Admin must approve or reject it.'
          : status === 'paid' || status === 'rejected' || status === 'reversed'
            ? 'This payout has no further actions at this stage. Its history remains available below.'
            : 'No payout action is available for your role at this stage. A Super Admin handles independent approval and payment recording.'}
      </p>
    );
  const effectiveAction = permitted.includes(action) ? action : permitted[0];
  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setConfirm(true);
        }}
        className="space-y-4"
      >
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
          {error && !confirm ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              pending ||
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
          void send(
            '/api/admin/payouts/' + encodeURIComponent(payoutId),
            { action: effectiveAction, note, providerReference: reference },
            'idempotencyKey',
          ).then((ok) => {
            if (ok) {
              setConfirm(false);
              setNote('');
              setReference('');
            }
          });
        }}
      />
    </div>
  );
}
