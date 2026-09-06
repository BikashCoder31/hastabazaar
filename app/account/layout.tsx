import Link from 'next/link';

import { chatGPTSignOutPath } from '@/app/chatgpt-auth';
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
  return (
    <div className="min-h-screen bg-muted/20">
      <SiteHeader />
      <div className="border-b bg-card">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm font-semibold">{customer.displayName}</p>
            <p className="text-xs text-muted-foreground">{customer.email}</p>
          </div>
          <nav
            className="flex flex-wrap gap-2 text-sm"
            aria-label="Customer account"
          >
            <Link
              className="rounded-full px-3 py-2 hover:bg-muted"
              href="/account"
            >
              Profile
            </Link>
            <Link
              className="rounded-full px-3 py-2 hover:bg-muted"
              href="/account/orders"
            >
              Orders
            </Link>
            <Link
              className="rounded-full px-3 py-2 hover:bg-muted"
              href="/account/addresses"
            >
              Addresses
            </Link>
            <Link
              className="rounded-full px-3 py-2 hover:bg-muted"
              href="/account/wishlist"
            >
              Wishlist
            </Link>
            <Link
              className="rounded-full px-3 py-2 hover:bg-muted"
              href="/account/notifications"
            >
              Notifications
            </Link>
            <Link
              className="rounded-full px-3 py-2 hover:bg-muted"
              href="/account/privacy"
            >
              Privacy
            </Link>
            <a
              className="rounded-full px-3 py-2 text-muted-foreground hover:bg-muted"
              href={chatGPTSignOutPath('/')}
              target="_top"
            >
              Sign out
            </a>
          </nav>
        </div>
      </div>
      <main className="shell py-10 sm:py-14">{children}</main>
      <SiteFooter />
    </div>
  );
}
