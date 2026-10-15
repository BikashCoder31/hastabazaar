import { listStaffAccessHistory } from '@/lib/db/repositories/staff-access-history';
import { StaffPermissionManager } from '@/components/admin/staff-permission-manager';
import {
  getStaffPermissionProfile,
  listStaffPermissionChanges,
} from '@/lib/db/repositories/staff-permissions';
import { env } from 'cloudflare:workers';
import { KeyRound, UsersRound } from 'lucide-react';

import { StaffInvitationManager } from '@/components/admin/staff-invitation-manager';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  listStaffInvitations,
  listStaffMembers,
} from '@/lib/db/repositories/staff';
import { isEmailDeliveryConfigured } from '@/lib/email/staff-invitation';

export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kathmandu',
});

export default async function TeamAccessPage() {
  const staff = await requireStaffPage('/admin/team', 'admin.invite');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [members, invitations, changes, history] = await Promise.all([
    listStaffMembers(database),
    listStaffInvitations(database),
    listStaffPermissionChanges(database),
    listStaffAccessHistory(database, staff.id),
  ]);

  const superAdminIds = new Set(
    members.filter((m) => m.role === 'super_admin').map((m) => m.id),
  );
  const permissionMembers = await Promise.all(
    members
      .filter((m) => m.role === 'admin' && !superAdminIds.has(m.id))
      .map(async (m) => ({
        ...(await getStaffPermissionProfile(database, m.id)),
        displayName: m.displayName,
        email: m.email,
      })),
  );
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Super Admin control</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Team access
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Staff access is invitation-only. Admins can review marketplace
          operations; Super Admins can also control staff access and major
          policy settings.
        </p>
      </div>

      <StaffPermissionManager
        actorId={staff.id}
        members={permissionMembers}
        {...changes}
        history={history}
        staffNames={Object.fromEntries(
          members.map((member) => [member.id, member.displayName]),
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" /> Create staff access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StaffInvitationManager
            pendingInvitations={invitations
              .filter((invitation) => invitation.status === 'pending')
              .map(({ id, email }) => ({ id, email }))}
          />
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Invitations expire after 7 days.{' '}
            {isEmailDeliveryConfigured() ? (
              'The invited person will receive an email with the protected staff workspace address.'
            ) : (
              <>
                Email delivery needs configuration, so share the protected{' '}
                <strong>/admin</strong> address with the invited person
                separately.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="py-0">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <UsersRound className="size-5 text-primary" />
          <h2 className="font-heading text-base font-medium">Active staff</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={`${member.id}-${member.role}`}>
                <TableCell className="pl-4 font-semibold">
                  {member.displayName}
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  <StatusBadge status={member.role} />
                </TableCell>
                <TableCell>
                  {dateFormatter.format(new Date(member.assignedAt))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="py-0">
        <div className="border-b px-4 py-4">
          <h2 className="font-heading text-base font-medium">
            Invitation history
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell className="pl-4 font-semibold">
                  {invitation.email}
                </TableCell>
                <TableCell className="capitalize">
                  {invitation.role.replace('_', ' ')}
                </TableCell>
                <TableCell>
                  <StatusBadge status={invitation.status} />
                </TableCell>
                <TableCell>
                  {dateFormatter.format(new Date(invitation.createdAt))}
                </TableCell>
                <TableCell>
                  {dateFormatter.format(new Date(invitation.expiresAt))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
