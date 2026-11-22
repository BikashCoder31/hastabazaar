'use client';
import {useId,useRef,useState,type SubmitEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {PayoutFixDeadline} from '@/lib/sellers/payout-fixes';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSessionReference,notifySessionReference} from '@/hooks/use-session-reference';
import {useDenyStaffReview} from './staff-review-access-boundary';

type Action='review'|'permission';
type Props={actorId:string;action:Action;sourceId:string;url:string;fields:Record<string,string|null>;options:readonly [string,string][];canDecide:boolean;canSetDeadline?:boolean;problemNote?:string;initialDeadline?:PayoutFixDeadline};
type Attempt={id:string;wire:string;decision:string;uncertain:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

function DocumentDecisionForm(props:Props){return <OwnedDecision key={JSON.stringify([props.actorId,props.action,props.sourceId])} {...props}/>;}
function OwnedDecision({actorId,action,sourceId,url,fields,options,canDecide,canSetDeadline,problemNote,initialDeadline}:Props){
 const router=useRouter(),denyParent=useDenyStaffReview(),scope=useOwnedFormScope(JSON.stringify([actorId,action,sourceId]));
 const reasonId=useId();
 const key=sessionAttemptKey('staff.document.'+action,JSON.stringify([actorId,sourceId])),stored=useSessionReference(key);
 const revision=JSON.stringify(fields),[reviewedRevision,setReviewedRevision]=useState(revision);
 const [reason,setReason]=useState(options[0][0]==='request_correction' ? problemNote ?? '' : '');
 const [decision,setDecision]=useState(options[0][0]),[attempt,setAttempt]=useState<Attempt|null>(null);
 const [neededBefore,setNeededBefore]=useState<PayoutFixDeadline>(initialDeadline??'first_payout');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState(false),[denied,setDenied]=useState(false);
 const flight=useRef(false),restored=typeof stored==='string'&&uuid.test(stored)?stored:null;
 const requestId=attempt?.id??restored,blocked=stored===undefined||stored==='unavailable'||!!stored&&!restored,changed=revision!==reviewedRevision;
 const headers={[ACTOR_INTENT_HEADER]:actorId};
 function deny(){if(!scope.isCurrent())return;setDenied(true);denyParent?.();router.refresh();}
 function retain(id:string){
  const current=sessionStorage.getItem(key);
  if(current!==null&&current!==id)throw new Error('Another original action reference is retained. Check it before another decision.');
  sessionStorage.setItem(key,id);
  if(sessionStorage.getItem(key)!==id)throw new Error('The original action reference could not be retained. No decision was sent.');
  notifySessionReference(key);
 }
 function clearExact(id:string){try{if(sessionStorage.getItem(key)===id){sessionStorage.removeItem(key);notifySessionReference(key);}}catch{/* The recorded result remains true; its opaque reference stays recoverable. */}}
 function matches(value:unknown,id:string,expectedDecision?:string){
  return object(value)&&value.recorded===true&&value.actorId===actorId&&value.action===action&&value.sourceId===sourceId&&value.id===sourceId&&value.requestId===id
   &&typeof value.decision==='string'&&options.some(([allowed])=>allowed===value.decision)&&(expectedDecision===undefined||value.decision===expectedDecision);
 }
 function finish(id:string){
  if(!scope.isCurrent())return;
  clearExact(id);setAttempt(null);setConfirmed(true);
  setMessage('The original decision is recorded. Review the refreshed evidence and current permissions before another action.');router.refresh();
 }
 async function send(value:Attempt){
  if(flight.current||!scope.isCurrent()||denied)return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   retain(value.id);setAttempt({...value,uncertain:true});
   const response=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:value.wire});
   if(!scope.isCurrent())return;
   if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json().catch(()=>null);
   if(!scope.isCurrent())return;
   if(response.ok&&matches(result,value.id,value.decision)){finish(value.id);return;}
   const definite=object(result)&&result.phase==='before_write'&&result.actorId===actorId&&result.action===action&&result.sourceId===sourceId&&result.requestId===value.id;
   if(!value.uncertain&&definite){clearExact(value.id);setAttempt(null);}
   setMessage(object(result)&&typeof result.error==='string'?result.error:'The original decision could not be confirmed. Keep its reference and check the saved outcome.');
  }catch(error){if(scope.isCurrent())setMessage(error instanceof Error?error.message:'The original decision could not be confirmed. Check its saved outcome.');}
  finally{flight.current=false;if(scope.isCurrent())setBusy(false);}
 }
 function submit(event:SubmitEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy||flight.current||blocked||requestId||changed||confirmed||!canDecide||!scope.isCurrent())return;
  if(reason.trim().length<8){setMessage('Enter a meaningful seller-visible reason of at least eight characters.');return;}
  const id=crypto.randomUUID();
  void send({id,wire:JSON.stringify({...fields,decision,reason,commandId:id,
    ...(canSetDeadline&&decision==='request_correction'?{neededBefore}:{})}),decision,uncertain:false});
 }
 async function recover(){
  if(!requestId||flight.current||!scope.isCurrent()||denied)return;
  const original=requestId;flight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch(url+'?'+new URLSearchParams({commandId:original}),{cache:'no-store',headers});
   if(!scope.isCurrent())return;
   if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json().catch(()=>null);
   if(!scope.isCurrent())return;
   if(response.ok&&matches(result,original,attempt?.decision)){finish(original);return;}
   setMessage('The original decision is not confirmed. Its reference is retained; no new decision was sent. Review the recorded history before continuing.');
  }catch{if(scope.isCurrent())setMessage('The original outcome is unavailable. Its reference is retained; retry this read when connected.');}
  finally{flight.current=false;if(scope.isCurrent())setBusy(false);}
 }
 if(denied)return <section role="alert">Review access changed. Private inputs are hidden; reopen this record with current access.</section>;
 if(!canDecide&&!requestId&&!message)return null;
 return <section className="space-y-3 border-t pt-3">
  {canDecide||attempt?<form data-form-id={action==='review'?'staff.seller-document-review':'staff.seller-document-change-permission'} onSubmit={submit} className="space-y-3">
   <fieldset disabled={busy||!!requestId||confirmed} className="space-y-3">
    {action === 'review' ? (
      <fieldset className="flex min-w-0 flex-wrap gap-2">
        <legend className="sr-only">Document decision</legend>
        {options.map(([value, label]) => (
          <Button key={value} type="button" aria-pressed={decision === value} variant="outline"
            className={'min-h-11 max-w-full flex-1 whitespace-normal ' +
              (decision === value ? value === 'verify' ? 'border-[#236548] bg-[#DFECE4] text-[#236548]' : 'border-[#A8232E] bg-[#F8E1DE] text-[#6E1219]' : '')}
            onClick={() => {
              setDecision(value);
              if (value==='request_correction' && !reason.trim() && problemNote) setReason(problemNote);
            }}>{label}</Button>
        ))}
      </fieldset>
    ) : <label className="block space-y-2 text-sm">Decision<select name="decision" value={decision} onChange={event=>setDecision(event.target.value)} className="block min-h-11 w-full rounded-lg border bg-background p-3">{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    {decision==='request_correction' && (canSetDeadline||problemNote) ? (
      <section className="space-y-3 rounded-lg border border-[#E5C7C2] bg-[#FFFAF9] p-3">
        <h4 className="font-semibold">Ask the seller to fix</h4>
        <label htmlFor={reasonId} className="block space-y-2 text-sm">
          Note shown to the seller
          <Textarea id={reasonId} name="reason" value={reason} onChange={event=>setReason(event.target.value)}
            required minLength={8} maxLength={1000} className="min-h-24 bg-white"/>
        </label>
        {canSetDeadline ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">Needed before</legend>
            <label className="flex min-h-11 items-center gap-2 rounded border bg-white p-2 text-sm">
              <input type="radio" name="neededBefore" value="first_payout" checked={neededBefore==='first_payout'} onChange={()=>setNeededBefore('first_payout')}/>
              First payout
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded border bg-white p-2 text-sm">
              <input type="radio" name="neededBefore" value="approval" checked={neededBefore==='approval'} onChange={()=>setNeededBefore('approval')}/>
              Approval
            </label>
          </fieldset>
        ) : null}
      </section>
    ) : <label htmlFor={reasonId} className="block space-y-2 text-sm">Reason shown to the seller<Input id={reasonId} name="reason" value={reason} onChange={event=>setReason(event.target.value)} required minLength={8} maxLength={1000} className="min-h-11"/></label>}
   </fieldset>
   {changed&&!requestId?<div className="space-y-2"><p>The evidence or review history changed. Inspect the current version before using your retained note.</p><Button type="button" variant="outline" onClick={()=>{setReviewedRevision(revision);setConfirmed(false);}}>Use reviewed current evidence</Button></div>:null}
   <Button type="submit" className="min-h-11" disabled={busy||blocked||!!requestId||changed||confirmed||!canDecide}>{busy?'Saving…':'Record decision'}</Button>
  </form>:null}
  <div className="flex flex-wrap gap-2">
   {attempt?<Button type="button" variant="outline" disabled={busy||blocked} onClick={()=>void send(attempt)}>Retry exact original decision</Button>:null}
   {requestId?<Button type="button" variant="outline" disabled={busy||blocked} onClick={()=>void recover()}>Check original saved outcome</Button>:null}
   <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal text-left" disabled={busy} onClick={()=>router.refresh()}>Refresh current evidence and keep my note</Button>
  </div>
  {requestId?<p className="text-sm">The original action reference is retained. {attempt?'Retry sends the exact original decision.':'Reloaded private input is never resubmitted; check the original saved outcome.'}</p>:null}
  {blocked&&stored!==undefined?<p role="alert">The original browser reference is unavailable or invalid. No new decision can be sent.</p>:null}
  {message?<output className="block text-sm" aria-live="polite">{message}</output>:null}
 </section>;
}

