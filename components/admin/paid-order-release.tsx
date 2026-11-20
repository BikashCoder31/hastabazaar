'use client';
import {useState} from 'react';
import {useBrowserReady} from '@/hooks/use-browser-ready';
import {usePaymentAttempt} from '@/hooks/use-payment-attempt';
import {useRouter} from 'next/navigation';
import type {getPaidManualReleaseReview} from '@/lib/payments/manual-receipts';
type Review=Awaited<ReturnType<typeof getPaidManualReleaseReview>>;
type ReleaseProps={review:Review;actorId:string};
export function PaidOrderRelease(props:ReleaseProps){const ready=useBrowserReady();return ready?<PaidOrderReleaseScope key={JSON.stringify([props.actorId,props.review.orderId])} {...props}/>:<output>Loading the original release…</output>;}
function PaidOrderReleaseScope({review,actorId}:ReleaseProps){
 const router=useRouter(),[reason,setReason]=useState(''),attempt=usePaymentAttempt({actorId,sourceId:review.orderId,action:'release',storageKey:`hastabazaar:paid-release:${actorId}:${review.orderId}`,endpoint:`/api/admin/payments/orders/${review.orderId}/release`});
 async function release(){const saved=await attempt.send(requestId=>JSON.stringify({action:'release',requestId,expectedRevision:String(review.revision),input:{orderId:review.orderId,reason}}));if(saved){attempt.setMessage('Release saved. Refreshing the original order.');router.refresh();}}
 async function recover(){if(await attempt.recover())router.refresh();}
 const recovery=attempt.pending?<button disabled={attempt.busy} className="section-link" onClick={()=>void recover()}>Check original release outcome</button>:null;
 if(attempt.denied)return <section><output aria-live="polite">{attempt.message}</output>{recovery}</section>;
 return <section className="space-y-4"><h1 className="font-heading text-3xl">Paid-order release · {review.orderNumber}</h1><p>{review.closed?'This order is closed.':!review.paid?'Payment is awaiting independent verification.':review.released?'Verified payment and release are recorded.':'Payment is verified; existing-order readiness needs review.'}</p>{review.holds.length?<p>Open review: {review.holds.map(h=>h.replaceAll('_',' ')).join(', ')}.</p>:null}{attempt.pending||review.paid&&!review.closed&&!review.released?<><label className="block">Release review reason<textarea disabled={attempt.busy||attempt.pending} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 block w-full rounded border p-2"/></label>{!attempt.pending||attempt.canRetry?<button disabled={attempt.busy} onClick={()=>void release()} className="rounded bg-primary px-4 py-2 text-primary-foreground">{attempt.pending?'Retry the same release':'Check readiness and release'}</button>:<p>The original reference is retained. Check its saved outcome; private review notes are not stored in this browser.</p>}</>:null}{recovery}{attempt.message?<output aria-live="polite">{attempt.message}</output>:null}<button className="section-link" onClick={()=>router.refresh()}>Refresh saved release state</button></section>;
}
