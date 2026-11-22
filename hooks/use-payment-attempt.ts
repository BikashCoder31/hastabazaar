'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {paymentAttemptReference,type PaymentAttemptAction,type PaymentAttemptReference,type PaymentAttemptOutcome} from '@/lib/payments/claim-release-client';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
type Pending={reference:PaymentAttemptReference|null;body:string|FormData|null;unknown:boolean;blocked:boolean;unclaimed?:boolean;blockedNonce?:string};
type Options={actorId:string;sourceId:string;action:PaymentAttemptAction;storageKey:string;endpoint:string;legacyKey?:string};
function restored(options:Options):Pending|null{
 try{
  const own=sessionStorage.getItem(options.storageKey),raw=own??(options.legacyKey?sessionStorage.getItem(options.legacyKey):null);if(raw===null)return null;
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return{reference:null,body:null,unknown:true,blocked:true};}
  if(options.action==='upload'&&own===null&&(!object(parsed)||!object(parsed.upload)))return null;
  const reference=paymentAttemptReference(parsed,options.actorId,options.sourceId,options.action);if(reference)return{reference,body:null,unknown:true,blocked:false};
  if(!object(parsed))return{reference:null,body:null,unknown:true,blocked:true};
  if(parsed.version===1||parsed.actorMismatch===true||typeof parsed.actorId==='string'&&parsed.actorId!==options.actorId)return{reference:null,body:null,unknown:true,blocked:true,blockedNonce:typeof parsed.requestId==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(parsed.requestId)?parsed.requestId:undefined};
  const legacy=options.action==='upload'&&object(parsed.upload)?parsed.upload:object(parsed.pending)?parsed.pending:parsed;
  if(typeof legacy.requestId==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(legacy.requestId))return{reference:{version:1,actorId:options.actorId,sourceId:options.sourceId,action:options.action,requestId:legacy.requestId},body:null,unknown:true,blocked:false,unclaimed:true};
  // An old ordinary draft can be discarded; an unreadable pending operation cannot.
  return (options.action==='upload'?parsed.upload:parsed.pending)||parsed.version===0?{reference:null,body:null,unknown:true,blocked:true}:null;
 }catch{return{reference:null,body:null,unknown:true,blocked:true};}
}
function persisted(attempt:Pending){return attempt.blocked?{version:0,actorMismatch:true,...attempt.blockedNonce?{requestId:attempt.blockedNonce}:{}}:attempt.unclaimed?{version:0,requestId:attempt.reference?.requestId}:attempt.reference;}
function readOutcome(body:unknown,reference:PaymentAttemptReference):PaymentAttemptOutcome|null{
 if(!object(body)||!Object.hasOwn(body,'outcome'))throw new Error('The original outcome remains unconfirmed.');if(body.outcome===null)return null;
 const value=body.outcome;if(!object(value)||!object(value.result)||!Number.isSafeInteger(value.recordedAt))throw new Error('The original outcome remains unconfirmed.');
 const proven=paymentAttemptReference(value.reference,reference.actorId,reference.sourceId,reference.action);if(!proven||proven.requestId!==reference.requestId)throw new Error('The original outcome remains unconfirmed.');
 if(reference.action==='release'?value.result.orderId!==reference.sourceId:typeof value.result.id!=='string'||!value.result.id||reference.action==='claim'&&!Number.isSafeInteger(value.result.revision)||reference.action==='upload'&&typeof value.result.name!=='string')throw new Error('The original outcome remains unconfirmed.');
 return{reference:proven,result:value.result,recordedAt:Number(value.recordedAt)};
}
/** Private values and retry bytes live only in this mounted actor/source. Persistence contains opaque references only. */
export function usePaymentAttempt(options:Options){
 const [pending,setPending]=useState(()=>restored(options)),pendingRef=useRef(pending),[busy,setBusy]=useState(false),busyRef=useRef(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false),active=useRef(true);
 useLayoutEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const {storageKey}=options;
 useEffect(()=>{try{const saved=pendingRef.current;sessionStorage.setItem(storageKey,JSON.stringify(saved?persisted(saved):null));if(!saved)sessionStorage.removeItem(storageKey);}catch{/* Original opaque reference and private bytes remain in RAM. */}},[storageKey]);
 function update(next:Pending|null){pendingRef.current=next;setPending(next);try{if(next)sessionStorage.setItem(storageKey,JSON.stringify(persisted(next)));else sessionStorage.removeItem(storageKey);}catch{/* Keep the same in-memory attempt and never reconstruct it after a reload. */}}
 async function responseBody(response:Response){
  if(!active.current)return undefined;
  if(response.status===401||response.status===403){setDenied(true);throw new Error('Current payment access changed. Sign in to the original account and check its retained outcome.');}
  const body:unknown=await response.json().catch(()=>null);if(!active.current)return undefined;return body;
 }
 async function lookup(reference:PaymentAttemptReference){
  const response=await fetch(options.endpoint+'?'+new URLSearchParams({attempt:reference.requestId}),{headers:{[ACTOR_INTENT_HEADER]:options.actorId},cache:'no-store'}),body=await responseBody(response);if(!active.current)return undefined;
  if(!response.ok)throw new Error(object(body)&&typeof body.error==='string'?body.error:'The original outcome remains unconfirmed.');return readOutcome(body,reference);
 }
 function recorded(outcome:PaymentAttemptOutcome){update(null);setDenied(false);setMessage(`Original ${options.action} recorded. Review the refreshed saved state before another action.`);return outcome;}
 async function recover(){
  if(busyRef.current||!active.current)return null;const attempt=pendingRef.current;if(!attempt)return null;
  if(!attempt.reference||attempt.blocked){setMessage('The original reference is unreadable or belongs to another account. Its outcome remains unconfirmed.');return null;}
  busyRef.current=true;setBusy(true);try{const outcome=await lookup(attempt.reference);if(!active.current)return null;if(outcome)return recorded(outcome);setDenied(false);setMessage('The original outcome remains unconfirmed. Keep this reference; no replacement request has been created.');return null;}catch(error){if(active.current)setMessage(error instanceof Error?error.message:'The original outcome remains unconfirmed.');return null;}finally{busyRef.current=false;if(active.current)setBusy(false);}
 }
 async function send(create:(requestId:string)=>string|FormData){
  if(busyRef.current||denied||!active.current)return null;let attempt=pendingRef.current;if(attempt&&!attempt.body){setMessage('Check the original saved outcome. Private request values are not restored after reload.');return null;}
  busyRef.current=true;setBusy(true);setMessage('');let dispatched=false;try{
   if(!attempt){const requestId=crypto.randomUUID(),reference:PaymentAttemptReference={version:1,actorId:options.actorId,sourceId:options.sourceId,action:options.action,requestId};attempt={reference,body:create(requestId),unknown:false,blocked:false};update(attempt);}
   const original=attempt,reference=original.reference!;
   try{const opaque=JSON.stringify(persisted(original));sessionStorage.setItem(storageKey,opaque);if(sessionStorage.getItem(storageKey)!==opaque)throw new Error('Unavailable');}catch{throw new Error('The browser recovery reference could not be saved. Keep this page open; no request was sent.');}
   dispatched=true;const response=await fetch(options.endpoint,{method:'POST',headers:{[ACTOR_INTENT_HEADER]:options.actorId,...typeof original.body==='string'?{'Content-Type':'application/json'}:{}},body:original.body}),body=await responseBody(response);if(!active.current)return null;
   if(!response.ok){const attested=object(body)&&body.notApplied===true?paymentAttemptReference(body.reference,options.actorId,options.sourceId,options.action):null;if(!original.unknown&&attested?.requestId===reference.requestId)update(null);else update({...original,unknown:true});throw new Error(object(body)&&typeof body.error==='string'?body.error:'The original outcome remains unconfirmed.');}
   const outcome=await lookup(reference);if(!active.current)return null;if(!outcome)throw new Error('The original outcome remains unconfirmed.');return recorded(outcome);
  }catch(error){if(active.current){const retained=pendingRef.current;if(retained&&dispatched)update({...retained,unknown:true});setMessage(error instanceof Error?error.message:'The original outcome remains unconfirmed.');}return null;}finally{busyRef.current=false;if(active.current)setBusy(false);}
 }
 return{pending:pending!==null,canRetry:!!pending?.body,busy,message,setMessage,denied,send,recover};
}
