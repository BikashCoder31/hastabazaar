'use client';
import Link from 'next/link';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldPlus, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { sendJson } from '@/lib/http/client-request';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const invitationBaseKeys = ['email', 'role', 'requestId', 'formVersion', 'customAnswers'];

export function StaffInvitationManager({
  pendingInvitations,
}: {
  pendingInvitations: readonly { id: string; email: string }[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [revoking, setRevoking] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const catalog = usePublishedFormConfig('staff.staff-invitation');
  const [configured, setConfigured] = useState<ReturnType<typeof configuredJsonPayload> | null>(null);
  const attemptKey = sessionAttemptKey('staff.staff-invitation', 'new');
  const [retry, setRetry] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setRetry(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);

  async function invite() {
    if (busy || !configured) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setRetry(true);
      const response = await fetch('/api/admin/staff-invitations', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role, requestId, ...configured }) });
      const result = await response.json().catch(() => null) as { id?: string; message?: string; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error ?? 'Invitation failed. Retry the same request.');
      if (typeof result?.id !== 'string' || !result.id.trim() || typeof result.message !== 'string' || !result.message.trim()) throw new Error('The response could not confirm the invitation. Retry the same request.');
      setConfirmInvite(false);
      setConfigured(null);
      clearSessionAttempt(attemptKey); setRetry(false);
      setEmail('');
      setMessage(result.message || 'Invitation created.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invitation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking || busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await sendJson<{ message?: string }>(
        `/api/admin/staff-invitations/${encodeURIComponent(revoking.id)}`,
        'DELETE',
        undefined,
        'Revocation failed.',
      );
      setRevoking(null);
      setMessage(result.message || 'Invitation revoked.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Revocation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        data-form-id="staff.staff-invitation"
        onSubmit={(event) => {
          event.preventDefault();
          if (!catalog.config || !catalog.canSubmit) return;
          try {
            const values = readConfiguredSubmission(event.currentTarget, catalog.config, invitationBaseKeys);
            setConfigured(configuredJsonPayload(catalog.config, values.answers, invitationBaseKeys));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Review the configured fields.');
            return;
          }
          setError('');
          setConfirmInvite(true);
        }}
        className="grid gap-4 rounded-xl border bg-muted/25 p-4 lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-end"
      >
<p className="text-xs text-muted-foreground">* Required field</p>

        <div className="space-y-2">
          <Label htmlFor="staff-email">Staff email <span aria-hidden="true">*</span></Label>
          <Input
            id="staff-email"
            disabled={busy}
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <select
            id="staff-role"
            disabled={busy}
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <Link href="/admin/staff-form-history?kind=staff-invitation" className="block text-sm underline">View invitation form history</Link>
        {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={invitationBaseKeys} /> : null}
        {!catalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p> : null}
        <Button type="submit" disabled={busy || !catalog.canSubmit}>
          <ShieldPlus />
          {busy ? 'Saving…' : 'Review invitation'}
        </Button>
      </form>

      {message ? (
        <output className="block text-sm font-medium text-emerald-700">
          {message}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {retry ? <div className="space-y-2 text-xs text-muted-foreground"><p>An invitation may already have been created. Check pending access before retrying. Changed email or role keeps the same request reference and may conflict.</p><Button type="button" variant="outline" disabled={busy} onClick={() => {
        if (!window.confirm('A prior invitation may already have been created or emailed. Check pending access first. Starting a new attempt may duplicate it. Continue?')) return;
        clearSessionAttempt(attemptKey); setRetry(false); setError('');
        if (catalog.status === 'stale') catalog.refresh();
      }}>Start a new attempt</Button></div> : null}

      {pendingInvitations.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Pending access</h3>
          {pendingInvitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm">
                {invitation.email}
              </span>
              <Button
                type="button"
                disabled={busy}
                variant="ghost"
                size="sm"
                onClick={() => setRevoking(invitation)}
                aria-label={`Revoke invitation for ${invitation.email}`}
              >
                <Trash2 /> Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmOperation
        open={confirmInvite}
        onOpenChange={setConfirmInvite}
        title="Create this staff invitation?"
        description={`${email} will be invited as ${role === 'super_admin' ? 'Super Admin, including high-risk approvals and staff access controls' : 'Admin, with operations review and payout preparation access'}. Check the email and authority carefully. An invitation email will be sent after confirmation.`}
        pending={busy}
        error={error}
        onConfirm={() => void invite()}
      />
      <AlertDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => {
          if (!open && !busy) setRevoking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this staff invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.email} will no longer be able to activate staff access
              from this invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={revoke}
            >
              {busy ? 'Revoking…' : 'Revoke invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
