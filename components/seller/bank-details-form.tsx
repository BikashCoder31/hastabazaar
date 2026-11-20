'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Landmark, ShieldCheck } from 'lucide-react';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { Input } from '@/components/ui/input';
import {useRouter} from 'next/navigation';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {sellerAccessDenied,SELLER_ACCESS_EVENT} from '@/lib/sellers/client-access';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {ProtectedChangeRequestForm} from './protected-change-request-form';
import type {BankDetails} from '@/lib/sellers/bank-details';
type BankFormState={status:string;revision:string;userId:string;caseId:string|null;permissionId:string|null;identityRevision:number;bankRevision:number;activeCase:boolean};

type BankProps={accountId:string;caseId?:string;defaults?:BankDetails;allowedFields?:readonly string[];
  overview?: boolean; maskedAccount?: {bankName:string;lastFour:string;beneficiary:string}|null;
};
export function SellerBankDetailsForm(props:BankProps) {
  const scope=useOwnedFormScope(JSON.stringify([props.accountId,props.caseId??null]));
  return <OwnedSellerBankDetailsForm key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}
function OwnedSellerBankDetailsForm({accountId,caseId,defaults,allowedFields,overview=false,maskedAccount,isCurrent}:BankProps&{isCurrent:()=>boolean}) {
  const router=useRouter();const [state, setState] = useState<BankFormState | null>(null);
  const pending=useRef<FormData|null>(null);const [hasPending,setHasPending]=useState(false);
  const [message, setMessage] = useState('Loading bank details status…');
  const [busy, setBusy] = useState(false);const[accessDenied,setAccessDenied]=useState(false);
  function deny(){if(!isCurrent())return;setAccessDenied(true);sellerAccessDenied(accountId);router.refresh();}
  async function load(signal?:AbortSignal) {
    const response = await fetch('/api/seller/bank-details'+(caseId?`?caseId=${encodeURIComponent(caseId)}`:''), { cache: 'no-store', headers:{[ACTOR_INTENT_HEADER]:accountId},signal });
    const body = await response.json() as BankFormState & {error?:string};
    if(!isCurrent())throw new Error('This bank workspace changed.');
    if(response.status===401||response.status===403){deny();throw new Error('Your account access changed. Refresh before continuing.');}
    if (!response.ok) throw new Error(body.error ?? 'Bank details could not be loaded.');
    if(body.userId!==accountId||typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision)||(caseId&&body.caseId!==caseId))throw new Error('The current bank workspace could not be confirmed. Refresh before continuing.');
    return body;
  }
  const loadInitial=useEffectEvent((signal:AbortSignal)=>{void load(signal).then(body=>{if(!signal.aborted&&isCurrent()){setState(body);setMessage('');}}).catch(error=>{if(!signal.aborted&&isCurrent())setMessage(error.message);});});
  useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)loadInitial(controller.signal);});return()=>controller.abort();},[]);
  const checkFocused=useEffectEvent((active:()=>boolean)=>{void load().then(body=>{if(active()&&isCurrent()&&state&&body.revision!==state.revision&&!pending.current)setMessage('Bank source details changed. Refresh and review the current source before submitting. Your entries remain on this page.');}).catch(error=>{if(active()&&isCurrent())setMessage(error.message);});});
  useEffect(()=>{let active=true;const check=()=>checkFocused(()=>active);window.addEventListener('focus',check);return()=>{active=false;window.removeEventListener('focus',check);};},[]);
  useEffect(()=>{const denied=(event:Event)=>{if(isCurrent()&&(event as CustomEvent<{actorId?:string}>).detail?.actorId===accountId){setAccessDenied(true);router.refresh();}};window.addEventListener(SELLER_ACCESS_EVENT,denied);return()=>window.removeEventListener(SELLER_ACCESS_EVENT,denied);},[accountId,isCurrent,router]);
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault(); if (!isCurrent() || accessDenied || !state || busy) return;
    const form = event.currentTarget;
    if(!pending.current){const data=new FormData(form);data.set('revision',state.revision);data.set('accountId',state.userId);data.set('commandId',crypto.randomUUID());
      if(state.permissionId&&state.caseId){data.set('changeRequestId',state.caseId);data.set('permissionId',state.permissionId);}pending.current=data;setHasPending(true);}
    setBusy(true);
    try {
      const response = await fetch('/api/seller/bank-details', { method: 'POST', headers:{[ACTOR_INTENT_HEADER]:accountId}, body: pending.current });
      const body = await response.json() as { error?: string;ok?:boolean };
      if(!isCurrent())return;
      if(response.status===401||response.status===403){deny();return;}
      if (!response.ok) {if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setHasPending(false);}throw new Error(body.error ?? 'Bank details could not be saved.');}
      if(body.ok!==true)throw new Error('Bank submission could not be confirmed. Retry the same submission.');
      const next=await load();if(!isCurrent())return;setState(next);pending.current=null;setHasPending(false); form.reset(); setMessage('Bank details submitted for review. Payouts remain blocked until verification is complete.');router.refresh();
    } catch (error) { if(!isCurrent())return;setMessage(error instanceof Error ? error.message : 'Save could not be confirmed. Reload to check before retrying.'); }
    finally { if(isCurrent())setBusy(false); }
  }
  if(accessDenied)return <p role="alert">Seller access changed. Reopen this workspace before continuing with bank details.</p>;
  const protectedChange=state&&!['missing','pending'].includes(state.status)&&!state.activeCase?<ProtectedChangeRequestForm kind="bank" fields={['payoutBeneficiary','bankName','bankBranch','bankAccountNumber','bank_verification']}
    identityRevision={state.identityRevision} bankRevision={state.bankRevision} accountId={state.userId} onSaved={()=>{if(!isCurrent())return;void load().then(body=>{if(isCurrent())setState(body);}).catch(error=>{if(isCurrent())setMessage(error.message);});}}/>:null;
  return <section id="bank-details" className={overview?'min-w-0 space-y-4 rounded-[0.9rem] border border-[#E4DACA] bg-white p-4 sm:p-5':'space-y-4 rounded-2xl border bg-card p-6'}>
    <h2 className={overview?'font-bold':'font-heading text-2xl'}>{overview?'Bank account':'Bank details for payouts'}</h2>
    {overview&&maskedAccount?<div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-[#E4DACA] bg-[#FFFCF7] p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#DFECE4] text-[#236548]"><Landmark className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 basis-32 break-words text-sm"><strong>{maskedAccount.bankName} · account ending {maskedAccount.lastFour}</strong><p className="text-[#46536F]">In the name of {maskedAccount.beneficiary}</p></div>
      {state?.status==='verified'?<span className="inline-flex items-center gap-1 rounded-full bg-[#DFECE4] px-2 py-1 text-xs font-semibold text-[#236548]"><Check className="size-3.5" /> Verified</span>:null}
    </div>:null}
    {!overview?<p className="text-sm text-muted-foreground">Add these details when you are ready. Staff must review the beneficiary and bank evidence before processing payouts. Never enter a banking password, PIN or OTP.</p>:null}
    {overview&&state?.activeCase?<div className="flex items-start gap-2 rounded-xl bg-[#E3E9F4] p-3 text-sm text-[#264880]">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1"><p className="font-bold">Your bank account change is being checked.</p><WhoseTurn status="with-hastabazaar" /><p>The current receiving account stays on file while Hastabazaar reviews the change.</p></div>
    </div>:null}
    <output className="block text-sm text-[#46536F]">{message || (state?.status === 'verified' ? overview ? '' : state.activeCase?'A bank change is open. The recorded receiving account stays current until its replacement is verified.':'A receiving reference is recorded. Actual evidence, current identity and all holds are rechecked before payout.' : state?.status==='legacy_review_required'?'A legacy receiving reference is retained but needs evidence reconciliation before it can be treated as verified.':state?.status==='needs_recheck'?'The receiving evidence or linked identity needs a fresh review. The existing account stays protected.':state?.status === 'pending' ? 'Your bank details are awaiting review. You can replace them below if corrections are needed.' : 'Bank details have not been added. Payouts are unavailable until review is complete.')}</output>
    {state?.caseId?<a className="section-link inline-flex min-h-11 items-center" href={`/seller/requests/changes/${encodeURIComponent(state.caseId)}`}>Open the bank review and its hold status →</a>:null}
    {hasPending?<p className="text-sm">Retry confirms the same submitted details and file before you make further edits.</p>:null}
    {overview&&protectedChange?<details className="space-y-3"><summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-[#D7C4A9] px-3 text-sm font-semibold">Change bank account</summary>{protectedChange}</details>:protectedChange}
    {state && (['missing','pending'].includes(state.status)||!!caseId&&!!state.permissionId) ? <form key={state.userId} data-form-id="seller.bank-details" onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy||hasPending} className="grid gap-4 sm:grid-cols-2">
      {([['payoutBeneficiary', 'Account beneficiary name'], ['bankName', 'Bank name'], ['bankBranch', 'Bank branch'], ['bankAccountNumber', 'Bank account number']] as const).map(([name, label]) =>
        <label key={name} className="space-y-2 text-sm">{label} *<Input name={name} required minLength={name === 'bankAccountNumber' ? 4 : 3} maxLength={name === 'bankAccountNumber' ? 40 : 160} autoComplete="off" spellCheck={false}
          defaultValue={defaults?.[name]} readOnly={!!allowedFields&&!allowedFields.includes(name)}/></label>)}
      <label htmlFor="payout-bank-evidence" className="space-y-2 text-sm sm:col-span-2">Bank evidence showing the beneficiary and account *<Input id="payout-bank-evidence" name="bankVerification" type="file" required accept="application/pdf,image/jpeg,image/png" /><span>PDF, JPG or PNG, up to 5 MB. Stored privately.</span></label>
      </fieldset><Button disabled={busy} type="submit">{busy ? 'Submitting…' : hasPending?'Retry the same submission':'Submit bank details for review'}</Button>
    </form> : null}
  </section>;
}
