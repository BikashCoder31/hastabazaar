'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
export function AdminTaskContext({
  role,
  permissions,
}: {
  role: 'admin' | 'super_admin';
  permissions?: readonly Permission[];
}) {
  const pathname = usePathname(),
    guide = adminTaskGuide(pathname, role, permissions);
  const canViewOverview = adminNavigation(role, permissions).some(
    (link) => link.href === '/admin',
  );
  if (!guide) return null;
  const isDetail = pathname !== guide.href;
  return (
    <div className="mb-6 flex flex-col gap-3">
      <Breadcrumb aria-label="Task location">
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
      </Breadcrumb>
      <details key={pathname} className="rounded-xl border bg-card px-4 py-3">
        <summary className="min-h-7 cursor-pointer text-sm font-semibold focus-visible:rounded focus-visible:outline-2 focus-visible:outline-primary">
          How to handle this task
        </summary>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {guide.description}
        </p>
        <ol className="mt-3 grid list-decimal gap-3 pl-5 text-sm leading-6 sm:grid-cols-3 sm:gap-6">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
