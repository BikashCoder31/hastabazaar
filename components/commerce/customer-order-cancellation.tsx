'use client';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const FORM_ID = 'commerce.order-cancellation';
const BASE_KEYS = ['action', 'sellerIds', 'fingerprint', 'requestId', 'reason', 'formVersion', 'customAnswers'];
interface Choice {
  items:{id:string;name:string;quantity:number;status:string}[];
  id: string;
  name: string;
  eligible: boolean;
  reviewRequired: boolean;
}
interface Preview {
  fingerprint: string;
  reviewRequired: boolean;
  walletRestored: number;
  discountRemoved: number;
  delivery: number;
  total: number;
  collected: number;
  deliveryPricingPolicy: string | null;
}
function validPreview(value: unknown): value is Preview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const preview = value as Preview;
  return typeof preview.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(preview.fingerprint)
    && typeof preview.reviewRequired === 'boolean'
    && (preview.reviewRequired || preview.collected <= preview.total)
    && [preview.walletRestored, preview.discountRemoved, preview.delivery, preview.total, preview.collected]
      .every((amount) => typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0)
    && (preview.deliveryPricingPolicy === null || preview.deliveryPricingPolicy === 'base_plus_half_per_additional_store_v1' || preview.deliveryPricingPolicy === 'seller_shipment_equal_units_v2');
}
const bordered = 'inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#D4C1A6] px-4 text-center text-sm font-semibold text-[#14213D] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-55';
const action = 'inline-flex min-h-11 items-center justify-center rounded-[9px] bg-[#A8232E] px-4 text-center text-sm font-semibold text-white hover:bg-[#8f1e27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-55';

type Props = {
  orderNumber: string;
  actorId?: string | null;
  viewerScope?: string;
  initialChoices?: Choice[];
  initialSellerId?: string;
  previousTotal?: number;
  paymentMode?: string;
  parcelCash?: Record<string, number>;
};
export function CustomerOrderCancellation(props:Props){
 const scope=useOwnedFormScope(JSON.stringify([props.viewerScope??props.actorId??'legacy-receipt',props.orderNumber]));
 return <ScopedCustomerOrderCancellation key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}
