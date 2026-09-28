'use client';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
const subscribeToAttempts = () => () => undefined;
export function ReviewModerationActions({
  id,
  status,
  replyVersion,
}: {
  id: string;
  status: string;
  replyVersion?: number;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig('staff.review-moderation');
  const formRef = useRef<HTMLFormElement>(null);
  const keyFor = (action: string) => sessionAttemptKey('staff.review-moderation', `${id}:${replyVersion ?? 'review'}:${action}`);
  const [, updateAttemptNotice] = useState(0);
  const attemptSnapshot = useSyncExternalStore(subscribeToAttempts,
    () => JSON.stringify(Object.fromEntries(['publish', 'reject', 'hide'].map((action) => [action, hasSessionAttempt(keyFor(action))]))),
    () => '{}');
  const attempts = JSON.parse(attemptSnapshot) as Record<string, boolean>;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const fieldId = useId();
  async function act(action: 'publish' | 'reject' | 'hide') {
    if (!catalog.canSubmit || !catalog.config || !formRef.current) { setError(catalog.message || 'Form configuration is unavailable.'); return; }
    if (note.trim().length < 8 || note.trim().length > 1000) { setError('Add a moderation note of 8–1,000 characters.'); return; }
    setPending(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, ['action', 'note', 'version', 'idempotencyKey', 'formVersion']);
      const payload = { action, note, ...(replyVersion ? { version: replyVersion } : {}),
        ...configuredJsonPayload(catalog.config, configured.answers, ['action', 'note', 'version', 'idempotencyKey', 'formVersion']) };
      const url = '/api/admin/reviews/' + encodeURIComponent(id) + (replyVersion ? '/reply' : '');
      const attemptKey = keyFor(action);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      updateAttemptNotice((current) => current + 1);
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey: requestId }) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error || 'The moderation action could not be saved.');
      if (result?.ok !== true) throw new Error('The moderation response could not confirm this action. Retry the same attempt.');
      clearSessionAttempt(attemptKey);
      updateAttemptNotice((current) => current + 1);
      setNote('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The moderation action could not be saved.');
    } finally {
      setPending(false);
    }
  }
  if (status !== 'pending' && status !== 'published')
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No moderation action is available at this stage.
      </p>
    );
  return (
    <form ref={formRef} data-form-id="staff.review-moderation" className="mt-4" onSubmit={(event) => event.preventDefault()}><fieldset disabled={pending || !catalog.canSubmit}>
      <Label htmlFor={fieldId}>Moderation note</Label>
      <Input
        id={fieldId}
        className="mt-2"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        minLength={8}
        maxLength={1000}
        placeholder="Explain the decision for the audit record."
      />
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={['action', 'note', 'version', 'idempotencyKey', 'formVersion']} /> : null}
      {catalog.message ? <p role="alert" className="mt-2 text-sm text-destructive">{catalog.message}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'pending' ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={pending || note.trim().length < 8}
              onClick={() => void act('publish')}
            >
              Publish {replyVersion ? 'reply' : 'review'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || note.trim().length < 8}
              onClick={() => void act('reject')}
            >
              Reject {replyVersion ? 'reply' : 'review'}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || note.trim().length < 8}
            onClick={() => void act('hide')}
          >
            Hide {replyVersion ? 'reply' : 'review'}
          </Button>
        )}
      </div>
    </fieldset>
    {Object.entries(attempts).filter(([, present]) => present).map(([action]) => <div key={action} className="mt-3 space-y-2 text-sm">
      <p>A prior {action} action may have succeeded. Check this record before starting another attempt.</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        if (!window.confirm('A prior moderation action may already have succeeded. Check the record first. Starting a new attempt may duplicate it. Continue?')) return;
        clearSessionAttempt(keyFor(action));
        updateAttemptNotice((current) => current + 1);
        setError('');
        if (catalog.status === 'stale') catalog.refresh();
      }}>Start a new moderation attempt</Button>
    </div>)}
    </form>
  );
}
