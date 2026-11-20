'use client';
import {formText} from '@/lib/http/bounded-body';
import {useEffect,useId,useState,type SubmitEvent} from 'react';
import type {getLiveInvoiceAdjustmentReview} from '@/lib/managed-commerce/live-invoice-adjustments';
import {useCaseCommand} from './use-case-command';
import {RecoveryAttempt} from '@/components/commerce/recovery-action';

type Review=Awaited<ReturnType<typeof getLiveInvoiceAdjustmentReview>>;
const formId='system.live-invoice-adjustment';
const money=(value:number)=>new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR'}).format(value/100);
type InvoiceProps={actorId:string;invoiceId:string};
export function LiveInvoiceAdjustmentForm(props:InvoiceProps){return <LiveInvoiceAdjustmentScope key={JSON.stringify([props.actorId,props.invoiceId])} {...props}/>;}
function LiveInvoiceAdjustmentScope({actorId,invoiceId}:InvoiceProps){
 const endpoint=`/api/admin/invoices/${encodeURIComponent(invoiceId)}/live-adjustments`;
 const sourceControlId=useId();
 const [review,setReview]=useState<Review|null>(null),[error,setError]=useState('');
 const [readVersion,setReadVersion]=useState(0);
 const refresh=()=>setReadVersion(version=>version+1);
 useEffect(()=>{let current=true;async function load(){try{const response=await fetch(endpoint,{cache:'no-store'}),body=await response.json() as {review?:Review;error?:string};if(!current)return;if(!response.ok||!body.review)throw new Error(body.error??'The original invoice could not be checked.');setReview(body.review);setError('');}catch(failure){if(current){setReview(null);setError(failure instanceof Error?failure.message:'Refresh the original invoice.');}}}void load();return()=>{current=false;};},[endpoint,readVersion]);
 const command=useCaseCommand(formId,actorId,'credit',invoiceId,endpoint,{created:true,onSuccess:refresh});
 async function submit(event:SubmitEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget),source=review?.sources.find(row=>`${row.sourceKind}:${row.sourceId}`===data.get('source'));if(!source){command.setMessage('Refresh and choose a completed original financial event.');return;}await command.submit({sourceFormId:formId,expectedRevision:null,input:{sourceKind:source.sourceKind,sourceId:source.sourceId,reason:formText(data,'reason')}});}
 return <section className="mt-4 space-y-3 rounded-lg border p-4" aria-label="Actual invoice corrections">
  <h3 className="font-semibold">Actual invoice credit</h3>
  <p className="text-sm">Choose a completed original refund or cancellation. The amount comes from that record. This appends a commercial credit without changing the invoice or moving money.</p>
  <RecoveryAttempt command={command}/>
  {error?<p role="alert">{error} <button type="button" className="underline" onClick={refresh}>Refresh invoice</button></p>:null}
  {review?.adjustments.length?<ul className="space-y-1 text-sm" aria-label="Recent actual credit documents">{review.adjustments.map(row=><li key={row.id}>{row.number} · {money(row.amountPaisa)}</li>)}</ul>:null}
  {review?.needsReconciliation?<p role="alert">A completed refund exceeds the remaining commercial credit. Finance must reconcile its original allocation.</p>:null}
  {review&&!review.sources.length?<p className="text-sm">No uncredited completed refund or cancellation is currently eligible.</p>:null}
  <form data-form-id={formId} aria-label="Issue actual invoice credit" onSubmit={submit}>
   <fieldset disabled={!review?.sources.length||command.busy||command.saved} className="grid gap-3">
    <div><label htmlFor={sourceControlId}>Completed source</label><select id={sourceControlId} name="source" required className="mt-1 block w-full rounded border p-2">{review?.sources.map(source=><option key={`${source.sourceKind}:${source.sourceId}`} value={`${source.sourceKind}:${source.sourceId}`}>{source.sourceKind==='refund'?'Completed customer refund':'Original order cancellation'} · {source.sourceId} · {money(source.amountPaisa)}</option>)}</select></div>
    <label>Review reason<textarea name="reason" required minLength={10} maxLength={1000} className="mt-1 block w-full rounded border p-2"/></label>
    <button className="min-h-11 rounded bg-primary px-4 py-2 text-primary-foreground">Issue actual credit</button>
   </fieldset>
  </form>
 </section>;
}
