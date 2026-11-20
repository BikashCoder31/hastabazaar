'use client';
import {useRef,useState,type ReactNode,type SubmitEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSessionReference,notifySessionReference} from '@/hooks/use-session-reference';
import {useDenyStaffReview} from './staff-review-access-boundary';
import type {ProtectedAdminAction} from '@/lib/sellers/protected-admin-recovery';
type Props={actorId:string;action:ProtectedAdminAction;sourceId:string;revision:string;canDecide?:boolean;title:string;submitLabel:string;children:ReactNode;makePayload:(form:FormData)=>Record<string,unknown>;description?:ReactNode};
type Attempt={id:string;wire:string;decision:string;uncertain:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const decisions:Record<ProtectedAdminAction,readonly string[]>={permission:['permit','clarify','reject'],'verify-identity':['identity_verified'],'bank-details':['verify'],disposition:['retain_holds','release_holds','bank_revalidated','evidence_only','packet_retired']};
function decisionOf(action:ProtectedAdminAction,payload:Record<string,unknown>){return action==='permission'?String(payload.decision):action==='verify-identity'?'identity_verified':action==='bank-details'?'verify':payload.action==='revalidate_bank'?'bank_revalidated':payload.action==='retire_packet'?'packet_retired':String(payload.action);}
export function ProtectedReviewForm(props:Props){return <OwnedForm key={JSON.stringify([props.actorId,props.action,props.sourceId])} {...props}/>;}
function OwnedForm({actorId,action,sourceId,revision,canDecide=true,title,submitLabel,children,makePayload,description}:Props){
 const router=useRouter(),denyParent=useDenyStaffReview(),scope=useOwnedFormScope(JSON.stringify([actorId,action,sourceId])),flight=useRef(false),formRef=useRef<HTMLFormElement>(null);
 const key=sessionAttemptKey('staff.protected.'+action,JSON.stringify([actorId,sourceId])),stored=useSessionReference(key);
 const [attempt,setAttempt]=useState<Attempt|null>(null),[reviewedRevision,setReviewedRevision]=useState(revision),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false),[confirmed,setConfirmed]=useState(false);
 const restored=typeof stored==='string'&&uuid.test(stored)?stored:null,requestId=attempt?.id??restored,blocked=stored===undefined||stored==='unavailable'||!!stored&&!restored,changed=revision!==reviewedRevision;
 const url=action==='bank-details'?`/api/admin/seller-applications/${encodeURIComponent(sourceId)}/bank-details`:`/api/admin/seller-protected-changes/${encodeURIComponent(sourceId)}/${action}`;
 const headers={[ACTOR_INTENT_HEADER]:actorId};
 function deny(){if(!scope.isCurrent())return;setDenied(true);denyParent?.();router.refresh();}
 function retain(id:string){const current=sessionStorage.getItem(key);if(current!==null&&current!==id)throw Error('Another original action reference is retained. Check it before another decision.');sessionStorage.setItem(key,id);if(sessionStorage.getItem(key)!==id)throw Error('The original action reference could not be retained. No decision was sent.');notifySessionReference(key);}
 function clear(id:string){try{if(sessionStorage.getItem(key)===id){sessionStorage.removeItem(key);notifySessionReference(key);}}catch{/* A confirmed result stays true while its opaque reference remains recoverable. */}}
 function matches(value:unknown,id:string,decision?:string){return object(value)&&value.recorded===true&&value.actorId===actorId&&value.action===action&&value.sourceId===sourceId&&value.requestId===id&&typeof value.decision==='string'&&decisions[action].includes(value.decision)&&(decision===undefined||value.decision===decision);}
 function finish(id:string){if(!scope.isCurrent())return;clear(id);setAttempt(null);setConfirmed(true);setMessage('The original decision is recorded. Review current evidence, permissions and independent holds before another action.');router.refresh();}
 async function send(value:Attempt){
  if(flight.current||!scope.isCurrent()||denied)return;flight.current=true;setBusy(true);setMessage('');
  try{
   retain(value.id);setAttempt({...value,uncertain:true});
   const response=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:value.wire});
   if(!scope.isCurrent())return;if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json().catch(()=>null);if(!scope.isCurrent())return;
   if(response.ok&&matches(result,value.id,value.decision)){finish(value.id);return;}
   const definite=object(result)&&result.phase==='before_write'&&result.actorId===actorId&&result.action===action&&result.sourceId===sourceId&&result.requestId===value.id;
   if(!value.uncertain&&definite){clear(value.id);setAttempt(null);setReviewedRevision('review-required');router.refresh();}
   setMessage(object(result)&&typeof result.error==='string'?result.error:'The original decision could not be confirmed. Keep its reference and check the saved outcome.');
  }catch(error){if(scope.isCurrent())setMessage(error instanceof Error?error.message:'The original decision could not be confirmed. Check its saved outcome.');}
  finally{flight.current=false;if(scope.isCurrent())setBusy(false);}
 }
 function submit(event:SubmitEvent<HTMLFormElement>){event.preventDefault();if(busy||flight.current||blocked||requestId||changed||confirmed||!canDecide||!scope.isCurrent())return;
  let payload:Record<string,unknown>;try{payload=makePayload(new FormData(event.currentTarget));}catch(error){setMessage(error instanceof Error?error.message:'Review the required fields before recording this decision.');return;}
  const id=crypto.randomUUID();void send({id,wire:JSON.stringify({...payload,commandId:id}),decision:decisionOf(action,payload),uncertain:false});}
 async function recover(){
  if(!requestId||flight.current||!scope.isCurrent()||denied)return;const original=requestId;flight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch(url+'?'+new URLSearchParams({commandId:original}),{cache:'no-store',headers});
   if(!scope.isCurrent())return;if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json().catch(()=>null);if(!scope.isCurrent())return;
   if(response.ok&&matches(result,original,attempt?.decision)){finish(original);return;}
   setMessage('The original decision is not confirmed. Its reference is retained; no new decision was sent. Review recorded history before continuing.');
  }catch{if(scope.isCurrent())setMessage('The original outcome is unavailable. Its reference is retained; retry this read when connected.');}
  finally{flight.current=false;if(scope.isCurrent())setBusy(false);}
 }
 function reviewCurrent(){formRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input=>{input.checked=false;});setReviewedRevision(revision);setConfirmed(false);}
 if(denied)return <section role="alert">Review access changed. Private inputs are hidden; reopen this record with current access.</section>;
 if(!canDecide&&!requestId&&!message)return null;
 return <section data-protected-action={action} className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">{title}</h3>
  {canDecide||attempt?<form ref={formRef} data-form-id={action==='bank-details'?'staff.seller-bank-review':action==='permission'?'staff.protected-change-permission':action==='verify-identity'?'staff.protected-identity-review':'staff.protected-change-disposition'} onSubmit={submit} className="space-y-3"><fieldset disabled={busy||!!requestId||confirmed||changed} className="space-y-3">{children}</fieldset>
   {description}<Button type="submit" disabled={busy||blocked||!!requestId||changed||confirmed||!canDecide}>{busy?'Saving…':submitLabel}</Button>
  </form>:null}
  {changed&&!requestId?<div className="space-y-2"><p>The evidence or review history changed. Inspect its current version and confirm the evidence again; your notes are retained.</p><Button type="button" variant="outline" disabled={busy} onClick={reviewCurrent}>Use reviewed current evidence</Button></div>:null}
  <div className="flex flex-wrap gap-2">{attempt?<Button type="button" variant="outline" disabled={busy||blocked} onClick={()=>void send(attempt)}>Retry exact original decision</Button>:null}
   {requestId?<Button type="button" variant="outline" disabled={busy||blocked} onClick={()=>void recover()}>Check original saved outcome</Button>:null}
   <Button type="button" variant="outline" disabled={busy} onClick={()=>router.refresh()}>Refresh current evidence and keep my note</Button></div>
  {requestId?<p className="text-sm">The original action reference is retained. {attempt?'Retry sends the exact original decision.':'Reloaded private input is never resubmitted; check the original saved outcome.'}</p>:null}
  {blocked&&stored!==undefined?<p role="alert">The original browser reference is unavailable or invalid. No new decision can be sent.</p>:null}
  {message?<output className="block text-sm" aria-live="polite">{message}</output>:null}
 </section>;
}
