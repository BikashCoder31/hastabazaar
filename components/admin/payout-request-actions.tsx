'use client';
import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {FinanceAccessNotice} from './finance-access-notice';
const BASE_KEYS=['action','note','requestId'];
type PayoutRequestActionProps={desk?:boolean;id:string;actorId:string;role?:'admin'|'super_admin';approvalAmount?:string};
export function PayoutRequestActions(props:PayoutRequestActionProps){
  return <PayoutRequestActionScope key={JSON.stringify([props.actorId,props.id])} {...props}/>;
}
function PayoutRequestActionScope({ id, actorId, role = 'admin', approvalAmount, desk }: PayoutRequestActionProps) {
  const router=useRouter();
  const active=useRef(true);useLayoutEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[retryPending,setRetryPending]=useState(false),[accessDenied,setAccessDenied]=useState(false),[retained,setRetained]=useState<Record<string,unknown>|null>(null);
  const attemptKey=sessionAttemptKey('staff.payout-request-action',actorId+':'+id);
  useEffect(() => { const timer = window.setTimeout(() => setRetryPending(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const catalog=usePublishedFormConfig('staff.payout-request-action');
  const [fieldError,setFieldError]=useState('');
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  async function save(body:Record<string,unknown>){
    if(pending||accessDenied)return;
    setRetained(body);
    setPending(true);setError('');
    try{
      const requestId=getOrCreateSessionAttempt(attemptKey);setRetryPending(true);
      const response=await fetch('/api/admin/payout-requests/'+encodeURIComponent(id),{method:'POST',headers:{'content-type':'application/json',[ACTOR_INTENT_HEADER]:actorId},body:JSON.stringify({...body,requestId})});
      const result=await response.json().catch(()=>null) as {error?:string;code?:string;ok?:boolean}|null;
      if(!active.current)return;
      if(response.status===401||response.status===403)setAccessDenied(true);
      if(!response.ok){if(response.status===409&&result?.code==='stale_version')catalog.handleSubmissionResponse(response,result.code);throw new Error(result?.error||'The payout decision could not be saved.');}
      if(result?.ok!==true)throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(attemptKey);setRetryPending(false);setOpen(false);if(desk)window.dispatchEvent(new Event('seller-desk-decided'));router.refresh();
    }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'The payout decision could not be saved.');}
    finally{if(active.current)setPending(false);}
  }
  async function checkOriginal(){
    setPending(true);try{
      const attempt=sessionStorage.getItem(attemptKey);if(!attempt)throw new Error('The original reference is unavailable. Refresh the current request.');
      const response=await fetch('/api/admin/payout-requests/'+encodeURIComponent(id)+'?attempt='+encodeURIComponent(attempt),{headers:{[ACTOR_INTENT_HEADER]:actorId}}),result=await response.json() as {outcome?:{id:string}|null;currentStatus?:string;error?:string};
      if(!active.current)return;if(!response.ok)throw new Error(result.error??'The original outcome could not be checked.');
      if(!Object.hasOwn(result,'outcome')||!['submitted','prepared','rejected'].includes(result.currentStatus??'')||result.outcome&&result.outcome.id!==id)throw new Error('The original outcome could not be verified.');
      setAccessDenied(false);if(result.outcome){clearSessionAttempt(attemptKey);setRetryPending(false);setRetained(null);if(desk)window.dispatchEvent(new Event('seller-desk-decided'));router.refresh();}else if(result.currentStatus!=='submitted'){setError('The original request already has a recorded decision. Review its current history.');router.refresh();}else setError('No original decision is recorded yet. Review the retained same-actor fields before retrying.');
    }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'The original outcome could not be checked.');}finally{if(active.current)setPending(false);}
  }
  if(accessDenied)return <FinanceAccessNotice message={error} busy={pending} onCheck={()=>void checkOriginal()}/>;
  const form = (
    <form
      data-form-id="staff.payout-request-action"
      onSubmit={(event) => {
        event.preventDefault();
        if(!catalog.config||!catalog.canSubmit)return;
        let configured:ReturnType<typeof configuredJsonPayload>;
        try{const submission=readConfiguredSubmission(event.currentTarget,catalog.config,BASE_KEYS);
          configured=configuredJsonPayload(catalog.config,submission.answers,BASE_KEYS);setFieldError('');}
        catch(cause){setFieldError(cause instanceof Error?cause.message:'Review the configured fields.');return;}
        const data = new FormData(event.currentTarget);
        void save({
          action: data.get('action'),
          note: data.get('note'),
          ...configured,
        });
      }}
      className="mt-4"
    >
      <FormGuide formId="staff.payout-request-action" />

      <Link className="text-sm underline" href={`/admin/staff-form-history?kind=payout-request-action&id=${encodeURIComponent(id)}`}>View payout request form history</Link>
      <fieldset
        disabled={pending||!catalog.canSubmit}
        className={approvalAmount ? 'mt-3 grid min-w-0 gap-3' : 'grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end'}
      >
        {approvalAmount ? <input type="hidden" name="action" value="prepare" /> : <div>
          <Label htmlFor={fieldId + '-action'}>Next action</Label>
          <select
            id={fieldId + '-action'}
            name="action"
            defaultValue={typeof retained?.action==='string'?retained.action:'prepare'}
            className="mt-2 min-h-11 w-full rounded-lg border bg-background p-2"
          >
            <option value="prepare">{role==='super_admin'?'Create approved payout':'Prepare for Super Admin approval'}</option>
            <option value="reject">Reject request</option>
          </select>
        </div>}
        <div>
          <Label htmlFor={fieldId + '-note'}>Review note</Label>
          <Input
            id={fieldId + '-note'}
            name="note"
            defaultValue={typeof retained?.note==='string'?retained.note:''}
            className="mt-2 min-h-11"
            required
            minLength={8}
            maxLength={1000}
          />
        </div>
        {catalog.config?<div className="md:col-span-3"><ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS}/></div>:null}
        {!catalog.canSubmit?<output aria-live="polite" className="md:col-span-3 text-sm">{catalog.message||'Form configuration is loading.'}</output>:null}
        <Button type="submit" variant={approvalAmount ? 'default' : 'outline'} className="min-h-11" disabled={pending}>
          {pending ? 'Saving…' : approvalAmount ? 'Approve payout' : 'Save decision'}
        </Button>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {fieldError?<p role="alert" className="mt-2 text-sm text-destructive">{fieldError}</p>:null}
      {retryPending?<div className="mt-3 space-y-2 text-sm"><p>A previous decision may have succeeded. Check the payout request before another attempt.</p><Button type="button" variant="outline" disabled={pending} onClick={()=>void checkOriginal()}>Check original saved outcome</Button>{retained?<Button type="button" variant="outline" disabled={pending} onClick={()=>retained?void save(retained):undefined}>Retry unchanged decision</Button>:null}<Button type="button" variant="outline" disabled={pending} onClick={()=>{if(!window.confirm('Starting a new attempt may duplicate a prior successful action. Check the payout request first. Continue?'))return;clearSessionAttempt(attemptKey);setRetryPending(false);setError('');if(catalog.status==='stale')catalog.refresh();}}>Start a new attempt</Button></div>:null}
    </form>
  );
  if (!approvalAmount) return form;
  return (
    <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
      <DialogTrigger type="button" data-desk-action={desk?"approve":undefined} className="admin-decision max-w-full">{desk?"Approve payout":"Approve available balance"}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border border-[#E3D8C7] bg-white p-5 text-[#14213D] sm:max-w-md" showCloseButton={false}>
        <DialogTitle className="text-xl">Approve seller payout</DialogTitle>
        <DialogDescription>The current eligible balance is {approvalAmount}. The final amount is checked when you approve. Record why you are approving the payout.</DialogDescription>
        {form}
        <DialogClose type="button" className="min-h-11 rounded-lg border border-[#CDBFA9] px-3 font-semibold hover:bg-[#F0EBE1] disabled:opacity-50" disabled={pending}>Cancel</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
