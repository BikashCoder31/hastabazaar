'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Heart,
  House,
  LifeBuoy,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  UserRound,
  Wallet,
  Gift,
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
  { href: '/account', label: 'Overview', icon: House },
  { href: '/account/orders', label: 'My orders', icon: Package },
  { href: '/account/wallet', label: 'My wallet', icon: Wallet },
  { href: '/account/rewards', label: 'My Rewards', icon: Gift },
  { href: '/account/referrals', label: 'Refer & earn', icon: Gift },
  { href: '/account/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/rider', label: 'Assigned deliveries', icon: Package },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/notifications', label: 'Notifications', icon: Bell },
  { href: '/account/profile', label: 'My profile', icon: UserRound },
  { href: '/account/privacy', label: 'Privacy', icon: ShieldCheck },
  { href: '/help', label: 'Help & support', icon: LifeBuoy },
];

export function AccountNavigation({
  displayName,
  email,
  signOutPath,
  showAssignedDeliveries = false,
}: {
  displayName: string;
  email: string;
  signOutPath: string;
  showAssignedDeliveries?: boolean;
}) {
  const pathname = usePathname();
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toUpperCase();
  return (
    <SidebarProvider className="min-h-0 min-w-0">
      <Sidebar
        collapsible="none"
        className="h-auto w-full rounded-2xl border bg-card text-foreground"
      >
        <SidebarHeader className="hidden border-b p-5 lg:flex">
          <div
            aria-hidden="true"
            className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground"
          >
            {initials || 'H'}
          </div>
          <p className="break-words font-semibold">{displayName}</p>
          <p className="break-all text-sm leading-6 text-muted-foreground">
            {email}
          </p>
        </SidebarHeader>
        <SidebarContent className="overflow-visible p-2">
          <nav aria-label="Customer account">
            <SidebarMenu className="grid grid-cols-1 gap-1 min-[360px]:grid-cols-2 sm:grid-cols-4 lg:flex">
              {links.filter(({ href }) => href !== '/rider' || showAssignedDeliveries).map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    size="lg"
                    render={<Link href={href} />}
                    isActive={pathname === href}
                    aria-current={pathname === href ? 'page' : undefined}
                    className="h-auto min-h-11 gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 data-active:bg-secondary data-active:font-semibold data-active:text-primary"
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
          <form method="POST" action={signOutPath} target="_top">
          <button
            type="submit"
            className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl border-t px-3 py-3 text-sm text-muted-foreground hover:bg-muted"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
          </form>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