export function SellerDocumentReview({
 actorId,sellerId,documentId,expectedReviewId=null,canDecide=true,canSetDeadline,bankProblemOnly,problemNote,initialDeadline,
}:{
 actorId:string;sellerId:string;documentId:string;expectedReviewId?:string|null;canDecide?:boolean;canSetDeadline?:boolean;
 bankProblemOnly?:boolean;problemNote?:string;initialDeadline?:PayoutFixDeadline;
}){
 const options: [string,string][] = bankProblemOnly ? [['request_correction','Problem']]
   : [['verify','Matches'],['request_correction','Problem'],['reject','Reject document']];
 return <DocumentDecisionForm actorId={actorId} action="review" sourceId={documentId} url={`/api/admin/seller-documents/${encodeURIComponent(documentId)}/review`}
   fields={{sellerId,expectedReviewId}} canDecide={canDecide} canSetDeadline={canSetDeadline} problemNote={problemNote} initialDeadline={initialDeadline} options={options}/>;
}
export function DocumentChangeReview({actorId,requestId,expectedOperationId,canDecide=true}:{actorId:string;requestId:string;expectedOperationId:string|null;canDecide?:boolean}){
 return <DocumentDecisionForm actorId={actorId} action="permission" sourceId={requestId} url={`/api/admin/seller-document-change-requests/${encodeURIComponent(requestId)}`} fields={{expectedOperationId}} canDecide={canDecide} options={[["approve","Permit this document replacement"],["reject","Reject this change request"]]}/>;
}
