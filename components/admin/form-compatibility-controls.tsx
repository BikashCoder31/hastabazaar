'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formAnswerContractsMatch } from '@/lib/forms/catalog-changes';
import type { ConfiguredField } from '@/lib/forms/types';

type Mode = 'review_equivalent' | 'require_current';
type Policy = { mode: Mode | 'automatic' | 'expired'; expiresAt: number | null; reason: string };

function readResponse(value: unknown): { policy: Policy | null; error?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { policy: null };
  const data = value as Record<string, unknown>;
  const error = typeof data.error === 'string' ? data.error : undefined;
  if (!data.policy || typeof data.policy !== 'object' || Array.isArray(data.policy)) return { policy: null, error };
  const candidate = data.policy as Record<string, unknown>;
  if (!['automatic', 'expired', 'review_equivalent', 'require_current'].includes(String(candidate.mode)) ||
    typeof candidate.reason !== 'string' ||
    !(candidate.expiresAt === null || (typeof candidate.expiresAt === 'number' && Number.isSafeInteger(candidate.expiresAt) && candidate.expiresAt > 0 && candidate.expiresAt <= 8_640_000_000_000_000)) ||
    (candidate.mode === 'review_equivalent' && candidate.expiresAt === null)) return { policy: null, error };
  return { policy: candidate as Policy, error };
}

export function FormCompatibilityControls({ formId, versionId, version, previousFields, currentFields, disabled, onPendingChange, actorId, retainedReview }: {
  formId: string; versionId: string; version: number; previousFields: readonly ConfiguredField[]; currentFields: readonly ConfiguredField[];
  disabled: boolean; onPendingChange: (pending: boolean) => void;
  actorId?: string; retainedReview?: { purpose: string; ownerId: string };
}) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<Mode | null>(null);
  const pending = useRef<{ mode: Mode; body: string } | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const endpoint = `/api/admin/forms/${encodeURIComponent(formId)}/compatibility`;
  const reviewPossible = formAnswerContractsMatch(previousFields, currentFields, true);
  const wording = (field: ConfiguredField) => [field.label, field.helpText, field.placeholder,
    ...(field.choices?.map(choice => `${choice.value}: ${choice.label}`) ?? [])].filter(Boolean).join('\n');
  const previous = new Map(previousFields.map(field => [field.id, field]));
  const wordingChanges = currentFields.flatMap(field => {
    const before = previous.get(field.id);
    return before && wording(before) !== wording(field) ? [{ id: field.id, before: wording(before), after: wording(field) }] : [];
  });

  async function load() {
    if (running.current || pending.current) return;
    const request = ++generation.current;
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}?version=${version}`, { cache: 'no-store', headers: actorId ? { 'X-Hastabazaar-Actor': actorId } : {} });
      const data = readResponse(await response.json());
      if (!response.ok || !data.policy) throw new Error(data.error ?? 'Compatibility status is unavailable.');
      if (generation.current === request) { setPolicy(data.policy); setMessage(''); }
    } catch (error) {
      if (generation.current === request) setMessage(error instanceof Error ? error.message : 'Compatibility status is unavailable.');
    } finally { if (generation.current === request) setBusy(false); }
  }

  async function act(mode: Mode) {
    if (running.current || disabled || (mode === 'review_equivalent' && !reviewPossible) || (pending.current && pending.current.mode !== mode)) return;
    if (!pending.current && !reason.trim()) { setMessage('Explain why the previous wording is equivalent or must no longer be accepted.'); return; }
    if (!pending.current) pending.current = { mode, body: JSON.stringify({ mode, versionId, expectedPublishedVersion: version,
      reason: reason.trim(), requestId: crypto.randomUUID(), ...(retainedReview ? { retainedReview } : {}) }) };
    running.current = true; ++generation.current; onPendingChange(true); setBusy(true); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(actorId ? { 'X-Hastabazaar-Actor': actorId } : {}), ...(retainedReview ? { 'X-Hastabazaar-Form-Mode': 'retained-extension' } : {}) }, body: pending.current.body });
      const data = readResponse(await response.json());
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
          pending.current = null; setUncertain(null); onPendingChange(false);
        }
        throw new Error(data.error ?? 'The compatibility result is not confirmed.');
      }
      if (!data.policy || !['review_equivalent', 'require_current'].includes(data.policy.mode)) throw new Error('The compatibility result is not confirmed.');
      setPolicy(data.policy); pending.current = null; setUncertain(null); onPendingChange(false);
      setMessage('Compatibility policy saved. Existing question edits are unchanged.');
    } catch (error) {
      if (pending.current) setUncertain(mode);
      setMessage(error instanceof Error ? error.message : 'The result is not confirmed. Retry the same action.');
    } finally { running.current = false; setBusy(false); }
  }

  return <details className="rounded-xl border p-4" onToggle={event => { if (event.currentTarget.open && !policy) void load(); }}>
    <summary className="cursor-pointer font-medium">Previous-version compatibility</summary>
    <div className="mt-4 grid gap-3 text-sm">
      <p>Compare published versions {version - 1} and {version}. Only an equivalent change in wording can be reviewed here. Required questions, choices, identity, consent and business rules keep their current checks.</p>
      {wordingChanges.length ? <div className="grid gap-3">{wordingChanges.map(change => <div key={change.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
        <div><p className="font-medium">Previous wording</p><p className="whitespace-pre-wrap break-words">{change.before}</p></div>
        <div><p className="font-medium">Current wording</p><p className="whitespace-pre-wrap break-words">{change.after}</p></div>
      </div>)}</div> : <p>No wording differences between these publications.</p>}
      {!reviewPossible ? <p>This publication also changes question structure or validation. Wording review cannot make the previous questions eligible.</p> : null}
      {policy ? <p>{policy.mode === 'automatic' ? 'Only mechanically equivalent spacing and ordering changes are accepted automatically.' :
        policy.mode === 'require_current' ? 'Previous wording is revoked. New submissions must use the current questions.' :
        policy.mode === 'expired' ? 'The reviewed acceptance window has expired. Current questions are required.' :
        `Reviewed equivalent wording is accepted until ${new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' }).format(new Date(policy.expiresAt!))} (Nepal time).`}</p> : null}
      <label htmlFor="compatibility-reason">Reason for compatibility decision</label>
      <Textarea id="compatibility-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} disabled={disabled || busy || uncertain !== null} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled || busy || !reviewPossible || (uncertain !== null && uncertain !== 'review_equivalent') || policy?.mode === 'require_current'} onClick={() => void act('review_equivalent')}>
          {uncertain === 'review_equivalent' ? 'Retry identical wording review' : 'Approve equivalent wording for 24 hours'}
        </Button>
        <Button type="button" variant="outline" disabled={disabled || busy || (uncertain !== null && uncertain !== 'require_current')} onClick={() => void act('require_current')}>
          {uncertain === 'require_current' ? 'Retry identical revocation' : 'Require current questions'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || uncertain !== null} onClick={() => void load()}>Refresh compatibility status</Button>
      </div>
      {uncertain ? <p>The result is uncertain. Retry the same action to recover its recorded outcome; question editing stays locked until it is resolved.</p> : null}
      <output className="block" aria-live="polite">{message}</output>
    </div>
  </details>;
}
