'use client';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
const BASE_KEYS=['action','note','requestId'];
export function PayoutRequestActions({ id, role = 'admin' }: { id: string; role?: 'admin'|'super_admin' }) {
  const router=useRouter();
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[retryPending,setRetryPending]=useState(false);
  const attemptKey=sessionAttemptKey('staff.payout-request-action',id);
  useEffect(() => { const timer = window.setTimeout(() => setRetryPending(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const catalog=usePublishedFormConfig('staff.payout-request-action');
  const [fieldError,setFieldError]=useState('');
  const fieldId = useId();
  async function save(body:Record<string,unknown>){
    if(pending)return;
    setPending(true);setError('');
    try{
      const requestId=getOrCreateSessionAttempt(attemptKey);setRetryPending(true);
      const response=await fetch('/api/admin/payout-requests/'+encodeURIComponent(id),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,requestId})});
      const result=await response.json().catch(()=>null) as {error?:string;code?:string;ok?:boolean}|null;
      if(!response.ok){if(response.status===409&&result?.code==='stale_version')catalog.handleSubmissionResponse(response,result.code);throw new Error(result?.error||'The payout decision could not be saved.');}
      if(result?.ok!==true)throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(attemptKey);setRetryPending(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'The payout decision could not be saved.');}
    finally{setPending(false);}
  }
  return (
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
      <Link className="text-sm underline" href={`/admin/staff-form-history?kind=payout-request-action&id=${encodeURIComponent(id)}`}>View payout request form history</Link>
      <fieldset
        disabled={pending||!catalog.canSubmit}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end"
      >
        <div>
          <Label htmlFor={fieldId + '-action'}>Next action</Label>
          <select
            id={fieldId + '-action'}
            name="action"
            className="mt-2 w-full rounded-lg border bg-background p-2"
          >
            <option value="prepare">{role==='super_admin'?'Create approved payout':'Prepare for Super Admin approval'}</option>
            <option value="reject">Reject request</option>
          </select>
        </div>
        <div>
          <Label htmlFor={fieldId + '-note'}>Review note</Label>
          <Input
            id={fieldId + '-note'}
            name="note"
            className="mt-2"
            required
            minLength={8}
            maxLength={1000}
          />
        </div>
        {catalog.config?<div className="md:col-span-3"><ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS}/></div>:null}
        {!catalog.canSubmit?<output aria-live="polite" className="md:col-span-3 text-sm">{catalog.message||'Form configuration is loading.'}</output>:null}
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? 'Saving…' : 'Save decision'}
        </Button>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {fieldError?<p role="alert" className="mt-2 text-sm text-destructive">{fieldError}</p>:null}
      {retryPending?<div className="mt-3 space-y-2 text-sm"><p>A previous decision may have succeeded. Check the payout request before another attempt.</p><Button type="button" variant="outline" disabled={pending} onClick={()=>{if(!window.confirm('Starting a new attempt may duplicate a prior successful action. Check the payout request first. Continue?'))return;clearSessionAttempt(attemptKey);setRetryPending(false);setError('');if(catalog.status==='stale')catalog.refresh();}}>Start a new attempt</Button></div>:null}
    </form>
  );
}
