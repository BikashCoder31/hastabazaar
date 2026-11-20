'use client';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {accountCommandActions,type AccountCommandReference} from '@/lib/account/command-outcome-contract';

export const ACCOUNT_ACCESS_DENIED_EVENT='hb:account-access-denied';
export interface AccountCommandInput extends AccountCommandReference{endpoint:string;method:'POST'|'PATCH'|'DELETE';body:Record<string,unknown>|FormData}
export interface AccountCommandReply{ok:boolean;status:number;data:unknown}
interface Options{actorId:string;scopeKey:string;onRecorded:(data:unknown,isCurrent:()=>boolean,reference:AccountCommandReference)=>void|Promise<void>;onDenied?:()=>void}
interface Slot{key:string;token:object}
interface Attempt{reference:AccountCommandReference;endpoint?:string;method?:AccountCommandInput['method'];body?:string|Blob;contentType?:string;uncertain?:boolean}
interface View{token:object;pending:Attempt|null;busy:boolean;accessDenied:boolean;message:string;restoring:boolean;invalid:boolean}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const opaqueId=(value:unknown,max=191):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&!Array.from(value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
const reference=(value:unknown):value is AccountCommandReference=>object(value)&&accountCommandActions.some(action=>action===value.action)&&opaqueId(value.sourceId)&&opaqueId(value.requestId,100)&&(value.action==='review.submit'?opaqueId(value.relatedId):value.relatedId===undefined);
function nativeSuccess(reference:AccountCommandReference,data:unknown){if(!object(data))return false;if(reference.action==='profile.update'||reference.action==='address.delete')return data.ok===true;return opaqueId(data.id)&&(reference.action!=='address.update'||data.id===reference.sourceId);}

function restoreAccountReference(raw:string|null|undefined,actorId:string,scopeKey:string){
  let value:Attempt|null=null,message='',invalid=false;
  try{if(raw){const saved:unknown=JSON.parse(raw);if(!object(saved)||Object.keys(saved).some(key=>!['schema','actorId','scopeKey','action','sourceId','requestId','relatedId'].includes(key))||saved.schema!==1||saved.actorId!==actorId||saved.scopeKey!==scopeKey||!reference(saved))throw Error('Invalid account action reference');value={reference:{action:saved.action,sourceId:saved.sourceId,requestId:saved.requestId,...(typeof saved.relatedId==='string'?{relatedId:saved.relatedId}:{})}};message='The original action needs a saved-result check. No private input has been restored or resubmitted.';}}catch{invalid=true;message='The original account action reference could not be confirmed. Open Help & support to reconcile it before starting a replacement. No new attempt has been started.';}
  return {value,message,invalid};
 
}

function initialAccountView(token:object):View{return{token,pending:null,busy:false,accessDenied:false,message:'',restoring:false,invalid:false};}

/** One actor/source scope, one exact RAM attempt; reload can only inspect its opaque receipt. */
export function useAccountCommand(options:Options){
 const key=JSON.stringify([options.actorId,options.scopeKey]),scope=useMemo<Slot>(()=>({key,token:{}}),[key]),activeSlot=useRef<Slot|null>(null);
 const isCurrent=()=>activeSlot.current===scope,capture=()=>isCurrent,storageKey='hb:account-command:v1:'+key;
 const raw=useSessionReference(storageKey),restored=useMemo(()=>restoreAccountReference(raw,options.actorId,options.scopeKey),[raw,options.actorId,options.scopeKey]);
 const initial=()=>initialAccountView(scope.token);
 const [state,setState]=useState<View>(initial);
 const flight=useRef<object|null>(null),denied=useRef(false),attempt=useRef<{token:object;value:Attempt|null}>({token:scope.token,value:null});
 const scoped=state.token===scope.token?state:initial(),view={...scoped,pending:scoped.pending??restored.value,restoring:raw===undefined,invalid:restored.invalid&&!scoped.pending,message:scoped.message||restored.message};
 function update(delta:Partial<View>){if(isCurrent())setState(old=>({... (old.token===scope.token?old:initialAccountView(scope.token)),...delta}));}
 function retain(value:Attempt|null){if(!isCurrent())return;attempt.current={token:scope.token,value};update({pending:value});try{if(value)sessionStorage.setItem(storageKey,JSON.stringify({schema:1,actorId:options.actorId,scopeKey:options.scopeKey,...value.reference}));else sessionStorage.removeItem(storageKey);notifySessionReference(storageKey);}catch{update({message:'Browser recovery storage is unavailable. Keep this page open for the exact original retry.'});}}
 function retireRejectedReference(value:Attempt){try{const original=JSON.stringify({schema:1,actorId:options.actorId,scopeKey:options.scopeKey,...value.reference});if(sessionStorage.getItem(storageKey)===original){sessionStorage.removeItem(storageKey);notifySessionReference(storageKey);}}catch{/* Keep an inaccessible reference; never mutate another view or a replacement attempt. */}}
 function denyAccess(){if(!isCurrent())return;denied.current=true;update({accessDenied:true});window.dispatchEvent(new CustomEvent(ACCOUNT_ACCESS_DENIED_EVENT,{detail:{actorId:options.actorId}}));options.onDenied?.();}
 useLayoutEffect(()=>{activeSlot.current=scope;denied.current=false;attempt.current={token:scope.token,value:null};
  const onDenied=(event:Event)=>{const detail=(event as CustomEvent<{actorId?:unknown}>).detail;if(activeSlot.current===scope&&detail?.actorId===options.actorId){denied.current=true;setState(old=>({... (old.token===scope.token?old:initialAccountView(scope.token)),accessDenied:true}));}};
  window.addEventListener(ACCOUNT_ACCESS_DENIED_EVENT,onDenied);return()=>{if(activeSlot.current===scope)activeSlot.current=null;window.removeEventListener(ACCOUNT_ACCESS_DENIED_EVENT,onDenied);};
 },[scope,options.actorId]);
 useLayoutEffect(()=>{if(attempt.current.token===scope.token&&attempt.current.value===null&&restored.value)attempt.current.value=restored.value;},[scope,restored.value]);
 async function complete(data:unknown,original:AccountCommandReference){if(!isCurrent())return null;const reference={...original};retain(null);update({message:'The original account action is recorded.'});try{await options.onRecorded(data,isCurrent,reference);}catch(error){update({message:'The action is recorded, but the current view could not be refreshed. '+(error instanceof Error?error.message:'Refresh the current record.')});}return isCurrent()?{ok:true,status:200,data}:null;}
 async function send(value:Attempt):Promise<AccountCommandReply|null>{
  if(!isCurrent()||flight.current===scope.token||!value.body||!value.endpoint||!value.method)return null;
  flight.current=scope.token;update({busy:true});retain(value);
  try{const response=await fetch(value.endpoint,{method:value.method,headers:{[ACTOR_INTENT_HEADER]:options.actorId,...(value.contentType?{'Content-Type':value.contentType}:{})},body:value.body}),data:unknown=await response.json().catch(()=>null);
   const rejectedBeforeWrite=[401,403].includes(response.status)&&object(data)&&data.code==='access_denied_before_write'&&!value.uncertain;
   if(!isCurrent()){if(rejectedBeforeWrite)retireRejectedReference(value);return null;}
   if(response.ok){if(!nativeSuccess(value.reference,data)){value.uncertain=true;update({message:'The response did not confirm the original account action. Check its saved result or retry the retained original request; no replacement attempt has been started.'});return{ok:false,status:response.status,data};}const result=await complete(data,value.reference);return result?{...result,status:response.status}:null;}
   if([401,403].includes(response.status)){if(rejectedBeforeWrite)retain(null);else value.uncertain=true;denyAccess();}else if([400,409,413,422].includes(response.status)){if(!value.uncertain)retain(null);}else value.uncertain=true;
   update({message:object(data)&&typeof data.error==='string'?data.error:'The original account action is unconfirmed. Retry its exact request or check the saved result.'});return isCurrent()?{ok:false,status:response.status,data}:null;
  }catch(error){value.uncertain=true;update({message:error instanceof Error?error.message:'The response is uncertain. Keep and retry the original request.'});return isCurrent()?{ok:false,status:0,data:null}:null;}
  finally{if(flight.current===scope.token)flight.current=null;update({busy:false});}
 }
 async function run(input:AccountCommandInput):Promise<AccountCommandReply|null>{
  if(!isCurrent()||view.restoring||view.invalid||denied.current||flight.current===scope.token||attempt.current.value)return null;
  flight.current=scope.token;update({busy:true});
  try{if(!reference(input))throw Error('Identify the original account action.');const bodyKey=input.body instanceof FormData?input.body.get('idempotencyKey')??input.body.get('requestId'):input.body.idempotencyKey??input.body.requestId;if(bodyKey!==input.requestId)throw Error('The original request reference does not match its account submission.');
   let body:string|Blob,contentType:string;
   if(input.body instanceof FormData){const encoded=new Request('https://account-body.invalid',{method:'POST',body:input.body});contentType=encoded.headers.get('content-type')!;body=new Blob([await encoded.arrayBuffer()],{type:contentType});}else{body=JSON.stringify(input.body);contentType='application/json';}
   if(!isCurrent()||denied.current)return null;const value:Attempt={reference:{action:input.action,sourceId:input.sourceId,requestId:input.requestId,...(input.relatedId?{relatedId:input.relatedId}:{})},endpoint:input.endpoint,method:input.method,body,contentType};flight.current=null;return await send(value);
  }catch(error){update({message:error instanceof Error?error.message:'The original account request could not be prepared.'});return isCurrent()?{ok:false,status:400,data:null}:null;}
  finally{if(flight.current===scope.token)flight.current=null;update({busy:false});}
 }
 async function checkOutcome():Promise<AccountCommandReply|null>{const value=attempt.current.value;if(!isCurrent()||!value||flight.current===scope.token)return null;flight.current=scope.token;update({busy:true});try{
  const query=new URLSearchParams({...value.reference}),response=await fetch('/api/account/command-outcomes?'+query,{cache:'no-store',headers:{[ACTOR_INTENT_HEADER]:options.actorId}}),data:unknown=await response.json().catch(()=>null);if(!isCurrent())return null;
  if(!response.ok){if([401,403].includes(response.status))denyAccess();update({message:object(data)&&typeof data.error==='string'?data.error:'The saved account result could not be checked.'});return isCurrent()?{ok:false,status:response.status,data}:null;}
  if(!object(data)||data.requestId!==value.reference.requestId||!['recorded','unconfirmed'].includes(String(data.status)))throw Error('The original account result response is invalid. No new attempt was started.');
  denied.current=false;update({accessDenied:false});if(data.status==='recorded')return await complete(data,value.reference);update({message:'No recorded result is visible yet. The original action remains unconfirmed; no new attempt has been started.'});return{ok:false,status:200,data};
 }catch(error){update({message:error instanceof Error?error.message:'The original account result remains unconfirmed.'});return isCurrent()?{ok:false,status:0,data:null}:null;}finally{if(flight.current===scope.token)flight.current=null;update({busy:false});}}
 const pending=view.pending?.reference??null,canRetry=!!view.pending?.body&&!view.restoring&&!view.busy&&!view.accessDenied;
 return{pending,busy:view.busy,blocked:view.restoring||view.invalid||view.busy||!!pending||view.accessDenied,invalidReference:view.invalid,accessDenied:view.accessDenied,message:view.message,canRetry,capture,run,retry:()=>canRetry&&attempt.current.value?send(attempt.current.value):checkOutcome(),checkOutcome,setMessage:(message:string)=>update({message})};
}
