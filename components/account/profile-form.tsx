'use client';
import {canonicalKey} from '@/lib/forms/field-keys';
import {useAccountCommand} from './use-account-command';
import {AccountCommandRecovery} from './account-command-recovery';

import { FormGuide } from '@/components/forms/form-guide';
import { useRouter } from 'next/navigation';
import { useEffect,useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { ConfiguredFields, fieldDisplay, focusConfiguredField } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';

const FORM_ID = 'account.profile';
const BASE_KEYS = ['displayName', 'phone', 'locale', 'idempotencyKey'] as const;

type ProfileFormProps={
  actorId:string;
  displayName: string;
  phone: string | null;
  locale?: 'en-NP' | 'ne-NP';
};
export function ProfileForm(props:ProfileFormProps) {
  return <CurrentProfileForm key={JSON.stringify([props.actorId,props.displayName,props.phone,props.locale])} {...props}/>;
}
function CurrentProfileForm(props:ProfileFormProps) {
  const router = useRouter();
  const { config, status, message: configMessage, canSubmit, refresh, handleSubmissionResponse } = usePublishedFormConfig(FORM_ID);
  const requestId = useRef<string | null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const command=useAccountCommand({actorId:props.actorId,scopeKey:'profile',onRecorded:(result)=>{
    const recovered=!!result&&typeof result==='object'&&'status' in result&&result.status==='recorded';
    requestId.current=null;setError('');setMessage(recovered?'The original profile change was recorded. Refresh to see your current details.':'Your profile is up to date.');command.setMessage('');router.refresh();
  },onDenied:()=>router.refresh()});
  useEffect(()=>{const fieldId=Object.keys(fieldErrors)[0],form=formRef.current;if(!fieldId||!form||command.blocked)return;
    if(fieldId==='displayName')form.querySelector<HTMLInputElement>('input[name="displayName"]')?.focus();else focusConfiguredField(form,fieldId);
  },[fieldErrors,command.blocked]);

  async function submit(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (saving || command.blocked || !canSubmit || !config) return;
    const isCurrent=command.capture();
    let payload: ReturnType<typeof configuredJsonPayload>;
    try {
      const { answers } = readConfiguredSubmission(event.currentTarget, config, BASE_KEYS);
      payload = configuredJsonPayload(config, answers, BASE_KEYS);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Please review the form answers.');
      return;
    }
    const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    setSaving(true);
    setMessage('');
    setError('');
    setFieldErrors({});
    try {
      const response = await command.run({action:'profile.update',sourceId:props.actorId,requestId:requestId.current,endpoint:'/api/account/profile',
        method: 'PATCH',body:{
          displayName: data.get('displayName'),
          phone: data.get('phone'),
          locale: props.locale ?? 'en-NP',
          idempotencyKey: requestId.current,
          ...payload,
        },
      });
      if(!response||!isCurrent())return;
      const result = response.data as { error?: unknown; fieldId?: unknown; code?: unknown } | null;
      if (!response.ok) {
        if (response.status === 409 && result?.code === 'stale_version') handleSubmissionResponse(response, 'stale_version');
        else if (response.status === 400 || response.status === 409) requestId.current = null;
        const explanation = typeof result?.error === 'string' ? result.error : 'Profile could not be saved.';
        if (typeof result?.fieldId === 'string') {
          const errors = Object.create(null) as Record<string, string>;
          errors[result.fieldId] = explanation;
          setFieldErrors(errors);
        }
        throw new Error(explanation);
      }
    } catch (reason) {
      if(isCurrent())setError(reason instanceof Error ? reason.message : 'Profile could not be saved.');
    } finally {
      if(isCurrent())setSaving(false);
    }
  }

  const nameDisplay = fieldDisplay(config, 'displayName');
  const phoneDisplay = fieldDisplay(config, 'phone');
  const nameControl = <div key="displayName" className="min-w-0 space-y-2">
    <Label htmlFor="displayName">{nameDisplay?.label ?? 'Your name'} <span aria-hidden="true">*</span></Label>
    <Input id="displayName" name="displayName" autoComplete="name" defaultValue={props.displayName}
      minLength={2} maxLength={100} required aria-required="true" placeholder={nameDisplay?.placeholder} />
    {nameDisplay?.helpText ? <p className="text-sm text-muted-foreground">{nameDisplay.helpText}</p> : null}
  </div>;
  const phoneControl = <div key="phone" className="min-w-0 space-y-2">
    <Label htmlFor="phone">{phoneDisplay?.label ?? 'Nepal mobile number'}</Label>
    <Input id="phone" name="phone" autoComplete="tel" defaultValue={props.phone ?? ''} type="tel"
      placeholder={phoneDisplay?.placeholder ?? '98XXXXXXXX'} />
    <p className="text-sm text-muted-foreground">{phoneDisplay?.helpText ?? 'Used to contact you about your orders.'}</p>
  </div>;
  const ordered = config ? [
    { id: 'displayName', order: config.fields.find((field) => canonicalKey(field.key) === 'displayname')?.order ?? -2, control: nameControl },
    { id: 'phone', order: config.fields.find((field) => canonicalKey(field.key) === 'phone')?.order ?? -1, control: phoneControl },
    ...config.fields.filter((field) => field.status === 'active' && !BASE_KEYS.some((key) => canonicalKey(key) === canonicalKey(field.key)))
      .map((field) => ({ id: field.id, order: field.order,
        control: <ConfiguredFields key={field.id} config={config} baseKeys={BASE_KEYS} fieldIds={[field.id]}
          includeVersion={false} errors={fieldErrors} /> })),
  ].sort((left, right) => left.order - right.order) : [];

  if(command.accessDenied)return <p role="alert">Account access changed. Reopen your account to load the current profile.</p>;
  return <><form ref={formRef} data-form-id="account.profile" onSubmit={submit} className="customer-form mt-6 grid min-w-0 gap-5 sm:grid-cols-2">
    <fieldset disabled={command.blocked} className="contents">
      <FormGuide formId="account.profile" />

    <p className="text-xs text-muted-foreground sm:col-span-2">* Required field</p>
    {config ? <input type="hidden" name="formVersion" value={config.version} /> : null}
    {config ? ordered.map((item) => <div key={item.id} className={`min-w-0 ${item.id === 'displayName' || item.id === 'phone' ? '' : 'sm:col-span-2'}`}>{item.control}</div>) : <>
      {nameControl}{phoneControl}
    </>}
    {status !== 'ready' ? <div className="sm:col-span-2">
      <output className="text-sm text-muted-foreground">{status === 'loading' ? 'Form configuration is loading.' : configMessage}</output>
      {status !== 'loading' ? <Button type="button" variant="outline" onClick={refresh} className="mt-3">Refresh form</Button> : null}
    </div> : null}
    <div className="flex flex-wrap items-center gap-4 border-t pt-5 sm:col-span-2">
      <Button type="submit" disabled={saving || command.blocked || !canSubmit} className="min-h-11 rounded-full px-6">
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
      {message ? <output className="flex items-center gap-2 text-sm text-primary"><Check className="size-4" />{message}</output> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
    </fieldset>
  </form><div className="mt-4"><AccountCommandRecovery command={command}/></div></>;
}
