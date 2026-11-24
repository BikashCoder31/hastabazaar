'use client';
import {useRef,useState} from 'react';
import {ArrowRight, Clock3, LockKeyhole} from 'lucide-react';
import Link from 'next/link';
import {SettingPreviewPanel} from '@/components/admin/setting-value-preview';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import {useCommercialScope,CommercialRecovery} from '@/components/admin/commercial-recovery';
import {FinanceAccessNotice} from '@/components/admin/finance-access-notice';
import {sessionAttemptKey,getOrCreateSessionAttempt,clearSessionAttempt} from '@/lib/forms/client-attempt';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {commissionDate} from '@/lib/commission/reporting';
import {percentToBasisPoints,parseNepalDateTime,COMMISSION_NOTICE_DAYS,COMMISSION_NOTICE_MS} from '@/lib/commission/rates';
import type {getCommonFeeState} from '@/lib/commission/coordinated-policy';
type State=Awaited<ReturnType<typeof getCommonFeeState>>;
type Review={requestId:string;action:'publish'|'cancel'|'initialize';expectedContext:string;reason:string;basisPoints?:number;effectiveAt?:number;replacesId?:string|null;policyId?:string;registeredBasisPoints?:number;managedBasisPoints?:number};
type CommonFeeProps={actorId:string;state:State;editable?:boolean;embedded?:boolean};
export function CommonFeePolicy(props:CommonFeeProps){return <CommonFeePolicyScope key={props.actorId} {...props}/>;}
function CommonFeePolicyScope({actorId,state:initial,editable=true,embedded=false}:CommonFeeProps){
 const commercial=useCommercialScope(actorId),attemptKey=sessionAttemptKey('staff.common-fee-policy',actorId+':policy'),[outcomeChecked,setOutcomeChecked]=useState(false);
 const router=useRouter(),[state,setState]=useState(initial),[percent,setPercent]=useState(''),[date,setDate]=useState(''),[reason,setReason]=useState(''),[review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[wasUncertain,setUncertain]=useState(false),[ownedAttempt,setOwnedAttempt]=useState<string|null>(null),[message,setMessage]=useState(''),inFlight=useRef(false);
 const [initialRegistered,setInitialRegistered]=useState(''),[initialManaged,setInitialManaged]=useState(''),[needsMfa,setNeedsMfa]=useState(false);
 const storedAttempt=useSessionReference(attemptKey),uncertain=wasUncertain||storedAttempt!==undefined&&storedAttempt!==null&&storedAttempt!==ownedAttempt;
 async function refresh(){const response=await fetch('/api/admin/common-fee-policy',{cache:'no-store',headers:commercial.headers}),body=await response.json().catch(() => null) as State & {error?:string};if(!commercial.current())throw new Error('Original actor view closed.');commercial.observe(response);if(!response.ok)throw new Error(body?.error??'Policy sources are unavailable.');if(!body||!Array.isArray(body.issues)||!body.current||typeof body.context!=='string')throw new Error('The current fee sources could not be verified.');setState(body);return body as State;}
 async function preview(action:Review['action']){
  if(inFlight.current||uncertain||storedAttempt===undefined)return;inFlight.current=true;setBusy(true);setMessage('');try{if(reason.trim().length<10)throw new Error('Describe the reason in at least 10 characters.');const current=await refresh();
   const details:Partial<Review>={};
   if(action==='initialize'){
    if(!current.initialPublicationAvailable)throw new Error('Initial rates already have a publication history.');
    details.registeredBasisPoints=percentToBasisPoints(initialRegistered);
    details.managedBasisPoints=percentToBasisPoints(initialManaged);
    if(details.registeredBasisPoints!==details.managedBasisPoints)throw new Error('Enter the same percentage for both routes.');
   }else if(current.issues.length)throw new Error(current.issues.join(' '));
   const request={requestId:getOrCreateSessionAttempt(attemptKey),action,expectedContext:current.context,reason:reason.trim()};setOwnedAttempt(request.requestId);notifySessionReference(attemptKey);
   if(action==='initialize'){setReview({...request,...details});return;}
   if(action==='cancel'){if(!current.upcoming)throw new Error('There is no current future common schedule.');setReview({...request,policyId:current.upcoming.id});}
   else{const basisPoints=percentToBasisPoints(percent),effectiveAt=parseNepalDateTime(date);if(effectiveAt<current.asOf+COMMISSION_NOTICE_MS)throw new Error('Choose at least 15 full days after publication. The final publication rechecks this time.');setReview({...request,basisPoints,effectiveAt,replacesId:current.upcoming?.id??null});}
  }catch(error){setMessage(error instanceof Error?error.message:'The policy preview is unavailable.');}finally{inFlight.current=false;if(commercial.current())setBusy(false);}
 }
 async function save(){if(!review||inFlight.current)return;inFlight.current=true;setBusy(true);setUncertain(true);setMessage('');try{const response=await fetch('/api/admin/common-fee-policy',{method:'POST',headers:{'Content-Type':'application/json',...commercial.headers},body:JSON.stringify(review)}),body=await response.json().catch(() => null) as {error?:string;id?:string;code?:string}|null;if(!commercial.current())return;
  if(review.action==='initialize'&&(body?.code==='MFA_REQUIRED'||response.status===401)){
   setNeedsMfa(true);setUncertain(false);return;
  }
  commercial.observe(response);if(!response.ok){throw new Error(body?.error??'Publication could not be confirmed.');}if(!body||typeof body.id!=='string'||!body.id||(review.action==='cancel'&&body.id!==review.policyId))throw new Error('The saved policy result could not be verified. Keep its original request for recovery.');clearSessionAttempt(attemptKey);notifySessionReference(attemptKey);setUncertain(false);setReview(null);setNeedsMfa(false);
  if(review.action==='initialize')setState(current=>({...current,initialPublicationAvailable:false}));
  setMessage(review.action==='cancel'?'Both future route versions were cancelled.':'Both route versions were published with the same start.');await refresh();router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'The outcome is uncertain. Retry the same reviewed request.');}finally{inFlight.current=false;if(commercial.current())setBusy(false);}}
 const recovery=<CommercialRecovery actorId={actorId} kind="common-fee" attemptKey={attemptKey} onDenied={commercial.deny} onReauthorized={()=>{commercial.reauthorize();setOutcomeChecked(true);}} onRecovered={()=>{clearSessionAttempt(attemptKey);notifySessionReference(attemptKey);setUncertain(false);setReview(null);setMessage('Original committed common fee operation confirmed.');void refresh().catch(error=>{if(commercial.current())setMessage((error as Error).message);});}}/>;
 if(commercial.accessDenied)return <div className="space-y-3"><FinanceAccessNotice message={message}/>{recovery}</div>;
 const disabled=busy||review!==null||uncertain||storedAttempt===undefined;
 const showInitial=editable&&state.initialPublicationAvailable;
 const verifyHref='/login?reauth=password&return_to='+encodeURIComponent(embedded?'/admin/business-settings?setting=independent_seller_commission_bps':'/admin/commission');
 let proposedBasisPoints: number | null = null;
 if (percent.trim()) {
  try { proposedBasisPoints = percentToBasisPoints(percent); } catch { /* Preview appears when the entered rate is valid. */ }
 }
 const registered = state.current.registered;
 const managed = state.current.managed;
 const currentRate = registered && managed && registered.basisPoints === managed.basisPoints
   ? `${registered.basisPoints / 100}%` : 'Source review required';
 const fieldClass = 'min-h-11 w-full min-w-0 rounded-[10px] border border-[#D3C5AD] bg-white px-3.5 text-base md:text-sm focus-visible:outline-2 focus-visible:outline-primary';
 return <section id="rate-management" className={embedded ? 'min-w-0 scroll-mt-20 space-y-5' : 'scroll-mt-28 space-y-5 rounded-2xl border bg-card p-5 sm:p-6'}>
  {uncertain?<div className="space-y-2">{recovery}{outcomeChecked?<button type="button" disabled={busy} onClick={()=>void refresh().then(()=>{if(!commercial.current())return;clearSessionAttempt(attemptKey);notifySessionReference(attemptKey);setUncertain(false);setReview(null);setOutcomeChecked(false);setMessage('Current sources refreshed. Your draft is retained for a new reviewed attempt.');}).catch(error=>{if(commercial.current())setMessage((error as Error).message);})}>Start a new reviewed attempt</button>:null}</div>:null}
  {embedded ? <p className="text-sm leading-6 text-[#46536F]">Registered Sellers and sale-linked Managed Makers share one selling fee and start date. Fixed supplier contracts use their agreed prices.</p> : (
    <div><h2 className="font-heading text-2xl">Selling fee</h2><p className="mt-2 text-sm leading-6">One common start for Registered Sellers and sale-linked Managed Makers. Fixed supplier contracts keep their own agreed price. Original orders keep their recorded amounts.</p></div>
  )}
  {state.issues.length&&!showInitial?<div role="alert" className="rounded-xl border border-amber-400 p-4"><h3 className="font-semibold">Source review required</h3><ul>{state.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>:null}
  {showInitial ? (
    <form data-form-id="system.common-fee-policy" onSubmit={event=>{event.preventDefault();void preview('initialize');}} className="space-y-4 rounded-xl border p-4">
      <h3 className="font-semibold">Publish initial rates</h3>
      <p className="text-sm leading-6">Enter the same percentage for both routes. Managed Maker retention is the share Hastabazaar keeps from an eligible sale. Publishing makes both rates effective together. Sellers still need to accept their terms before taking new orders.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold"><span>Independent seller commission (%)</span>
          <input className={fieldClass} required inputMode="decimal" maxLength={6} value={initialRegistered} disabled={disabled} onChange={event=>setInitialRegistered(event.target.value)} />
        </label>
        <label className="space-y-2 text-sm font-semibold"><span>Managed Maker retention (%)</span>
          <input className={fieldClass} required inputMode="decimal" maxLength={6} value={initialManaged} disabled={disabled} onChange={event=>setInitialManaged(event.target.value)} />
        </label>
      </div>
      <label className="block space-y-2 text-sm font-semibold"><span>Reason for publishing</span>
        <input className={fieldClass} required minLength={10} maxLength={1000} value={reason} disabled={disabled} onChange={event=>setReason(event.target.value)} />
      </label>
      <Button className="min-h-11" type="submit" disabled={disabled}>Review initial rates</Button>
    </form>
  ) : embedded && editable ? (
    <form data-form-id="system.common-fee-policy" onSubmit={event => { event.preventDefault(); void preview('publish'); }} className="space-y-6">
      {state.upcoming ? <p className="rounded-lg border border-[#E4DACA] p-3 text-sm">
        Scheduled: {state.upcoming.basisPoints / 100}% from {commissionDate(state.upcoming.effectiveAt)} Nepal time. Saving a new schedule replaces this one.
      </p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(8rem,13.75rem)_minmax(0,1fr)]">
        <label className="min-w-0 space-y-2 text-sm font-semibold">
          <span className="block">New value</span>
          <span className="relative block">
            <input type="text" inputMode="decimal" required value={percent} disabled={disabled} onChange={event => setPercent(event.target.value)} className={fieldClass + ' pr-12 font-normal'} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 content-center border-l border-[#E4DACA] px-4 font-normal text-[#675B4E]">%</span>
          </span>
        </label>
        <label className="min-w-0 space-y-2 text-sm font-semibold">
          <span className="block">Starts (Nepal time)</span>
          <input type="datetime-local" required value={date} disabled={disabled} onChange={event => setDate(event.target.value)} className={fieldClass + ' font-normal'} />
        </label>
      </div>
      <section aria-labelledby="commission-preview-title" className="space-y-3">
        <h3 id="commission-preview-title" className="text-[15px] font-semibold">What changes</h3>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1.5 md:gap-2">
          <SettingPreviewPanel caption="Now" summary={currentRate} value={null} detail={registered && managed && registered.basisPoints !== managed.basisPoints ? `Registered: ${registered.basisPoints / 100}% · sale-linked: ${managed.basisPoints / 100}%` : null} after={false} />
          <ArrowRight className="size-4 self-center text-[#A8232E]" aria-hidden="true" />
          <SettingPreviewPanel caption={proposedBasisPoints === null ? 'Type a new value' : 'After the change'} summary={proposedBasisPoints === null ? '—' : `${proposedBasisPoints / 100}%`} value={null} detail={null} after />
        </div>
        <p className="flex items-start gap-2 text-sm text-[#46536F]">
          <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Sellers need {COMMISSION_NOTICE_DAYS} full days’ notice and fresh consent before the new fee starts.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#46536F]">
          <span>Shows on</span>
          {['Seller earnings', 'Payouts', 'Add product'].map(area => <span key={area} className="rounded-full bg-[#EDE4D3] px-2.5 py-0.5 text-xs font-semibold text-[#14213D]">{area}</span>)}
        </div>
      </section>
      <label className="block space-y-2 text-sm font-semibold">
        <span>Why are you changing this?</span>
        <input value={reason} required minLength={10} maxLength={1000} disabled={disabled} placeholder="Required. Saved in the setting’s history." onChange={event => setReason(event.target.value)} className={fieldClass + ' font-normal'} />
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 border-t border-[#E4DACA] pt-4">
        <Button type="submit" disabled={disabled || state.issues.length > 0 || proposedBasisPoints === null || !date || reason.trim().length < 10} className="min-h-11 rounded-[10px] bg-[#A8232E] px-5 text-white hover:bg-[#8C1C27]">Review schedule</Button>
        <Button type="button" variant="outline" disabled={disabled} className="min-h-11 rounded-[10px] border-[#D3C5AD] bg-transparent px-5" onClick={() => {setPercent(''); setDate(''); setReason(''); setMessage('');}}>Discard</Button>
        {state.upcoming ? <Button type="button" variant="outline" className="min-h-11" disabled={disabled || state.issues.length > 0} onClick={() => void preview('cancel')}>Review cancellation</Button> : null}
        <p className="ml-auto flex items-start gap-1.5 text-[13px] text-[#46536F]">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Orders already placed keep their saved values.
        </p>
      </div>
    </form>
  ) : (<>
  <div className="grid gap-4 md:grid-cols-2"><article className="space-y-2 rounded-xl border p-4"><h3 className="font-semibold">Current fee</h3>{state.current.registered&&state.current.managed?<><p className="text-3xl">{state.current.registered.basisPoints/100}%</p><p className="text-sm">Effective {commissionDate(state.current.registered.effectiveAt)} · Nepal time</p>{state.issues.length?<p>Registered: {state.current.registered.basisPoints/100}% · sale-linked maker: {state.current.managed.basisPoints/100}%</p>:null}<p className="text-sm">Current consent is required for new orders. Missing consent keeps the dashboard, listing visibility and existing order work available.</p></>:<p>The actual current rate needs review.</p>}</article>
   {state.upcoming?<article className="space-y-2 rounded-xl border p-4"><h3 className="font-semibold">Upcoming fee</h3><p className="text-3xl">{state.upcoming.basisPoints/100}%</p><p className="text-sm">Starts {commissionDate(state.upcoming.effectiveAt)} · Nepal time</p><p className="text-sm">Early acceptance starts no charge early and does not satisfy a missing current acceptance.</p></article>:null}</div>
  {editable?<form data-form-id="system.common-fee-policy" onSubmit={event=>{event.preventDefault();void preview('publish');}} className="space-y-4"><h3 className="font-semibold">{state.upcoming?'Replace the upcoming schedule':'Publish a future schedule'}</h3><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">Fee percentage<input aria-label="Fee percentage" type="text" inputMode="decimal" value={percent} disabled={disabled} onChange={event=>setPercent(event.target.value)} className="w-full rounded-lg border p-3"/></label><label className="space-y-2">Common start · Nepal time<input aria-label="Common start · Nepal time" type="datetime-local" value={date} disabled={disabled} onChange={event=>setDate(event.target.value)} className="w-full rounded-lg border p-3"/></label></div><label className="block space-y-2">Reason<textarea aria-label="Policy reason" maxLength={1000} value={reason} disabled={disabled} onChange={event=>setReason(event.target.value)} className="w-full rounded-lg border p-3"/></label><p className="text-sm">Every replacement, including a date-only change or lower rate, requires a fresh 15-day notice and fresh consent. A sooner common start is rejected.</p><div className="flex flex-wrap gap-3"><Button className="min-h-11" type="submit" disabled={disabled||state.issues.length>0}>Review publication</Button>{state.upcoming?<Button className="min-h-11" type="button" variant="outline" disabled={disabled||state.issues.length>0} onClick={()=>void preview('cancel')}>Review cancellation</Button>:null}</div></form>:null}
  </>)}
  {review?<div className="space-y-3 rounded-xl border p-4" aria-label="Reviewed fee action">
    <h3 className="font-semibold">{review.action==='initialize'?'Publish the first rates':review.action==='cancel'?'Cancel both future versions':review.replacesId?'Replace both future versions':'Publish both future versions'}</h3>
    {review.action==='initialize' ? <>
      <p>Independent seller commission {review.registeredBasisPoints!/100}% · Managed Maker retention {review.managedBasisPoints!/100}%</p>
      <p className="text-sm">Both rates take effect when you publish.</p>
      {needsMfa ? <output className="block text-sm">Verify your password and authenticator again.{' '}
        <Link className="inline-flex min-h-11 items-center font-semibold underline" href={verifyHref} target="_blank" rel="noopener noreferrer">Verify in a new tab</Link>{' '}
        Then return here to publish the reviewed rates.</output> : null}
    </> : review.action==='publish'?<p>{review.basisPoints!/100}% from {commissionDate(review.effectiveAt!)} · Nepal time.</p>:<p>Current terms remain in force. Future acceptance remains history and grants no new authority.</p>}
    <p>{review.reason}</p>
    <div className="flex flex-wrap gap-3"><Button className="min-h-11" type="button" disabled={busy} onClick={()=>void save()}>{busy?'Confirming…':uncertain?'Retry the same request':review.action==='initialize'?'Publish initial rates':embedded && review.action === 'publish' ? 'Schedule change' : 'Confirm reviewed action'}</Button>{!uncertain?<Button className="min-h-11" type="button" variant="outline" disabled={busy} onClick={()=>{setReview(null);setNeedsMfa(false);}}>Keep editing</Button>:null}</div>
    {uncertain?<output className="block" aria-live="polite">The result is not confirmed. Keep this exact request until its saved outcome is known.</output>:null}
  </div>:null}
  {message?<output className="block" aria-live="polite">{message}</output>:null}
  {state.history.length?<details open={embedded}><summary className="min-h-11 cursor-pointer py-3 font-semibold">{embedded ? 'History' : 'Common policy history'}</summary><div className="mt-3 space-y-3">{state.history.map(policy=><article key={policy.id} className="rounded-lg border p-3"><h3>{policy.basisPoints/100}% · {commissionDate(policy.effectiveAt)}</h3><p>{policy.cancelledAt?policy.replacementId?'Replaced':'Cancelled':policy.effectiveAt>state.asOf?'Scheduled':'Effective history'}</p><p>{policy.reason}</p><details><summary>Recorded terms</summary><p className="whitespace-pre-line text-sm">{policy.termsText}</p></details></article>)}</div></details>:null}
  {embedded && !state.history.length ? <section aria-label="History" className="space-y-2">
    <h3 className="font-semibold">History</h3>
    <p className="border-t border-[#E4DACA] pt-2.5 text-sm text-[#46536F]">No common fee schedules have been published.</p>
  </section> : null}
  {embedded ? <Link href="/admin/commission#rate-management" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Commission earnings and rate history</Link> : null}
 </section>;
}
