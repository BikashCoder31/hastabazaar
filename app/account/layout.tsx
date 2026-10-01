import { getSellerUser } from '@/lib/auth/seller';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { signOutPath } from '@/app/auth';
import { AccountNavigation } from '@/components/account/account-navigation';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireCustomerPage } from '@/lib/auth/customer';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const customer = await requireCustomerPage('/account');
  const seller = await getSellerUser();
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
        <div className="grid items-start gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8">
          <aside className="min-w-0 lg:sticky lg:top-40">
            {seller ? <Link href="/seller" className="mb-3 flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 py-3 text-sm font-semibold text-primary">Switch to seller dashboard</Link> : null}
            <Link href="/rider" className="mb-3 flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 py-3 text-sm font-semibold text-primary">Rider dashboard / apply</Link>
            <AccountNavigation
              displayName={customer.displayName}
              email={customer.email}
              signOutPath={signOutPath('/')}
            />
          </aside>
          <main tabIndex={-1} id="main-content" className="min-w-0 pb-10">
            {children}
          </main>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
