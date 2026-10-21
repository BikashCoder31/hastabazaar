'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PlatformServiceFeeRefund({orderId,chargedPaisa,refundedPaisa}:{orderId:string;chargedPaisa:number;refundedPaisa:number}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const requestId=useRef<string|null>(null),router=useRouter();
  const remaining=Math.max(0,chargedPaisa-refundedPaisa);
  return <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Platform service fee · legally required refund</summary>
    <p className="mt-3 text-sm">Saved charge: NPR {(chargedPaisa/100).toFixed(2)}. Recorded refunds: NPR {(refundedPaisa/100).toFixed(2)}. The fee is normally non-refundable. Record an exception only after reviewing the legal requirement and completing the refund payment separately. This form does not send money.</p>
    <form data-form-id="system.platform-service-fee-refund" className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={async event=>{
      event.preventDefault();if(busy)return;const data=new FormData(event.currentTarget);setBusy(true);setMessage('');
      requestId.current??=crypto.randomUUID();
      try { const response=await fetch('/api/admin/platform-service-fee-refunds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceFormId:'system.platform-service-fee-refund',orderId,amountPaisa:Math.round(Number(data.get('amount'))*100),legalBasis:data.get('basis'),caseReference:data.get('case'),paymentReference:data.get('payment'),requestId:requestId.current})});
        const result=await response.json() as {error?:unknown};if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'Unable to record refund.');
        requestId.current=null;setMessage('Legally required fee refund recorded. Seller commission and delivery charges are unchanged.');router.refresh();
      }catch(error){setMessage(error instanceof Error?error.message:'Unable to record refund.');}finally{setBusy(false);}
    }}>
      <div><Label htmlFor="fee-refund-amount">Refund amount (NPR)</Label><Input id="fee-refund-amount" name="amount" type="number" min="0.01" step="0.01" max={remaining/100} required disabled={!remaining||busy}/></div>
      <div><Label htmlFor="fee-refund-case">Case reference</Label><Input id="fee-refund-case" name="case" minLength={3} maxLength={120} required disabled={!remaining||busy}/></div>
      <div><Label htmlFor="fee-refund-basis">Legal basis and decision</Label><Input id="fee-refund-basis" name="basis" minLength={20} maxLength={2000} required disabled={!remaining||busy}/></div>
      <div><Label htmlFor="fee-refund-payment">Completed payment reference</Label><Input id="fee-refund-payment" name="payment" minLength={3} maxLength={120} required disabled={!remaining||busy}/></div>
      <label className="flex gap-2 text-sm sm:col-span-2"><input type="checkbox" required disabled={!remaining||busy}/>I confirm this refund is required by law and has already been paid to the customer.</label>
      <Button type="submit" disabled={busy||!remaining}>{busy?'Recording…':'Record lawful fee refund'}</Button>
      {message?<output className="text-sm sm:col-span-2">{message}</output>:null}
    </form></details>;
}
