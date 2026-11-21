'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { Ban, CircleCheckBig, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

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
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { CancellationCauseField } from './cancellation-cause-field';
import type { CancellationCause } from '@/lib/cancellation/causes';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import type { AdminFulfillmentAction, SellerFulfillmentAction } from '@/lib/db/repositories/fulfillment';
type FulfillmentAction = AdminFulfillmentAction | SellerFulfillmentAction;

const fulfillmentBaseKeys = ['action', 'note', 'trackingCode', 'requestId', 'formVersion', 'codNotConfirmed', 'cause'];
const unconfirmedCodLabel = 'Cancel order — customer did not confirm';

const definitions = {
  start_packing: {label:'Start company packing',title:'Start packing these company-store items?',description:'Records preparation of this maker’s company-store items. It does not dispatch the parcel or record payment.',icon:Send,variant:'default'},
  ready_for_pickup: {label:'Mark company items ready',title:'Mark these company-store items ready for pickup?',description:'Confirm preparation is complete. Dispatch, delivery and customer payment remain separate steps.',icon:CircleCheckBig,variant:'default'},
  dispatch: { label: 'Mark dispatched', title: 'Dispatch this order?', description: 'The customer will see the consignment as dispatched.', icon: Send, variant: 'default' },
  deliver: { label: 'Confirm delivery', title: 'Confirm physical delivery?', description: 'Records the completed delivery. Actual customer collection and company remittance require their separate evidence and records.', icon: CircleCheckBig, variant: 'default' },
  cancel: { label: 'Cancel order', title: 'Cancel this complete order?', description: 'Eligible parcels close and reserved inventory is restored. Custom production already started requires a separate staff review. Readiness and revised amounts are checked before cancellation.', icon: Ban, variant: 'destructive' },
} as const;

