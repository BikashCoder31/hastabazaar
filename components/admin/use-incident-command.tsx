'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSessionReference,notifySessionReference} from '@/hooks/use-session-reference';
import {useDenyStaffReview} from './staff-review-access-boundary';

type Reference={requestId:string;action:string;sourceId:string};
type Attempt={reference:Reference;wire:string;uncertain:boolean};
const endpoint='/api/admin/system-health/incidents';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function parse(value:unknown):Reference|null{
 if(typeof value!=='string')return null;
 try{const item:unknown=JSON.parse(value);return object(item)&&Object.keys(item).length===3&&typeof item.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(item.requestId)&&typeof item.action==='string'&&/^[a-z_]{1,40}$/.test(item.action)&&typeof item.sourceId==='string'&&item.sourceId.length>0&&item.sourceId.length<=191?{requestId:item.requestId,action:item.action,sourceId:item.sourceId}:null;}catch{return null;}
}

/** Storage retains only opaque actor/workspace/action references; draft and exact wire stay in RAM. */
export function useIncidentCommand(actorId:string,workspace:string,onSaved:(id:string,recovered:boolean)=>void,onFormReviewRequired:(response:Pick<Response,'status'|'ok'>)=>void){
 const router=useRouter(),denyParent=useDenyStaffReview(),key=sessionAttemptKey('staff.incident-review',JSON.stringify([actorId,workspace])),stored=useSessionReference(key),scope=useOwnedFormScope(key);
 const [attempt,setAttempt]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false),[confirmed,setConfirmed]=useState(false);
 const flight=useRef(false),restored=parse(stored),reference=attempt?.reference??restored;
 const unavailable=stored===undefined||stored==='unavailable'||!!stored&&!restored;
 const pending=!!reference;
 function deny(){if(!scope.isCurrent())return;setDenied(true);denyParent?.();router.refresh();}
 function retain(value:Reference){
  const wire=JSON.stringify(value),existing=sessionStorage.getItem(key);
  if(existing!==null&&existing!==wire)throw Error('Another original incident action is retained. Check it before another save.');
  sessionStorage.setItem(key,wire);if(sessionStorage.getItem(key)!==wire)throw Error('The original reference could not be retained. No incident action was sent.');notifySessionReference(key);
 }
 function clear(value:Reference){try{if(sessionStorage.getItem(key)===JSON.stringify(value)){sessionStorage.removeItem(key);notifySessionReference(key);}}catch{/* The immutable saved fact remains true; its reference remains recoverable. */}}
 function matches(value:unknown,ref:Reference){return object(value)&&value.actorId===actorId&&value.requestId===ref.requestId&&value.action===ref.action&&value.sourceId===ref.sourceId;}
 function recorded(value:unknown,ref:Reference):value is Record<string,unknown>&{incidentId:string}{return matches(value,ref)&&object(value)&&value.recorded===true&&value.historical===true&&typeof value.incidentId==='string'&&value.incidentId.length>0&&typeof value.version==='string'&&/^\d+:\d+$/.test(value.version)&&typeof value.state==='string';}
 function finish(ref:Reference,id:string,recovered:boolean){if(!scope.isCurrent())return;clear(ref);setAttempt(null);setConfirmed(true);setMessage('The original incident action is recorded. This is its historical result; review current evidence before another action.');onSaved(id,recovered);router.refresh();}
 async function send(value:Attempt){
  if(flight.current||!scope.isCurrent()||denied)return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   retain(value.reference);setAttempt({...value,uncertain:true});
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',[ACTOR_INTENT_HEADER]:actorId},body:value.wire});
   if(!scope.isCurrent())return;
   if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json().catch(()=>null);
   if(response.ok&&recorded(result,value.reference)){finish(value.reference,result.incidentId,false);return;}
   if(response.status===409&&!value.uncertain&&matches(result,value.reference)&&object(result)&&result.phase==='before_write'){
    if(result.code==='form_review_required')onFormReviewRequired(response);
    clear(value.reference);setAttempt(null);setMessage(typeof result.error==='string'?result.error:'Review the current incident evidence. Your draft is retained.');router.refresh();return;
   }
   setMessage('The original outcome is uncertain. Retry the identical action or check its recorded outcome; your original draft is retained.');
  }catch(error){if(scope.isCurrent())setMessage(error instanceof Error?error.message:'The original outcome could not be confirmed.');}
  finally{flight.current=false;if(scope.isCurrent())setBusy(false);}
 }
 async function recover(){
  if(!reference||flight.current||!scope.isCurrent()||denied)return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const query=new URLSearchParams(reference),response=await fetch(endpoint+'?'+query,{headers:{[ACTOR_INTENT_HEADER]:actorId},cache:'no-store'});
   if(!scope.isCurrent())return;
   if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json().catch(()=>null);
   if(response.ok&&recorded(result,reference)){finish(reference,result.incidentId,true);return;}
   setMessage('The original outcome is not confirmed. Its reference is retained; no new action has been started.');
  }catch(error){if(scope.isCurrent())setMessage(error instanceof Error?error.message:'The original outcome could not be checked.');}
  finally{flight.current=false;if(scope.isCurrent())setBusy(false);}
 }
 function submit(payload:Record<string,unknown>){
  if(pending||unavailable||confirmed||denied||flight.current||!scope.isCurrent())return;
  const action=String(payload.action),sourceId=action==='create'?'new':String(action==='legacy_map'?payload.legacyId:payload.incidentId),ref={requestId:crypto.randomUUID(),action,sourceId};
  return send({reference:ref,wire:JSON.stringify({...payload,requestId:ref.requestId}),uncertain:false});
 }
 const recovery=pending?<div className="space-y-2"><output className="block">An original incident action remains unresolved. Its reference is retained.</output><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={busy||denied} onClick={recover}>Check original incident outcome</Button>{attempt?<Button type="button" variant="outline" className="min-h-11" disabled={busy||denied} onClick={()=>send(attempt)}>Retry original incident action</Button>:null}</div></div>:unavailable?<output className="block">The original-action reference is unavailable. Incident actions are paused until it can be read safely.</output>:null;
 return{busy,pending,confirmed,blocked:pending||unavailable||confirmed||denied,message,recovery,submit,resetConfirmation(){if(scope.isCurrent()&&!pending)setConfirmed(false);}};
}
