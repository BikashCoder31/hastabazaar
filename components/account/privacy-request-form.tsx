'use client';
import {useAccountCommand} from './use-account-command';
import {AccountCommandRecovery} from './account-command-recovery';

import { FormGuide } from '@/components/forms/form-guide';
import { useEffect,useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfiguredFields, focusConfiguredField } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';

const BASE_KEYS = ['requestType', 'detail', 'requestId', 'customerId'] as const;

export function PrivacyRequestForm({actorId}:{actorId:string}) {
  return <CurrentPrivacyRequestForm key={actorId} actorId={actorId}/>;
}
function CurrentPrivacyRequestForm({actorId}:{actorId:string}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  const { config, status, message: configMessage, canSubmit, refresh, handleSubmissionResponse } = usePublishedFormConfig('account.privacy-request');
  const command=useAccountCommand({actorId,scopeKey:'privacy',onRecorded:()=>{
    requestId.current=null;setMessage('Request submitted.');formRef.current?.reset();command.setMessage('');router.refresh();
  },onDenied:()=>router.refresh()});
  useEffect(()=>{const fieldId=Object.keys(fieldErrors)[0];if(fieldId&&formRef.current&&!command.blocked)focusConfiguredField(formRef.current,fieldId);},[fieldErrors,command.blocked]);
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || command.blocked || !canSubmit || !config) return;
    const isCurrent=command.capture();
    const form = event.currentTarget;
    const formData = new FormData(form);
    let payload: ReturnType<typeof configuredJsonPayload>;
    try {
      const { answers } = readConfiguredSubmission(form, config, BASE_KEYS);
      payload = configuredJsonPayload(config, answers, BASE_KEYS);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Review your form answers.');
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    setMessage('');
    setFieldErrors({});
    try {
      const response = await command.run({action:'privacy.request',sourceId:actorId,requestId:requestId.current,endpoint:'/api/account/privacy',method:'POST',
        body:{
          requestType: formData.get('requestType'),
          detail: formData.get('detail'),
          requestId: requestId.current,
          ...payload,
        } });
      if(!response||!isCurrent())return;
      const result = response.data as { error?: unknown; code?: unknown; fieldId?: unknown } | null;
      if (!response.ok) {
        if (response.status === 409 && result?.code === 'stale_version') handleSubmissionResponse(response, 'stale_version');
        else if (response.status === 400 || response.status === 409) requestId.current = null;
        const explanation = typeof result?.error === 'string' ? result.error : 'Request could not be submitted.';
        if (typeof result?.fieldId === 'string') {
          setFieldErrors({ [result.fieldId]: explanation });
        }
        throw new Error(explanation);
      }
    } catch (reason) {
      if(isCurrent())setMessage(
        reason instanceof Error
          ? reason.message
          : 'Request could not be submitted.',
      );
    } finally {
      if(isCurrent())setBusy(false);
    }
  }
  if(command.accessDenied)return <p role="alert">Account access changed. Reopen your account to load the current privacy workspace.</p>;
  return (<>
    <form ref={formRef}
      data-form-id="account.privacy-request"
      onSubmit={submit}
      onChange={() => { if (!busy&&!command.blocked) requestId.current = null; }}
      className="customer-form space-y-4 rounded-2xl border bg-card p-6"
    >
      <fieldset disabled={command.blocked} className="contents">
      <FormGuide formId="account.privacy-request" />

<p className="text-xs text-muted-foreground">* Required field</p>

      <h2 className="font-heading text-2xl">New privacy request</h2>
      {config ? <ConfiguredFields config={config} baseKeys={BASE_KEYS} errors={fieldErrors} /> : null}
      <label className="block text-sm font-semibold">
        Request type
         <span aria-hidden="true">*</span><select
          name="requestType"
          className="mt-2 w-full rounded-lg border bg-background p-3"
          required
        >
          <option value="access">Access my data</option>
          <option value="correction">Correct my data</option>
          <option value="deletion">Delete eligible data</option>
          <option value="retention_objection">Object to retention</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Details
         <span aria-hidden="true">*</span><textarea
          name="detail"
          minLength={20}
          maxLength={2000}
          required
          className="mt-2 min-h-28 w-full rounded-lg border bg-background p-3"
        />
      </label>
      {status !== 'ready' ? <div>
        <output className="text-sm text-muted-foreground">{status === 'loading' ? 'Form configuration is loading.' : configMessage}</output>
        {status !== 'loading' ? <button type="button" onClick={refresh} className="ml-3 rounded-lg border px-3 py-2 text-sm">Refresh form</button> : null}
      </div> : null}
      <button
        disabled={busy || command.blocked || !canSubmit}
        className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit request'}
      </button>
      {message ? <output className="block text-sm">{message}</output> : null}
      </fieldset>
    </form><AccountCommandRecovery command={command}/></>
  );
}
