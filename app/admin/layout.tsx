import Image from 'next/image';
import Link from 'next/link';
import {
  Activity,
  Banknote,
  CircleAlert,
  ClipboardCheck,
  LayoutDashboard,
  ListTree,
  MessageSquareText,
  PackageCheck,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
} from 'lucide-react';

import { chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { requireStaffPage } from '@/lib/auth/staff';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireStaffPage('/admin');

  return (
    <div className="min-h-screen bg-muted/35">
      <header className="border-b bg-background">
        <div className="shell flex min-h-20 flex-wrap items-center justify-between gap-4 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/brand/hastabazaar-logo.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover"
            />
            <span>
              <span className="block font-heading text-xl leading-tight">
                Hastabazaar
              </span>
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Operations
              </span>
            </span>
          </Link>

          <nav
            aria-label="Operations navigation"
            className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto"
          >
            <Link className="admin-nav-link" href="/admin">
              <LayoutDashboard /> Overview
            </Link>
            <Link className="admin-nav-link" href="/admin/sellers">
              <Store /> Sellers
            </Link>
            <Link className="admin-nav-link" href="/admin/products">
              <PackageCheck /> Products
            </Link>
            <Link className="admin-nav-link" href="/admin/catalog">
              <ListTree /> Catalogue
            </Link>
            <Link className="admin-nav-link" href="/admin/reviews">
              <MessageSquareText /> Reviews
            </Link>
            <Link className="admin-nav-link" href="/admin/orders">
              <ShoppingCart /> Orders
            </Link>
            <Link className="admin-nav-link" href="/admin/cases">
              <CircleAlert /> Cases
            </Link>
            <Link className="admin-nav-link" href="/admin/payouts">
              <Banknote /> Payouts
            </Link>
            <Link className="admin-nav-link" href="/admin/shipping">
              <Truck /> Shipping
            </Link>
            <Link className="admin-nav-link" href="/admin/analytics">
              <Activity /> Reports
            </Link>
            <Link className="admin-nav-link" href="/admin/privacy">
              <Scale /> Privacy
            </Link>
            <Link className="admin-nav-link" href="/admin/governance">
              <ShieldCheck /> Governance
            </Link>
            {staff.role === 'super_admin' ? (
              <Link className="admin-nav-link" href="/admin/team">
                <ShieldCheck /> Team
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-3 text-right">
            <div className="hidden sm:block">
              <p className="max-w-52 truncate text-sm font-semibold">
                {staff.displayName}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {staff.role.replace('_', ' ')}
              </p>
            </div>
            <a
              href={chatGPTSignOutPath('/')}
              target="_top"
              className="rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign out
            </a>
          </div>
        </div>
      </header>

      <main className="shell py-8 sm:py-10">
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          <ClipboardCheck className="size-4" /> Protected staff workspace
        </div>
        {children}
      </main>
    </div>
  );
}
