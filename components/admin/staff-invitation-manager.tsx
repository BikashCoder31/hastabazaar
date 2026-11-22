'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { FormGuide } from '@/components/forms/form-guide';
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
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { validateAdminPermissions, type Permission } from '@/lib/marketplace/permissions';
import { STAFF_ACCESS_RIGHTS, BUILT_IN_STAFF_ACCESS_TEMPLATES } from '@/lib/staff/access';
import { staffInvitationPreset, STAFF_INVITATION_PRESETS } from './staff-invitation-presets';
import { useDenyTeamScope } from './team-scope-boundary';
import { useStaffInvitationCommand } from './use-staff-invitation-command';

const invitationBaseKeys = ['email', 'role', 'permissions', 'requestId', 'formVersion', 'customAnswers'];
const accessLabels = new Map(STAFF_ACCESS_RIGHTS.map((right) => [right.permission, right.label]));

function describeAccess(permissions: readonly Permission[], separator: string) {
  return permissions.map((permission) => accessLabels.get(permission) ?? permission).join(separator);
}

export function StaffInvitationManager(props: Parameters<typeof StaffInvitationManagerBody>[0]) {
  return <StaffInvitationManagerBody key={props.actorId} {...props} />;
}

function StaffInvitationManagerBody({
  actorId,
  pendingInvitations,
  collapsible = false,
}: {
  actorId: string;
  pendingInvitations: readonly { id: string; email: string }[];
  collapsible?: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const inviteTrigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(!collapsible);
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [revoking, setRevoking] = useState<{ id: string; email: string } | null>(null);
  const [localError, setError] = useState('');
  const denyTeam = useDenyTeamScope();
  const catalog = usePublishedFormConfig('staff.staff-invitation', { onAccessDenied: denyTeam ?? undefined, actorId });
  type Candidate = {
    email: string;
    permissions: Permission[];
    configured: ReturnType<typeof configuredJsonPayload>;
  };
  const [reviewed, setReviewed] = useState<Candidate | null>(null);

  function clearDraft() {
    form.current?.reset();
    setEmail('');
    setPermissions([]);
    setTemplateId('');
    setReviewed(null);
  }

  const command = useStaffInvitationCommand(actorId, {
    recorded: (kind) => {
      setError('');
      setConfirmInvite(false);
      setRevoking(null);
      if (kind === 'invite') {
        clearDraft();
        if (collapsible) {
          setExpanded(false);
          inviteTrigger.current?.focus();
        }
      }
      router.refresh();
    },
    rejected: (response, data) => {
      if (typeof data.code === 'string') catalog.handleSubmissionResponse(response, data.code);
      setReviewed(null);
    },
  });
  const { busy, message } = command;
  const error = localError || command.error;
  const activePreset = staffInvitationPreset(permissions);

  async function invite() {
    if (!reviewed || command.blocked) return;
    const candidate = reviewed;
    setConfirmInvite(false);
    setError('');
    await command.invite({
      email: candidate.email,
      role: 'admin',
      permissions: candidate.permissions,
      ...candidate.configured,
    });
  }

  async function revoke() {
    if (!revoking || command.blocked) return;
    const target = revoking;
    setRevoking(null);
    setError('');
    await command.revoke(target.id);
  }

  if (command.denied) {
    return (
      <section role="alert" className="space-y-3 rounded-lg border p-4">
        <p>Team access changed. Private workspace details and inputs are hidden.</p>
        <button type="button" className="min-h-11 rounded border px-4" onClick={() => window.location.reload()}>Reopen Team with current access</button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {collapsible ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="team-list" className="text-lg font-semibold">Team</h2>
          <Button ref={inviteTrigger} type="button" className="min-h-11" aria-expanded={expanded} aria-controls="staff-invitation-form" onClick={() => setExpanded(!expanded)}>
            <Plus aria-hidden="true" /> Invite a staff member
          </Button>
        </div>
      ) : null}
      <form
        ref={form}
        id="staff-invitation-form"
        data-form-id="staff.staff-invitation"
        hidden={!expanded}
        className="rounded-2xl border bg-card p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!catalog.config || !catalog.canSubmit || command.blocked) return;
          try {
            const values = readConfiguredSubmission(event.currentTarget, catalog.config, invitationBaseKeys);
            const data = new FormData(event.currentTarget);
            const currentEmail = data.get('email');
            if (typeof currentEmail !== 'string' || data.get('role') !== 'admin') throw new Error('Review the staff email and role.');
            const selected = validateAdminPermissions(data.getAll('permissions'));
            setEmail(currentEmail);
            setPermissions(selected);
            setReviewed({
              email: currentEmail,
              permissions: selected,
              configured: configuredJsonPayload(catalog.config, values.answers, invitationBaseKeys),
            });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Review the configured fields.');
            return;
          }
          setError('');
          command.clearFeedback();
          setConfirmInvite(true);
        }}
      >
        <fieldset disabled={command.blocked} className="min-w-0 space-y-4">
          <FormGuide formId="staff.staff-invitation" />
          <input type="hidden" name="role" value="admin" />
          <div className="space-y-2">
            <Label htmlFor="staff-email">Staff email <span aria-hidden="true">*</span></Label>
            <Input id="staff-email" name="email" className="min-h-11" type="email" required maxLength={254} value={email}
              onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          </div>
          <fieldset className="min-w-0 space-y-3">
            <legend className="text-sm font-semibold">What they can do</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STAFF_INVITATION_PRESETS.map((preset) => (
                <button key={preset.name} type="button" aria-pressed={activePreset === preset} onClick={() => {
                  setPermissions([...preset.permissions]);
                  setTemplateId('');
                }} className="min-h-11 min-w-0 space-y-1 rounded-xl border bg-background p-3 text-left hover:border-primary aria-pressed:border-primary aria-pressed:bg-card aria-pressed:ring-1 aria-pressed:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <span className="block text-sm font-semibold">{preset.name}</span>
                  <span className="block text-sm text-muted-foreground">{describeAccess(preset.permissions, ' · ')}</span>
                  {preset.scope ? <span className="block text-xs text-muted-foreground">{preset.scope}</span> : null}
                </button>
              ))}
            </div>
            <details>
              <summary className="min-h-11 w-fit cursor-pointer py-3 text-sm font-semibold">Customize exact access</summary>
              <div className="space-y-3">
                <Label htmlFor="staff-invitation-template">Start from access template</Label>
                <select id="staff-invitation-template" className="block min-h-11 w-full rounded-lg border bg-background px-3 text-sm sm:w-auto" value={templateId} onChange={(event) => {
                  setTemplateId(event.target.value);
                  const selected = BUILT_IN_STAFF_ACCESS_TEMPLATES.find((template) => template.id === event.target.value);
                  if (selected) setPermissions([...selected.permissions]);
                }}>
                  <option value="">Choose a starting template</option>
                  {BUILT_IN_STAFF_ACCESS_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
                <div className="grid gap-3 md:grid-cols-2">
                  {STAFF_ACCESS_RIGHTS.map((right) => (
                    <label key={right.permission} aria-label={right.label} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                      <input name="permissions" value={right.permission} type="checkbox" className="mt-1 shrink-0 accent-primary" checked={permissions.includes(right.permission)} onChange={(event) => {
                        setTemplateId('');
                        setPermissions((previous) => event.target.checked ? [...previous, right.permission] : previous.filter((permission) => permission !== right.permission));
                      }} />
                      <span><strong>{right.label}</strong><span className="block text-xs text-muted-foreground">{right.description}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
            {!permissions.length ? <p className="text-sm text-muted-foreground">No work access selected.</p> : !activePreset ? <p className="break-words text-sm text-muted-foreground">Selected access: {describeAccess(permissions, ' · ')}</p> : null}
          </fieldset>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={invitationBaseKeys} /> : null}
          {!catalog.canSubmit ? (
            <div>
              <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p>
              {catalog.status !== 'loading' ? <Button type="button" variant="outline" className="min-h-11" disabled={busy || !!command.pending} onClick={() => catalog.refresh()}>Refresh form configuration</Button> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11 bg-[#a8232e] text-white hover:bg-[#861c25]" disabled={command.blocked || !catalog.canSubmit}>
              {busy ? 'Saving…' : 'Review invitation'}
            </Button>
            {collapsible ? <Button type="button" className="min-h-11" variant="ghost" onClick={() => {
              clearDraft();
              setError('');
              command.clearFeedback();
              setExpanded(false);
              inviteTrigger.current?.focus();
            }}>Cancel</Button> : null}
          </div>
          <p className="text-sm text-muted-foreground">Staff must verify this email and set up the 2-step check. Invitations expire after seven days.</p>
          <Link href="/admin/staff-form-history?kind=staff-invitation" className="inline-flex min-h-11 items-center text-sm underline">View invitation form history</Link>
        </fieldset>
      </form>
      {message ? <output aria-live="polite" className="block text-sm font-medium text-emerald-700">{message}</output> : null}
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
      {command.pending ? (
        <section className="space-y-3 rounded-lg border p-4" aria-label="Original invitation action recovery">
          <p>Check the saved result of the original action.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void command.check()}>
              {command.pending.kind === 'invite' ? 'Check original invitation' : 'Check original revocation target'}
            </Button>
            {command.canRetry ? <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void command.retry()}>
              {command.pending.kind === 'invite' ? 'Retry exact invitation' : 'Retry original revocation'}
            </Button> : null}
          </div>
        </section>
      ) : null}
      {pendingInvitations.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Pending access</h3>
          {pendingInvitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3">
              <span className="min-w-0 break-all text-sm">{invitation.email}</span>
              <Button type="button" disabled={command.blocked} variant="ghost" size="sm" className="min-h-11 shrink-0"
                onClick={() => setRevoking(invitation)} aria-label={'Revoke invitation for ' + invitation.email}>
                <Trash2 /> Revoke
              </Button>
            </div>
          ))}
        </section>
      ) : null}
      <ConfirmOperation
        open={confirmInvite}
        onOpenChange={setConfirmInvite}
        title="Create this staff invitation?"
        description={(reviewed?.email ?? email) + ' will be invited as Admin with ' +
          (describeAccess(reviewed?.permissions ?? permissions, ', ') || 'no operational access') +
          '. An invitation email will be sent after confirmation.'}
        pending={busy}
        error={error}
        workspace={collapsible}
        onConfirm={() => void invite()}
      />
      <AlertDialog open={Boolean(revoking)} onOpenChange={(open) => {
        if (!open && !busy) setRevoking(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this staff invitation?</AlertDialogTitle>
            <AlertDialogDescription>{revoking?.email} will no longer be able to activate staff access from this invitation.</AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={command.blocked}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={command.blocked} onClick={() => void revoke()}>
              {busy ? 'Revoking…' : 'Revoke invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
