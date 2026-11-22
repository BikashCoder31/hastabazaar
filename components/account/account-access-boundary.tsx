'use client';
import Link from 'next/link';
import {useEffect,useState,type ReactNode} from 'react';

export function AccountAccessBoundary(props:{actorId:string;children:ReactNode}) {
 return <CurrentAccountBoundary key={props.actorId} {...props}/>;
}
function CurrentAccountBoundary({actorId,children}:{actorId:string;children:ReactNode}) {
 const [denied,setDenied]=useState(false);
 useEffect(()=>{
  const changed=(event:Event)=>{if((event as CustomEvent<{actorId?:unknown}>).detail?.actorId===actorId)setDenied(true);};
  window.addEventListener('hb:account-access-denied',changed);
  return()=>window.removeEventListener('hb:account-access-denied',changed);
 },[actorId]);
 if(denied)return <section role="alert" className="rounded-xl border bg-card p-5"><p>Account access changed. Reopen your account to load the current private details.</p><Link prefetch={false} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();window.location.assign('/account');}}} className="mt-3 inline-flex min-h-11 items-center font-semibold underline" href="/account">Open current account</Link></section>;
 return children;
}
