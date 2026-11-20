'use client';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import { FormGuide } from '@/components/forms/form-guide';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {useActionRecovery} from '@/components/orders/use-action-recovery';
import {useDenyStaffReview} from './staff-review-access-boundary';

const FORM_ID = 'staff.cancellation-review';
const BASE_KEYS = ['reviewId', 'action', 'note', 'fingerprint', 'requestId', 'clientAttemptId', 'formVersion', 'customAnswers'];
interface ReviewPreview {
  fingerprint: string; total: number; walletRestored: number; delivery: number;
  deliveryPricingPolicy: string | null;
}
function validPreview(value: unknown): value is ReviewPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const preview = value as ReviewPreview;
  return typeof preview.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(preview.fingerprint)
    && [preview.total, preview.walletRestored, preview.delivery]
      .every((amount) => typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0)
    && (preview.deliveryPricingPolicy === null || preview.deliveryPricingPolicy === 'base_plus_half_per_additional_store_v1');
}
const actions=['approve','reject'];
type Props={reviewId:string;actorId:string;canDecide?:boolean};
export function CancellationReviewControl(props:Props){
 const scope=useOwnedFormScope(JSON.stringify([props.actorId,props.reviewId]));
 return <ScopedCancellationReviewControl key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}
function ScopedCancellationReviewControl({reviewId,actorId,isCurrent,canDecide=true}:Props&{isCurrent:()=>boolean}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const denyParent=useDenyStaffReview();
  const
    [accessDenied,setAccessDenied]=useState(false),
    [note, setNote] = useState(''),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<{
      fingerprint: string;
      total: number;
      walletRestored: number;
      delivery: number;
      deliveryPricingPolicy:string|null;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const denyAccess=useCallback(()=>{if(!isCurrent())return;setNote('');setPreview(null);setAccessDenied(true);denyParent?.();router.refresh();},[isCurrent,denyParent,router]);
  const catalog=usePublishedFormConfig(FORM_ID,{actorId,onAccessDenied:denyAccess,enabled:!accessDenied});
  const legacy=useMemo(()=>actions.map(action=>({action,key:sessionAttemptKey(FORM_ID,JSON.stringify([actorId,reviewId,action]))})),[actorId,reviewId]);
  const recovery=useActionRecovery({actorId,sourceId:reviewId,endpoint:'/api/admin/cancellations',storageKey:sessionAttemptKey(FORM_ID,JSON.stringify([actorId,reviewId])),actions,isCurrent,legacy,onDenied:denyAccess,continuation:{action:'approve',body:ref=>({reviewId,action:ref.action,clientAttemptId:ref.requestId,continuation:true})}});
  async function act(action: 'preview' | 'approve' | 'reject') {
    if (!catalog.config || !catalog.canSubmit || !formRef.current) {
      setMessage(catalog.message || 'Form configuration is unavailable.'); return;
    }
    if (!formRef.current.reportValidity()) return;
    setBusy(true);
    setMessage('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
      const formPayload = configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS);
      if(action!=='preview'){if(await recovery.run(action,{reviewId,action,note,...(preview?{fingerprint:preview.fingerprint}:{}),...formPayload},'clientAttemptId')&&isCurrent())router.refresh();return;}
      const r = await fetch('/api/admin/cancellations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',[ACTOR_INTENT_HEADER]:actorId },
          body: JSON.stringify({
            reviewId,
            action,
            note,
            fingerprint: preview?.fingerprint,
            ...formPayload,
          }),
        });
      if(!isCurrent())return;
      if([401,403,404].includes(r.status)){denyAccess();return;}
      const d = (await r.json().catch(() => null)) as {
          id?: string;
          status?: string;
          ok?: boolean;
          error?: string;
          code?: string;
          fingerprint: string;
          total: number;
          walletRestored: number;
          delivery: number;
          deliveryPricingPolicy:string|null;
        } | null;
      if(!isCurrent())return;

      if (d?.code === 'stale_version') catalog.handleSubmissionResponse(r, d.code);
      if (!d) throw Error('The review response could not be verified. Retry this attempt.');
      if (!r.ok) throw Error(d.error ?? 'Review failed.');
      if (action === 'preview') {
        if (!validPreview(d)) throw Error('The review preview could not be verified. Review the current amounts again.');
        setPreview(d);
      }
    } catch (e) {
      if(!isCurrent())return;
      setMessage(e instanceof Error ? e.message : 'Review failed.');
      setPreview(null);
    } finally {
      if(isCurrent())setBusy(false);
    }
  }
  if(accessDenied||recovery.denied)return <p role="alert">Review access changed. Reopen the original review with current access.</p>;
  return (
    <form ref={formRef} data-form-id={FORM_ID} onSubmit={(event) => event.preventDefault()} className="space-y-3">
      {recovery.pending?<div className="space-y-2"><p>{recovery.recorded?'The cancellation decision is recorded. Keep its reference until settlement continuation is confirmed.':'The original decision still needs confirmation. Keep its reference.'}</p>{recovery.canContinue?<button type="button" disabled={recovery.busy} onClick={()=>void recovery.continueOriginal()}>Continue original settlement</button>:null}{recovery.canRetry?<button type="button" disabled={recovery.busy} onClick={()=>void recovery.retry()}>Retry the same saved decision</button>:null}{recovery.reference?<button type="button" disabled={recovery.busy} onClick={()=>void recovery.check()}>Check original saved outcome</button>:null}{recovery.rejected?<button type="button" disabled={recovery.busy} onClick={()=>{recovery.reviewAgain();setPreview(null);catalog.refresh();}}>Review current form for a new attempt</button>:null}</div>:null}
      <fieldset disabled={busy||recovery.blocked||!canDecide} className="space-y-3">
      <FormGuide formId={FORM_ID} />

      <p>
        Responsible team: operations. Review production with the seller.
        Approval rechecks the readiness cutoff and current financial amounts.
      </p>
      <label className="block">
        Decision reason (shown to customer) *
        <textarea
          required
          minLength={8}
          maxLength={300}
          className="block w-full rounded border p-2"
          value={note}
          onChange={(e) => { setNote(e.target.value); setPreview(null); }}
        />
      </label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
      {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
      <button
        type="button"
        disabled={busy || !catalog.canSubmit}
        className="rounded border p-2"
        onClick={() => void act('preview')}
      >
        Review current cancellation amounts
      </button>
      {preview ? (
        <div>
          <p>
            Remaining COD {formatPaisaExact(preview.total)} · wallet restoration{' '}
            {formatPaisaExact(preview.walletRestored)} · delivery{' '}
            {formatPaisaExact(preview.delivery)}
          </p>
          <p className="text-sm text-muted-foreground">{preview.deliveryPricingPolicy?'Delivery is recalculated from the remaining store count under the saved 50%-increment policy.':'This historical order retains its recorded single-fee cancellation policy.'}</p>
          <button
            type="button"
            disabled={busy || note.trim().length < 8 || !catalog.canSubmit}
            className="rounded border p-2"
            onClick={() => void act('approve')}
          >
            Approve reviewed cancellation
          </button>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy || note.trim().length < 8 || !catalog.canSubmit}
        className="rounded border p-2"
        onClick={() => void act('reject')}
      >
        Reject with reason
      </button>
      </fieldset>
      <output aria-live="polite">{recovery.message||message}</output>
    </form>
  );
}
