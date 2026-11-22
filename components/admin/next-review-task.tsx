'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import type {ReviewContinuation} from '@/lib/admin/review-continuation';
export function NextReviewTask({returnTo,actorId}:{returnTo:string;actorId:string}){return <NextReviewTaskScope key={actorId+':'+returnTo} returnTo={returnTo} actorId={actorId}/>;}
function NextReviewTaskScope({returnTo,actorId}:{returnTo:string;actorId:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[followUp,setFollowUp]=useState<string|null>(null),flight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function next(){if(flight.current)return;flight.current=true;setBusy(true);setMessage('');setFollowUp(null);try{
  const response=await fetch('/api/admin/review-continuation?'+new URLSearchParams({returnTo}),{cache:'no-store',headers:{'X-Hastabazaar-Actor':actorId}}),result=await response.json() as ReviewContinuation&{error?:string};if(!mounted.current)return;
  if(response.status===401||response.status===403)router.refresh();if(!response.ok)throw Error(result.error??'Current source access could not be checked.');
  if(result.state==='next'){router.push(result.href);return;}
  if(result.state==='pending'&&result.followUpHref)setFollowUp(result.followUpHref);
  setMessage(result.state==='pending'?'This source still has an unresolved step. Review its current outcome before continuing.':result.state==='complete'?'No next actionable task matches the original queue filters.':'The original source is no longer available in this view. Return to results to refresh.');
 }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'The next task could not be checked.');}finally{flight.current=false;if(mounted.current)setBusy(false);}}
 return <span className="inline-flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={()=>void next()} className="min-h-11 rounded border px-3 py-2">{busy?'Checking current source…':'Next eligible task'}</button>{message?<output className="text-sm">{message}</output>:null}{followUp?<Link href={followUp} className="inline-flex min-h-11 items-center underline">Open continuing source</Link>:null}</span>;
}
