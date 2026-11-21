import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowUpRight } from 'lucide-react';
import { env } from 'cloudflare:workers';
import { signOutPath } from '@/app/auth';
import { AdminAccountMenu, AdminBrand, AdminBrandMark, AdminMobileNavigation, AdminNavigation, AdminSearch } from '@/components/admin/admin-navigation';
import { AdminSectionTabs } from '@/components/admin/admin-section-tabs';
import { CommandSearch } from '@/components/admin/command-search';
import { readAdminSidebarCounts } from '@/components/admin/admin-review-data';
import { AdminTaskContext } from '@/components/admin/admin-task-context';
import { NotificationBell } from '@/components/account/notification-bell';
import { WorkspaceRefresh } from '@/components/ui/workspace-refresh';
import { AdminWorkspaceReady } from '@/components/admin/admin-workspace-ready';
import { requireStaffPage } from '@/lib/auth/staff';
import { AdminSessionActivity } from '@/components/security/session-activity';
import { adminNavigation } from '@/lib/admin/navigation';
import { localStaffMfaFlagEnabled } from '@/lib/security/local-simulation';
import type { SecurityPolicyBindings } from '@/lib/security/runtime-policy';
import AdminLoading from './loading';
import './workspace.css';

export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireStaffPage('/admin');
  const access = { role: staff.role, permissions: staff.permissions };
  const destinations = adminNavigation(staff.role, staff.permissions);
  const procedure = destinations.find(item => item.href === '/admin/legal-policies/active')?.href;
  const bindings = env as SecurityPolicyBindings & { DB?: D1Database };
  const local = bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging';
  const localMfaNotice = local && localStaffMfaFlagEnabled(bindings, (await headers()).get('host') ?? '');
  const counts = bindings.DB ? await readAdminSidebarCounts(bindings.DB, staff).catch(() => ({})) : {};
  const account = { name: staff.displayName, role: staff.role, signOut: signOutPath('/'), procedure };
  return (
    <div className="admin-shell">
      <AdminSessionActivity />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">Skip to operations</a>
      <AdminWorkspaceReady fallback={<>
        <div className="admin-rail" aria-hidden="true">
          <div className="admin-brand"><AdminBrandMark /></div>
        </div>
        <div className="min-w-0">
          <div className="admin-toolbar" aria-hidden="true">
            <div className="admin-brand admin-brand-mobile"><AdminBrandMark /></div>
          </div>
          <main tabIndex={-1} id="main-content" className="admin-workspace min-w-0">
            <AdminLoading />
          </main>
        </div>
      </>}>
        <aside className="admin-rail">
          <div className="hidden lg:block"><AdminBrand {...access} /></div>
          <AdminNavigation role={staff.role} permissions={staff.permissions} counts={counts} />
          <div className="mt-auto hidden pt-4 lg:block">
            <Link href="/shop" className="admin-hub-link mb-2"><ArrowUpRight className="size-4 shrink-0" />Open marketplace</Link>
            <AdminAccountMenu {...account} />
          </div>
        </aside>
        <div className="min-w-0">
          {localMfaNotice ? <p className="border-b border-amber-200 bg-amber-100 px-4 py-2 text-sm text-amber-950">Local only: 2-step check is off for test accounts. Remove HASTABAZAAR_LOCAL_SKIP_STAFF_MFA before any deploy.</p> : null}
          <header className="admin-toolbar">
            <AdminBrand {...access} mobile />
            <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3 lg:mr-auto lg:ml-0 lg:flex-1"><AdminSearch /></div>
            {local ? <span className="hidden rounded-full bg-[#f7e7be] px-3 py-1 text-xs font-semibold text-[#744a0b] lg:inline">Local staging · payments simulated</span> : null}
            <WorkspaceRefresh className="admin-toolbar-icon" excludePaths={['/admin/orders', '/admin/payouts']} />
            <div className="admin-toolbar-notifications"><NotificationBell workspace="staff" accountId={staff.id} /></div>
            <AdminMobileNavigation {...access} counts={counts} account={account} />
          </header>
          <CommandSearch key={staff.id} actorId={staff.id} />
          <AdminSectionTabs {...access} />
          <main
            key={`${staff.id}:${staff.role}:${staff.permissions?.slice().sort().join(',') ?? 'default'}`}
            tabIndex={-1}
            id="main-content"
            className="admin-workspace min-w-0"
          >
            <AdminTaskContext {...access}>{children}</AdminTaskContext>
          </main>
        </div>
      </AdminWorkspaceReady>
    </div>
  );
}
