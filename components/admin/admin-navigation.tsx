'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Banknote,
  CircleAlert,
  LayoutDashboard,
  PanelsTopLeft,
  ListTree,
  ListChecks,
  MessageSquareText,
  PackageCheck,
  Percent,
  Scale,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import type { Permission } from '@/lib/marketplace/permissions';
import { adminNavigation } from '@/lib/admin/navigation';

const icons: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  orders: ShoppingCart,
  shipping: Truck,
  cases: CircleAlert,
  sellers: Store,
  products: PackageCheck,
  homepage: PanelsTopLeft,
  catalog: ListTree,
  forms: ListChecks,
  reviews: MessageSquareText,
  payouts: Banknote,
  analytics: Activity,
  privacy: Scale,
  governance: ShieldCheck,
  team: Users,
  commission: Percent,
  settings: Settings2,
  programs: Workflow,
};

export function AdminNavigation({ role, permissions }: { role: 'admin' | 'super_admin'; permissions?: readonly Permission[] }) {
  const pathname = usePathname();
  const links = adminNavigation(role, permissions);
  return (
    <SidebarProvider className="min-h-0 min-w-0">
      <Sidebar
        collapsible="none"
        className="h-auto w-full rounded-2xl border bg-card text-foreground"
      >
        <SidebarContent className="p-2 xl:max-h-[calc(100dvh-9rem)]">
          <nav
            aria-label="Staff workspace"
            className="grid gap-2 sm:grid-cols-3 xl:block"
          >
            {['Operations', 'Marketplace', 'Controls'].map((group) => (
              <div key={group} className="xl:mb-3">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group}
                </p>
                <SidebarMenu className="grid grid-cols-1 gap-1 min-[360px]:grid-cols-2 sm:flex">
                  {links
                    .filter((link) => link.group === group)
                    .map((link) => {
                      const active =
                        pathname === link.href ||
                        (link.href !== '/admin' &&
                          pathname.startsWith(link.href + '/'));
                      const Icon = icons[link.icon];
                      return (
                        <SidebarMenuItem key={link.href}>
                          <SidebarMenuButton
                            size="lg"
                            render={<Link href={link.href} />}
                            isActive={active}
                            aria-current={active ? 'page' : undefined}
                            className="h-auto min-h-11 gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 data-active:bg-secondary data-active:text-primary data-active:font-semibold"
                          >
                            <Icon />
                            <span className="whitespace-normal">
                              {link.label}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                </SidebarMenu>
              </div>
            ))}
          </nav>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
