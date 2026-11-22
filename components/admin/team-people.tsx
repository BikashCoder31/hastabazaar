import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { AccountRecoveryAssistance } from '@/components/admin/account-recovery-assistance';
import { StaffAccessHistory } from '@/components/admin/staff-access-history';
import { StaffInvitationManager } from '@/components/admin/staff-invitation-manager';
import { staffInvitationPreset } from '@/components/admin/staff-invitation-presets';
import { StaffPermissionManager } from '@/components/admin/staff-permission-manager';
import type { StaffAccessHistoryEntry } from '@/lib/db/repositories/staff-access-history';
import type { getTeamWorkspace } from '@/lib/operations/team-governance';
import { STAFF_ACCESS_RIGHTS } from '@/lib/staff/access';
import type { ComponentProps } from 'react';

type FullTeam = Extract<Awaited<ReturnType<typeof getTeamWorkspace>>, { mode: 'full' }>;
type Person = FullTeam['people'][number];
type Manager = ComponentProps<typeof StaffPermissionManager>;

const panel = 'rounded-2xl border border-[#e4daca] bg-card';
const accessLabel = new Map(STAFF_ACCESS_RIGHTS.map((right) => [right.permission, right.label]));
const formatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' });
const initialsSegmenter = new Intl.Segmenter();

function describeAccess(person: Person) {
  if (person.staffRole === 'super_admin') return 'Everything';
  if (person.staffRole === 'off' || !person.permissions.length) return 'No work access';
  if (person.permissionsJson === null) return 'Inherited access · ' + person.permissions.length + ' work areas';
  return staffInvitationPreset(person.permissions)?.name ??
    (person.permissions.length > 2 ? 'Custom access · ' + person.permissions.length + ' work areas' :
      person.permissions.map((permission) => accessLabel.get(permission) ?? permission).join(' · '));
}

function recentChange(entry: StaffAccessHistoryEntry) {
  const person = entry.staffName ?? 'Former staff member';
  if (entry.outcome === 'rejected') return 'Access request rejected for ' + person;
  if (entry.outcome === 'incomplete') return 'Access record for ' + person;
  const preset = entry.afterPermissions && staffInvitationPreset(entry.afterPermissions);
  return preset ? person + ' received ' + preset.name : 'Access updated for ' + person;
}

export function TeamPeople({
  actorId,
  people,
  permissionMembers,
  pendingInvitations,
  selectedId,
  showHistory,
  staffNames,
  history,
  href,
  requests,
  presets,
}: {
  actorId: string;
  people: readonly Person[];
  permissionMembers: Manager['members'];
  pendingInvitations: ComponentProps<typeof StaffInvitationManager>['pendingInvitations'];
  selectedId?: string;
  showHistory: boolean;
  staffNames: NonNullable<Manager['staffNames']>;
  history: readonly StaffAccessHistoryEntry[];
  href: (query: Record<string, string>, anchor: string) => string;
  requests: Manager['requests'];
  presets: Manager['presets'];
}) {
  const selected = permissionMembers.find((member) => member.userId === selectedId);
  const editableIds = new Set(permissionMembers.map((member) => member.userId));
  const sorted = [...people].sort((a, b) => Number(b.staffRole === 'super_admin') - Number(a.staffRole === 'super_admin'));

  return (
    <div className="space-y-5">
      <aside className="flex items-start gap-3 rounded-xl bg-[#deece3] p-4 text-sm leading-6 text-[#1f5138]">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p><strong>One Super Admin.</strong> You can handle protected decisions yourself. Admins only see the sections their access allows.</p>
      </aside>

      <section aria-labelledby="team-list" className="space-y-5">
        <StaffInvitationManager actorId={actorId} pendingInvitations={pendingInvitations} collapsible />
        {sorted.length ? (
          <ul className={panel + ' divide-y divide-[#e4daca]'}>
            {sorted.map((person) => {
              const isSuperAdmin = person.staffRole === 'super_admin';
              const isSelf = person.id === actorId;
              const role = isSuperAdmin ? 'Super Admin' : person.staffRole === 'admin' ? 'Admin' : 'Work access off';
              const initials = person.displayName.trim().split(/\s+/).slice(0, 2)
                .map((word) => initialsSegmenter.segment(word).containing(0)?.segment).join('').toUpperCase();
              const changeHref = href({ staff: person.id }, 'staff-access-controls');
              return (
                <li key={person.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_auto]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className={'grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ' + (isSuperAdmin ? 'bg-[#e2b65c] text-[#14213d]' : 'bg-[#284982] text-white')}>{initials}</span>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold [overflow-wrap:anywhere]">{person.displayName}{isSelf ? ' (you)' : ''}</p>
                      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{person.email}</p>
                    </div>
                  </div>
                  <span className={'w-fit rounded-full px-2.5 py-1 text-xs font-semibold ' + (isSuperAdmin ? 'bg-[#14213d] text-white' : 'bg-[#ede4d3] text-[#46536f]')}>{role}</span>
                  <div className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    <p>{person.accountStatus === 'active' ? describeAccess(person) : 'Account ' + person.accountStatus}</p>
                  </div>
                  {isSelf ? (
                    <Link href="/security" className="inline-flex min-h-11 items-center justify-self-start rounded-md px-2 text-sm font-semibold hover:bg-muted lg:justify-self-end">Security</Link>
                  ) : editableIds.has(person.id) ? (
                    <Link href={changeHref} aria-label={'Change access for ' + person.displayName} className="inline-flex min-h-11 items-center justify-self-start rounded-md px-2 text-sm font-semibold hover:bg-muted lg:justify-self-end">Change access</Link>
                  ) : <span />}
                </li>
              );
            })}
          </ul>
        ) : <p className={panel + ' p-5 text-sm text-muted-foreground'}>No staff match these filters.</p>}
      </section>

      <section className={panel + ' space-y-2 px-5 pt-4 pb-2'} aria-labelledby="recent-access-heading">
        <h2 id="recent-access-heading" className="font-semibold">Recent access changes</h2>
        {history.length ? (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {history.slice(0, 3).map((entry) => (
              <li key={entry.id} className="break-words">
                {recentChange(entry)} · <time dateTime={new Date(entry.createdAt).toISOString()}>{formatter.format(entry.createdAt)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No recorded access changes yet.</p>}
        <Link href={href({ view: 'history' }, 'staff-access-history')} className="inline-flex min-h-11 items-center font-semibold text-[#a8232e] underline underline-offset-4">All staff history</Link>
      </section>

      <details id="staff-access-controls" className={panel + ' scroll-mt-20 px-4 sm:px-5'} open={Boolean(selected)}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Staff access controls</summary>
        <div className="space-y-5 pb-4">
          <StaffPermissionManager key={selected?.userId} actorId={actorId} members={permissionMembers} initialUserId={selected?.userId} requests={requests} presets={presets} staffNames={staffNames} includeHistory={false} />
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Protected assisted account recovery</summary>
            <div className="space-y-3">
              {permissionMembers.filter((member) => member.userId !== actorId).map((member) => (
                <AccountRecoveryAssistance key={member.userId} actorId={actorId} targetId={member.userId} displayName={member.displayName} email={member.email} targetRole="admin" />
              ))}
            </div>
          </details>
        </div>
      </details>

      <details id="staff-access-history" className={panel + ' scroll-mt-20 px-4 sm:px-5'} open={showHistory}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Access change history</summary>
        <div className="pb-4"><StaffAccessHistory entries={history} requests={requests} staffNames={staffNames} /></div>
      </details>
    </div>
  );
}
