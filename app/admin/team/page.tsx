import { env } from 'cloudflare:workers';
import { TeamPeople } from '@/components/admin/team-people';
import { TeamWorkspace } from '@/components/admin/team-workspace';
import { safeAdminReturnTo } from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listStaffAccessHistory } from '@/lib/db/repositories/staff-access-history';
import { getStaffPermissionProfile, listStaffPermissionChanges } from '@/lib/db/repositories/staff-permissions';
import { getTeamWorkspace } from '@/lib/operations/team-governance';
import { teamReadFence } from '@/lib/operations/team-read-fence';

export const dynamic = 'force-dynamic';

type TeamQuery = Record<string, string | string[] | undefined>;

export default async function TeamAccessPage({ searchParams }: { searchParams?: Promise<TeamQuery> } = {}) {
  const actor = await requireStaffPage('/admin/team');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await (searchParams ?? Promise.resolve({} as TeamQuery));
  const value = (key: string) => typeof query[key] === 'string' ? query[key] : undefined;
  const returnTo = safeAdminReturnTo(query.returnTo);
  const pageFence = await teamReadFence(db, actor.id);
  const model = await getTeamWorkspace(db, actor.id);
  if (model.mode === 'own') {
    return <TeamWorkspace model={model} actorId={actor.id} returnTo={returnTo} />;
  }

  const requestedTab = value('tab');
  const tab = requestedTab && ['people', 'coverage', 'calendar', 'identity', 'policies'].includes(requestedTab)
    ? requestedTab : 'people';
  const filters = { department: value('department'), status: value('status'), permission: value('permission') };

  if (tab !== 'people') {
    await pageFence();
    return <TeamWorkspace model={model} actorId={actor.id} tab={tab} returnTo={returnTo} filters={filters} />;
  }

  const editableMembers = model.people.filter((member) => member.staffRole === 'admin' && member.accountStatus === 'active');
  const [changes, history, permissionMembers] = await Promise.all([
    listStaffPermissionChanges(db),
    listStaffAccessHistory(db, actor.id),
    Promise.all(editableMembers.map(async (member) => ({
      ...await getStaffPermissionProfile(db, member.id),
      displayName: member.displayName,
      email: member.email,
    }))),
  ]);
  const pendingInvitations = model.invitations.filter((invitation) => invitation.status === 'pending')
    .map((invitation) => ({ id: String(invitation.id), email: String(invitation.email) }));
  await pageFence();

  return (
    <TeamWorkspace
      model={model}
      actorId={actor.id}
      returnTo={returnTo}
      filters={filters}
      renderPeople={(people, href) => (
        <TeamPeople
          actorId={actor.id}
          people={people}
          permissionMembers={permissionMembers}
          pendingInvitations={pendingInvitations}
          selectedId={value('staff')}
          showHistory={value('view') === 'history'}
          staffNames={Object.fromEntries(model.people.map((member) => [member.id, member.displayName]))}
          history={history}
          href={href}
          {...changes}
        />
      )}
    />
  );
}
