'use client';
import {useDenyProductScope} from './product-scope-boundary';
import {useRouter} from 'next/navigation';
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import type {ProductCommandSource} from '@/lib/products/command-outcome-contract';
import {useProductScope} from './use-product-scope';
import {validProductCommandResult} from '@/lib/products/command-result';
import {notifySessionReference} from '@/hooks/use-session-reference';
import {isProductRequestId as requestId,useProductAttemptReference} from '@/hooks/use-product-attempt-reference';

const historicalConfirmation='The original Product action is recorded. Review the refreshed current source.';
type Attempt={requestId:string;action:string;payload:Record<string,unknown>|null;body:string|null;message:string;uncertain?:boolean};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Exact in-page retry; reload stores only an opaque reference and checks native receipts. */
export function usePublicationCommand(endpoint:string,storageKey:string,onRecorded:(isCurrent:()=>boolean)=>Promise<void>,source:ProductCommandSource){
 const router=useRouter(),denyProduct=useDenyProductScope();
 const identity=JSON.stringify([endpoint,storageKey,source.actorId,source.kind,source.sourceId,source.relatedId??null]),scope=useProductScope(identity);
 const {token:scopeToken,isCurrent:scopeCurrent,capture:scopeCapture}=scope;
 type Local={token:typeof scopeToken;pending:Attempt|null;busy:boolean;status:string;accessDenied:boolean};
 const empty=(token:typeof scopeToken):Local=>({token,pending:null,busy:false,status:'',accessDenied:false});
 const [local,setLocal]=useState(()=>empty(scopeToken));
 if(local.token!==scopeToken)setLocal(empty(scopeToken));
 const view=local.token===scopeToken?local:empty(scopeToken),{reference,read:readStored}=useProductAttemptReference(storageKey,source);
 const patch=useCallback((value:Partial<Omit<Local,'token'>>)=>{if(scopeCurrent())setLocal(previous=>previous.token===scopeToken?{...previous,...value}:previous);},[scopeCurrent,scopeToken]);
 const setPending=useCallback((pending:Attempt|null)=>patch({pending}),[patch]),setBusy=useCallback((busy:boolean)=>patch({busy}),[patch]),setStatus=useCallback((status:string)=>patch({status}),[patch]),setAccessDenied=useCallback((accessDenied:boolean)=>{if(!scopeCurrent())return;patch({accessDenied});if(accessDenied){denyProduct?.();router.refresh();}},[patch,scopeCurrent,router,denyProduct]);
 const restoring=reference.state==='loading',restored:Attempt|null=reference.state==='pending'?{requestId:reference.requestId,action:reference.action,payload:null,body:null,message:'The original Product action is recorded.',uncertain:true}:null,pending=view.pending??restored,busy=view.busy,accessDenied=view.accessDenied;
 const invalid=reference.state==='invalid'||!!(view.pending&&restored&&(view.pending.requestId!==restored.requestId||view.pending.action!==restored.action));
 const status=view.status||(invalid?'The original recovery reference cannot be validated. Keep this record open and review its current history before another attempt.':restored&&!view.pending?'An original action is unconfirmed in this view. Check its recorded outcome before starting another attempt. Private command fields are not stored in this browser.':'');
 const flight=useRef<object|null>(null);
 const marker=useCallback((id:string,action:string)=>({schema:1,requestId:id,action,actorId:source.actorId,kind:source.kind,sourceId:source.sourceId,...(source.relatedId?{relatedId:source.relatedId}:{})}),[source.actorId,source.kind,source.sourceId,source.relatedId]);
 function forgetMatching(attempt:Attempt){try{const value=readStored();if(value.state!=='pending'||value.requestId!==attempt.requestId||value.action!==attempt.action)return;sessionStorage.removeItem(storageKey);notifySessionReference(storageKey);}catch{/* Unvalidated original metadata remains owned. */}}
 useLayoutEffect(()=>{
  if(reference.state!=='pending'||!reference.legacy)return;
  try{const current=readStored();if(current.state!=='pending'||!current.legacy||current.requestId!==reference.requestId||current.action!==reference.action)return;sessionStorage.setItem(storageKey,JSON.stringify(marker(current.requestId,current.action)));notifySessionReference(storageKey);}catch{/* Failed legacy scrub stays blocked and never resends private fields. */}
 },[reference,readStored,storageKey,marker]);
 function retain(attempt:Attempt|null,original?:Attempt){
  if(!scopeCurrent())return false;
  if(!attempt){if(original)forgetMatching(original);setPending(null);return true;}
  try{
   const current=readStored();if(current.state==='invalid'||current.state==='loading'||current.state==='pending'&&(current.requestId!==attempt.requestId||current.action!==attempt.action))throw new Error('The original browser recovery reference changed. Reopen its current history before another action.');
   sessionStorage.setItem(storageKey,JSON.stringify(marker(attempt.requestId,attempt.action)));notifySessionReference(storageKey);setPending(attempt);return true;
  }catch{setStatus(attempt.uncertain?'The original action remains unconfirmed. Browser recovery could not be updated; keep this page and the original reference.':'No Product action was sent because its browser recovery reference could not be saved. Keep your entries and restore browser storage before trying again.');return false;}
 }
 async function recover(attempt:Attempt){
  if(!scopeCurrent()||flight.current===scopeToken||restoring)return false;flight.current=scopeToken;setBusy(true);
  const isCurrent=scopeCapture();
  try{
   const query=new URLSearchParams({kind:source.kind,sourceId:source.sourceId,requestId:attempt.requestId,action:attempt.action,...(source.relatedId?{relatedId:source.relatedId}:{})}),namespace=endpoint.startsWith('/api/admin/')?'admin':'seller';
   const response=await fetch('/api/'+namespace+'/product-command-outcomes?'+query,{cache:'no-store',headers:{'X-Hastabazaar-Actor':source.actorId}}),data:unknown=await response.json().catch(()=>null);
   if(!isCurrent())return false;
   if(!response.ok){if([401,403].includes(response.status))setAccessDenied(true);throw new Error(object(data)&&typeof data.error==='string'?data.error:'The original outcome could not be checked. Keep its reference and retry.');}
   if(!object(data)||data.requestId!==attempt.requestId||!['recorded','unconfirmed'].includes(String(data.status)))throw new Error('The original outcome response is invalid. No new action was started.');
   setAccessDenied(false);
   if(data.status!=='recorded'){setStatus('No recorded result is visible yet. The original action remains unconfirmed. Check again or open the original history; no new attempt has been started.');return false;}
   retain(null,attempt);setStatus(historicalConfirmation);await onRecorded(isCurrent);return isCurrent();
  }catch(error){if(isCurrent())setStatus(error instanceof Error?error.message:'The original action remains unconfirmed.');return false;}
  finally{if(flight.current===scopeToken)flight.current=null;if(isCurrent())setBusy(false);}
 }
 async function run(payload:Record<string,unknown>,message:string,original?:Attempt){
  if(!scopeCurrent()||flight.current===scopeToken||restoring||invalid||accessDenied||pending&&!original)return false;
  const body=original?.body??JSON.stringify(payload),snapshot:unknown=JSON.parse(body);if(!object(snapshot)||!requestId(snapshot.requestId)||typeof snapshot.action!=='string')return false;
  let attempt:Attempt=original??{requestId:snapshot.requestId,action:snapshot.action,payload:snapshot,body,message};const isCurrent=scopeCapture();
  flight.current=scopeToken;setBusy(true);if(!retain(attempt)){if(flight.current===scopeToken)flight.current=null;setBusy(false);return false;}let recorded=false,rejectedBeforeWrite=false;
  const markUncertain=()=>{attempt={...attempt,uncertain:true};setPending(attempt);};
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Hastabazaar-Actor':source.actorId},body}),data:unknown=await response.json().catch(()=>null);
   rejectedBeforeWrite=!attempt.uncertain&&object(data)&&data.phase==='rejected_before_write';
   if(!isCurrent()){if(rejectedBeforeWrite)forgetMatching(attempt);return false;}
   if(!response.ok){if(rejectedBeforeWrite)retain(null,attempt);else markUncertain();if([401,403].includes(response.status))setAccessDenied(true);throw new Error(object(data)&&typeof data.error==='string'?data.error:'The outcome is uncertain. Retry this exact request.');}
   if(!validProductCommandResult(source,snapshot,data)){markUncertain();throw new Error('The original Product result is unconfirmed. Check its saved outcome or retry the exact retained action.');}
   recorded=true;retain(null,attempt);setStatus(original?historicalConfirmation:message);await onRecorded(isCurrent);return isCurrent();
  }catch(error){if(!recorded&&!rejectedBeforeWrite)markUncertain();if(isCurrent())setStatus((recorded?'The action is recorded, but the current view could not be refreshed. ':'')+(error instanceof Error?error.message:'Keep and retry the exact action.'));return recorded&&isCurrent();}
  finally{if(flight.current===scopeToken)flight.current=null;if(isCurrent())setBusy(false);}
 }
 const canRetryRetained=(id:string)=>!restoring&&!busy&&!invalid&&!accessDenied&&source.kind==='publication_owner'&&(!pending||pending.requestId===id&&pending.action==='price_only');
 async function retryRetained(payload:Record<string,unknown>,message:string){
  if(!requestId(payload.requestId)||payload.action!=='price_only'||!canRetryRetained(payload.requestId))return false;
  if(!pending)return run(payload,message);
  if(pending.payload&&pending.body)return run(pending.payload,pending.message,pending);
  const body=JSON.stringify(payload),snapshot:unknown=JSON.parse(body);if(!object(snapshot))return false;
  return run(snapshot,message,{requestId:pending.requestId,action:'price_only',payload:snapshot,body,message,uncertain:true});
 }
 return{pending:restoring?null:pending,busy:restoring?false:busy,blocked:restoring||busy||!!pending||invalid||accessDenied,accessDenied:!restoring&&accessDenied,status:restoring?'':status,setStatus:(value:string)=>{if(scopeCurrent())setStatus(value);},denyAccess:()=>{if(scopeCurrent())setAccessDenied(true);},run,retry:()=>pending?pending.payload&&pending.body?run(pending.payload,pending.message,pending):recover(pending):Promise.resolve(false),checkOutcome:()=>pending?recover(pending):Promise.resolve(false),canRetryRetained,retryRetained,capture:scopeCapture,isCurrent:scopeCurrent};
}
