'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
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
  canApproveStandard?: boolean;
};

const operationLabels: Record<string, string> = {
  mark_in_transit: 'Mark return in transit',
  mark_received: 'Mark return received',
  resolve_replacement: 'Complete replacement',
  resolve_return_to_origin: 'Complete return to origin',
  start_refund: 'Start refund processing',
  complete_refund: 'Mark refund paid',
  fail_refund: 'Mark refund failed',
};

export function ReturnCaseActions(props: Props) {
  const router = useRouter();
  const catalog = usePublishedFormConfig('staff.return-case-action');
  const formRef = useRef<HTMLFormElement>(null);
  const [action, setAction] = useState('request_changes');
  const [outcome, setOutcome] = useState('refund');
  const [responsibility, setResponsibility] = useState('seller');
  const [itemRefund, setItemRefund] = useState('');
  const [deliveryRefund, setDeliveryRefund] = useState('0');
  const [reference, setReference] = useState('');
  const [restockQuantity, setRestockQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [failedAttemptKey, setFailedAttemptKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const reviewable = props.canApproveStandard && [
    'requested',
    'under_investigation',
    'needs_customer_changes',
  ].includes(props.status);
  const highValue =
    props.status === 'pending_high_value_approval' &&
    props.role === 'super_admin';
  const operations = props.canApproveStandard ? availableOperations(
    props.status,
    props.outcome,
    props.refundStatus,
  ) : [];

  async function send(endpoint: string, body: Record<string, unknown>) {
    if (!catalog.canSubmit || !catalog.config || !formRef.current) {
      setError(catalog.message || 'Return form configuration is unavailable.');
      return;
    }
    setPending(true);
    setError('');
    setFailedAttemptKey(null);
    let attemptKey: string | null = null;
    try {
      const builtIns = ['action', 'decision', 'outcome', 'responsibility', 'itemRefundPaisa',
        'deliveryRefundPaisa', 'reference', 'restockQuantity', 'note', 'publicMessageEn',
        'publicMessageNe', 'idempotencyKey', 'formVersion'];
      const configured = readConfiguredSubmission(formRef.current, catalog.config, builtIns);
      const actionName = String(body.action ?? body.decision);
      attemptKey = sessionAttemptKey('staff.return-case-action',
        `${props.id}:${endpoint.split('/').at(-1)}:${actionName}`);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          note,
          publicMessageEn: messageEn,
          publicMessageNe: messageEn,
          sourceFormId: 'staff.return-case-action',
          ...configuredJsonPayload(catalog.config, configured.answers, builtIns),
          idempotencyKey: requestId,
        }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(result?.error || 'The case could not be updated.');
      if (result?.ok !== true) throw new Error('The return action could not be confirmed. Retry the same attempt.');
      clearSessionAttempt(attemptKey);
      setNote('');
      setMessageEn('');
      setReference('');
      router.refresh();
    } catch (cause) {
      setFailedAttemptKey(attemptKey);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The case could not be updated.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!reviewable && !highValue && operations.length === 0)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No administrative action is currently available.
      </p>
    );
  return (
    <form ref={formRef} data-form-id="staff.return-case-action" className="space-y-5"
      onSubmit={(event) => event.preventDefault()}>
      {reviewable ? (
        <>
          <Field label="Decision">
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="request_changes">Request customer changes</option>
              <option value="reject">Reject</option>
              <option value="approve">Approve</option>
            </select>
          </Field>
          {action === 'approve' ? (
            <>
              <Field label="Outcome">
                <select
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="refund">Refund</option>
                  <option value="replacement">Replacement</option>
                  <option value="return_to_origin">Return to origin</option>
                </select>
              </Field>
              <Field label="Responsible party">
                <select
                  value={responsibility}
                  onChange={(event) => setResponsibility(event.target.value)}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="seller">Seller</option>
                  <option value="carrier">Carrier</option>
                  <option value="platform">HastaBazaar</option>
                  <option value="buyer">Customer</option>
                </select>
              </Field>
              {outcome === 'refund' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Item refund (NPR)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemRefund}
                      onChange={(event) => setItemRefund(event.target.value)}
                    />
                  </Field>
                  <Field label="Delivery refund (NPR)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={deliveryRefund}
                      onChange={(event) =>
                        setDeliveryRefund(event.target.value)
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {highValue ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          This high-value refund needs a different Super Admin from the person
          who proposed it.
        </div>
      ) : null}
      {operations.length ? (
        <Field label="Operation">
          <select
            value={operations.includes(action) ? action : operations[0]}
            onChange={(event) => setAction(event.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {operations.map((value) => (
              <option key={value} value={value}>
                {operationLabels[value]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {operations.some((value) =>
        [
          'mark_in_transit',
          'resolve_replacement',
          'resolve_return_to_origin',
          'complete_refund',
        ].includes(value),
      ) ? (
        <Field label="Shipment, replacement, or payment reference">
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={120}
          />
        </Field>
      ) : null}
      {operations.some((value) =>
        [
          'resolve_replacement',
          'resolve_return_to_origin',
          'complete_refund',
        ].includes(value),
      ) ? (
        <Field label={`Restock quantity (0–${props.quantity})`}>
          <Input
            type="number"
            min={0}
            max={props.quantity}
            value={restockQuantity}
            onChange={(event) => setRestockQuantity(event.target.value)}
          />
        </Field>
      ) : null}
      <Field label="Internal investigation note">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          minLength={8}
          maxLength={2000}
        />
      </Field>
      <Field label="Customer message">
        <Textarea
          value={messageEn}
          onChange={(event) => setMessageEn(event.target.value)}
          minLength={8}
          maxLength={1000}
        />
      </Field>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={['action', 'decision', 'outcome',
        'responsibility', 'itemRefundPaisa', 'deliveryRefundPaisa', 'reference', 'restockQuantity',
        'note', 'publicMessageEn', 'publicMessageNe', 'idempotencyKey', 'formVersion']} /> : null}
      {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {failedAttemptKey ? <Button type="button" variant="outline" disabled={pending}
        onClick={() => {
          if (!window.confirm('This case action may already have succeeded. Check its latest history before starting a new attempt, which could duplicate the action. Continue?')) return;
          clearSessionAttempt(failedAttemptKey);
          if (catalog.status === 'stale') catalog.refresh();
          setFailedAttemptKey(null);
          setError('New attempt ready. Review the latest case history before submitting again.');
        }}>Start a new attempt</Button> : null}
      {reviewable ? (
        <Button
          disabled={
            pending || !catalog.canSubmit || note.trim().length < 8 || messageEn.trim().length < 8
          }
          onClick={() =>
            void send(
              `/api/admin/returns/${encodeURIComponent(props.id)}/review`,
              {
                action,
                outcome: action === 'approve' ? outcome : undefined,
                responsibility:
                  action === 'approve' ? responsibility : undefined,
                itemRefundPaisa: Math.round(Number(itemRefund || 0) * 100),
                deliveryRefundPaisa: Math.round(
                  Number(deliveryRefund || 0) * 100,
                ),
              },
            )
          }
        >
          {pending ? 'Saving…' : 'Save decision'}
        </Button>
      ) : highValue ? (
        <div className="flex gap-2">
          <Button
            disabled={
              pending || !catalog.canSubmit || note.trim().length < 8 || messageEn.trim().length < 8
            }
            onClick={() =>
              void send(
                `/api/admin/returns/${encodeURIComponent(props.id)}/high-value`,
                { decision: 'approve' },
              )
            }
          >
            Approve high-value refund
          </Button>
          <Button
            variant="destructive"
            disabled={
              pending || !catalog.canSubmit || note.trim().length < 8 || messageEn.trim().length < 8
            }
            onClick={() =>
              void send(
                `/api/admin/returns/${encodeURIComponent(props.id)}/high-value`,
                { decision: 'reject' },
              )
            }
          >
            Reject
          </Button>
        </div>
      ) : operations.length ? (
        <Button
          disabled={
            pending || !catalog.canSubmit || note.trim().length < 8 || messageEn.trim().length < 8
          }
          onClick={() =>
            void send(
              `/api/admin/returns/${encodeURIComponent(props.id)}/operations`,
              {
                action: operations.includes(action) ? action : operations[0],
                reference,
                restockQuantity: Number(restockQuantity),
              },
            )
          }
        >
          {pending
            ? 'Saving…'
            : operationLabels[
                operations.includes(action) ? action : operations[0]
              ]}
        </Button>
      ) : null}
    </form>
  );
}

function availableOperations(
  status: string,
  outcome: string | null,
  refundStatus: string | null,
): string[] {
  if (
    status === 'approved' &&
    outcome === 'refund' &&
    refundStatus === 'approved'
  )
    return ['mark_in_transit', 'start_refund'];
  if (status === 'approved' && outcome === 'replacement')
    return ['mark_in_transit', 'resolve_replacement'];
  if (status === 'approved' && outcome === 'return_to_origin')
    return ['mark_in_transit', 'resolve_return_to_origin'];
  if (status === 'in_transit') return ['mark_received'];
  if (
    status === 'received' &&
    outcome === 'refund' &&
    refundStatus === 'approved'
  )
    return ['start_refund'];
  if (status === 'received' && outcome === 'replacement')
    return ['resolve_replacement'];
  if (status === 'received' && outcome === 'return_to_origin')
    return ['resolve_return_to_origin'];
  if (refundStatus === 'processing') return ['complete_refund', 'fail_refund'];
  if (
    ['approved', 'received'].includes(status) &&
    outcome === 'refund' &&
    refundStatus === 'failed'
  )
    return ['start_refund'];
  return [];
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
