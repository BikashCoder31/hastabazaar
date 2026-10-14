'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  configurableAdminPermissions,
  type Permission,
} from '@/lib/marketplace/permissions';
import type {
  StaffPermissionProfile,
  StaffPermissionRequest,
  StaffPermissionPreset,
} from '@/lib/db/repositories/staff-permissions';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const proposalBaseKeys = ['action', 'userId', 'permissions', 'version', 'reason', 'presetName', 'requestId', 'formVersion', 'customAnswers'];
const decisionBaseKeys = ['action', 'requestId', 'reason', 'formRequestId', 'formVersion', 'customAnswers'];
const labels: Record<string, string> = {
  'seller.application.review': 'Review seller applications',
  'product.review': 'Review products and customer reviews',
  'product.publish': 'Publish products',
  'catalog.manage': 'Manage categories and governance',
  'order.manage': 'Manage orders, shipping and order emails',
  'support.manage': 'Manage returns, complaints and privacy requests',
  'refund.approve.standard': 'Approve standard refunds',
  'payout.prepare': 'Prepare payouts',
  'audit_log.view': 'View audit, reports and overview',
};
export function StaffPermissionManager({
  actorId,
  members,
  requests,
  presets,
}: {
  actorId: string;
  members: readonly (StaffPermissionProfile & {
    displayName: string;
    email: string;
  })[];
  requests: readonly StaffPermissionRequest[];
  presets: readonly StaffPermissionPreset[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(members[0]?.userId ?? '');
  const selected = members.find((m) => m.userId === userId);
  const [permissions, setPermissions] = useState<readonly Permission[]>(
    members[0]?.permissions ?? [],
  );
  const [reason, setReason] = useState('');
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<{body:Record<string,unknown>;requestKey:'requestId'|'formRequestId';attemptKey:string;title:string;description:string;confirmLabel:string}|null>(null);
  const added = configurableAdminPermissions.filter(permission=>permissions.includes(permission)&&!selected?.permissions.includes(permission));
  const removed = configurableAdminPermissions.filter(permission=>!permissions.includes(permission)&&selected?.permissions.includes(permission));
  const unchanged = configurableAdminPermissions.filter(permission=>permissions.includes(permission)&&selected?.permissions.includes(permission));
  const proposalCatalog = usePublishedFormConfig('staff.staff-permission-1');
  const decisionCatalog = usePublishedFormConfig('staff.staff-permission-2');
  const [retryKeys, setRetryKeys] = useState<Record<string, boolean>>({});
  const proposalKey = sessionAttemptKey('staff.staff-permission-1', userId);
  useEffect(() => {
    const keys = [proposalKey, ...requests.filter((r) => r.status === 'pending').flatMap((r) => [
      sessionAttemptKey('staff.staff-permission-2', r.id + ':approve'),
      sessionAttemptKey('staff.staff-permission-2', r.id + ':reject'),
    ])];
    const timer = window.setTimeout(() => setRetryKeys(Object.fromEntries(keys.map((key) => [key, hasSessionAttempt(key)]))), 0);
    return () => window.clearTimeout(timer);
  }, [proposalKey, requests]);
  async function submit(body: Record<string, unknown>, requestKey: 'requestId' | 'formRequestId', attemptKey: string) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setRetryKeys((current) => ({ ...current, [attemptKey]: true }));
      const response = await fetch('/api/admin/staff-permissions', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, [requestKey]: requestId }) });
      const result = await response.json().catch(() => null) as { id?: string; message?: string; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') (requestKey === 'requestId' ? proposalCatalog : decisionCatalog).handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error ?? 'Permission request failed. Retry the same request.');
      if (typeof result?.message !== 'string' || !result.message.trim() || (requestKey === 'requestId' && (typeof result.id !== 'string' || !result.id.trim()))) throw new Error('The response could not confirm this decision. Retry the same request.');
      setMessage(result.message);
      clearSessionAttempt(attemptKey);
      setRetryKeys((current) => ({ ...current, [attemptKey]: false }));
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permission request failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const retryNotice = (key: string, catalog: typeof proposalCatalog) => retryKeys[key] ? <div className="space-y-2 text-xs text-muted-foreground"><p>A permission action may already have succeeded. Check its history before retrying. Changed details keep the same request reference and may conflict.</p><Button type="button" variant="outline" disabled={busy} onClick={() => {
    if (!window.confirm('A prior permission action may already have succeeded. Check its history first. Starting a new attempt may duplicate it. Continue?')) return;
    clearSessionAttempt(key); setRetryKeys((current) => ({ ...current, [key]: false })); setError('');
    if (catalog.status === 'stale') catalog.refresh();
  }}>Start a new attempt</Button></div> : null;
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-heading text-xl">Individual Admin permissions</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Review changes before saving. Confirmed changes apply to the selected Admin immediately.
          Existing pending requests can still be approved or rejected.
          Reserved Super Admin actions cannot be delegated.
        </p>
      </div>
      {members.length > 0 ? (
        <form
          data-form-id="staff.staff-permission-1"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!proposalCatalog.config || !proposalCatalog.canSubmit) return;
            let configured: ReturnType<typeof configuredJsonPayload>;
            try {
              const values = readConfiguredSubmission(e.currentTarget, proposalCatalog.config, proposalBaseKeys);
              configured = configuredJsonPayload(proposalCatalog.config, values.answers, proposalBaseKeys);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Review the configured fields.');
              return;
            }
            setError('');
            setReview({ body:{action:'propose',userId,permissions,version:selected?.version,reason,presetName,...configured},requestKey:'requestId',attemptKey:proposalKey,
              title:'Review permissions for '+(selected?.displayName??userId),
              description:'This changes feature access for '+(selected?.displayName??userId)+'. Added: '+(added.map(permission=>labels[permission]).join(', ')||'none')+'. Removed: '+(removed.map(permission=>labels[permission]).join(', ')||'none')+'. Reason: '+reason+'. Account access is retained; reserved Super Admin actions cannot be delegated.',
              confirmLabel:'Confirm permission changes' });
          }}
        >
      <FormGuide formId="staff.staff-permission-1" />

          <div>
            <Label htmlFor="permission-admin">Admin *</Label>
            <select
              id="permission-admin"
              className="mt-2 min-h-11 w-full rounded border p-2"
              disabled={busy}
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPermissions(
                  members.find((m) => m.userId === e.target.value)
                    ?.permissions ?? [],
                );
              }}
            >
              {members.map((m) => (
                <option value={m.userId} key={m.userId}>
                  {m.displayName} — {m.email}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm">Reviewing <strong>{selected?.displayName}</strong> · Current version {selected?.version}. Account access is retained.</p>

          <div>
            <Label htmlFor="permission-preset">Reuse an approved preset</Label>
            <select
              id="permission-preset"
              className="mt-2 min-h-11 w-full rounded border p-2"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                const p = presets.find((p) => p.id === e.target.value);
                if (p) setPermissions(JSON.parse(p.permissionsJson));
              }}
            >
              <option value="">Select a preset</option>
              {presets.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 font-semibold">
              Feature access
            </legend>
            {configurableAdminPermissions.map((p) => (
              <label
                key={p}
                className="flex min-h-11 items-center gap-3 rounded border p-3"
              >
                <input
                  type="checkbox"
                  checked={permissions.includes(p)}
                  onChange={(e) =>
                    setPermissions(
                      e.target.checked
                        ? [...permissions, p]
                        : permissions.filter((x) => x !== p),
                    )
                  }
                />
                <span className="text-sm">{labels[p] ?? p}</span>
              </label>
            ))}
          </fieldset>
          <section aria-label="Permission change preview"><Alert role="presentation"><AlertTitle>Changes for {selected?.displayName}</AlertTitle><AlertDescription>
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              <div><dt className="font-semibold">Added ({added.length})</dt><dd>{added.map(permission=>labels[permission]).join(', ')||'No features added'}</dd></div>
              <div><dt className="font-semibold">Removed ({removed.length})</dt><dd>{removed.map(permission=>labels[permission]).join(', ')||'No features removed'}</dd></div>
              <div><dt className="font-semibold">Unchanged ({unchanged.length})</dt><dd>{unchanged.map(permission=>labels[permission]).join(', ')||'No features retained'}</dd></div>
            </dl>
          </AlertDescription></Alert></section>
          <div>
            <Label htmlFor="permission-preset-name">
              Save approved selection as a reusable preset (optional)
            </Label>
            <Input
              id="permission-preset-name"
              maxLength={80}
              value={presetName}
              disabled={busy}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="permission-reason">Reason *</Label>
            <Input
              id="permission-reason"
              required
              minLength={8}
              maxLength={1000}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * Required. Clearing every feature removes operational access when
            saved. Presets are copies: reusing one does not change other
            people.
          </p>
          <Link href="/admin/staff-form-history?kind=staff-permission-proposal" className="block text-sm underline">View permission proposal form history</Link>
          {proposalCatalog.config ? <ConfiguredFields config={proposalCatalog.config} baseKeys={proposalBaseKeys} /> : null}
          {!proposalCatalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{proposalCatalog.message || 'Loading form configuration…'}</p> : null}
          {retryNotice(proposalKey, proposalCatalog)}
          <Button disabled={busy || !proposalCatalog.canSubmit} type="submit">
            Save permissions
          </Button>
        </form>
      ) : (
        <p>No active Admin accounts are available.</p>
      )}
      <output className="block text-sm" aria-live="polite">{busy ? 'Saving permission decision…' : message}</output>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <h3 className="font-semibold">Recent permission requests</h3>
      <div className="space-y-3">
        {requests.map((r) => (
          <article key={r.id} className="space-y-2 rounded border p-4">
            <p className="font-semibold">
              {members.find((m) => m.userId === r.userId)?.displayName ??
                r.userId}{' '}
              — {r.status}
            </p>
            <p className="text-sm">
              Access:{' '}
              {(JSON.parse(r.permissionsJson) as string[])
                .map((p) => labels[p] ?? p)
                .join(', ') || 'No operational features'}
            </p>
            <p className="text-sm">{r.reason}</p>
            <p className="text-xs text-muted-foreground">
              {r.appliedDirectly ? 'Saved by ' : 'Proposed by '}{r.proposedBy} at{' '}
              {new Date(r.proposedAt).toISOString()}. Based on version{' '}
              {r.expectedVersion}.
              {r.decidedBy
                ? ' Decided by ' + r.decidedBy + '. ' + r.decisionNote
                : ''}
            </p>
            {r.status !== 'pending' ? <Link href={`/admin/staff-form-history?kind=${r.appliedDirectly ? 'staff-permission-proposal' : 'staff-permission-decision'}&id=${encodeURIComponent(r.id)}`} className="block text-sm underline">{r.appliedDirectly ? 'View permission change form history' : 'View permission decision form history'}</Link> : null}
            {r.status === 'pending' &&
              (r.userId === actorId ? (
                <p className="text-sm">You cannot change your own permissions.</p>
              ) : (
                <form
                  data-form-id="staff.staff-permission-2"
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!decisionCatalog.config || !decisionCatalog.canSubmit) return;
                    let configured: ReturnType<typeof configuredJsonPayload>;
                    try {
                      const values = readConfiguredSubmission(e.currentTarget, decisionCatalog.config, decisionBaseKeys);
                      configured = configuredJsonPayload(decisionCatalog.config, values.answers, decisionBaseKeys);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'Review the configured fields.');
                      return;
                    }
                    const form = new FormData(e.currentTarget);
                    const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ?? 'approve';
                    setError('');
                    const decisionReason = form.get('reason');
                    setReview({body:{action,requestId:r.id,reason:form.get('reason'),...configured},requestKey:'formRequestId',attemptKey:sessionAttemptKey('staff.staff-permission-2',r.id+':'+action),
                      title:(action==='approve'?'Approve':'Reject')+' this permission request?',
                      description:'Review the requested access for '+(members.find(member=>member.userId===r.userId)?.displayName??r.userId)+'. Reason: '+(typeof decisionReason === 'string' ? decisionReason : '')+'. The recorded request and current authority are checked again when you confirm.',confirmLabel:action==='approve'?'Approve access changes':'Reject access changes'});
                  }}
                >
      <FormGuide formId="staff.staff-permission-2" />

                  <Input
                    aria-label="Decision reason"
                    name="reason"
                    minLength={8}
                    maxLength={1000}
                    required
                    placeholder="Decision reason (required)"
                    disabled={busy}
                  />
                  <Link href={`/admin/staff-form-history?kind=staff-permission-decision&id=${encodeURIComponent(r.id)}`} className="block text-sm underline">View permission decision form history</Link>
                  {decisionCatalog.config ? <ConfiguredFields config={decisionCatalog.config} baseKeys={decisionBaseKeys} /> : null}
                  {!decisionCatalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{decisionCatalog.message || 'Loading form configuration…'}</p> : null}
                  {retryNotice(sessionAttemptKey('staff.staff-permission-2', r.id + ':approve'), decisionCatalog)}
                  {retryNotice(sessionAttemptKey('staff.staff-permission-2', r.id + ':reject'), decisionCatalog)}
                  <Button
                    type="submit"
                    name="action"
                    value="approve"
                    disabled={busy || !decisionCatalog.canSubmit}
                  >
                    Approve
                  </Button>
                  <Button
                    type="submit"
                    name="action"
                    value="reject"
                    variant="outline"
                    disabled={busy || !decisionCatalog.canSubmit}
                  >
                    Reject
                  </Button>
                </form>
              ))}
          </article>
        ))}
      </div>
      <ConfirmOperation open={review!==null} onOpenChange={open=>{if(!open&&!busy)setReview(null);}} title={review?.title??'Review permission changes'} description={review?.description??''} pending={busy} error={error} confirmLabel={review?.confirmLabel} disabled={review?.requestKey==='requestId'?!proposalCatalog.canSubmit:!decisionCatalog.canSubmit} onConfirm={()=>{
        if(!review)return;
        const catalog=review.requestKey==='requestId'?proposalCatalog:decisionCatalog;
        if(!catalog.canSubmit){setError(catalog.message||'Refresh the form configuration before confirming.');return;}
        void submit(review.body,review.requestKey,review.attemptKey).then(saved=>{if(saved)setReview(null);});
      }}/>
    </section>
  );
}
