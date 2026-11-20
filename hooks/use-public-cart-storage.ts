'use client';
import {useCallback,useSyncExternalStore} from 'react';

const changedEvent='hastabazaar:public-cart-storage';
const serverSnapshot=():undefined=>undefined;

/** Public option choices and anonymous cart references only; never checkout contact or payment fields. */
export function notifyPublicCartStorage(key:string){
 window.dispatchEvent(new CustomEvent(changedEvent,{detail:key}));
}

export function usePublicCartStorage(key:string){
 const subscribe=useCallback((changed:()=>void)=>{
  const listener=(event:Event)=>{
   if(event.type==='storage'){
    const storage=event as StorageEvent;
    if(storage.key===null||storage.key===key)changed();
   }else if((event as CustomEvent<string>).detail===key)changed();
  };
  window.addEventListener('storage',listener);
  window.addEventListener(changedEvent,listener);
  return()=>{window.removeEventListener('storage',listener);window.removeEventListener(changedEvent,listener);};
 },[key]);
 const snapshot=useCallback(()=>{try{return sessionStorage.getItem(key);}catch{return 'unavailable';}},[key]);
 return useSyncExternalStore(subscribe,snapshot,serverSnapshot);
}
