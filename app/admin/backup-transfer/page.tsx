import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminPageTitle } from '@/components/admin/page-help';
import { BackupTransferWorkspace } from '@/components/security/backup-transfer-workspace';
import { requireStaffPage } from '@/lib/auth/staff';
import { safeAdminReturnTo } from '@/lib/admin/return-context';

export const dynamic = 'force-dynamic';

export default async function BackupTransferPage({ searchParams }: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const [staff, query] = await Promise.all([
    requireStaffPage('/admin/backup-transfer', 'audit_log.view'),
    searchParams,
  ]);
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const returnTo = safeAdminReturnTo(query?.returnTo, '/admin/system-health');
  return <div className="max-w-[69.75rem] min-w-0 wrap-anywhere [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:min-h-11 [&_input]:min-h-11 [&_label]:min-w-0">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4" href={returnTo}>
      {returnTo === '/admin/system-health' ? 'System health & backups' : 'Back to results'}
    </Link>
    <BackupTransferWorkspace heading={
      <AdminPageTitle><h1 className="font-heading text-[28px] tracking-tight">Backup &amp; transfer</h1></AdminPageTitle>
    } />
  </div>;
}
