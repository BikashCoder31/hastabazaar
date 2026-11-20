'use client';
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
type Reference={action:string;requestId:string};
type Pending=Reference&{wire:string;uncertain:boolean};
const eventName='hb:order-original-reference';
const noLegacy:readonly {key:string;action:string}[]=[];
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{1,150}$/.test(id);
function read(key:string){try{return sessionStorage.getItem(key)??'';}catch{return '!unavailable';}}
function write(key:string,value:string){sessionStorage.setItem(key,value);if(read(key)!==value)throw Error('The original reference could not be retained.');window.dispatchEvent(new Event(eventName));}
export function useActionRecovery({actorId,sourceId,endpoint,storageKey,actions,isCurrent,onDenied,legacy=noLegacy,continuation}:{actorId:string;sourceId:string;endpoint:string;storageKey:string;actions:readonly string[];isCurrent:()=>boolean;onDenied:()=>void;legacy?:readonly {key:string;action:string}[];continuation?:{action:string;body:(reference:Reference)=>Record<string,unknown>}}){
 const subscribe=useCallback((listener:()=>void)=>{window.addEventListener(eventName,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(eventName,listener);window.removeEventListener('storage',listener);};},[]);
 const getSnapshot=useCallback(()=>read(storageKey),[storageKey]);
 const raw=useSyncExternalStore(subscribe,getSnapshot,()=>null);
 const reference=useMemo(()=>{if(!raw)return null;try{const value=JSON.parse(raw) as Reference;if(actions.includes(value.action)&&validId(value.requestId))return{action:value.action,requestId:value.requestId};}catch{/* Keep unknown references blocked. */}return null;},[raw,actions]);
 const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false),[rejected,setRejected]=useState(false),[confirmed,setConfirmed]=useState(false),[recorded,setRecorded]=useState(false);
 const inFlight=useRef(false);
 useEffect(()=>{
  // Old wires are never reused. Preserve only their original reference for GET.
  const current=read(storageKey);let migrated:Reference|null=null;
  try{const value=JSON.parse(current) as Reference&{pending?:Reference|null};if(value?.pending&&validId(value.pending.requestId)&&actions.includes(value.pending.action))migrated={requestId:value.pending.requestId,action:value.pending.action};
   else if(current&&!['!unavailable','!legacy-unconfirmed'].includes(current)&&!(value&&Object.keys(value).length===2&&validId(value.requestId)&&actions.includes(value.action)))write(storageKey,value?.pending===null?'':'!legacy-unconfirmed');
  }catch{if(current&&!['!unavailable','!legacy-unconfirmed'].includes(current))try{write(storageKey,'!legacy-unconfirmed');}catch{/* Remain blocked. */}}
  if(!current){const saved=legacy.filter(item=>read(item.key));if(saved.length===1&&validId(read(saved[0].key)))migrated={requestId:read(saved[0].key),action:saved[0].action};else if(saved.length>0){try{write(storageKey,'!legacy-unconfirmed');}catch{/* Remain unavailable. */}}}
  if(migrated)try{write(storageKey,JSON.stringify(migrated));for(const item of legacy)sessionStorage.removeItem(item.key);}catch{/* No writes are enabled when storage is unavailable. */}
 },[storageKey,actions,legacy]);
 const matches=(value:Record<string,unknown>,ref:Reference)=>value.actorId===actorId&&value.sourceId===sourceId&&value.requestId===ref.requestId&&value.action===ref.action;
 async function execute(ref:Reference,wire?:string,previousUnknown=true,continuing=false){
  if(inFlight.current||!isCurrent()||denied)return false;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch(wire?endpoint:`${endpoint}?${new URLSearchParams({sourceId,action:ref.action,requestId:ref.requestId})}`,{method:wire?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',[ACTOR_INTENT_HEADER]:actorId},...(wire?{body:wire}:{})});
   if(!isCurrent())return false;
   if(response.status===401||response.status===403||Boolean(wire)&&response.status===404){setDenied(true);setPending(null);onDenied();return false;}
   const result=await response.json().catch(()=>null) as Record<string,unknown>|null;if(!isCurrent())return false;
   const needsSettlement=continuation?.action===ref.action;
   if(result?.recorded===true&&matches(result,ref)&&needsSettlement&&(response.ok||response.status===503)){
    setRecorded(true);setRejected(false);
    if(!response.ok||result.settlement!=='confirmed'){
     if(wire&&!continuing)setPending({...ref,wire,uncertain:true});
     setMessage('The original cancellation is recorded. Settlement continuation is unconfirmed. Keep its reference and continue the original settlement.');return false;
    }
   }
   if(response.ok&&result?.recorded===true&&matches(result,ref)&&(!needsSettlement||result.settlement==='confirmed')){
    try{write(storageKey,'');}catch{/* Local cleanup cannot undo verified native proof. */}setConfirmed(true);setPending(null);setRejected(false);setMessage(needsSettlement?'Original cancellation and settlement continuation confirmed.':'Original action confirmed. This is its saved historical outcome.');return true;
   }
   if(wire&&!continuing&&!recorded&&!previousUnknown&&result?.phase==='before_write'&&result.recorded===false&&matches(result,ref)){setRejected(true);setMessage(typeof result.error==='string'?result.error:'Review the current source before a new attempt.');return false;}
   if(wire&&!continuing)setPending({ ...ref,wire,uncertain:true });
   setMessage(recorded?'The original cancellation is recorded. Settlement continuation is unconfirmed. Keep its reference and continue the original settlement.':'The original outcome is unconfirmed. Keep this reference and check again.');return false;
  }catch{if(isCurrent()){if(wire&&!continuing)setPending({...ref,wire,uncertain:true});setMessage(recorded?'The original cancellation is recorded. Settlement continuation is unconfirmed. Keep its reference and continue the original settlement.':'The original outcome is unconfirmed. Keep this reference and check again.');}return false;}
  finally{inFlight.current=false;if(isCurrent())setBusy(false);}
 }
 async function run(action:string,body:Record<string,unknown>,idField='requestId'){
  if(inFlight.current||raw===null||raw||busy||denied||!isCurrent())return false;
  const ref={action,requestId:crypto.randomUUID()},wire=JSON.stringify({...body,[idField]:ref.requestId});
  try{write(storageKey,JSON.stringify(ref));}catch{setMessage('Browser storage is unavailable. No action was sent.');return false;}
  setConfirmed(false);setRecorded(false);setPending({...ref,wire,uncertain:false});setRejected(false);return execute(ref,wire,false);
 }
 return{busy,message:message||(raw==='!unavailable'?'Browser storage is unavailable. No new action can be sent.':raw==='!legacy-unconfirmed'?'The original reference is incomplete. Reconcile this action before starting another.':''),denied,blocked:raw===null||Boolean(raw)||busy||denied,reference,pending:Boolean(raw)&&!confirmed,run,
  retry:()=>pending?execute(pending,pending.wire,pending.uncertain):Promise.resolve(false),canRetry:Boolean(pending)&&!rejected,
  check:()=>reference?execute(reference):Promise.resolve(false),rejected,recorded,
  canContinue:recorded&&Boolean(reference)&&reference?.action===continuation?.action&&!confirmed,
  continueOriginal:()=>recorded&&reference&&reference.action===continuation?.action?execute(reference,JSON.stringify(continuation.body(reference)),true,true):Promise.resolve(false),
  reviewAgain:()=>{if(!rejected||!isCurrent())return;try{write(storageKey,'');setPending(null);setRejected(false);setMessage('Review the current source and retained entries before submitting.');}catch{setMessage('The original reference could not be updated.');}},
 };
}
