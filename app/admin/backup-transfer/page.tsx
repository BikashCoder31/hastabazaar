import { redirect } from 'next/navigation';
import { BackupTransferWorkspace } from '@/components/security/backup-transfer-workspace';
import { requireStaffPage } from '@/lib/auth/staff';

export const dynamic = 'force-dynamic';

export default async function BackupTransferPage() {
  const staff = await requireStaffPage(
    '/admin/backup-transfer',
    'audit_log.view',
  );
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  return <BackupTransferWorkspace />;
}
