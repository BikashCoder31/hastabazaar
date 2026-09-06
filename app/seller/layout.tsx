import Image from 'next/image';
import Link from 'next/link';
import {
  Banknote,
  Bell,
  ChartNoAxesCombined,
  CircleAlert,
  LayoutDashboard,
  PackagePlus,
  ReceiptText,
  ShoppingBag,
  Truck,
  UserRound,
} from 'lucide-react';

import { chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { requireSellerPage } from '@/lib/auth/seller';

export const dynamic = 'force-dynamic';

export default async function SellerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const seller = await requireSellerPage('/seller');
  return (
    <div className="min-h-screen bg-muted/35">
      <header className="border-b bg-background">
        <div className="shell flex min-h-20 flex-wrap items-center justify-between gap-4 py-3">
          <Link
            href="/seller"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/brand/hathkriti-logo.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover"
            />
            <span>
              <span className="block font-heading text-xl leading-tight">
                {seller.tradingName}
              </span>
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Hathkriti seller
              </span>
            </span>
          </Link>
          <nav
            aria-label="Seller navigation"
            className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto"
          >
            <Link className="admin-nav-link" href="/seller">
              <LayoutDashboard /> Overview
            </Link>
            <Link className="admin-nav-link" href="/seller/products">
              <ShoppingBag /> Products
            </Link>
            <Link className="admin-nav-link" href="/seller/orders">
              <ReceiptText /> Orders
            </Link>
            <Link className="admin-nav-link" href="/seller/cases">
              <CircleAlert /> Cases
            </Link>
            <Link className="admin-nav-link" href="/seller/finance">
              <Banknote /> Earnings
            </Link>
            <Link className="admin-nav-link" href="/seller/analytics">
              <ChartNoAxesCombined /> Analytics
            </Link>
            <Link className="admin-nav-link" href="/seller/shipping">
              <Truck /> Shipping
            </Link>
            <Link className="admin-nav-link" href="/seller/notifications">
              <Bell /> Alerts
            </Link>
            <Link className="admin-nav-link" href="/seller/profile">
              <UserRound /> Profile
            </Link>
            <Link className="admin-nav-link" href="/seller/products/new">
              <PackagePlus /> Add product
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-52 truncate text-sm font-semibold sm:block">
              {seller.displayName}
            </span>
            <a
              href={chatGPTSignOutPath('/')}
              target="_top"
              className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              Sign out
            </a>
          </div>
        </div>
      </header>
      <main className="shell py-8 sm:py-10">{children}</main>
    </div>
  );
}