function ScopedCustomerOrderCancellation({orderNumber,actorId,viewerScope,isCurrent,initialChoices,initialSellerId,previousTotal,paymentMode='cod',parcelCash}:Props&{isCurrent:()=>boolean}){
  const router = useRouter();
  const catalog = usePublishedFormConfig(FORM_ID);
  const formRef = useRef<HTMLFormElement>(null);
  const attemptKey = sessionAttemptKey(FORM_ID, JSON.stringify([viewerScope??actorId??'legacy-receipt',orderNumber]));
  const intentHeaders:Record<string,string>=actorId===undefined?{}:{[ACTOR_INTENT_HEADER]:actorId??''};
  const [accessDenied,setAccessDenied]=useState(false);
  const [attemptPresent, setAttemptPresent] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setAttemptPresent(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const
    [choices, setChoices] = useState<Choice[] | null>(initialChoices ?? null),
    [selected, setSelected] = useState<string[]>(initialSellerId && initialChoices?.some(choice => choice.id === initialSellerId && choice.eligible) ? [initialSellerId] : []),
    [preview, setPreview] = useState<Preview | null>(null),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const url = '/orders/' + encodeURIComponent(orderNumber) + '/cancel';
  async function recover(){
    setBusy(true);try{
      const requestId=sessionStorage.getItem(attemptKey);if(!requestId)throw new Error('No saved request reference is available. Check the order history.');
      const response=await fetch(url+'?attempt='+encodeURIComponent(requestId),{headers:intentHeaders}),data=await response.json() as {outcome?:{id:string;status:string;decision:string}|null;error?:string};
      if(!isCurrent())return;
      if([401,403,404].includes(response.status)){setAccessDenied(true);router.refresh();}
      if(!response.ok)throw new Error(data.error??'The saved outcome could not be checked.');
      if(!data.outcome){setMessage('This request has no confirmed outcome yet. Keep this reference and check again before starting another request.');return;}
      setMessage(`Saved request ${data.outcome.id}: ${data.outcome.status.replaceAll('_',' ')} (${data.outcome.decision}).`);clearSessionAttempt(attemptKey);setAttemptPresent(false);setChoices(null);router.refresh();
    }catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'Could not check the original outcome.');}finally{if(isCurrent())setBusy(false);}
  }
  async function open() {
    setBusy(true);
    try {
      const r = await fetch(url,{headers:intentHeaders}),
        d = (await r.json()) as { error?: string; choices: Choice[] };
      if(!isCurrent())return;
      if([401,403,404].includes(r.status)){setAccessDenied(true);router.refresh();}
      if (!r.ok) throw Error(d.error ?? 'Request failed.');
      setChoices(d.choices);
      setMessage('');
    } catch {
      if(!isCurrent())return;
      setMessage('Cancellation options are unavailable. Refresh the order.');
    } finally {
      if(isCurrent())setBusy(false);
    }
  }
  async function submit(confirm: boolean) {
    if (!catalog.config || !catalog.canSubmit || !formRef.current) {
      setMessage(catalog.message || 'Form configuration is unavailable.'); return;
    }
    if (!formRef.current.reportValidity()) return;
    setBusy(true);
    setMessage('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
      const formPayload = configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS);
      const requestId = confirm ? getOrCreateSessionAttempt(attemptKey) : undefined;
      if (confirm) setAttemptPresent(true);
      const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',...intentHeaders },
          body: JSON.stringify({
            action: confirm ? 'confirm' : 'preview',
            sellerIds: selected,
            fingerprint: preview?.fingerprint,
            requestId,
            reason,
            ...formPayload,
          }),
        }),
        d = (await r.json().catch(() => null)) as (Preview & { id?: string; error?: string; status?: string; code?: string }) | null;
      if(!isCurrent())return;
      if([401,403,404].includes(r.status)){setReason('');setAccessDenied(true);router.refresh();}
      if (d?.code === 'stale_version') catalog.handleSubmissionResponse(r, d.code);
      if (!d) throw Error('The cancellation response could not be verified. Retry this attempt.');
      if (!r.ok) throw Error(d.error);
      if (confirm) {
        if (typeof d.id !== 'string' || !d.id.trim() || !['cancelled', 'review_requested'].includes(d.status ?? ''))
          throw Error('The cancellation response could not confirm this action. Retry this attempt.');
        setMessage(
          d.status === 'review_requested'
            ? 'Request saved. Responsible team: operations. Staff must review actual custody and payment before any cancellation or refund. The order shows which items are on hold.'
            : 'Selected whole seller portions cancelled. The receipt shows the revised amount and wallet restoration.',
        );
        setChoices(null);
        setPreview(null);
        clearSessionAttempt(attemptKey);
        setAttemptPresent(false);
        router.refresh();
      } else {
        if (!validPreview(d)) throw Error('The cancellation preview could not be verified. Review the current amounts again.');
        setPreview(d);
      }
    } catch (e) {
      if(!isCurrent())return;
      setMessage(e instanceof Error ? e.message : 'Request failed.');
      setPreview(null);
    } finally {
      if(isCurrent())setBusy(false);
    }
  }
  const page = initialChoices !== undefined;
  const orderHref = '/orders/' + encodeURIComponent(orderNumber);
  if(accessDenied)return <section role="alert"><p>Account or order access changed. Previous private cancellation fields are hidden; original request references are retained.</p><button type="button" className={bordered} onClick={()=>window.location.reload()}>Reload current order</button></section>;
  return (
    <section className={page ? 'w-full space-y-4' : 'w-full space-y-4 rounded-xl border border-[#E3D6C3] p-4'}>
      {attemptPresent?<button type="button" disabled={busy} className={bordered} onClick={()=>void recover()}>Check saved cancellation outcome</button>:null}
      {!page ? <button
        disabled={busy}
        className={bordered}
        onClick={() => void open()}
      >
        Cancel order or seller parcels
      </button> : null}
      {choices ? (
        <form ref={formRef} data-form-id={FORM_ID} onSubmit={(event) => { event.preventDefault(); if (selected.length && !busy) void submit(Boolean(preview)); }} className="space-y-4 [&_summary]:min-h-11 [&_summary]:py-2.5">
      <FormGuide formId={FORM_ID} />
          {!page ? <p>Select whole seller parcels. Packed, custom and payment cases may need a staff review.</p> : null}
          {!choices.length ? <p className="rounded-xl bg-white p-4">There are no parcels left to cancel. Open the order for the current status.</p> : null}
          {choices.map((c, index) => (
            <label key={c.id} className={`grid min-h-11 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-[14px] border bg-white p-4 has-focus-visible:outline-2 has-focus-visible:outline-[#14213D] sm:grid-cols-[auto_minmax(0,1fr)_auto] ${selected.includes(c.id) ? 'border-[#A8232E]' : 'border-[#D4C1A6]'}`}>
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[#14213D]"
                disabled={!c.eligible || busy}
                checked={selected.includes(c.id)}
              onChange={(e) => {
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  );
                  setPreview(null);
                }}
              />
              <span className="min-w-0">
                <strong className="block">{page ? `Parcel ${index + 1} · ` : ''}{c.name}</strong>
                {c.items?.map(i=><span className="block text-sm text-[#465573]" key={i.id}>{i.name} × {i.quantity}</span>)}
                <span className="block text-sm text-[#465573]">{!c.eligible
                  ? 'Open order help'
                  : c.reviewRequired
                    ? 'Staff cancellation or delivery review required'
                    : 'Available to cancel'}</span>
              </span>
              {parcelCash?.[c.id] !== undefined ? (
                <strong className="col-span-2 border-t border-[#E3D6C3] pt-2 text-right text-sm tabular-nums sm:col-span-1 sm:border-t-0 sm:pt-0">
                  {formatPaisaExact(parcelCash[c.id])}
                </strong>
              ) : null}
            </label>
          ))}
          <label className="block">
            Reason <span aria-hidden="true">*</span>
            <textarea
              required
              minLength={8}
              maxLength={300}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[#D4C1A6] bg-white p-3 focus-visible:outline-2 focus-visible:outline-[#14213D]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
          {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
          {attemptPresent ? <div className="space-y-2 text-sm">
            <p>A prior cancellation may have succeeded. Check the order before starting a new attempt.</p>
            <button type="button" disabled={busy} className={bordered} onClick={() => {
              if (!window.confirm('A cancellation or review request may already have succeeded. Check the order first. Start a new request reference?')) return;
              clearSessionAttempt(attemptKey); setAttemptPresent(false); setPreview(null); setMessage('');
              if (catalog.status === 'stale') catalog.refresh();
            }}>Start a new cancellation attempt</button>
          </div> : null}
          {preview ? (
            <div className="space-y-2 rounded-[14px] border border-[#E3D6C3] bg-white p-4 text-sm">
              {paymentMode === 'cod' && previousTotal !== undefined && previousTotal > preview.total ? (
                <p className="flex flex-wrap justify-between gap-2">Cash you’ll no longer pay <strong>−{formatPaisaExact(previousTotal - preview.total)}</strong></p>
              ) : null}
              <p className="flex flex-wrap justify-between gap-2 font-semibold">
                {paymentMode === 'cod' ? (page ? 'Cash still due on delivery' : 'Remaining order COD') : 'Revised order total'}
                <span>{formatPaisaExact(paymentMode === 'cod' && page ? Math.max(0, preview.total - preview.collected) : preview.total)}</span>
              </p>
              <p>
                Delivery after cancellation: {formatPaisaExact(preview.delivery)}
              </p>
              <p>
                Wallet credit to restore:{' '}
                {formatPaisaExact(preview.walletRestored)}
              </p>
              <p>
                Friend discount removed from cancelled items:{' '}
                {formatPaisaExact(preview.discountRemoved)}
              </p>
              {paymentMode === 'cod' && preview.collected > 0 ? <p>Already collected: {formatPaisaExact(preview.collected)}</p> : null}
              {paymentMode === 'cod' && !page ? <p>
                Still to collect:{' '}
                {formatPaisaExact(Math.max(0,preview.total - preview.collected))}
              </p> : null}
              <p>
                {preview.reviewRequired
                  ? 'These amounts are an estimate for staff review. Nothing changes until staff approves a current eligible request.'
                  : preview.deliveryPricingPolicy === 'seller_shipment_equal_units_v2'
                    ? 'Each remaining shipment keeps its original delivery charge.'
                    : preview.deliveryPricingPolicy
                    ? 'The delivery amount was recalculated for the remaining parcels using the original checkout rates. Cash already collected is shown separately.'
                    : 'This historical order keeps its recorded single-fee cancellation rule while any parcel continues. Previously recorded collections remain separate.'}
              </p>
            </div>
          ) : null}
          <div className={page ? "grid gap-2.5 sm:flex sm:flex-wrap" : "flex flex-wrap gap-2.5"}>
            <button type="submit" disabled={busy || !selected.length || !catalog.canSubmit || (preview !== null && reason.trim().length < 8)} className={preview ? action : bordered}>
              {!preview ? 'Review cancellation amounts' : preview.reviewRequired ? 'Request staff review' : page ? `Cancel ${selected.length} ${selected.length === 1 ? 'parcel' : 'parcels'}` : 'Confirm cancellation and revised amount'}
            </button>
            {page ? <a href={orderHref} className={bordered}>Keep my order</a> : null}
          </div>
        </form>
      ) : null}
      {page && !choices ? <a href={orderHref} className={bordered}>Back to order</a> : null}
      {page ? <p className="flex items-start gap-2 rounded-xl bg-[#EBE2D3] p-4 text-sm text-[#344766]"><Truck className="size-4 shrink-0" aria-hidden="true" />
        <span>A parcel already with the courier needs a staff review. <a href={`${orderHref}#order-help`} className="inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline">Get help with this order</a></span>
      </p> : null}
      {message ? <output className="block text-sm" aria-live="polite">{message}</output> : null}
    </section>
  );
}
