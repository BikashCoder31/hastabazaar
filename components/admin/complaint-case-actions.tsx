'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ComplaintCaseActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig('staff.complaint-case-action');
  const formRef = useRef<HTMLFormElement>(null);
  const actions =
    status === 'closed'
      ? []
      : status === 'resolved'
        ? ['close', 'reopen']
        : status === 'open'
          ? ['assign_to_me', 'investigate', 'escalate', 'resolve']
          : status === 'waiting_customer'
            ? ['investigate', 'escalate', 'resolve']
            : [
                'assign_to_me',
                'investigate',
                'request_customer',
                'escalate',
                'resolve',
              ];
  const [action, setAction] = useState(actions[0] || 'investigate');
  const [note, setNote] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [resolutionEn, setResolutionEn] = useState('');
  const [failedAttemptKey, setFailedAttemptKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!actions.length)
    return (
      <p className="text-sm text-muted-foreground">This complaint is closed.</p>
    );
  async function submit() {
    if (!catalog.canSubmit || !catalog.config || !formRef.current) {
      setError(catalog.message || 'Complaint form configuration is unavailable.');
      return;
    }
    setPending(true);
    setError('');
    setFailedAttemptKey(null);
    let attemptKey: string | null = null;
    try {
      const builtIns = ['action', 'note', 'publicMessageEn', 'publicMessageNe',
        'resolutionEn', 'resolutionNe', 'idempotencyKey', 'formVersion'];
      const configured = readConfiguredSubmission(formRef.current, catalog.config, builtIns);
      attemptKey = sessionAttemptKey('staff.complaint-case-action', `${id}:${action}`);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      const response = await fetch(
        `/api/admin/complaints/${encodeURIComponent(id)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            note,
            publicMessageEn: messageEn,
            publicMessageNe: messageEn,
            resolutionEn,
            resolutionNe: resolutionEn,
            sourceFormId: 'staff.complaint-case-action',
            ...configuredJsonPayload(catalog.config, configured.answers, builtIns),
            idempotencyKey: requestId,
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(result?.error || 'Complaint could not be updated.');
      if (result?.ok !== true) throw new Error('The complaint action could not be confirmed. Retry the same attempt.');
      clearSessionAttempt(attemptKey);
      router.refresh();
    } catch (cause) {
      setFailedAttemptKey(attemptKey);
      setError(
        cause instanceof Error
          ? cause.message
          : 'Complaint could not be updated.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form ref={formRef} data-form-id="staff.complaint-case-action" className="space-y-4"
      onSubmit={(event) => event.preventDefault()}>
      <div className="space-y-2">
        <Label>Action</Label>
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {actions.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <Field label="Internal case note">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          minLength={8}
          maxLength={2000}
        />
      </Field>
      <Field label="Customer message">
        <Textarea
          value={messageEn}
          onChange={(event) => setMessageEn(event.target.value)}
          minLength={8}
          maxLength={1000}
        />
      </Field>
      {action === 'resolve' ? (
        <Field label="Resolution">
          <Textarea
            value={resolutionEn}
            onChange={(event) => setResolutionEn(event.target.value)}
            minLength={8}
          />
        </Field>
      ) : null}
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={['action', 'note',
        'publicMessageEn', 'publicMessageNe', 'resolutionEn', 'resolutionNe',
        'idempotencyKey', 'formVersion']} /> : null}
      {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {failedAttemptKey ? <Button type="button" variant="outline" disabled={pending}
        onClick={() => {
          if (!window.confirm('This case action may already have succeeded. Check its latest history before starting a new attempt, which could duplicate the action. Continue?')) return;
          clearSessionAttempt(failedAttemptKey);
          if (catalog.status === 'stale') catalog.refresh();
          setFailedAttemptKey(null);
          setError('New attempt ready. Review the latest case history before submitting again.');
        }}>Start a new attempt</Button> : null}
      <Button
        type="button"
        disabled={
          pending || !catalog.canSubmit ||
          note.trim().length < 8 ||
          messageEn.trim().length < 8 ||
          (action === 'resolve' && resolutionEn.trim().length < 8)
        }
        onClick={() => void submit()}
      >
        {pending ? 'Saving…' : 'Apply action'}
      </Button>
    </form>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
