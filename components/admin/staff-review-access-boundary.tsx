'use client';
import {createContext,useCallback,useContext,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {matchingNotificationScope,NOTIFICATION_ACCESS_EVENT,notificationAccessDenied} from '@/lib/operations/notification-client-events';

const ReviewAccess=createContext<{actorId:string;deny:()=>void}|null>(null);
export function useDenyStaffReview(){return useContext(ReviewAccess)?.deny;}
export function StaffReviewAccessBoundary({actorId,sourceId,children}:{actorId:string;sourceId:string;children:ReactNode}){
 return <OwnedBoundary key={JSON.stringify([actorId,sourceId])} actorId={actorId}>{children}</OwnedBoundary>;
}
function OwnedBoundary({actorId,children}:{actorId:string;children:ReactNode}){
 const parent=useContext(ReviewAccess),closed=useRef(false),[denied,setDenied]=useState(false);
 const deny=useCallback(()=>{
  if(closed.current)return;
  closed.current=true;setDenied(true);
  if(parent?.actorId===actorId)parent.deny();
  notificationAccessDenied({accountId:actorId,workspace:'staff'});
 },[actorId,parent]);
 useLayoutEffect(()=>{
  closed.current=denied;
  const listener=(event:Event)=>{if(matchingNotificationScope(event,{accountId:actorId,workspace:'staff'}))deny();};
  window.addEventListener(NOTIFICATION_ACCESS_EVENT,listener);
  return()=>{closed.current=true;window.removeEventListener(NOTIFICATION_ACCESS_EVENT,listener);};
 },[actorId,denied,deny]);
 const value=useMemo(()=>({actorId,deny}),[actorId,deny]);
 return <ReviewAccess.Provider value={value}>{denied?<section role="alert" className="space-y-3 rounded-lg border p-4"><h2 className="text-lg font-semibold">Review access changed</h2><p>Private evidence and unsent entries are hidden. The original action reference is retained for an authorized saved-outcome check.</p><button type="button" className="min-h-11 rounded border px-4 py-2" onClick={()=>window.location.reload()}>Reopen this review with current access</button></section>:children}</ReviewAccess.Provider>;
}