export function AdminOrderFulfillmentActions({ orderId, status, initialTrackingCode, companySellerId, codNotConfirmedActorId, actorId, cancellationCause }: {
  orderId: string; status: string; initialTrackingCode?: string | null; companySellerId?: string; codNotConfirmedActorId?: string;
  actorId?: string; cancellationCause?: CancellationCause | null;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig('staff.order-fulfillment');
  const formRef = useRef<HTMLFormElement>(null);
  const [attemptPresent, setAttemptPresent] = useState(false);
  const keyFor = (action: FulfillmentAction) => sessionAttemptKey('staff.order-fulfillment', companySellerId ? `${orderId}:company:${companySellerId}:${action}` : `${orderId}:${action}${codNotConfirmedActorId ? ':cod-not-confirmed' : ''}`);
  const [selected, setSelected] = useState<FulfillmentAction | null>(null);
  const [note, setNote] = useState('');
  const [trackingCode, setTrackingCode] = useState(initialTrackingCode??'');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const actions: FulfillmentAction[] = codNotConfirmedActorId ? ['cancel'] : companySellerId ? status==='confirmed'?['start_packing']:status==='packing'?['ready_for_pickup']:[] : status === 'ready_for_pickup'
    ? ['dispatch', 'cancel']
    : status === 'dispatched'
      ? ['deliver']
      : ['confirmed', 'packing'].includes(status)
        ? ['cancel']
        : [];
  if (actions.length === 0) return <p className="text-sm leading-6 text-muted-foreground">No operations action is currently available.</p>;

  function prepare(action: FulfillmentAction) {
    setError('');
    setSelected(action);
    setAttemptPresent(hasSessionAttempt(keyFor(action)));
  }

  async function submit() {
    if (!selected) return;
    if (!catalog.canSubmit || !catalog.config || !formRef.current) { setError(catalog.message || 'Form configuration is unavailable.'); return; }
    if (note.trim().length < 8) { setError('Add a clear operations note of at least 8 characters.'); return; }
    if (selected === 'dispatch' && (trackingCode.trim().length < 4 || trackingCode.trim().length > 80)) { setError('Enter a tracking or manual consignment reference.'); return; }
    const cause = selected === 'cancel' ? new FormData(formRef.current).get('cause') : null;
    if (selected === 'cancel' && !codNotConfirmedActorId && cancellationCause === null && !cause) {
      setError('Choose a cancellation cause.');
      formRef.current.querySelector<HTMLElement>('select[name="cause"]')?.focus();
      return;
    }
    const intendedActor = codNotConfirmedActorId ?? actorId;
    setPending(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, fulfillmentBaseKeys);
      const payload = { action: selected, note, trackingCode, ...(companySellerId?{sellerId:companySellerId}:{}),
        ...(codNotConfirmedActorId ? { codNotConfirmed: true } : {}),
        ...(cause ? { cause } : {}),
        ...configuredJsonPayload(catalog.config, configured.answers, fulfillmentBaseKeys) };
      const attemptKey = keyFor(selected);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setAttemptPresent(true);
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/fulfillment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json',
          ...(intendedActor ? { [ACTOR_INTENT_HEADER]: intendedActor } : {}) },
        body: JSON.stringify({ ...payload, requestId }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error || 'Order could not be updated.');
      if (result?.ok !== true) throw new Error('The fulfilment response could not confirm this action. Retry the same attempt.');
      clearSessionAttempt(attemptKey);
      setAttemptPresent(false);
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
      <div className="flex flex-wrap gap-2">{actions.map((action) => { const definition = definitions[action]; const Icon = definition.icon; return <Button key={action} variant={definition.variant} className="h-auto min-h-11 max-w-full whitespace-normal" onClick={() => prepare(action)}><Icon />{codNotConfirmedActorId ? unconfirmedCodLabel : definition.label}</Button>; })}</div>
      {error && !selected ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
      <AlertDialog open={selected !== null} onOpenChange={(open) => { if (!open && !pending) setSelected(null); }}>
        <AlertDialogContent>
          {selected ? (
            <form ref={formRef} data-form-id="staff.order-fulfillment" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <FormGuide formId="staff.order-fulfillment" />
              <AlertDialogHeader>
                <AlertDialogTitle>{codNotConfirmedActorId ? 'Cancel this cash-on-delivery order?' : definitions[selected].title}</AlertDialogTitle>
                <AlertDialogDescription>{codNotConfirmedActorId
                  ? 'Cancel the order and record why the customer did not confirm.' : definitions[selected].description}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4">
                {selected === 'dispatch' ? (
                  <div className="space-y-2">
                    <Label htmlFor="trackingCode">Tracking or consignment reference</Label>
                    <Input id="trackingCode" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} maxLength={80} />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="operationsNote">Operations note</Label>
                  <Textarea id="operationsNote" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Record the reason and any relevant details." />
                </div>
                {selected === 'cancel' && cancellationCause !== undefined && !codNotConfirmedActorId
                  ? <CancellationCauseField inferred={cancellationCause} /> : null}
                {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={fulfillmentBaseKeys} /> : null}
                {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
                {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
              </div>
              {attemptPresent ? (
                <div className="my-3 space-y-2 text-sm">
                  <p>A prior fulfilment action may have succeeded. Check this order before starting another attempt.</p>
                  <Button type="button" variant="outline" disabled={pending} onClick={() => {
                    if (!window.confirm('A prior fulfilment action may already have succeeded. Check the order first. Starting a new attempt may duplicate it. Continue?')) return;
                    clearSessionAttempt(keyFor(selected));
                    setAttemptPresent(false);
                    setError('');
                    if (catalog.status === 'stale') catalog.refresh();
                  }}>Start a new fulfilment attempt</Button>
                </div>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11" disabled={pending}>Go back</AlertDialogCancel>
                <AlertDialogAction className="h-auto min-h-11 whitespace-normal" variant={definitions[selected].variant}
                  disabled={pending || !catalog.canSubmit} onClick={(event) => { event.preventDefault(); void submit(); }}>
                  {pending ? 'Updating…' : codNotConfirmedActorId ? unconfirmedCodLabel : definitions[selected].label}
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
