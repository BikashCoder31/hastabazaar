import { redirect } from 'next/navigation';
import { AdminPageTitle } from '@/components/admin/page-help';
import { BackupTransferWorkspace } from '@/components/security/backup-transfer-workspace';
import { requireStaffPage } from '@/lib/auth/staff';

export const dynamic = 'force-dynamic';

export default async function BackupTransferPage() {
  const staff = await requireStaffPage(
    '/admin/backup-transfer',
    'audit_log.view',
  );
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  return <BackupTransferWorkspace heading={
    <AdminPageTitle><h1 className="section-title">Backup &amp; Transfer</h1></AdminPageTitle>
  } />;
}
