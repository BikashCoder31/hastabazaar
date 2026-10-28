import { redirect } from 'next/navigation';
import {
  requireStaffApi,
  requireStaffPage,
  StaffAuthorizationError,
} from '@/lib/auth/staff';
import { can } from '@/lib/marketplace/permissions';

export async function requireAccountingPageReader() {
  const staff = await requireStaffPage('/admin/accounting', 'audit_log.view');
  if (staff.role !== 'super_admin' || !can(staff, 'audit_log.view'))
    redirect('/staff-access-denied');
  return staff;
}

export async function requireAccountingApiReader() {
  const staff = await requireStaffApi('audit_log.view');
  if (staff.role !== 'super_admin' || !can(staff, 'audit_log.view'))
    throw new StaffAuthorizationError('Super Admin access is required.', 403);
  return staff;
}
