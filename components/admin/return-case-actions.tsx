'use client';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';

import { FormGuide } from '@/components/forms/form-guide';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import { useRouter } from 'next/navigation';
import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import type { ReturnCaseDetail } from '@/lib/db/repositories/returns';

type Props = {
  actorId:string;
  id: string;
  status: string;
  outcome: string | null;
  refundStatus: string | null;
  role: 'admin' | 'super_admin';
  quantity: number;
  deliveryEntitlement?:{kind:string;amountPaisa:number|null};
  pricingEntitlement?: ReturnCaseDetail['pricingEntitlement'];
  canApproveStandard?: boolean;
  variationCheck?: { sellerResponded: boolean };
};

const variationQuestions = [
  'Does the listing say it’s handmade?',
  'Is the colour within what the photos showed?',
  'Is it safe and does it work as intended?',
  'Is it still the same product as listed?',
] as const;
type DecisionShortcut = 'refund' | 'close' | 'exchange' | 'photo' | 'other';

const builtIns = ['action', 'decision', 'outcome', 'responsibility', 'itemRefundPaisa',
  'deliveryRefundPaisa', 'reference', 'restockQuantity', 'note', 'publicMessageEn',
  'publicMessageNe', 'idempotencyKey', 'formVersion', 'decisionEvidenceReference', 'correctSellerFulfillment'];

const operationLabels: Record<string, string> = {
  mark_in_transit: 'Mark return in transit',
  mark_received: 'Mark return received',
  resolve_replacement: 'Complete replacement',
  resolve_return_to_origin: 'Complete return to origin',
  close_paid_refund: 'Close paid refund after physical disposition',
  start_refund: 'Start refund processing',
  complete_refund: 'Mark refund paid',
  fail_refund: 'Mark refund failed',
};

export function ReturnCaseActions(props: Props) {
  const scope=useOwnedFormScope(JSON.stringify([props.actorId,props.id]));
  return <ScopedReturnCaseActions key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}
