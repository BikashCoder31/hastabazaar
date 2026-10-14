'use client';
import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { RiderPolicy } from '@/lib/riders/repository';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
const BASE_KEYS=['action','status','note','userId','reportId','version','eligible','requestId'];
const POLICY_KEYS=['action','version','otpScope','requestId'];
export function RiderAdminAction({
  action,
  fields,
  label,
}: {
  action: string;
  fields: Record<string, string | number | boolean>;
  label: string;
}) {
  const router = useRouter(),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const catalog=usePublishedFormConfig('staff.rider-control-1');
  const attemptKey=sessionAttemptKey('staff.rider-control-1',`${action}:${String(fields.userId??fields.reportId??'global')}`);
  const [retryPending,setRetryPending]=useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setRetryPending(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if(busy||!catalog.config||!catalog.canSubmit)return;
    let configured:ReturnType<typeof configuredJsonPayload>;
    try{const submission=readConfiguredSubmission(e.currentTarget,catalog.config,BASE_KEYS);
      configured=configuredJsonPayload(catalog.config,submission.answers,BASE_KEYS);}
    catch(error){setMessage(error instanceof Error?error.message:'Review the configured fields.');return;}
    const f = new FormData(e.currentTarget);
    const body={...fields,action,status:f.get('status'),note:f.get('note'),...configured};
    setBusy(true);
    try {
      const requestId=getOrCreateSessionAttempt(attemptKey);setRetryPending(true);
      const r = await fetch('/api/admin/riders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({...body,requestId}),
        }),
        data = (await r.json().catch(()=>null)) as { error?: string;code?:string;ok?:boolean } | null;
      if(r.status===409&&data?.code==='stale_version')catalog.handleSubmissionResponse(r,data.code);
      if (!r.ok) throw new Error(data?.error ?? 'Update failed.');
      if(data?.ok!==true)throw new Error('The response could not be verified. Retry with the same request.');
      setMessage('Rider record updated.');
      clearSessionAttempt(attemptKey);setRetryPending(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form data-form-id="staff.rider-control-1" className="my-3 space-y-2" onSubmit={(e) => void submit(e)}>
      <FormGuide formId="staff.rider-control-1" />

      <Link className="text-sm underline" href={`/admin/staff-form-history?kind=${fields.reportId?'rider-report-control':'rider-control'}${fields.reportId||fields.userId?`&id=${encodeURIComponent(String(fields.reportId??fields.userId))}`:''}`}>View rider form history</Link>
      {action === 'review' ? (
        <label className="block">
          Decision *
          <select name="status" className="ml-2 rounded border p-2">
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
            <option value="suspended">Suspend</option>
          </select>
        </label>
      ) : null}
      {action !== 'confirm' ? (
        <label className="block">
          Reason / next action *
          <textarea
            className="mt-1 block w-full rounded border p-2"
            name="note"
            required
            minLength={8}
            maxLength={500}
          />
        </label>
      ) : (
        <p className="text-sm">
          Confirm only after reviewing proof and cash evidence. This records
          reported COD collection; it does not record carrier remittance.
        </p>
      )}
      {catalog.config?<ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS}/>:null}
      {!catalog.canSubmit?<output aria-live="polite" className="block text-sm">{catalog.message||'Form configuration is loading.'}</output>:null}
      <button type="submit" disabled={busy||!catalog.canSubmit} className="rounded-lg border px-4 py-2">
        {label}
      </button>
      <output className="block" aria-live="polite">
        {message}
      </output>
      {retryPending?<div className="space-y-2 text-sm"><p>A previous update may have succeeded. Check the rider record before another attempt.</p><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>{if(!window.confirm('Starting a new attempt may duplicate a prior successful action. Check the rider record first. Continue?'))return;clearSessionAttempt(attemptKey);setRetryPending(false);setMessage('');if(catalog.status==='stale')catalog.refresh();}}>Start a new attempt</button></div>:null}
    </form>
  );
}
export function RiderPolicyForm({ policy }: { policy: RiderPolicy }) {
  const router = useRouter(),
    [message, setMessage] = useState(''),[busy,setBusy]=useState(false),[retryPending,setRetryPending]=useState(false);
  const catalog=usePublishedFormConfig('staff.rider-control-2');
  const attemptKey=sessionAttemptKey('staff.rider-control-2','policy');
  useEffect(() => { const timer = window.setTimeout(() => setRetryPending(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  return (
    <form
      data-form-id="staff.rider-control-2"
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if(busy||!catalog.config||!catalog.canSubmit)return;
        let configured:ReturnType<typeof configuredJsonPayload>;
        try{const submission=readConfiguredSubmission(e.currentTarget,catalog.config,POLICY_KEYS);
          configured=configuredJsonPayload(catalog.config,submission.answers,POLICY_KEYS);}
        catch(error){setMessage(error instanceof Error?error.message:'Review the configured fields.');return;}
        const f = new FormData(e.currentTarget);
        const body={action:'policy',version:policy.version,otpScope:f.get('otpScope'),...configured};
        let requestId:string;try{requestId=getOrCreateSessionAttempt(attemptKey);setRetryPending(true);}catch(error){setMessage(error instanceof Error?error.message:'Browser storage is unavailable.');return;}
        setBusy(true);
        void fetch('/api/admin/riders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({...body,requestId}),
        })
          .then(async (r) => {
            const d = (await r.json().catch(()=>null)) as { error?: string;code?:string;ok?:boolean } | null;
            if(r.status===409&&d?.code==='stale_version')catalog.handleSubmissionResponse(r,d.code);
            setMessage(
              r.ok&&d?.ok===true ? 'Rider settings saved.' : (d?.error ?? 'The response could not be verified. Retry with the same request.'),
            );
            if (r.ok&&d?.ok===true) {clearSessionAttempt(attemptKey);setRetryPending(false);router.refresh();}
          })
          .catch(() => setMessage('Settings could not be saved.'))
          .finally(()=>setBusy(false));
      }}
    >
      <h2 className="font-semibold">Delivery evidence settings</h2>
      <FormGuide formId="staff.rider-control-2" />

      <Link className="text-sm underline" href="/admin/staff-form-history?kind=rider-policy&id=current">View policy form history</Link>
      <p>
        One handover photo or video is required. Evidence is retained; no
        automatic deletion runs.
      </p>
      <p className="text-sm">
        Open-box product codes, district codes, and financial controls are
        managed in Business Settings. Rider eligibility is reviewed per rider
        below; the former global open-box switch is no longer authoritative.
      </p>
      <label className="block">
        Optional OTP applicability
        <select
          className="ml-2 rounded border p-2"
          name="otpScope"
          defaultValue={policy.otpScope}
        >
          <option value="off">Off</option>
          <option value="prepaid_only">Prepaid handovers only</option>
        </select>
      </label>
      <p className="text-sm">
        COD never requires OTP. When enabled for a prepaid handover, the
        customer obtains the code from their protected receipt. No SMS or email
        is sent by this setting.
      </p>
      {catalog.config?<ConfiguredFields config={catalog.config} baseKeys={POLICY_KEYS}/>:null}
      {!catalog.canSubmit?<output aria-live="polite" className="block text-sm">{catalog.message||'Form configuration is loading.'}</output>:null}
      <button type="submit" disabled={busy||!catalog.canSubmit} className="rounded border p-2">Save settings</button>
      <output className="block" aria-live="polite">
        {message}
      </output>
      {retryPending?<div className="space-y-2 text-sm"><p>A previous save may have succeeded. Check settings before another attempt.</p><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>{if(!window.confirm('Starting a new attempt may duplicate a prior successful action. Check rider settings first. Continue?'))return;clearSessionAttempt(attemptKey);setRetryPending(false);setMessage('');if(catalog.status==='stale')catalog.refresh();}}>Start a new attempt</button></div>:null}
    </form>
  );
}
