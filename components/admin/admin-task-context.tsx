'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
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
      <details key={pathname} className="group rounded-xl border bg-card p-4">
        <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-md py-2 pr-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          How to handle this task
        </summary>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {guide.description}
        </p>
        <ol className="mt-4 grid gap-3 lg:grid-cols-3">
          {guide.steps.map((step, index) => (
            <li
              key={step}
              className="flex min-w-0 items-start gap-3 rounded-lg bg-muted/40 p-3"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <p className="min-w-0 text-sm leading-6">{step}</p>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
