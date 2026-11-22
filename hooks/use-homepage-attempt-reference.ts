'use client';
import {useCallback,useSyncExternalStore} from 'react';
import {SESSION_REFERENCE_EVENT} from './use-session-reference';
type Reference={state:'loading'|'empty'|'invalid'}|{state:'pending';key:string;requestId:string};
type Options={pointer:string;prefix:string;legacyPrefix:string;sourceKey:string|null;legacyKey?:string};
const server=():undefined=>undefined,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validHomepageRequestId=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
export function parseHomepageAttemptReference(raw:string|undefined):Reference{if(raw===undefined)return{state:'loading'};try{const row:unknown=JSON.parse(raw);if(Array.isArray(row)&&row.length===1&&(row[0]==='empty'||row[0]==='invalid'))return{state:row[0]};if(Array.isArray(row)&&row.length===3&&row[0]==='pending'&&typeof row[1]==='string'&&typeof row[2]==='string'&&uuid.test(row[2]))return{state:'pending',key:row[1],requestId:row[2]};}catch{/* An invalid opaque reference never authorizes a replacement. */}return{state:'invalid'};}
/** Snapshot only opaque keys/UUIDs. Legacy private values are never copied into
 * React state, events, new storage or requests. */
export function useHomepageAttemptReference({pointer,prefix,legacyPrefix,sourceKey,legacyKey}:Options){
 const snapshot=useCallback(()=>{try{let key=sessionStorage.getItem(pointer);if(key&&(key.length>700||(sourceKey?key!==sourceKey:!key.startsWith(prefix))))return JSON.stringify(['invalid']);if(!key){if(sourceKey)key=sessionStorage.getItem(sourceKey)!==null?sourceKey:legacyKey&&sessionStorage.getItem(legacyKey)!==null?legacyKey:null;else key=Object.keys(sessionStorage).sort().find(candidate=>candidate.startsWith(prefix)||candidate.startsWith(legacyPrefix)&&/^(save|publish|reverse):/.test(candidate.slice(legacyPrefix.length)))??null;}if(!key)return JSON.stringify(['empty']);const id=sessionStorage.getItem(key);return id&&uuid.test(id)?JSON.stringify(['pending',key,id]):JSON.stringify(['invalid']);}catch{return JSON.stringify(['invalid']);}},[pointer,prefix,legacyPrefix,sourceKey,legacyKey]);
 const subscribe=useCallback((changed:()=>void)=>{const relevant=(key:unknown)=>key===null||key===pointer||typeof key==='string'&&key.startsWith(legacyPrefix);const listener=(event:Event)=>{const key=event.type==='storage'?(event as StorageEvent).key:(event as CustomEvent<unknown>).detail;if(relevant(key))changed();};window.addEventListener('storage',listener);window.addEventListener(SESSION_REFERENCE_EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(SESSION_REFERENCE_EVENT,listener);};},[pointer,legacyPrefix]);
 const raw=useSyncExternalStore(subscribe,snapshot,server);
 return{reference:parseHomepageAttemptReference(raw),read:()=>parseHomepageAttemptReference(snapshot())};
}
