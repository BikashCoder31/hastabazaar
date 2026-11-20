'use client';
import Link from 'next/link';
import {FinanceEvidenceUpload} from '@/components/commerce/finance-evidence-upload';
import {useRef} from 'react';
import {useCaseCommand} from './use-case-command';
export function PlatformServiceFeeRefund({actorId,orderId,chargedPaisa,refundedPaisa,authorizedPaisa=0}:{actorId:string;orderId:string;chargedPaisa:number;refundedPaisa:number;authorizedPaisa?:number}){
 const form=useRef<HTMLFormElement>(null),command=useCaseCommand('system.platform-service-fee-refund',actorId,'authorize',orderId,'/api/admin/platform-service-fee-refunds?order='+encodeURIComponent(orderId),{created:true});
 const remaining=Math.max(0,chargedPaisa-refundedPaisa-authorizedPaisa);
 return <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Platform service fee · legally required refund</summary>
  <p className="mt-3 text-sm">Saved charge: NPR {(chargedPaisa/100).toFixed(2)}. Actually paid refunds: NPR {(refundedPaisa/100).toFixed(2)}. Authorized and awaiting payment: NPR {(authorizedPaisa/100).toFixed(2)}.</p>
  <p className="mt-2 text-sm">The fee is normally non-refundable. Authorize an exception only with a documented legal requirement. Finance then verifies the beneficiary, available funds and actual payment.</p>
  <Link className="my-3 block underline" href="/admin/payments/refunds">Open the refund and funding workspace</Link>
  {command.saved?<div className="flex gap-3"><button disabled={command.busy} onClick={()=>void command.recover()}>Check saved authorization</button>{command.canRetry?<button disabled={command.busy} onClick={()=>void command.retry()}>Retry unchanged authorization</button>:null}{command.unrecorded?<button disabled={command.busy} onClick={command.restart}>Review and start a new attempt</button>:null}</div>:null}
  <FinanceEvidenceUpload actorId={actorId} mode="staff" scope={{kind:'order',id:orderId}} onSaved={id=>{const field=form.current?.elements.namedItem('evidence');if(field instanceof HTMLInputElement)field.value=id;}}/>
  <form ref={form} data-form-id="system.platform-service-fee-refund" onSubmit={event=>{event.preventDefault();if(!form.current)return;const data=new FormData(form.current);void command.submit({sourceFormId:'system.platform-service-fee-refund',orderId,amountPaisa:Math.round(Number(data.get('amount'))*100),legalBasis:data.get('basis'),caseReference:data.get('case'),evidenceReference:data.get('evidence')});}}>
   <fieldset disabled={command.busy||command.saved||!remaining} className="mt-4 grid gap-3 sm:grid-cols-2">
    <label>Refund amount (NPR)<input className="block w-full rounded border p-2" name="amount" type="number" min="0.01" step="0.01" max={remaining/100} required/></label>
    <label>Original case reference<input className="block w-full rounded border p-2" name="case" minLength={3} maxLength={120} required/></label>
    <label>Legal basis and decision<textarea className="block w-full rounded border p-2" name="basis" minLength={20} maxLength={2000} required/></label>
    <label>Retained legal decision evidence<input className="block w-full rounded border p-2" name="evidence" minLength={8} maxLength={1500} required/></label>
    <label className="sm:col-span-2"><input type="checkbox" required/> I confirm the recorded legal requirement and exact original fee amount.</label>
    <button className="rounded bg-primary px-4 py-2 text-primary-foreground">Authorize original fee refund</button>
   </fieldset>
  </form>{command.message?<output aria-live="polite" className="mt-3 block">{command.message}</output>:null}
 </details>;
}
