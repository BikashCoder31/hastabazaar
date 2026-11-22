'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {incomingReference,parseIncomingReference,parseUnclaimedIncomingReference,sameIncomingReference,type IncomingReference,type IncomingOutcome} from '@/lib/payments/incoming-outcome-contract';

export interface IncomingCommand{action:string;requestId:string;expectedRevision:string|null;input:Record<string,unknown>}
interface Options{actorId:string;storageKey:string;pending:IncomingCommand|null;onPending:(command:IncomingCommand|null)=>void;onRecorded:(reference:IncomingReference,outcome:IncomingOutcome)=>void}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const ACCESS_DENIED_EVENT='hastabazaar:incoming-access-denied';
function decode(raw:string|null|undefined){if(raw===null||raw===undefined)return null;try{return JSON.parse(raw) as unknown;}catch{return 'unavailable';}}
function readOutcome(value:unknown,reference:IncomingReference):IncomingOutcome|null{
 if(!object(value)||!Object.hasOwn(value,'outcome'))throw new Error('The original outcome response could not be verified.');
 if(value.outcome===null)return null;const outcome=value.outcome;if(!object(outcome)||!Number.isSafeInteger(outcome.recordedAt)||!object(outcome.entity)||typeof outcome.entity.id!=='string'||!outcome.entity.id||!['receipt','allocation','claim','order','reversal','parcel','exception'].includes(String(outcome.entity.kind)))throw new Error('The original outcome response could not be verified.');
 const expected=reference.action==='record_bank'||reference.action==='record_cash'?'receipt':reference.action==='allocate'?'allocation':reference.action==='review_claim'?'claim':reference.action==='release'||reference.action==='close_expired'?'order':reference.action==='record_reversal'?'reversal':reference.action==='reconcile_cod'?'parcel':'exception';
 if(outcome.entity.kind!==expected||['release','close_expired','reconcile_cod','triage_exception'].includes(reference.action)&&outcome.entity.id!==reference.sourceId)throw new Error('The original outcome does not match its retained source.');
 return{recordedAt:Number(outcome.recordedAt),entity:{kind:expected,id:outcome.entity.id}};
}
/** Only opaque references survive reload. Drafts and unchanged request bodies remain in their actor-owned page memory. */
export function useIncomingRecovery(options:Options){
 const {actorId,storageKey}=options,router=useRouter(),{isCurrent}=useOwnedFormScope(storageKey),raw=useSessionReference(storageKey),value=decode(raw),reference=parseIncomingReference(value,actorId),unclaimed=parseUnclaimedIncomingReference(value);
 const handlers=useRef(options),navigation=useRef(router),epoch=useRef(0);useLayoutEffect(()=>{handlers.current=options;navigation.current=router;},[options,router]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false),[verified,setVerified]=useState(false),[unrecorded,setUnrecorded]=useState(false);
 const legacy=object(value)&&(Object.hasOwn(value,'bank')||Object.hasOwn(value,'costs'));
 const headers={[ACTOR_INTENT_HEADER]:actorId};
 function current(ticket:number){return isCurrent()&&epoch.current===ticket;}
 useEffect(()=>{const denied=(event:Event)=>{if((event as CustomEvent<unknown>).detail!==actorId||!isCurrent())return;epoch.current++;setDenied(true);setVerified(false);setBusy(false);setMessage('Current Finance access or source eligibility changed. Keep the original reference.');};window.addEventListener(ACCESS_DENIED_EVENT,denied);return()=>window.removeEventListener(ACCESS_DENIED_EVENT,denied);},[actorId,isCurrent,setDenied,setVerified,setBusy,setMessage]);
 const observe=useCallback((response:Response)=>{if(response.status===401||response.status===403){window.dispatchEvent(new CustomEvent(ACCESS_DENIED_EVENT,{detail:actorId}));navigation.current.refresh();}},[actorId]);
 const verifyAccess=useCallback(()=>{
  const ticket=epoch.current;
  return fetch('/api/admin/payments',{headers:{[ACTOR_INTENT_HEADER]:actorId},cache:'no-store'}).then(async response=>{if(!isCurrent()||epoch.current!==ticket)return;observe(response);const body:unknown=await response.json().catch(()=>null);if(!isCurrent()||epoch.current!==ticket)return;if(!response.ok||!object(body)||!Array.isArray(body.accounts)||!Array.isArray(body.receipts))throw new Error('Current Finance access could not be verified. Your private draft stays in this page.');setVerified(true);setDenied(false);}).catch(error=>{if(isCurrent()&&epoch.current===ticket)setMessage(error instanceof Error?error.message:'Current Finance access could not be verified.');});
 },[actorId,isCurrent,observe,setVerified,setDenied,setMessage]);
 useEffect(()=>{void verifyAccess();const check=()=>{void verifyAccess();};const visible=()=>{if(document.visibilityState==='visible')check();};window.addEventListener('focus',check);window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',visible);};},[verifyAccess]);
 async function outcome(ref:IncomingReference,ticket:number){
  const response=await fetch('/api/admin/payments?'+new URLSearchParams({attempt:ref.requestId,action:ref.action,source:ref.sourceId}),{headers,cache:'no-store'});if(!current(ticket))return undefined;observe(response);const body:unknown=await response.json().catch(()=>null);if(!current(ticket))return undefined;if(!response.ok)throw new Error(object(body)&&typeof body.error==='string'?body.error:'Current access or the original incoming outcome could not be verified.');return readOutcome(body,ref);
 }
 function forget(ref:IncomingReference){const stored=decode(sessionStorage.getItem(storageKey)),existing=parseIncomingReference(stored,actorId),prior=parseUnclaimedIncomingReference(stored);if(existing&&sameIncomingReference(existing,ref)||prior&&!prior.actorMismatch&&prior.requestId===ref.requestId&&(!prior.claimedActorId||prior.claimedActorId===actorId)){sessionStorage.removeItem(storageKey);notifySessionReference(storageKey);}}
 function recorded(ref:IncomingReference,result:IncomingOutcome){try{forget(ref);}catch{/* A native recorded fact is not reversed by unavailable browser storage. */}handlers.current.onPending(null);handlers.current.onRecorded(ref,result);setUnrecorded(false);setDenied(false);setMessage('The original operation was recorded. Review the refreshed native balances before any next action.');router.refresh();}
 useEffect(()=>{
  if(raw===null||raw===undefined||raw==='unavailable'||!isCurrent())return;const stored=decode(raw);
  if(parseUnclaimedIncomingReference(stored)||object(stored)&&typeof stored.actorId==='string'&&parseIncomingReference(stored,stored.actorId))return;
  const pending=object(stored)&&object(stored.pending)?stored.pending:stored,requestId=object(pending)?pending.requestId:undefined,claimedActorId=object(stored)&&typeof stored.actorId==='string'?stored.actorId:undefined;
  const next=typeof requestId==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(requestId)?JSON.stringify({version:0,requestId,...claimedActorId===actorId?{claimedActorId}:claimedActorId?{actorMismatch:true}:{}}):'unavailable';
  try{sessionStorage.setItem(storageKey,next);notifySessionReference(storageKey);}catch{/* No private draft is sent or reconstructed when recovery storage is unavailable. */}
 },[raw,storageKey,isCurrent,actorId]);
 async function send(action:string,expectedRevision:string|null,input:Record<string,unknown>){
  if(busy||denied||!verified||!isCurrent()||legacy||raw===undefined)return;const ticket=++epoch.current;setBusy(true);setMessage('');setUnrecorded(false);
  try{
   const command=handlers.current.pending??{action,expectedRevision,input,requestId:crypto.randomUUID()},ref=incomingReference(actorId,command.action,command.requestId,command.input),stored=decode(sessionStorage.getItem(storageKey));
   if(stored!==null){const prior=parseIncomingReference(stored,actorId);if(!prior||!sameIncomingReference(prior,ref))throw new Error('Check the original saved outcome before starting another operation.');}
   sessionStorage.setItem(storageKey,JSON.stringify(ref));handlers.current.onPending(command);notifySessionReference(storageKey);
   const response=await fetch('/api/admin/payments',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(command)});if(!current(ticket))return;observe(response);const body:unknown=await response.json().catch(()=>null);if(!current(ticket))return;if(!response.ok)throw new Error(object(body)&&typeof body.error==='string'?body.error:'The operation could not be confirmed. Keep its original reference.');
   const result=await outcome(ref,ticket);if(!current(ticket))return;if(!result)throw new Error('The response is not yet supported by the original native record. Keep the reference and check its outcome.');recorded(ref,result);
  }catch(error){if(current(ticket))setMessage(error instanceof Error?error.message:'The original operation could not be confirmed.');}finally{if(current(ticket))setBusy(false);}
 }
 async function recover(){
  if(busy||!isCurrent())return;
  if(unclaimed?.actorMismatch||unclaimed?.claimedActorId&&unclaimed.claimedActorId!==actorId){setMessage('The retained nonce is not bound to this account. Its outcome remains unconfirmed; no private values or request body are adopted.');return;}
  if(!reference&&!unclaimed){await verifyAccess();if(isCurrent()&&raw!==null)setMessage('The original reference is unreadable. No operation is assumed unrecorded; review native history before continuing.');return;}
  const ticket=++epoch.current;setBusy(true);
  try{
   if(unclaimed){
    const response=await fetch('/api/admin/payments?'+new URLSearchParams({attempt:unclaimed.requestId,probe:'1'}),{headers,cache:'no-store'});if(!current(ticket))return;observe(response);const body:unknown=await response.json().catch(()=>null);if(!current(ticket))return;if(!response.ok||!object(body)||!Object.hasOwn(body,'recovery'))throw new Error('The original account and outcome could not be proved. Keep the nonce.');
    if(body.recovery===null){setUnrecorded(false);setMessage('No original receipt proves this nonce belongs to this account. Its outcome remains unconfirmed; do not start a replacement operation.');return;}
    if(!object(body.recovery))throw new Error('The original account and outcome could not be proved.');const proven=parseIncomingReference(body.recovery.reference,actorId);if(!proven||proven.requestId!==unclaimed.requestId)throw new Error('The original account and source do not match this nonce.');const result=readOutcome({outcome:body.recovery.outcome},proven);if(!result)throw new Error('The original native fact is unavailable.');recorded(proven,result);
   }else if(reference){
    const result=await outcome(reference,ticket);if(!current(ticket))return;if(result)recorded(reference,result);else if(result===null){setUnrecorded(true);setDenied(false);setMessage('No original outcome is recorded yet. Retry the unchanged operation, or explicitly review the current native records before starting another.');router.refresh();}
   }
   await verifyAccess();
  }catch(error){if(current(ticket))setMessage(error instanceof Error?error.message:'Keep the original recovery reference.');}finally{if(current(ticket))setBusy(false);}
 }
 function restart(){if(!isCurrent()||busy||denied||!unrecorded||!reference)return;epoch.current++;try{forget(reference);handlers.current.onPending(null);setUnrecorded(false);setMessage('Review the refreshed original records before entering another operation.');router.refresh();}catch{setMessage('The original reference could not be retired. Keep this page open.');}}
 return{busy,message:message||(unclaimed?'The original nonce is retained without an assumed actor. Check its native recorded outcome; private browser values are not restored.':raw==='unavailable'?'The original reference is unreadable. Its outcome remains unconfirmed.':''),setMessage,accessDenied:denied,verified,saved:reference!==null||raw!==undefined&&raw!==null,ready:verified&&raw!==undefined&&!legacy,unrecorded,canRetry:!!options.pending&&!!reference&&options.pending.requestId===reference.requestId&&!denied,send,recover,restart};
}
