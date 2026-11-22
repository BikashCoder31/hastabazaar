'use client';
import {useLayoutEffect,useMemo,useRef,useState,type SetStateAction} from 'react';
import {useRouter} from 'next/navigation';
import {clearSessionAttempt,getOrCreateSessionAttempt,hasSessionAttempt,sessionAttemptKey} from '@/lib/forms/client-attempt';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
/** Only an opaque, actor/case-bound reference survives reload; private form contents stay in memory. */
export function useCaseCommand(formId:string,actorId:string,scope:string,id:string,endpoint:string,options?:{created?:boolean;onSuccess?:(id:string)=>void;onResponse?:(response:Response,code?:string)=>void}){
 const router=useRouter(),pending=useRef<Record<string,unknown>|null>(null),key=sessionAttemptKey(formId,`${actorId}:${scope}:${id}`);
 const identity=JSON.stringify([key,endpoint]),owned=useMemo(()=>({identity}),[identity]),{isCurrent}=useOwnedFormScope(identity),reference=useSessionReference(key);
 const [busy,setBusy]=useState(false),[hasWire,setHasWire]=useState(false),[unrecorded,setUnrecorded]=useState(false),[message,setMessage]=useState(''),[accessDenied,setAccessDenied]=useState(false);
 const saved=hasWire||typeof reference==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);
 const [renderedScope,setRenderedScope]=useState(owned);
 // Reset before committing a different actor/source render, including an A → B → A switch.
 // Revision changes intentionally preserve the original saved command reference.
 if(renderedScope!==owned){setRenderedScope(owned);setBusy(false);setHasWire(false);setUnrecorded(false);setMessage('');setAccessDenied(false);}
 useLayoutEffect(()=>{pending.current=null;},[owned]);
 async function submit(payload:Record<string,unknown>){
  if(!isCurrent()||accessDenied)return;
  setBusy(true);setUnrecorded(false);try{
   if(!pending.current&&hasSessionAttempt(key))throw new Error('Check the saved action before starting another attempt.');
   const body=pending.current??{...payload,requestId:getOrCreateSessionAttempt(key)};pending.current=body;setHasWire(true);notifySessionReference(key);
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',[ACTOR_INTENT_HEADER]:actorId},body:JSON.stringify(body)});
   if(!isCurrent())return;
   const denied=response.status===401||response.status===403;
   if(denied){setAccessDenied(true);options?.onResponse?.(response);router.refresh();}
   const result=await response.json().catch(()=>{throw new Error(denied?'Current access changed. Check the original action from its permitted account.':'The action response could not be verified. Keep the original reference.');}) as {id?:string;error?:string;code?:string};
   if(!isCurrent())return;
   if(!denied)options?.onResponse?.(response,result.code);
   if(!response.ok||typeof result.id!=='string'||!result.id||!options?.created&&result.id!==id)throw new Error(result.error??'The action could not be confirmed. Check its original outcome.');
   clearSessionAttempt(key);pending.current=null;setHasWire(false);notifySessionReference(key);setMessage('Action recorded. The current case has been refreshed.');options?.onSuccess?.(result.id!);router.refresh();
  }catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'Check the saved outcome before retrying.');}finally{if(isCurrent())setBusy(false);}
 }
 async function recover(){
  if(!isCurrent())return;
  setBusy(true);try{
   const requestId=sessionStorage.getItem(key);if(!requestId)throw new Error('The saved reference is unavailable. Review current case history.');
   const response=await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'attempt='+encodeURIComponent(requestId),{headers:{[ACTOR_INTENT_HEADER]:actorId}});
   if(!isCurrent())return;
   if(response.status===401||response.status===403){setAccessDenied(true);router.refresh();}
   const result=await response.json().catch(()=>{throw new Error(response.status===401||response.status===403?'Current access changed. Check the original action from its permitted account.':'The saved outcome response could not be verified. Keep the original reference.');}) as {outcome?:{id:string;revision:number}|null;error?:string};
   if(!isCurrent())return;
   if(!response.ok)throw new Error(result.error??'The recorded outcome could not be checked.');
   if(!result||!Object.hasOwn(result,'outcome'))throw new Error('The saved outcome could not be verified. Keep the original reference.');
   if(result.outcome){if(typeof result.outcome.id!=='string'||!result.outcome.id||!options?.created&&result.outcome.id!==id)throw new Error('The returned outcome does not match this case.');clearSessionAttempt(key);pending.current=null;setHasWire(false);notifySessionReference(key);setUnrecorded(false);setMessage('The original action was recorded. Current case facts have been refreshed.');options?.onSuccess?.(result.outcome.id);}
   else{setUnrecorded(true);setMessage('No outcome is recorded yet. Retry the unchanged action, or review the current case before explicitly starting a new attempt.');}
   setAccessDenied(false);router.refresh();
  }catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'The original outcome could not be checked.');}finally{if(isCurrent())setBusy(false);}
 }
 function restart(){if(!unrecorded||accessDenied||!isCurrent())return;clearSessionAttempt(key);pending.current=null;setHasWire(false);notifySessionReference(key);setUnrecorded(false);setMessage('Review the refreshed case before entering the new action.');router.refresh();}
 return {busy,saved,message,setMessage:(value:SetStateAction<string>)=>{if(isCurrent())setMessage(value);},unrecorded,accessDenied,canRetry:hasWire&&!accessDenied,submit,recover,retry:()=>isCurrent()&&pending.current&&!accessDenied?submit(pending.current):Promise.resolve(),restart};
}
