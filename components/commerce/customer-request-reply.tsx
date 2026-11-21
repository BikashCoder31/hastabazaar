'use client';

import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type SyntheticEvent } from 'react';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { getOrCreateSessionAttempt, clearSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import type { CustomerRequestKind } from '@/lib/returns/customer-aftercare-context';
import { maximumEvidenceFiles, validateEvidenceFile } from '@/lib/returns/validation';
import { aftercarePrimary, aftercareSecondary } from './customer-request-presentation';

interface ReplyProps {
  endpoint: string;
  kind: CustomerRequestKind;
  actorId?: string | null;
  viewerScope?: string;
  prompt?: string;
}

export function CustomerRequestReply(props: ReplyProps) {
  const scope = useOwnedFormScope(JSON.stringify([props.viewerScope ?? props.actorId ?? 'legacy-receipt', props.endpoint]));
  return <ScopedReply key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}

function ScopedReply({ endpoint, kind, actorId, viewerScope, prompt, isCurrent }: ReplyProps & { isCurrent: () => boolean }) {
  const replyId = useId();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const minimum = kind === 'return' ? 10 : 8;
  const maximum = kind === 'return' ? 2_000 : 3_000;
  const attempt = sessionAttemptKey('commerce.aftercare-reply', JSON.stringify([viewerScope ?? actorId ?? 'legacy-receipt', endpoint]));

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (sending.current || !isCurrent()) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const answer = data.get('message');
    const message = typeof answer === 'string' ? answer.trim() : '';
    if (message.length < minimum || message.length > maximum) {
      setError(`Write a reply of ${minimum}–${maximum.toLocaleString('en-NP')} characters.`);
      return;
    }
    const evidence = data.getAll('evidence').filter((file): file is File => file instanceof File && file.size > 0);
    if (evidence.length > maximumEvidenceFiles) { setError(`Choose up to ${maximumEvidenceFiles} photos.`); return; }
    for (const file of evidence) {
      const reason = validateEvidenceFile(file);
      if (reason) { setError(`${file.name}: ${reason}`); return; }
    }

    sending.current = true;
    setPending(true);
    setError('');
    setNotice('');
    const intent: Record<string, string> = actorId === undefined ? {} : { [ACTOR_INTENT_HEADER]: actorId ?? '' };
    try {
      const request = getOrCreateSessionAttempt(attempt);
      let body: FormData | string;
      if (evidence.length) {
        const multipart = new FormData();
        multipart.set('message', message);
        multipart.set('locale', 'en-NP');
        multipart.set('idempotencyKey', request);
        for (const file of evidence) multipart.append('evidence', file);
        body = multipart;
      } else {
        intent['content-type'] = 'application/json';
        body = JSON.stringify({ message, locale: 'en-NP', idempotencyKey: request });
      }
      const response = await fetch(endpoint, { method: 'POST', headers: intent, body });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!isCurrent()) return;
      if ([401, 403, 404].includes(response.status)) {
        form.reset();
        setFiles([]);
        setAccessDenied(true);
        router.refresh();
        return;
      }
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Refresh the request and check whether your reply was saved before you retry.');
      clearSessionAttempt(attempt);
      form.reset();
      setFiles([]);
      setNotice('Reply received. We’ll review what you sent.');
      router.refresh();
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message
        : 'We couldn’t confirm that reply. Refresh the request and check the conversation before you retry the same reply.');
    } finally {
      sending.current = false;
      if (isCurrent()) setPending(false);
    }
  }

  if (accessDenied) return <div role="alert" className="space-y-3 rounded-xl border bg-white p-4">
    <p>Account or case access changed. Reload the current order before using previous private reply content.</p>
    <button className={aftercareSecondary} type="button" onClick={() => window.location.reload()}>Reload current request</button>
  </div>;
  return <form onSubmit={submit} className="mt-5 min-w-0 rounded-xl border border-[#E4DACA] bg-white p-4 sm:p-5">
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <legend className="mb-2 font-semibold text-[#14213D]">{prompt ? 'Hastabazaar asks' : 'Reply to Hastabazaar'}</legend>
      {prompt ? <p className="whitespace-pre-wrap break-words text-sm font-semibold text-[#14213D]">{prompt}</p> : null}
      {kind === 'return' ? <label className={`${aftercareSecondary} relative cursor-pointer focus-within:outline-2 focus-within:outline-[#14213D]`}>
        <Upload className="size-4" aria-hidden="true"/> Add photo
        <input name="evidence" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only"
          onChange={event => setFiles(Array.from(event.currentTarget.files ?? [], file => file.name))}/>
      </label> : null}
      {files.length ? <ul className="space-y-1 break-all text-sm text-[#46536F]">{files.map((name,index) => <li key={`${index}:${name}`}>{name}</li>)}</ul> : null}
      <label htmlFor={replyId} className="block text-sm font-semibold text-[#14213D]">Requested information</label>
      <textarea id={replyId} name="message" minLength={minimum} maxLength={maximum} rows={4} required
        className="min-h-20 w-full min-w-0 rounded-lg border border-[#CFBB9E] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]"/>
      {error ? <p role="alert" className="text-sm font-semibold text-[#A8232E]">{error}</p> : null}
      {notice ? <output className="block text-sm text-[#205D42]">{notice}</output> : null}
      <button type="submit" className={aftercarePrimary}>{pending ? 'Sending…' : 'Send reply'}</button>
    </fieldset>
  </form>;
}
