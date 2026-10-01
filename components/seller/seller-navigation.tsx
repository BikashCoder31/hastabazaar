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

export function SellerNavigation({
  tradingName,
  sellerId,
}: {
  tradingName: string;
  sellerId: string;
}) {
  const pathname = usePathname();
  return (
    <SidebarProvider className="min-h-0 min-w-0">
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
            <SidebarMenu className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:flex">
              {links.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href ||
                  (href !== '/seller' && pathname.startsWith(href + '/'));
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
  );
}