function ScopedReturnCaseActions(props:Props&{isCurrent:()=>boolean}){
  const router = useRouter();
  const catalog = usePublishedFormConfig('staff.return-case-action');
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const decisionFormId = useId();
  const focusDecision = useRef(false);
  const [variation, setVariation] = useState<Record<number, 'yes' | 'no'>>({});
  const [shortcut, setShortcut] = useState<DecisionShortcut | null>(null);
  const [action, setAction] = useState('request_changes');
  const [outcome, setOutcome] = useState('');
  const [responsibility, setResponsibility] = useState('');
  const [decisionEvidenceReference, setDecisionEvidenceReference] = useState('');
  const [correctSellerFulfillment, setCorrectSellerFulfillment] = useState(false);
  const [itemRefund, setItemRefund] = useState('');
  const deliveryRefund = props.deliveryEntitlement?.amountPaisa===null?'':((props.deliveryEntitlement?.amountPaisa??0)/100).toFixed(2);
  const [reference, setReference] = useState('');
  const [restockQuantity, setRestockQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [failedAttemptKey, setFailedAttemptKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [accessDenied,setAccessDenied]=useState(false);
  useEffect(() => {
    if (!shortcut || !focusDecision.current) return;
    focusDecision.current = false;
    messageRef.current?.focus();
  }, [shortcut]);
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
  ).filter(action=>!['mark_in_transit','mark_received','start_refund','complete_refund','fail_refund'].includes(action)) : [];
  const originalRefund = action === 'approve' && outcome === 'refund' ? props.pricingEntitlement : null;
  const retainVoluntaryDelivery = originalRefund?.kind === 'ready' &&
    originalRefund.canRetainVoluntaryDelivery === true && responsibility === 'buyer';
  const pricedRefund = retainVoluntaryDelivery ? {
    ...originalRefund,
    deliveryPaisa: 0,
    cashPaisa: originalRefund.cashPaisa - originalRefund.deliveryPaisa,
  } : originalRefund;
  const requiresDecisionEvidence = pricedRefund?.kind === 'ready' && pricedRefund.usesVariantPricing !== false;
  const requiresSellerConfirmation = requiresDecisionEvidence && (responsibility === 'carrier' || responsibility === 'platform');
  const evidenceReady = (!requiresDecisionEvidence || decisionEvidenceReference.trim().length >= 8) &&
    (!requiresSellerConfirmation || correctSellerFulfillment);
  const approvalReady = action !== 'approve' || Boolean(outcome && responsibility && evidenceReady &&
    pricedRefund?.kind !== 'needs_reconciliation');
  const useVariation = reviewable && props.variationCheck !== undefined;
  const differentFromListing = variationQuestions.some((_, index) => variation[index] === 'no');
  const normalVariation = variationQuestions.every((_, index) => variation[index] === 'yes');
  const cashQuote = props.pricingEntitlement?.kind === 'ready' ? formatPaisaExact(props.pricingEntitlement.cashPaisa) : null;

  function openDecision(next: DecisionShortcut) {
    if (pending || failedAttemptKey) return;
    setError('');
    if (next === 'refund') {
      setAction('approve');
      setOutcome('refund');
      if (next !== shortcut) setResponsibility('');
    } else {
      setAction(next === 'close' ? 'reject' : 'request_changes');
      setOutcome('');
    }
    setCorrectSellerFulfillment(false);
    if (next === shortcut) {
      messageRef.current?.focus();
    } else {
      focusDecision.current = true;
      setShortcut(next);
    }
  }

  async function send(endpoint: string, body: Record<string, unknown>) {
    if(!props.isCurrent())return;
    if (!catalog.canSubmit || !catalog.config || !formRef.current) {
      setError(catalog.message || 'Return form configuration is unavailable.');
      return;
    }
    setPending(true);
    setError('');
    setFailedAttemptKey(null);
    let attemptKey: string | null = null;
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, builtIns);
      const actionName = String(body.action ?? body.decision);
      attemptKey = sessionAttemptKey('staff.return-case-action',
        JSON.stringify([props.actorId,props.id,endpoint.split('/').at(-1),actionName]));
      const requestId = getOrCreateSessionAttempt(attemptKey);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [ACTOR_INTENT_HEADER]: props.actorId },
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
      if(!props.isCurrent())return;
      if(response.status===401||response.status===403){setNote('');setMessageEn('');setDecisionEvidenceReference('');setCorrectSellerFulfillment(false);formRef.current?.reset();setAccessDenied(true);router.refresh();throw new Error('The current account or case access changed. Reopen this original record.');}
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(result?.error || 'The case could not be updated.');
      if (result?.ok !== true) throw new Error('The return action could not be confirmed. Retry the same attempt.');
      clearSessionAttempt(attemptKey);
      setNote('');
      setMessageEn('');
      setReference('');
      setOutcome('');
      setResponsibility('');
      setDecisionEvidenceReference('');
      setCorrectSellerFulfillment(false);
      router.refresh();
    } catch (cause) {
      if(!props.isCurrent())return;
      setFailedAttemptKey(attemptKey);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The case could not be updated.',
      );
    } finally {
      if(props.isCurrent())setPending(false);
    }
  }

  if(accessDenied)return <section role="alert" className="space-y-3 rounded border p-4"><p>The current account or case access changed. Private decision fields are hidden.</p><Button type="button" onClick={()=>window.location.reload()}>Reload current case</Button></section>;
  if (!reviewable && !highValue && operations.length === 0)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No administrative action is currently available.
      </p>
    );
  return (
    <>
      {useVariation ? <section aria-labelledby={decisionFormId + '-variation'} className="mb-5 space-y-4">
        <div>
          <h2 id={decisionFormId + '-variation'} className="text-lg font-bold">Normal handmade variation?</h2>
          <p className="mt-1 text-sm text-muted-foreground">It only counts as normal if all four are yes.</p>
        </div>
        <div className="divide-y border-t">
          {variationQuestions.map((question, index) => (
            <div key={question} className="flex items-center justify-between gap-3 py-3">
              <span aria-hidden="true" className="text-sm leading-5">{question}</span>
              <fieldset className="flex shrink-0 divide-x rounded-lg border">
                <legend className="sr-only">{question}</legend>
                {(['yes', 'no'] as const).map(answer => (
                  <button key={answer} type="button" aria-pressed={variation[index] === answer}
                    className={'min-h-11 min-w-11 rounded-sm px-2 text-sm font-semibold capitalize hover:bg-muted ' +
                      (variation[index] === answer ? answer === 'yes' ? 'bg-[#E1EEE5] text-[#1F4D35]' : 'bg-[#F8E1DE] text-[#6E1219]' : '')}
                    onClick={() => setVariation(previous => ({ ...previous, [index]: answer }))}
                  >{answer}</button>
                ))}
              </fieldset>
            </div>
          ))}
        </div>
        <div aria-live="polite" className={'flex gap-2 rounded-xl p-3 text-sm ' +
          (differentFromListing ? 'bg-[#F8E1DE] text-[#6E1219]' : normalVariation ? 'bg-[#E1EEE5] text-[#1F4D35]' : 'bg-muted text-muted-foreground')}>
          {differentFromListing ? <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : normalVariation ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
          <div>
            <p className="font-semibold">{differentFromListing ? 'Different from the listing' : normalVariation ? 'Normal handmade variation' : 'Answer all four'}</p>
            <p className="mt-1">{differentFromListing ? 'Review the original refund and confirm who is responsible.' : normalVariation ? 'Explain why the difference is normal and record the decision.' : 'Review the photos and both accounts to answer the questions.'}</p>
          </div>
        </div>
        <div className="grid gap-2">
          {differentFromListing || normalVariation ? (
            <Button type="button" className="min-h-11 whitespace-normal bg-[#A8232E] text-center text-white hover:bg-[#8e1d28]"
              aria-controls={decisionFormId} disabled={pending || Boolean(failedAttemptKey)}
              onClick={() => openDecision(differentFromListing ? 'refund' : 'close')}>
              {differentFromListing ? 'Approve return' + (cashQuote ? ' · ' + cashQuote : '') : 'Explain and close'}
            </Button>
          ) : null}
          {props.variationCheck?.sellerResponded ? <Button type="button" variant="outline" className="min-h-11 whitespace-normal"
            aria-controls={decisionFormId} disabled={pending || Boolean(failedAttemptKey)}
            onClick={() => openDecision('exchange')}>Offer the seller’s exchange</Button> : null}
          <Button type="button" variant="outline" className="min-h-11 whitespace-normal"
            aria-controls={decisionFormId} disabled={pending || Boolean(failedAttemptKey)}
            onClick={() => openDecision('photo')}>Ask customer for a daylight photo</Button>
          {!shortcut ? <button type="button" className="min-h-11 text-left text-sm font-semibold underline underline-offset-4"
            aria-controls={decisionFormId} onClick={() => openDecision('other')}>Other return decisions</button> : null}
        </div>
      </section> : null}
    <form ref={formRef} id={decisionFormId} hidden={useVariation && !shortcut} data-form-id="staff.return-case-action" className="space-y-5"
      onSubmit={(event) => event.preventDefault()}>
      {shortcut === 'exchange' ? <p className="text-sm text-muted-foreground">Check the seller’s message for an exchange offer. Describe the offer and ask the customer if they want it.</p> : null}
      <FormGuide formId="staff.return-case-action" />

      {reviewable ? (
        <>
          <Field label="Decision">
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setCorrectSellerFulfillment(false);
              }}
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
                  onChange={(event) => {
                    setOutcome(event.target.value);
                    setCorrectSellerFulfillment(false);
                  }}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="" disabled>Choose an outcome</option>
                  <option value="refund">Refund</option>
                  <option value="replacement">Replacement</option>
                  <option value="return_to_origin">Return to origin</option>
                </select>
              </Field>
              <Field label="Responsible party">
                <select
                  value={responsibility}
                  onChange={(event) => {
                    setResponsibility(event.target.value);
                    setCorrectSellerFulfillment(false);
                  }}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="" disabled>Choose the responsible party</option>
                  <option value="seller">Seller</option>
                  <option value="carrier">Carrier</option>
                  <option value="platform">Hastabazaar</option>
                  <option value="buyer">Customer</option>
                </select>
              </Field>
              {pricedRefund?.kind === 'ready' ? (
                <>
                  <dl aria-label="Saved refund amounts" className="space-y-2 rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-x-2"><dt>Refundable item amount</dt><dd>{formatPaisaExact(pricedRefund.itemPaisa)}</dd></div>
                    <div className="flex flex-wrap justify-between gap-x-2"><dt>Applicable original delivery</dt><dd>{formatPaisaExact(pricedRefund.deliveryPaisa)}</dd></div>
                    <div className="flex flex-wrap justify-between gap-x-2 font-semibold"><dt>Cash refund</dt><dd>{formatPaisaExact(pricedRefund.cashPaisa)}</dd></div>
                  </dl>
                  {retainVoluntaryDelivery ? <p className="text-sm text-muted-foreground">The saved order terms retain the original delivery charge for this voluntary return.</p> : null}
                  {requiresDecisionEvidence ? (
                    <Field label="Verified evidence reference">
                      <Input name="decisionEvidenceReference" value={decisionEvidenceReference} minLength={8} maxLength={191} required
                        onChange={(event) => setDecisionEvidenceReference(event.target.value)} />
                    </Field>
                  ) : null}
                  {requiresSellerConfirmation ? (
                    <label className="flex items-start gap-2 text-sm">
                      <input name="correctSellerFulfillment" type="checkbox" className="mt-0.5 size-4" checked={correctSellerFulfillment} required
                        onChange={(event) => setCorrectSellerFulfillment(event.target.checked)} />
                      I verified that the seller fulfilled this order correctly.
                    </label>
                  ) : null}
                </>
              ) : pricedRefund?.kind === 'needs_reconciliation' ? (
                <p role="alert" className="rounded-lg border p-3 text-sm">Reconcile the original buyer refund amounts before approving this refund.</p>
              ) : outcome === 'refund' ? (
                <div className="grid gap-3">
                  <Field label="Item refund (NPR)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemRefund}
                      onChange={(event) => setItemRefund(event.target.value)}
                    />
                  </Field>
                  <p id="original-delivery-allocation" className="text-xs text-muted-foreground">{props.deliveryEntitlement?.kind==='needs_reconciliation'?'Original allocation needs reconciliation before approval.':'Saved original allocation; eligible no-fault returns include this amount.'}</p><Field label="Original attributable delivery refund (NPR)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={deliveryRefund}
                      readOnly
                      aria-describedby="original-delivery-allocation"
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
          {props.role==='super_admin'?'Review this pending high-value refund.':'This high-value refund needs Super Admin approval.'}
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
          ref={messageRef}
          value={messageEn}
          placeholder={shortcut === 'photo' ? 'Please send a daylight photo that shows the item clearly.' : undefined}
          onChange={(event) => setMessageEn(event.target.value)}
          minLength={8}
          maxLength={1000}
        />
      </Field>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={builtIns} /> : null}
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
            pending || !catalog.canSubmit || !approvalReady || note.trim().length < 8 || messageEn.trim().length < 8
          }
          onClick={() =>
            void send(
              `/api/admin/returns/${encodeURIComponent(props.id)}/review`,
              {
                action,
                outcome: action === 'approve' ? outcome : undefined,
                responsibility:
                  action === 'approve' ? responsibility : undefined,
                ...(pricedRefund?.kind === 'ready' ? {
                  itemRefundPaisa: pricedRefund.itemPaisa,
                  deliveryRefundPaisa: pricedRefund.deliveryPaisa,
                  ...(requiresDecisionEvidence ? { decisionEvidenceReference: decisionEvidenceReference.trim() } : {}),
                  ...(requiresSellerConfirmation ? { correctSellerFulfillment } : {}),
                } : {
                  itemRefundPaisa: Math.round(Number(itemRefund || 0) * 100),
                  deliveryRefundPaisa: Math.round(Number(deliveryRefund || 0) * 100),
                }),
              },
            )
          }
        >
          {pending ? 'Saving…' : 'Save decision'}
        </Button>
      ) : highValue ? (
        <div className="flex flex-wrap gap-2">
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
    </>
  );
}

function availableOperations(
  status: string,
  outcome: string | null,
  refundStatus: string | null,
): string[] {
  if(refundStatus==='paid'&&outcome==='refund'&&['approved','in_transit','received'].includes(status))return ['close_paid_refund'];
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
  children: React.ReactElement<{ id?: string }>;
}) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  return (
    <div className="space-y-2">
      <Label htmlFor={controlId}>{label}</Label>
      {cloneElement(children, { id: controlId })}
    </div>
  );
}
