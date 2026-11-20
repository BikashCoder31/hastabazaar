'use client';
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {SELLER_ACCESS_EVENT} from '@/lib/sellers/client-access';
import {NOTIFICATION_ACCESS_EVENT,matchingNotificationScope} from '@/lib/operations/notification-client-events';

export function SellerAccessBoundary(props:{actorId:string;children:ReactNode}){
 return <CurrentSellerBoundary key={props.actorId} {...props}/>;
}
function CurrentSellerBoundary({actorId,children}:{actorId:string;children:ReactNode}){
 const[denied,setDenied]=useState(false);
 useEffect(()=>{
  const seller=(event:Event)=>{if((event as CustomEvent<{actorId?:unknown}>).detail?.actorId===actorId)setDenied(true);};
  const notification=(event:Event)=>{if(matchingNotificationScope(event,{accountId:actorId,workspace:'seller'}))setDenied(true);};
  window.addEventListener(SELLER_ACCESS_EVENT,seller);window.addEventListener(NOTIFICATION_ACCESS_EVENT,notification);
  return()=>{window.removeEventListener(SELLER_ACCESS_EVENT,seller);window.removeEventListener(NOTIFICATION_ACCESS_EVENT,notification);};
 },[actorId]);
 if(denied)return <section id="main-content" tabIndex={-1} role="alert" className="rounded-xl border bg-card p-5"><p>Seller workspace access changed. Reopen Seller Center to load the current details.</p><Link prefetch={false} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();window.location.assign('/seller');}}} href="/seller" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Open current Seller Center</Link></section>;
 return children;
}
