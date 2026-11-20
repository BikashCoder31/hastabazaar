'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { adminNavigation, adminTaskGuide } from '@/lib/admin/navigation';
import type { Permission } from '@/lib/marketplace/permissions';
import { AdminPageHelpProvider } from './page-help';
import { getAdminPageHelp } from './page-help-copy';
export function AdminTaskContext({
  role,
  permissions,
  children,
}: {
  role: 'admin' | 'super_admin';
  permissions?: readonly Permission[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const guide = adminTaskGuide(pathname, role, permissions);
  const canViewOverview = adminNavigation(role, permissions).some(
    (link) => link.href === '/admin',
  );
  const help = getAdminPageHelp(pathname, { role, permissions }, searchParams);
  const isDetail = pathname !== guide?.href;
  const hasOrderBreadcrumb = /^\/admin\/orders\/[^/]+$/.test(pathname);
  return (
    <AdminPageHelpProvider help={help}>
      {guide && !hasOrderBreadcrumb ? <Breadcrumb className="mb-4" aria-label="Task location">
        <BreadcrumbList>
          {canViewOverview && guide.href !== '/admin' ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/admin" />}>
                  Overview
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          <BreadcrumbItem>
            {isDetail ? (
              <BreadcrumbLink render={<Link href={guide.href} />}>
                {guide.label}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{guide.label}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {isDetail ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Record details</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb> : null}
      {children}
    </AdminPageHelpProvider>
  );
}
