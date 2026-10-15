'use client';
import {useEffect,useState} from 'react';
import {readManagedTermsAttempts,type ManagedTermsAttempt} from './managed-terms-attempt';
import {ManagedTermsAcceptance} from './managed-terms-acceptance';
export function ManagedTermsRecovery({ownerId,sellerId,visibleOfferIds}:{ownerId:string;sellerId:string;visibleOfferIds:readonly string[]}) {
 const [attempts,setAttempts]=useState<ManagedTermsAttempt[]>([]),[error,setError]=useState('');
 const visible=JSON.stringify(visibleOfferIds);
 useEffect(()=>{let live=true;Promise.resolve().then(async()=>{
  const all=await readManagedTermsAttempts(sessionStorage,ownerId,sellerId);
  const shown=JSON.parse(visible) as string[];if(live)setAttempts(all.filter(item=>!shown.includes(item.offer.id)));
 }).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:'Recorded acceptances need review.');});return()=>{live=false;};},[ownerId,sellerId,visible]);
 if(error)return <p role="alert">{error}</p>;
 return attempts.length?<section aria-label="Earlier acceptance recovery" className="space-y-4"><h2 className="font-heading text-2xl">Confirm an earlier acceptance</h2>
  <p>These recorded requests refer to earlier or cancelled offers. Confirming an earlier saved result does not accept today’s new terms.</p>
  {attempts.map(attempt=><ManagedTermsAcceptance key={attempt.offer.id} ownerId={ownerId} sellerId={sellerId} offer={attempt.offer} future={false} alreadyAccepted={false} recovery/>)}</section>:null;
}
