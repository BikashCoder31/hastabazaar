import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { getSellerUser } from '@/lib/auth/seller';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { signOutPath } from '@/app/auth';
import { AccountNavigation } from '@/components/account/account-navigation';
import {AccountAccessBoundary} from '@/components/account/account-access-boundary';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { riderProfile } from '@/lib/riders/repository';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const customer = await requireCustomerPage('/account');
  const [seller, rider] = await Promise.all([
    getSellerUser(),
    isRiderPortalEnabled()
      ? riderProfile(requireDatabase(env as unknown as { DB?: D1Database }), customer.userId)
      : Promise.resolve(null),
  ]);
  return (
    <div className="min-h-screen bg-secondary/35">
      <SiteHeader />
      <div className="shell py-6 sm:py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/" className="rounded-md hover:text-primary">
            Home
          </Link>
          <ChevronRight className="size-3.5" />
          <Link href="/account" className="rounded-md hover:text-primary">
            My account
          </Link>
        </nav>
        <AccountAccessBoundary actorId={customer.userId}><div className="grid items-start gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8">
          <aside className="min-w-0 lg:sticky lg:top-40">
            {customer.isSuperAdmin === 1 ? (
              <Link
                href="/admin"
                prefetch={false}
                className="mb-3 flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 py-3 text-sm font-semibold text-primary"
              >
                Back to Super Admin
              </Link>
            ) : null}
            {seller ? <Link href="/seller" className="mb-3 flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 py-3 text-sm font-semibold text-primary">Switch to seller dashboard</Link> : null}
            {isRiderPortalEnabled() && (!seller || rider) ? <Link href="/rider" className="mb-3 flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 py-3 text-sm font-semibold text-primary">{rider ? rider.status === 'approved' ? 'Rider dashboard' : 'Rider application status' : 'Rider dashboard / apply'}</Link> : null}
            <AccountNavigation
              displayName={customer.displayName}
              email={customer.email}
              signOutPath={signOutPath('/')}
              showAssignedDeliveries={rider?.status === 'approved'}
            />
          </aside>
          <main tabIndex={-1} id="main-content" className="min-w-0 pb-10">
            {children}
          </main>
        </div></AccountAccessBoundary>
      </div>
      <SiteFooter />
    </div>
  );
}
