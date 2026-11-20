'use client';
import {useCallback,useSyncExternalStore} from 'react';

export const SESSION_REFERENCE_EVENT='hastabazaar:session-reference';
const serverSnapshot=():undefined=>undefined;

/** Only opaque references belong in this store; request bodies stay in their owning component. */
export function notifySessionReference(key:string){
 window.dispatchEvent(new CustomEvent(SESSION_REFERENCE_EVENT,{detail:key}));
}

export function useSessionReference(key:string){
 const subscribe=useCallback((changed:()=>void)=>{
  const listener=(event:Event)=>{
   if(event.type==='storage'){
    const storage=event as StorageEvent;
    if(storage.key===null||storage.key===key)changed();
   }else if((event as CustomEvent<string>).detail===key)changed();
  };
  window.addEventListener('storage',listener);
  window.addEventListener(SESSION_REFERENCE_EVENT,listener);
  return()=>{window.removeEventListener('storage',listener);window.removeEventListener(SESSION_REFERENCE_EVENT,listener);};
 },[key]);
 const snapshot=useCallback(()=>{try{return sessionStorage.getItem(key);}catch{return 'unavailable';}},[key]);
 return useSyncExternalStore(subscribe,snapshot,serverSnapshot);
}
