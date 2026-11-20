'use client';
import { FormGuide } from '@/components/forms/form-guide';
import {STAFF_ACCESS_RIGHTS,BUILT_IN_STAFF_ACCESS_TEMPLATES} from '@/lib/staff/access';
import type {Permission} from '@/lib/marketplace/permissions';
import Link from 'next/link';

import {useState} from 'react';
import {useDenyTeamScope} from './team-scope-boundary';
import {useStaffInvitationCommand} from './use-staff-invitation-command';
import {validateAdminPermissions} from '@/lib/marketplace/permissions';
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
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';

const invitationBaseKeys = ['email', 'role','permissions', 'requestId', 'formVersion', 'customAnswers'];

export function StaffInvitationManager(props:Parameters<typeof StaffInvitationManagerBody>[0]){return <StaffInvitationManagerBody key={props.actorId} {...props}/>;}
function StaffInvitationManagerBody({
  actorId,pendingInvitations,
}: {
  actorId:string;
  pendingInvitations: readonly { id: string; email: string }[];
}) {
  const router=useRouter(),[email,setEmail]=useState(''),[role,setRole]=useState<'admin'|'super_admin'>('admin'),[permissions,setPermissions]=useState<Permission[]>([]),[confirmInvite,setConfirmInvite]=useState(false),[revoking,setRevoking]=useState<{id:string;email:string}|null>(null),[localError,setError]=useState('');
  const denyTeam=useDenyTeamScope(),catalog=usePublishedFormConfig('staff.staff-invitation',{onAccessDenied:denyTeam??undefined,actorId});
  type Candidate={email:string;role:'admin'|'super_admin';permissions:Permission[];configured:ReturnType<typeof configuredJsonPayload>};
  const [reviewed,setReviewed]=useState<Candidate|null>(null);
  const command=useStaffInvitationCommand(actorId,{recorded:kind=>{setError('');setConfirmInvite(false);setRevoking(null);if(kind==='invite'){setEmail('');setReviewed(null);}router.refresh();},rejected:(response,data)=>{if(typeof data.code==='string')catalog.handleSubmissionResponse(response,data.code);setReviewed(null);}});
  const {busy,message}=command,error=localError||command.error;
  async function invite(){if(!reviewed||command.blocked)return;const candidate=reviewed;setConfirmInvite(false);setError('');await command.invite({email:candidate.email,role:candidate.role,permissions:candidate.permissions,...candidate.configured});}
  async function revoke(){if(!revoking||command.blocked)return;const target=revoking;setRevoking(null);setError('');await command.revoke(target.id);}
  if(command.denied)return <section role="alert" className="space-y-3 rounded-lg border p-4"><p>Team access changed. Private workspace details and inputs are hidden.</p><button type="button" className="min-h-11 rounded border px-4" onClick={()=>window.location.reload()}>Reopen Team with current access</button></section>;

  return (
    <div className="space-y-6">
      <form
        data-form-id="staff.staff-invitation"
        onSubmit={(event) => {
          event.preventDefault();
          if(!catalog.config||!catalog.canSubmit||command.blocked)return;
          try{
            const values=readConfiguredSubmission(event.currentTarget,catalog.config,invitationBaseKeys),data=new FormData(event.currentTarget),currentEmail=data.get('email'),currentRole=data.get('role');
            if(typeof currentEmail!=='string'||(currentRole!=='admin'&&currentRole!=='super_admin'))throw new Error('Review the staff email and role.');
            const selected=currentRole==='admin'?validateAdminPermissions(data.getAll('permissions')):[];
            setEmail(currentEmail);setRole(currentRole);setPermissions(selected);setReviewed({email:currentEmail,role:currentRole,permissions:selected,configured:configuredJsonPayload(catalog.config,values.answers,invitationBaseKeys)});
          }catch(cause){setError(cause instanceof Error?cause.message:'Review the configured fields.');return;}
          setError('');command.clearFeedback();setConfirmInvite(true);
        }}
        className="grid gap-4 rounded-xl border bg-muted/25 p-4 lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-end"
      >
      <fieldset disabled={command.blocked} className="contents"><FormGuide formId="staff.staff-invitation" />

<p className="col-span-full text-xs text-muted-foreground">* Required field</p>

        <div className="space-y-2">
          <Label htmlFor="staff-email">Staff email <span aria-hidden="true">*</span></Label>
          <Input
            id="staff-email"
            name="email"
            disabled={command.blocked}
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
            name="role"
            disabled={command.blocked}
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div className="flex items-end lg:justify-end">
          <Button type="submit" disabled={command.blocked || !catalog.canSubmit}>
            <ShieldPlus />
            {busy ? 'Saving…' : 'Review invitation'}
          </Button>
        </div>
        {role==='admin'?<fieldset className="col-span-full space-y-3" disabled={command.blocked}><legend className="font-medium">Exact work access</legend><p className="text-sm text-muted-foreground">Department labels do not grant access. Select only the required capabilities; an empty selection grants no configurable operational access.</p><select aria-label="Start from access template" defaultValue="" onChange={event=>{const selected=BUILT_IN_STAFF_ACCESS_TEMPLATES.find(value=>value.id===event.target.value);if(selected)setPermissions([...selected.permissions]);}}><option value="">Choose a starting template</option>{BUILT_IN_STAFF_ACCESS_TEMPLATES.map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select><div className="grid gap-3 md:grid-cols-2">{STAFF_ACCESS_RIGHTS.map(value=><label key={value.permission} aria-label={value.label} className="flex gap-2"><input name="permissions" value={value.permission} type="checkbox" checked={permissions.includes(value.permission)} onChange={event=>setPermissions(old=>event.target.checked?[...old,value.permission]:old.filter(item=>item!==value.permission))}/><span><strong className="text-sm">{value.label}</strong><span className="block text-xs text-muted-foreground">{value.description}</span></span></label>)}</div></fieldset>:<p className="col-span-full text-sm">Full Super Admin promotion is a separate explicit authority choice, including staff controls and reserved decisions. Ordinary department templates do not apply.</p>}
        <div className="col-span-full space-y-3">
          <Link href="/admin/staff-form-history?kind=staff-invitation" className="block text-sm underline">View invitation form history</Link>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={invitationBaseKeys} /> : null}
          {!catalog.canSubmit ? <div><p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p>{catalog.status!=='loading'&&<Button type="button" variant="outline" disabled={command.busy||!!command.pending} onClick={()=>catalog.refresh()}>Refresh form configuration</Button>}</div> : null}
        </div>
      </fieldset></form>

      {message ? (
        <output aria-live="polite" className="block text-sm font-medium text-emerald-700">
          {message}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {command.pending?<section className="space-y-3 rounded-lg border p-4" aria-label="Original invitation action recovery"><p>The original action remains retained. Checking its current native result does not send another invitation or email.</p><Button type="button" variant="outline" disabled={busy} onClick={()=>void command.check()}>{command.pending.kind==='invite'?'Check original invitation':'Check original revocation target'}</Button>{command.canRetry&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void command.retry()}>{command.pending.kind==='invite'?'Retry exact invitation':'Retry original revocation'}</Button>}</section>:null}

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
                disabled={command.blocked}
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
        description={`${reviewed?.email??email} will be invited as ${(reviewed?.role??role) === 'super_admin' ? 'Super Admin, including high-risk approvals and staff access controls' : 'Admin with only these selected capabilities: '+((reviewed?.permissions??permissions).map(permission=>STAFF_ACCESS_RIGHTS.find(value=>value.permission===permission)?.label??permission).join(', ')||'no operational capabilities')}. Check the email and authority carefully. An invitation email will be sent after confirmation.`}
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
            <AlertDialogCancel disabled={command.blocked}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={command.blocked}
              onClick={()=>void revoke()}
            >
              {busy ? 'Revoking…' : 'Revoke invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
