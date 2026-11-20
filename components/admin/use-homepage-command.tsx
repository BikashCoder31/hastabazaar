'use client';
import {useRef,useState,type ReactNode} from 'react';
import {CommercialRecovery} from './commercial-recovery';
import {useHomepageScope} from './homepage-access-boundary';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {useHomepageAttemptReference,validHomepageRequestId} from '@/hooks/use-homepage-attempt-reference';
import {notifySessionReference} from '@/hooks/use-session-reference';
type Action='save'|'publish'|'reverse'|'visibility';
type Submission={action:Action;sourceId:string;endpoint:string;body:Record<string,unknown>;verify:(response:Response,data:unknown)=>void;onRecorded:()=>void};
type Attempt={key:string;requestId:string;endpoint:string;wire:string;verify:Submission['verify'];onRecorded:()=>void;uncertain:boolean};
type RamReference={key:string;requestId:string};
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export type HomepageRecoveryProps={attemptKey:string;requestId:string;onConfirmed:(requestId:string)=>void;onDenied:()=>void};
type Options={sourceScope?:string;legacyAttemptKey?:string;renderRecovery?:(props:HomepageRecoveryProps)=>ReactNode};
/** Exact body stays in RAM. Render uses opaque external-store references and an
 * explicit RAM-metadata state, never a ref read or effect-driven hydration. */
export function useHomepageCommand(actorId:string,formId:string,options:Options={}){
 const sourceScope=options.sourceScope,scope=useHomepageScope(actorId),pointer=sourceScope?`hastabazaar:homepage-product-pending:${JSON.stringify([formId,actorId,sourceScope])}`:`hastabazaar:homepage-pending:${actorId}:${formId}`,prefix=sessionAttemptKey(formId,actorId+':'),sourceKey=sourceScope?sessionAttemptKey(formId,JSON.stringify([actorId,'visibility',sourceScope])):null;
 const stored=useHomepageAttemptReference({pointer,prefix,legacyPrefix:sessionAttemptKey(formId,''),sourceKey,legacyKey:options.legacyAttemptKey}),[ram,setRam]=useState<RamReference|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),attempt=useRef<Attempt|null>(null),flight=useRef(false);
 const reference=stored.reference.state==='pending'?stored.reference:null,pendingReference=ram??reference,blocked=stored.reference.state==='loading'||stored.reference.state==='invalid'||!!(ram&&reference&&(ram.key!==reference.key||ram.requestId!==reference.requestId));
 function forget(key:string,id:string){const changed:string[]=[];try{if(sessionStorage.getItem(key)!==id)return false;sessionStorage.removeItem(key);changed.push(key);if(sessionStorage.getItem(pointer)===key){sessionStorage.removeItem(pointer);changed.push(pointer);}}catch{/* Preserve unresolved metadata if storage is inaccessible. */}for(const removed of changed)notifySessionReference(removed);return changed.includes(key);}
 function persist(value:Attempt){sessionStorage.setItem(value.key,value.requestId);sessionStorage.setItem(pointer,value.key);}
 function complete(value:Attempt){forget(value.key,value.requestId);attempt.current=null;setRam(null);setMessage('');value.onRecorded();}
 async function send(value:Attempt){
  if(!scope.current()||flight.current)return;
  const original=stored.read();if(original.state==='invalid'||original.state==='loading'||original.state==='pending'&&(original.key!==value.key||original.requestId!==value.requestId)){setMessage('The original recovery reference changed. Keep both references for Help; no replacement request was sent.');return;}
  try{persist(value);notifySessionReference(value.key);notifySessionReference(pointer);}catch{setMessage('Browser recovery storage is unavailable. Keep this draft open; no request was sent.');return;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch(value.endpoint,{method:'POST',headers:{...scope.headers,'Content-Type':'application/json'},body:value.wire}),data:unknown=await response.json().catch(()=>null),beforeWrite=[401,403].includes(response.status)&&object(data)&&data.code==='access_denied_before_write'&&!value.uncertain;
   if(!scope.current()){if(beforeWrite)forget(value.key,value.requestId);return;}
   if([401,403].includes(response.status)){if(beforeWrite){forget(value.key,value.requestId);attempt.current=null;setRam(null);}else value.uncertain=true;scope.deny();return;}
   try{value.verify(response,data);}catch(error){if(response.ok||!object(data)||data.phase!=='rejected_before_write')value.uncertain=true;if(!value.uncertain){forget(value.key,value.requestId);attempt.current=null;setRam(null);}setMessage(error instanceof Error?error.message:'The original action could not be confirmed.');return;}
   complete(value);
  }catch(error){if(scope.current()){value.uncertain=true;setMessage(error instanceof Error?error.message:'The original action could not be confirmed.');}}
  finally{if(scope.current()){flight.current=false;setBusy(false);}}
 }
 async function run(input:Submission){
  if(!scope.current()||flight.current||attempt.current||stored.read().state!=='empty'||blocked)return;
  if(sourceScope&&(input.sourceId!==sourceScope||input.action!=='visibility'))throw Error('The original homepage product scope changed. Reopen its current control.');
  const requestId=input.body.requestId===undefined?crypto.randomUUID():input.body.requestId;if(!validHomepageRequestId(requestId))throw Error('The original request reference is invalid.');
  const key=sourceKey??sessionAttemptKey(formId,`${actorId}:${input.action}:${input.sourceId}`),value:Attempt={key,requestId,endpoint:input.endpoint,wire:JSON.stringify({...input.body,requestId}),verify:input.verify,onRecorded:input.onRecorded,uncertain:false};
  try{persist(value);}catch{forget(key,requestId);setMessage('Browser recovery storage is unavailable. No request was sent. Keep this draft open.');return;}
  attempt.current=value;setRam({key,requestId});notifySessionReference(key);notifySessionReference(pointer);await send(value);
 }
 const recovery=pendingReference&&!blocked?<div className="space-y-2" aria-label="Original homepage action recovery">{options.renderRecovery?options.renderRecovery({attemptKey:pendingReference.key,requestId:pendingReference.requestId,onDenied:scope.deny,onConfirmed:requestId=>{if(scope.current()&&requestId===pendingReference.requestId&&forget(pendingReference.key,requestId))window.location.reload();}}):<CommercialRecovery actorId={actorId} kind="business-setting" attemptKey={pendingReference.key} onDenied={scope.deny} onRecovered={outcome=>{if(scope.current()&&outcome.requestId===pendingReference.requestId&&forget(pendingReference.key,outcome.requestId))window.location.reload();}}/>}{ram&&!scope.accessDenied?<button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={()=>{const original=attempt.current;if(original)void send(original);}}>Retry original action</button>:null}</div>:blocked?<output className="block">{stored.reference.state==='loading'?'Checking the original saved reference before another change…':'The original recovery reference is unavailable or changed. Reopen the workspace or ask Help to reconcile it before another change.'}</output>:null;
 return{scope,busy,pending:!!pendingReference||blocked,message,recovery,run,setMessage};
}
