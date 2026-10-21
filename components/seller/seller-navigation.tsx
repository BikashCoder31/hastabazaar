'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Banknote,
  Bell,
  ChartNoAxesCombined,
  CircleAlert,
  LayoutDashboard,
  ShoppingBag,
  ReceiptText,
  Store,
  Truck,
  UserRound,
  ChevronDown,
  FileText,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';

const links = [
  { href: '/seller', label: 'Overview', icon: LayoutDashboard },
  { href: '/seller/orders', label: 'Orders', icon: ReceiptText },
  { href: '/seller/reviews', label: 'Customer reviews', icon: ReceiptText },
  { href: '/seller/products', label: 'Products & stock', icon: ShoppingBag },
  { href: '/seller/finance', label: 'Earnings & payouts', icon: Banknote },
  { href: '/seller/shipping', label: 'Shipping', icon: Truck },
  { href: '/seller/cases', label: 'Returns & complaints', icon: CircleAlert },
  {
    href: '/seller/analytics',
    label: 'Sales & inventory',
    icon: ChartNoAxesCombined,
  },
  { href: '/seller/notifications', label: 'Notifications', icon: Bell },
  { href: '/seller/profile', label: 'Shop profile', icon: UserRound },
];

const primaryPaths = [
  '/seller',
  '/seller/orders',
  '/seller/products',
  '/seller/finance',
];
const shortLabels: Record<string, string> = {
  '/seller': 'Overview',
  '/seller/orders': 'Orders',
  '/seller/products': 'Products',
  '/seller/finance': 'Earnings',
};
const isCurrent = (pathname: string, href: string) =>
  pathname === href || (href !== '/seller' && pathname.startsWith(href + '/'));
type NavigationProps = { tradingName: string; sellerId: string };

export function SellerNavigation({ tradingName, sellerId }: NavigationProps) {
  const pathname = usePathname();
  return (
    <SellerNavigationView
      pathname={pathname}
      tradingName={tradingName}
      sellerId={sellerId}
    />
  );
}

export function SellerNavigationView({
  pathname,
  tradingName,
  sellerId,
}: NavigationProps & { pathname: string }) {
  const secondary = links.filter((link) => !primaryPaths.includes(link.href));
  const activeSecondary = secondary.find((link) =>
    isCurrent(pathname, link.href),
  );
  return (
    <>
      <div className="rounded-2xl border bg-card p-2 xl:hidden">
        <nav aria-label="Seller quick links">
          <ul className="grid grid-cols-4 gap-1">
            {primaryPaths.map((href) => {
              const item = links.find((link) => link.href === href)!;
              const Icon = item.icon;
              const active = isCurrent(pathname, href);
              return (
                <li key={href} className="min-w-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    <span>{shortLabels[href]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <details key={pathname} className="group mt-1 border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <span>
              More
              {activeSecondary ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {activeSecondary.label}
                </span>
              ) : null}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 group-open:rotate-180"
            />
          </summary>
          <nav aria-label="More seller pages" className="border-t pt-2">
            <ul className="grid gap-1 sm:grid-cols-2">
              {secondary.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={
                      isCurrent(pathname, href) ? 'page' : undefined
                    }
                    className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-primary"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-muted"
                  href="/seller#managed-program"
                >
                  <FileText aria-hidden="true" className="size-4 shrink-0" />
                  Program & agreements
                </Link>
              </li>
              <li>
                <Link
                  className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-muted"
                  href={'/makers/' + sellerId}
                >
                  <Store aria-hidden="true" className="size-4 shrink-0" />
                  View public shop
                </Link>
              </li>
              <li>
                <Link
                  className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-muted"
                  href="/account"
                >
                  <UserRound aria-hidden="true" className="size-4 shrink-0" />
                  Customer dashboard
                </Link>
              </li>
            </ul>
          </nav>
        </details>
      </div>
      <SidebarProvider className="hidden min-h-0 min-w-0 xl:flex">
        <Sidebar
          collapsible="none"
          className="h-auto w-full rounded-2xl border bg-card text-foreground"
        >
          <SidebarHeader className="hidden border-b p-5 xl:flex">
            <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store className="size-5" />
            </span>
            <p className="break-words font-semibold">{tradingName}</p>
            <Link href={'/makers/' + sellerId} className="section-link">
              View public shop →
            </Link>
          </SidebarHeader>
          <SidebarContent className="p-2 xl:max-h-[calc(100dvh-17rem)]">
            <nav aria-label="Seller workspace">
              <SidebarMenu>
                {links.map(({ href, label, icon: Icon }) => {
                  const active = isCurrent(pathname, href);
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        size="lg"
                        render={<Link href={href} />}
                        isActive={active}
                        aria-current={active ? 'page' : undefined}
                        className="h-auto min-h-11 gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 data-active:bg-secondary data-active:text-primary data-active:font-semibold"
                      >
                        <Icon />
                        <span className="whitespace-normal">{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </>
  );
}
