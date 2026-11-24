'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import type {CommercialOutcomeKind,CommercialOutcome} from '@/lib/admin/commercial-outcome';
const actions:Record<CommercialOutcomeKind,readonly string[]>={waiver:['customer.service-fee-waiver'],promo:['promo.draft','promo.publish','promo.pause'],loyalty:['loyalty.draft','loyalty.publish','loyalty.pause','loyalty.cancel_schedule'],referral:['referral.offer.updated'],'common-fee':['commission.common.published','commission.common.cancelled','commission.common.initialized'],'business-setting':['business_setting.draft_created','business_setting.published','business_setting.submitted','business_setting.approved','business_setting.rejected','business_setting.cancelled']};
function verifiedOutcome(value:unknown,actorId:string,kind:CommercialOutcomeKind,attempt:string):value is CommercialOutcome{if(!value||typeof value!=='object'||Array.isArray(value))return false;const row=value as Record<string,unknown>;return row.actorId===actorId&&row.kind===kind&&row.requestId===attempt&&typeof row.sourceId==='string'&&/^[A-Za-z0-9_-]{1,191}$/.test(row.sourceId)&&typeof row.action==='string'&&actions[kind].includes(row.action)&&Number.isSafeInteger(row.recordedAt)&&Number(row.recordedAt)>=0;}
export function useCommercialScope(actorId:string){
 const router=useRouter();
 const active=useRef(true);useLayoutEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const[accessDenied,setAccessDenied]=useState(false);
 const deny=()=>{if(active.current){setAccessDenied(true);router.refresh();}};
 return{current:()=>active.current,headers:{[ACTOR_INTENT_HEADER]:actorId},accessDenied,deny,observe:(response:Response)=>{if(response.status===401||response.status===403)deny();},reauthorize:()=>{if(active.current)setAccessDenied(false);}};
}
export async function checkCommercialOutcome(
 actorId:string,kind:CommercialOutcomeKind,attempt:string,
 scope:ReturnType<typeof useCommercialScope>,onDenied?:()=>void,
):Promise<CommercialOutcome|null>{
 const response=await fetch('/api/admin/commercial-outcomes?'+new URLSearchParams({kind,attempt}),{cache:'no-store',headers:scope.headers});
 const result=await response.json().catch(()=>null) as {outcome?:unknown;error?:string}|null;
 if(!scope.current())throw new Error('Original actor view closed.');
 if(response.status===401||response.status===403){if(onDenied)onDenied();else scope.observe(response);}
 if(!response.ok||!result||!Object.hasOwn(result,'outcome'))throw new Error(result?.error??'The original outcome is unavailable.');
 if(kind==='waiver'&&(Array.isArray(result)||Object.keys(result).length!==1))
  throw new Error('The original outcome could not be verified. Keep its original reference; no success is assumed.');
 if(result.outcome!==null&&!verifiedOutcome(result.outcome,actorId,kind,attempt))throw new Error('The original outcome could not be verified. Keep its original reference; no success is assumed.');
 return result.outcome;
}
export function CommercialRecovery({actorId,kind,attemptKey,onRecovered,onReauthorized,onDenied,disabled=false,onCheckingChange,onNoOutcome}:{actorId:string;kind:CommercialOutcomeKind;attemptKey:string;onRecovered:(outcome:CommercialOutcome,reference:string)=>void;onReauthorized?:()=>void;onDenied?:()=>void;disabled?:boolean;onCheckingChange?:(checking:boolean)=>void;onNoOutcome?:(attempt:string)=>void}){
 const scope=useCommercialScope(actorId),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function recover(){setBusy(true);onCheckingChange?.(true);try{const raw=sessionStorage.getItem(attemptKey);if(!raw)throw new Error('No original saved action reference exists in this actor scope.');let attempt=raw;try{const parsed=JSON.parse(raw) as {requestId?:string};if(parsed&&typeof parsed.requestId==='string')attempt=parsed.requestId;}catch{/* Plain opaque attempts remain supported. */}
  const outcome=await checkCommercialOutcome(actorId,kind,attempt,scope,onDenied);
  if(onNoOutcome&&sessionStorage.getItem(attemptKey)!==raw)throw new Error('The original action reference changed. Check its saved outcome again.');
  onReauthorized?.();
  if(outcome){onRecovered(outcome,raw);setMessage('Original committed action confirmed. Review the current native source before another action.');}else{
   onNoOutcome?.(attempt);
   setMessage(onNoOutcome
    ? 'No committed outcome was found for this original actor reference. Retry the unchanged action. A new review requires proof that the original action can no longer commit.'
    : 'No committed outcome was found for this original actor reference. Your draft is retained; retry only the unchanged original action after current-source review.');
  }
 }catch(error){if(scope.current())setMessage(error instanceof Error?error.message:'Original outcome unavailable.');}finally{if(scope.current())setBusy(false);onCheckingChange?.(false);}}
 return <div className="space-y-2 rounded border p-3"><button type="button" disabled={busy||disabled} className="rounded border px-3 py-2" onClick={()=>void recover()}>Check original saved outcome</button>{message?<output className="block">{message}</output>:null}</div>;
}
