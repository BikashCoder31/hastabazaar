'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {sellerAccessDenied} from '@/lib/sellers/client-access';
import { NEPAL_PROVINCES } from '@/lib/checkout/validation';
import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const catalogBaseKeys = ['tradingName', 'businessDescription', 'sellerId', 'idempotencyKey',
  'legalName', 'payoutAccountReference', 'supportPhone', 'supportEmail', 'province', 'district',
  'municipality', 'ward', 'locality', 'productCategories', 'requestId', 'formVersion', 'customAnswers'];

type ProfileProps={profile:EditableSellerProfile;sellerId:string;accountId:string};
export function SellerProfileForm(props:ProfileProps){
 const scope=useOwnedFormScope(JSON.stringify([props.accountId,props.sellerId]));
 return <OwnedSellerProfileForm key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}
function OwnedSellerProfileForm({profile,sellerId,accountId,isCurrent}:ProfileProps&{isCurrent:()=>boolean}){
  const router=useRouter(),pending=useRef<string|null>(null),retainedKey=useRef<string|null>(null);
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[accessDenied,setAccessDenied]=useState(false);
  const attemptKey=sessionAttemptKey('seller.profile',JSON.stringify([accountId,sellerId]));
  const legacyKey=sessionAttemptKey('seller.profile',sellerId);
  const[hasPendingAttempt,setHasPendingAttempt]=useState(false),[hasPendingBody,setHasPendingBody]=useState(false),[checkingReference,setCheckingReference]=useState(true),[checkedUnconfirmed,setCheckedUnconfirmed]=useState(false);
  const catalog = usePublishedFormConfig('seller.profile');
  useEffect(()=>{
    const timeout=window.setTimeout(()=>{if(!isCurrent())return;retainedKey.current=hasSessionAttempt(attemptKey)?attemptKey:hasSessionAttempt(legacyKey)?legacyKey:null;setHasPendingAttempt(retainedKey.current!==null);setCheckingReference(false);},0);
    return()=>window.clearTimeout(timeout);
  },[attemptKey,legacyKey,isCurrent]);
  function deny(){if(!isCurrent())return;setAccessDenied(true);sellerAccessDenied(accountId);router.refresh();}
  function confirmed(text:string){
    if(!isCurrent())return;if(retainedKey.current)clearSessionAttempt(retainedKey.current);
    retainedKey.current=null;pending.current=null;setHasPendingBody(false);setHasPendingAttempt(false);setCheckedUnconfirmed(false);setMessage(text);router.refresh();
  }
  async function originalOutcome():Promise<'recorded'|'unconfirmed'|'obsolete'>{
    const key=retainedKey.current;if(!key)return 'unconfirmed';
    const requestId=sessionStorage.getItem(key);if(!requestId)throw new Error('The original reference is unavailable. Review your workshop history before a different action.');
    const query=new URLSearchParams({sellerId,requestId});
    const response=await fetch('/api/seller/profile?'+query,{headers:{[ACTOR_INTENT_HEADER]:accountId},cache:'no-store'});
    const body=await response.json().catch(()=>null)as{status?:string;requestId?:string;error?:string}|null;
    if(!isCurrent())return 'obsolete';if(response.status===401||response.status===403){deny();return 'obsolete';}
    if(!response.ok||body?.requestId!==requestId||!['recorded','unconfirmed'].includes(body?.status??''))throw new Error(body?.error??'The original workshop outcome could not be confirmed. Keep its reference and retry.');
    if(body?.status==='recorded'){confirmed('Original workshop update was recorded. Review the current saved details.');return 'recorded';}
    setCheckedUnconfirmed(true);setMessage('No original receipt is confirmed. This does not prove the save failed. Keep its reference and check again before a different action.');return 'unconfirmed';
  }
  async function checkOriginal(){if(busy||!isCurrent())return;setBusy(true);try{await originalOutcome();}catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'The original result could not be checked.');}finally{if(isCurrent())setBusy(false);}}
  function resetAttempt(){
    if(!isCurrent()||!checkedUnconfirmed){setMessage('Check the original workshop result before starting a different attempt.');return;}
    if(!window.confirm('The original save remains unconfirmed and may still have succeeded. Review its history first. Start a separate new attempt anyway?'))return;
    if(retainedKey.current)clearSessionAttempt(retainedKey.current);retainedKey.current=null;pending.current=null;setHasPendingBody(false);setHasPendingAttempt(false);setCheckedUnconfirmed(false);setMessage('A separate workshop attempt is ready. The original outcome remains unconfirmed.');
  }
  async function submit(event:React.SyntheticEvent<HTMLFormElement>){
    event.preventDefault();if(!isCurrent()||accessDenied||busy||checkingReference||!catalog.canSubmit||!catalog.config)return;
    const form=event.currentTarget;setBusy(true);setMessage('');
    try{
      if(retainedKey.current){const outcome=await originalOutcome();if(outcome!=='unconfirmed'||!pending.current)return;}
      if(!pending.current){
        const data=new FormData(form),next=Object.fromEntries([...data.entries()].filter(([key])=>key!=='formVersion'&&!key.startsWith('custom.')));
        const configured=readConfiguredSubmission(form,catalog.config,catalogBaseKeys),idempotencyKey=getOrCreateSessionAttempt(attemptKey);
        retainedKey.current=attemptKey;pending.current=JSON.stringify({profile:next,idempotencyKey,...configuredJsonPayload(catalog.config,configured.answers,catalogBaseKeys)});setHasPendingBody(true);setHasPendingAttempt(true);
      }
      let response:Response;try{response=await fetch('/api/seller/profile',{method:'PATCH',headers:{'Content-Type':'application/json',[ACTOR_INTENT_HEADER]:accountId},body:pending.current});}catch{throw new Error('We couldn’t connect. Check your connection and retry the original workshop save.');}
      const body=await response.json().catch(()=>null)as{ok?:boolean;error?:string;code?:string}|null;
      if(!isCurrent())return;if(response.status===401||response.status===403){deny();return;}
      catalog.handleSubmissionResponse(response,body?.code);
      if(!response.ok||body?.ok!==true)throw new Error(body?.error??'The workshop save could not be confirmed. Check or retry the original result.');
      confirmed('Private workshop details saved.');
    }catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'The workshop save could not be confirmed. Keep its original reference.');}
    finally{if(isCurrent())setBusy(false);}
  }
  if(accessDenied)return <p role="alert">Seller access changed. Reopen your current workspace before continuing.</p>;
  return (
    <form
      data-form-id="seller.profile"
      onSubmit={submit}
      className="seller-form mt-7 grid gap-5 rounded-2xl border bg-card p-6 sm:grid-cols-2"
    >
      <fieldset className="contents" disabled={busy||hasPendingAttempt||checkingReference}>
      <FormGuide formId="seller.profile" />
      <h2 className="font-heading text-2xl sm:col-span-2">Private workshop location</h2>
      <p className="text-sm sm:col-span-2">Public presentation and support contacts have their own actions above. Recorded values below are read-only in this workshop form.</p>

      <Field
        name="tradingName"
        label={fieldDisplay(catalog.config, 'tradingName')?.label ?? 'Public trading name'}
        help={fieldDisplay(catalog.config, 'tradingName')?.helpText}
        placeholder={fieldDisplay(catalog.config, 'tradingName')?.placeholder}
        defaultValue={profile.tradingName}
        readOnly
      />
      <Field
        name="supportEmail"
        label="Customer support email"
        type="email"
        defaultValue={profile.supportEmail}
        readOnly
      />
      <Field
        name="supportPhone"
        label="Customer support phone"
        type="tel"
        autoComplete="tel"
        defaultValue={profile.supportPhone}
        readOnly
      />
      <div className="space-y-2">
        <Label htmlFor="province">Province</Label>
        <select
          id="province"
          name="province"
          defaultValue={profile.province}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {NEPAL_PROVINCES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <Field
        name="district"
        label="District"
        defaultValue={profile.district}
        required
      />
      <Field
        name="municipality"
        label="Municipality"
        defaultValue={profile.municipality}
        required
      />
      <Field name="ward" label="Ward" type="number" inputMode="numeric" min={1} max={99} step={1} defaultValue={profile.ward ?? ''} />
      <Field
        name="locality"
        label="Workshop locality"
        defaultValue={profile.locality}
        required
      />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="businessDescription">{fieldDisplay(catalog.config, 'businessDescription')?.label ?? 'Maker story'}</Label>
        <Textarea
          id="businessDescription"
          name="businessDescription"
          defaultValue={profile.businessDescription ?? ''}
          readOnly
          maxLength={2000}
          rows={6}
          placeholder={fieldDisplay(catalog.config, 'businessDescription')?.placeholder}
          aria-describedby={fieldDisplay(catalog.config, 'businessDescription')?.helpText ? 'businessDescription-catalog-help' : undefined}
        />
        {fieldDisplay(catalog.config, 'businessDescription')?.helpText ? <p id="businessDescription-catalog-help" className="text-sm text-muted-foreground">{fieldDisplay(catalog.config, 'businessDescription')?.helpText}</p> : null}
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="productCategories">Crafts and specialties</Label>
        <Textarea
          id="productCategories"
          name="productCategories"
          defaultValue={profile.productCategories ?? ''}
          readOnly
          maxLength={1000}
          rows={3}
        />
      </div>
      {catalog.config ? <div className="sm:col-span-2"><ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /></div> : null}
      {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button
          type="submit"
          disabled={busy || checkingReference || !catalog.canSubmit || (hasPendingAttempt&&!hasPendingBody)}
          className="min-h-11 rounded-full px-6"
        >
          {busy ? 'Saving…' : hasPendingBody ? 'Retry original workshop save' : 'Save private workshop location'}
        </Button>
        {message ? (
          <output className="text-sm text-muted-foreground">{message}</output>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">
        Legal name, registration, tax and payout details stay locked to the
        reviewed application and require Admin-controlled change verification.
      </p>
      {hasPendingAttempt ? <div className="space-y-2 sm:col-span-2">
        <p className="text-sm text-muted-foreground">The original workshop reference is retained. Reload checks its native saved outcome without reconstructing private entries.</p>
        <Button type="button" variant="outline" disabled={busy} onClick={()=>void checkOriginal()}>Check original workshop result</Button>
        {checkedUnconfirmed?<Button type="button" variant="outline" onClick={resetAttempt}>Start a new seller profile attempt</Button>:null}
      </div> : null}
    </form>
  );
}
function Field({
  name,
  label,
  help,
  ...props
}: { name: string; label: string; help?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-describedby={help ? `${name}-catalog-help` : undefined} {...props} />
      {help ? <p id={`${name}-catalog-help`} className="text-sm text-muted-foreground">{help}</p> : null}
    </div>
  );
}
