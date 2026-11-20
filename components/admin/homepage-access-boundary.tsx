'use client';
import {createContext,useCallback,useContext,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useCommercialScope} from './commercial-recovery';
import {matchingNotificationScope,NOTIFICATION_ACCESS_EVENT,notificationAccessDenied} from '@/lib/operations/notification-client-events';
const Context=createContext<{actorId:string;current:()=>boolean;deny:()=>void}|null>(null);
export function HomepageAccessNotice(){return <output className="block">Homepage access changed. <button type="button" className="underline" onClick={()=>window.location.assign('/admin/homepage')}>Reopen the homepage workspace</button> before continuing.</output>;}
export function HomepageAccessBoundary({actorId,children}:{actorId:string;children:ReactNode}){return <BoundaryScope key={actorId} actorId={actorId}>{children}</BoundaryScope>;}
function BoundaryScope({actorId,children}:{actorId:string;children:ReactNode}){
 const router=useRouter(),closed=useRef(false),[denied,setDenied]=useState(false);
 const deny=useCallback(()=>{if(closed.current)return;closed.current=true;setDenied(true);notificationAccessDenied({accountId:actorId,workspace:'staff'});router.refresh();},[actorId,router]);
 useLayoutEffect(()=>{closed.current=denied;const listener=(event:Event)=>{if(matchingNotificationScope(event,{accountId:actorId,workspace:'staff'}))deny();};window.addEventListener(NOTIFICATION_ACCESS_EVENT,listener);return()=>{closed.current=true;window.removeEventListener(NOTIFICATION_ACCESS_EVENT,listener);};},[actorId,deny,denied]);
 return denied?<HomepageAccessNotice/>:<Context.Provider value={{actorId,current:()=>!closed.current,deny}}>{children}</Context.Provider>;
}
export function useHomepageScope(actorId:string){
 const parent=useContext(Context),scope=useCommercialScope(actorId),closed=useRef(false);
 const current=()=>scope.current()&&!closed.current&&(!parent||parent.actorId===actorId&&parent.current());
 function deny(){if(!current())return;closed.current=true;if(parent?.actorId===actorId)parent.deny();else{scope.deny();notificationAccessDenied({accountId:actorId,workspace:'staff'});}}
 return {...scope,current,deny};
}
