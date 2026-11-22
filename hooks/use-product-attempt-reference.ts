'use client';
import {useCallback,useMemo,useSyncExternalStore} from 'react';
import type {ProductCommandSource} from '@/lib/products/command-outcome-contract';
import {SESSION_REFERENCE_EVENT} from './use-session-reference';

type Reference={state:'loading'|'empty'|'invalid'}|{state:'pending';requestId:string;action:string;legacy:boolean};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const isProductRequestId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(value);
/** Legacy private fields may identify an old attempt, but never leave this parser.
 * Native outcome reads independently authorize the exact actor and source. */
export function readProductAttemptReference(raw:string|null|undefined,source:ProductCommandSource):Reference{
 if(raw===undefined)return{state:'loading'};
 if(raw===null)return{state:'empty'};
 try{
  const row:unknown=JSON.parse(raw);if(!object(row))return{state:'invalid'};
  const legacy=row.schema===undefined&&object(row.payload),attempt=legacy?row.payload:row;
  if(!object(attempt)||!isProductRequestId(attempt.requestId)||typeof attempt.action!=='string'||!/^[a-z_]{1,40}$/.test(attempt.action))return{state:'invalid'};
  if(!legacy&&(Object.keys(row).some(key=>!['schema','requestId','action','actorId','kind','sourceId','relatedId'].includes(key))||row.schema!==1||row.actorId!==source.actorId||row.kind!==source.kind||row.sourceId!==source.sourceId||row.relatedId!==source.relatedId))return{state:'invalid'};
  return{state:'pending',requestId:attempt.requestId,action:attempt.action,legacy};
 }catch{return{state:'invalid'};}
}
const server=():undefined=>undefined;
/** React observes only a stable serialized opaque projection, never a wire body. */
export function useProductAttemptReference(storageKey:string,source:ProductCommandSource){
 const {actorId,kind,sourceId,relatedId}=source;
 const snapshot=useCallback(()=>{try{return JSON.stringify(readProductAttemptReference(sessionStorage.getItem(storageKey),{actorId,kind,sourceId,...(relatedId?{relatedId}:{})}));}catch{return JSON.stringify({state:'invalid'});}},[storageKey,actorId,kind,sourceId,relatedId]);
 const subscribe=useCallback((changed:()=>void)=>{const listener=(event:Event)=>{const key=event.type==='storage'?(event as StorageEvent).key:(event as CustomEvent<unknown>).detail;if(key===null||key===storageKey)changed();};window.addEventListener('storage',listener);window.addEventListener(SESSION_REFERENCE_EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(SESSION_REFERENCE_EVENT,listener);};},[storageKey]);
 const value=useSyncExternalStore(subscribe,snapshot,server);
 const read=useCallback(()=>JSON.parse(snapshot()) as Reference,[snapshot]);
 const reference=useMemo<Reference>(()=>value===undefined?{state:'loading'}:JSON.parse(value) as Reference,[value]);
 return{reference,read};
}
