'use client';
import {formText} from '@/lib/http/bounded-body';
import {useEffect,useState,type SubmitEvent} from 'react';
import type {LiveManagedFinanceSnapshot} from '@/lib/managed-commerce/live-finance-api';
import {useCaseCommand} from './use-case-command';
import {RecoveryAttempt} from '@/components/commerce/recovery-action';
import {nepalDateTimeInput,parseNepalDateTime} from '@/lib/incentives/presentation';
const money=(value:number)=>`NPR ${(value/100).toLocaleString('en-NP',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const formId='system.managed-live-finance';
function Action({actorId,sellerId,action,scope=action,label,revision,disabled,input,read,asOf,onSaved}:{actorId:string;sellerId:string;action:'release'|'prepare'|'cancel';scope?:string;label:string;revision:string|null;disabled:boolean;input:Record<string,unknown>;read?:boolean;asOf?:number;onSaved:()=>void}){
 const command=useCaseCommand(formId,actorId,scope,sellerId,`/api/admin/managed-makers/${encodeURIComponent(sellerId)}/finance`,{created:true,onSuccess:onSaved});
 async function submit(event:SubmitEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);try{
  await command.submit({sourceFormId:formId,action,expectedRevision:revision,input:{...input,...(read?{scheduledFor:parseNepalDateTime(formText(data,'scheduledFor'))}:{}),reason:formText(data,'reason')}});
 }catch(error){command.setMessage(error instanceof Error?error.message:'Review the exact current payment fields.');}}
 return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium max-md:min-h-11 max-md:content-center">{label}</summary><RecoveryAttempt command={command}/><form aria-label={label} data-form-id={formId} onSubmit={submit}><fieldset disabled={disabled||command.busy||command.saved} className="mt-3 space-y-3">
  {read?<label className="block">Processing date and time · Nepal time<input type="datetime-local" name="scheduledFor" required defaultValue={nepalDateTimeInput(Math.ceil((asOf??0)/60000)*60000)} className="mt-1 block rounded border p-2"/></label>:null}
  <label className="block">Reason for this actual payment review<textarea name="reason" required minLength={10} maxLength={1000} className="mt-1 block w-full rounded border p-2"/></label>
  <button className="min-h-11 rounded border px-4 py-2">{label}</button>
 </fieldset></form></details>;
}
type FinanceProps={actorId:string;sellerId:string;initial?:LiveManagedFinanceSnapshot;error?:string};
export function LiveManagedFinanceControls(props:FinanceProps){return <LiveManagedFinanceScope key={JSON.stringify([props.actorId,props.sellerId])} {...props}/>;}
function LiveManagedFinanceScope({actorId,sellerId,initial,error:initialError}:FinanceProps){
 const [finance,setFinance]=useState(initial),[error,setError]=useState(initialError??''),[loading,setLoading]=useState(false),endpoint=`/api/admin/managed-makers/${encodeURIComponent(sellerId)}/finance`;
 const [readVersion,setReadVersion]=useState(0);
 const refresh=()=>{setLoading(true);setReadVersion(version=>version+1);};
 useEffect(()=>{if(readVersion===0&&(initial||initialError))return;let current=true;async function load(){try{const response=await fetch(endpoint,{cache:'no-store'}),body=await response.json() as {finance?:LiveManagedFinanceSnapshot;error?:string};if(!current)return;if(!response.ok||!body.finance)throw new Error(body.error??'Actual original earnings are unavailable.');setFinance(body.finance);setError('');}catch(problem){if(current){setFinance(undefined);setError(problem instanceof Error?problem.message:'Refresh the original actual earnings.');}}finally{if(current)setLoading(false);}}void load();return()=>{current=false;};},[endpoint,initial,initialError,readVersion]);
 return <section className="space-y-4 rounded-xl border p-4" aria-label="Actual live maker payments"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Actual original live earnings</h3><button type="button" onClick={refresh} disabled={loading} className="min-h-11 rounded border px-4">Refresh actual earnings</button></div><p>Original delivered-and-paid money is separate from new-order permission and retained simulation history. Bank execution and truthful sent/uncertain outcomes remain in the protected payout workspace.</p>
  {error?<p role="alert">{error}</p>:null}{!finance&&!error?<output aria-live="polite">Loading actual original earnings…</output>:null}
  {finance?<><dl className="grid gap-3 sm:grid-cols-3">{[['Earned',finance.summary.earnedPaisa],['Eligible',finance.summary.eligiblePaisa],['Held',finance.summary.heldPaisa],['Reserved',finance.summary.reservedPaisa],['Paid',finance.summary.paidPaisa],['Refund offsets',finance.summary.refundOffsetPaisa]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{money(Number(value))}</dd></div>)}</dl>
   {finance.preview.needsReview||finance.summary.needsReconciliation?<p role="alert">Reconcile the original money sources before preparing another payout.</p>:null}
   <Action actorId={actorId} sellerId={sellerId} action="release" label="Review mature actual earnings" revision={null} disabled={false} input={{}} onSaved={refresh}/>
   <Action actorId={actorId} sellerId={sellerId} action="prepare" label="Prepare actual payout reservation" revision={null} disabled={finance.preview.amountPaisa<=0} input={{expectedAmountPaisa:finance.preview.amountPaisa,expectedSnapshot:finance.preview.snapshotDigest}} read asOf={finance.asOf} onSaved={refresh}/>
   <p className="break-all text-sm">Reviewed receiving reference: {finance.preview.receivingReference??'Current verified beneficiary required'}</p><p><a href={finance.executionHref} className="underline">Open protected bank execution and reconciliation</a></p>
   <h4 className="font-semibold">Retained actual payouts</h4>{!finance.payments.length?<p>No actual payout reservation has been prepared.</p>:finance.payments.map(payment=><section key={payment.id} className="space-y-2 rounded border p-3"><p>{payment.number} · {money(payment.amountPaisa)} · {payment.status}</p><Action actorId={actorId} sellerId={sellerId} action="cancel" scope={`cancel:${payment.id}`} label={`Retire unsent reservation ${payment.number}`} revision={String(payment.updatedAt)} disabled={!payment.canCancel} input={{payoutId:payment.id}} onSaved={refresh}/></section>)}
  </>:null}
 </section>;
}
