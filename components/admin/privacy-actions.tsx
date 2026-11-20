'use client';
import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { sendJson } from '@/lib/http/client-request';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';

const BASE_KEYS=['action','note','requestId'];

export function PrivacyActions({
  id,
  canDecide,
  status,
  requestType,
  assignedToCurrentStaff,
}: {
  id: string;
  canDecide: boolean;
  status: string;
  requestType: string;
  assignedToCurrentStaff: boolean;
}) {
  const router=useRouter();
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const decisionKey=sessionAttemptKey('staff.privacy-action',id);
  const exportKey=sessionAttemptKey('staff.privacy-export',id);
  const eraseKey=sessionAttemptKey('staff.privacy-erase',id);
  const [decisionRetry,setDecisionRetry]=useState(false),[exportRetry,setExportRetry]=useState(false),[eraseRetry,setEraseRetry]=useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { setDecisionRetry(hasSessionAttempt(decisionKey)); setExportRetry(hasSessionAttempt(exportKey)); setEraseRetry(hasSessionAttempt(eraseKey)); }, 0); return () => window.clearTimeout(timer); }, [decisionKey, exportKey, eraseKey]);
  const catalog=usePublishedFormConfig('staff.privacy-action');
  const [fieldError,setFieldError]=useState('');
  const decisionPayload=useRef<ReturnType<typeof configuredJsonPayload>|null>(null);
  const [action, setAction] = useState('assign');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportDone, setExportDone] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [eraseDone, setEraseDone] = useState(false);
  const fieldId = useId();
  async function save() {
    if (!decisionPayload.current) return;
    setDone(false);
    if(pending)return;
    setPending(true);setError('');
    try{
      const requestId=getOrCreateSessionAttempt(decisionKey);setDecisionRetry(true);
      const response=await fetch('/api/admin/privacy/'+encodeURIComponent(id),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,note,...decisionPayload.current,requestId})});
      const result=await response.json().catch(()=>null) as {error?:string;code?:string;ok?:boolean}|null;
      if(!response.ok){if(response.status===409&&result?.code==='stale_version')catalog.handleSubmissionResponse(response,result.code);throw new Error(result?.error||'The privacy decision could not be saved.');}
      if(result?.ok!==true)throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(decisionKey);setDecisionRetry(false);
      setNote('');
      setConfirm(false);
      setDone(true);
      decisionPayload.current=null;
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'The privacy decision could not be saved.');}
    finally{setPending(false);}
  }
  async function exportAnswers() {
    if (exportPending) return;
    setExportPending(true);
    setExportError('');
    setExportDone(false);
    try {
      const requestId=getOrCreateSessionAttempt(exportKey);setExportRetry(true);
      const result = await sendJson<{ answers: unknown[] }>(
        '/api/admin/privacy/' + encodeURIComponent(id), 'POST',
        { action: 'export_answers', requestId },
        'The form-answer export could not be prepared.',
      );
      const blob = new Blob([JSON.stringify({ formAnswers: result.answers }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `form-answers-${id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      clearSessionAttempt(exportKey);setExportRetry(false);
      setExportDone(true);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'The export could not be prepared.');
    } finally { setExportPending(false); }
  }
  async function eraseAnswers() {
    if(pending)return;
    setEraseDone(false);
    setPending(true);setError('');
    try{
      const requestId=getOrCreateSessionAttempt(eraseKey);setEraseRetry(true);
      await sendJson('/api/admin/privacy/'+encodeURIComponent(id),'POST',{action:'erase_answers',requestId},'Eligible profile answers could not be erased.');
      clearSessionAttempt(eraseKey);setEraseRetry(false);
      setEraseConfirm(false);
      setEraseDone(true);
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'Eligible profile answers could not be erased.');}
    finally{setPending(false);}
  }
  if (status === 'completed' || status === 'rejected')
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        <p>This request is closed. Its records remain retained.</p>
        <Link className="underline" href={`/admin/staff-form-history?kind=privacy-action&id=${encodeURIComponent(id)}`}>View form history</Link>
      </div>
    );
  return (
    <div className="mt-5">
      <Link className="text-sm underline" href={`/admin/staff-form-history?kind=privacy-action&id=${encodeURIComponent(id)}`}>View form history</Link>
      {status === 'approved' && assignedToCurrentStaff && requestType === 'access' ? (
        <div className="mb-5 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Prepare a JSON copy of the customer’s stored form answers. This action does not close the request.</p>
          <Button className="mt-3" type="button" disabled={exportPending} onClick={() => void exportAnswers()}>
            {exportPending ? 'Preparing…' : 'Export form answers'}
          </Button>
          {exportError ? <p role="alert" className="mt-2 text-sm text-destructive">{exportError}</p> : null}
          {exportDone ? <output aria-live="polite" className="mt-2 block text-sm">Form-answer export prepared. Request status is unchanged.</output> : null}
          {exportRetry?<div className="mt-3 space-y-2 text-sm"><p>A previous export may have succeeded. Check the downloaded file before starting another attempt.</p><Button type="button" variant="outline" disabled={exportPending} onClick={()=>{if(!window.confirm('Starting a new attempt may duplicate a prior successful export. Check downloaded files first. Continue?'))return;clearSessionAttempt(exportKey);setExportRetry(false);setExportError('');}}>Start a new export attempt</Button></div>:null}
        </div>
      ) : null}
      {status === 'approved' && assignedToCurrentStaff && requestType === 'deletion' && canDecide ? (
        <div className="mb-5 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Erase eligible account-profile answer history after confirming retention and legal holds. Linked seller, delivery, order, and case records remain. This action does not close the request.</p>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => setEraseConfirm(true)}>Erase profile answers</Button>
          {eraseDone ? <output aria-live="polite" className="mt-2 block text-sm">Eligible profile answers erased. Other linked records and request status are unchanged.</output> : null}
          {eraseRetry?<div className="mt-3 space-y-2 text-sm"><p>A prior erasure may have succeeded. Check the request record before another attempt.</p><Button type="button" variant="outline" disabled={pending} onClick={()=>{if(!window.confirm('Starting a new attempt may repeat a prior successful erasure. Check the request record first. Continue?'))return;clearSessionAttempt(eraseKey);setEraseRetry(false);setError('');}}>Start a new erasure attempt</Button></div>:null}
        </div>
      ) : null}
      <form
        data-form-id="staff.privacy-action"
        onSubmit={(event) => {
          event.preventDefault();
          if (!catalog.config||!catalog.canSubmit) return;
          try {
            const submission=readConfiguredSubmission(event.currentTarget,catalog.config,BASE_KEYS);
            decisionPayload.current=configuredJsonPayload(catalog.config,submission.answers,BASE_KEYS);
            setFieldError('');
          } catch(cause) {
            setFieldError(cause instanceof Error?cause.message:'Review the configured fields.');
            return;
          }
          if (['approve', 'reject', 'complete'].includes(action))
            setConfirm(true);
          else void save();
        }}
      >
      <FormGuide formId="staff.privacy-action" />

        <fieldset disabled={pending||!catalog.canSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fieldId + '-action'}>Next action</Label>
            <select
              id={fieldId + '-action'}
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="assign">Assign for investigation</option>
              <option value="request_information">
                Request more information
              </option>
              {canDecide ? (
                <>
                  <option value="approve">Approve request</option>
                  <option value="reject">Reject request</option>
                  <option value="complete">Record completion</option>
                </>
              ) : null}
            </select>
          </div>
          <div>
            <Label htmlFor={fieldId + '-note'}>
              Investigation or decision note
            </Label>
            <Textarea
              id={fieldId + '-note'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              minLength={8}
              maxLength={2000}
            />
          </div>
          {catalog.config?<div className="sm:col-span-2"><ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS}/></div>:null}
          {!catalog.canSubmit?<output aria-live="polite" className="sm:col-span-2 text-sm">{catalog.message||'Form configuration is loading.'}</output>:null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending || note.trim().length < 8}>
              {pending ? 'Saving…' : 'Save decision'}
            </Button>
          </div>
        </fieldset>
      </form>
      {fieldError?<p role="alert" className="mt-3 text-sm text-destructive">{fieldError}</p>:null}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Recording approval or completion does not automatically export, correct,
        or delete data. Document the actual work and any retained records in
        your note.
      </p>
      {error && !confirm ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <output aria-live="polite" className="block mt-3 text-sm">Decision recorded.</output>
      ) : null}
      {decisionRetry?<div className="mt-3 space-y-2 text-sm"><p>A previous decision may have succeeded. Check the request history before another attempt.</p><Button type="button" variant="outline" disabled={pending} onClick={()=>{if(!window.confirm('Starting a new attempt may duplicate a prior successful decision. Check the request history first. Continue?'))return;clearSessionAttempt(decisionKey);setDecisionRetry(false);setError('');if(catalog.status==='stale')catalog.refresh();}}>Start a new decision attempt</Button></div>:null}
      <ConfirmOperation
        open={confirm}
        onOpenChange={setConfirm}
        title="Record this privacy decision?"
        description="Confirm that the decision and note accurately describe the reviewed request and any work performed. The event is retained in the request history."
        pending={pending}
        error={error}
        onConfirm={() => void save()}
      />
      <ConfirmOperation
        open={eraseConfirm}
        onOpenChange={setEraseConfirm}
        title="Erase eligible profile answers?"
        description="This erases only the customer’s saved account-profile answers after the server checks the approved request and stored legal hold. Other linked records and request status will not change."
        pending={pending}
        error={error}
        onConfirm={() => void eraseAnswers()}
      />
    </div>
  );
}
