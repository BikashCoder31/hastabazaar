'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {SELLER_ACCESS_EVENT,sellerAccessDenied} from '@/lib/sellers/client-access';
/** An access failure curtains this private Seller scope without revoking customer rights. */
export function useSellerPrivateScope(accountId:string,source:string){
 const owned=useOwnedFormScope(JSON.stringify([accountId,source])),router=useRouter(),denied=useRef(false),[accessDenied,setAccessDenied]=useState(false);
 const isCurrent=()=>owned.isCurrent()&&!denied.current;
 useEffect(()=>{const changed=(event:Event)=>{if(owned.isCurrent()&&(event as CustomEvent<{actorId?:string}>).detail?.actorId===accountId){denied.current=true;setAccessDenied(true);}};window.addEventListener(SELLER_ACCESS_EVENT,changed);return()=>window.removeEventListener(SELLER_ACCESS_EVENT,changed);},[accountId,owned]);
 const deny=()=>{if(!isCurrent())return;denied.current=true;setAccessDenied(true);sellerAccessDenied(accountId);router.refresh();};
 return{isCurrent,accessDenied,deny};
}
export function SellerFormAccessChanged(){return <p role="alert">Seller workspace access changed. <Link prefetch={false} href="/seller" onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();window.location.assign('/seller');}}}>Reopen Seller Center</Link> before entering private details.</p>;}
