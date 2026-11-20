'use client';
import {useEffect,useEffectEvent,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSellerPrivateScope,SellerFormAccessChanged} from './use-seller-private-scope';
const label=(name:string)=>name.replace(/([A-Z])/g,' $1').replaceAll('_',' ');
type Props={caseId:string;permissionId:string;accountId:string;fields:readonly string[];defaults:Record<string,string>;evidenceKinds:readonly string[]};
export function ProtectedIdentityForm(props:Props){return <OwnedProtectedIdentityForm key={JSON.stringify([props.accountId,props.caseId,props.permissionId,[...props.fields].sort(),[...props.evidenceKinds].sort()])} {...props}/>;}
function OwnedProtectedIdentityForm({caseId,permissionId,accountId,fields,defaults,evidenceKinds}:Props){
  const scope=useSellerPrivateScope(accountId,JSON.stringify([caseId,permissionId]));
  const router=useRouter(),formRef=useRef<HTMLFormElement>(null),pending=useRef<FormData|null>(null);
  const [busy,setBusy]=useState(false),[retained,setRetained]=useState(false),[locked,setLocked]=useState(false),[message,setMessage]=useState('');
  const clearPrivate=()=>{if(!scope.isCurrent())return;for(const element of Array.from(formRef.current?.elements??[]))if(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement)element.value='';scope.deny();};
  const valueFields=fields.filter(field=>!['representative_identity','pan_certificate','business_registration'].includes(field));
  const checkFocused=useEffectEvent(async(active:()=>boolean)=>{try{const response=await fetch('/api/seller/bank-details',{cache:'no-store',headers:{[ACTOR_INTENT_HEADER]:accountId}});if(!scope.isCurrent())return;if(response.status===401||response.status===403){clearPrivate();return;}const body=await response.json() as {userId?:string};if(!scope.isCurrent())return;
    if(active()&&(response.status===401||response.status===403||body.userId&&body.userId!==accountId)){clearPrivate();setMessage('Account access changed. Reopen this private case before entering evidence.');}}catch{/* Preserve inputs when the network is unavailable. */}});
  useEffect(()=>{let active=true;const check=()=>{void checkFocused(()=>active);};window.addEventListener('focus',check);return()=>{active=false;window.removeEventListener('focus',check);};},[]);
  async function submit(event:React.SyntheticEvent<HTMLFormElement,SubmitEvent>){event.preventDefault();if(busy||locked||!scope.isCurrent())return;
    if(!pending.current){const data=new FormData(event.currentTarget),values=Object.fromEntries(valueFields.map(field=>{const value=data.get(field);return[field,typeof value==='string'?value:''];}));
      for(const field of valueFields)data.delete(field);data.set('values',JSON.stringify(values));data.set('accountId',accountId);data.set('permissionId',permissionId);data.set('commandId',crypto.randomUUID());pending.current=data;}
    setBusy(true);setRetained(true);
    try{const response=await fetch(`/api/seller/protected-changes/${encodeURIComponent(caseId)}/identity`,{method:'POST',headers:{[ACTOR_INTENT_HEADER]:accountId},body:pending.current});if(!scope.isCurrent())return;if(response.status===401||response.status===403){clearPrivate();return;}const body=await response.json() as {ok?:boolean;error?:string;code?:string};if(!scope.isCurrent())return;
      if(!response.ok){if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setRetained(false);}if(body.code==='account_changed'||response.status===401||response.status===403)clearPrivate();
        throw new Error(body.error??'The identity submission could not be confirmed.');}
      if(body.ok!==true)throw new Error('Identity submission result is incomplete. Retry the original retained evidence.');
      pending.current=null;setRetained(false);setLocked(true);setMessage('Proposed facts and evidence saved. Current verified facts stay effective until review; existing holds remain.');router.refresh();
    }catch(error){if(!scope.isCurrent())return;setMessage(error instanceof Error?error.message:'Save could not be confirmed. Retry the same retained submission.');}finally{if(scope.isCurrent())setBusy(false);}}
  if(scope.accessDenied)return <SellerFormAccessChanged/>;
  return <form data-form-id="seller.protected-identity-upload" ref={formRef} onSubmit={submit} className="space-y-4 rounded-xl border p-5"><h2 className="font-heading text-xl">Supply permitted identity changes</h2>
    <p className="text-sm">Only this exact scope is open. This cannot transfer the account or business to another person or entity. Attach evidence for the facts you change.</p>
    <fieldset disabled={busy||retained||locked} className="space-y-3">{valueFields.map(field=><label className="block text-sm capitalize" key={field}>{label(field)}
      {field==='governmentIdType'?<select name={field} defaultValue={defaults[field]||''} required className="mt-1 block w-full rounded border bg-background p-2"><option value="" disabled>Choose type</option>{['citizenship','national_id','passport','driving_licence','other_government_id'].map(type=><option key={type} value={type}>{label(type)}</option>)}</select>
      :<input name={field} defaultValue={defaults[field]||''} required={!['personalPan','governmentIdDescription'].includes(field)} maxLength={200} className="mt-1 block w-full rounded border bg-background p-2"/>}</label>)}
      {evidenceKinds.map(kind=><label className="block text-sm capitalize" key={kind}>{label(kind)} proof<input type="file" name={kind} accept="image/png,image/jpeg,application/pdf" className="mt-1 block w-full"/></label>)}
      <p className="text-sm">PNG, JPEG or PDF; up to 5 MB per file. Files stay private.</p></fieldset>
    {retained&&!busy?<p className="text-sm">The result is uncertain. Your exact fields and files are retained for retry.</p>:null}
    <Button type="submit" disabled={busy||locked}>{busy?'Saving…':retained?'Retry retained submission':'Submit for identity verification'}</Button>
    {!retained&&!locked?<Button type="button" variant="outline" onClick={()=>router.refresh()}>Review current case</Button>:null}<output className="block text-sm" aria-live="polite">{message}</output></form>;
}
