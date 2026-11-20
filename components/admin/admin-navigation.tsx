'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Permission } from '@/lib/marketplace/permissions';
import { adminNavigation, adminNavigationGroups } from '@/lib/admin/navigation';
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
export function AdminNavigation({
  role,
  permissions,
}: {
  role: 'admin' | 'super_admin';
  permissions?: readonly Permission[];
}) {
  const pathname = usePathname(),
    searchId = useId(),
    menuId = useId();
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false);
  const links = adminNavigation(role, permissions, query);
  return (
    <SidebarProvider className="min-h-0 min-w-0">
      <Sidebar
        collapsible="none"
        className="h-auto w-full rounded-2xl border bg-card text-foreground"
      >
        <SidebarHeader className="p-3">
          <Field>
            <FieldLabel htmlFor={searchId}>Find a task</FieldLabel>
            <Input
              id={searchId}
              type="search"
              value={query}
              maxLength={120}
              placeholder="Orders, payouts, settings…"
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              aria-controls={menuId}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            className="xl:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close task menu' : 'Browse tasks'}
          </Button>
          {query.trim() ? (
            <div className="flex items-center justify-between gap-2">
              <output
                aria-live="polite"
                className="text-xs text-muted-foreground"
              >
                {links.length} matching tasks
              </output>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuery('')}
              >
                Clear search
              </Button>
            </div>
          ) : null}
        </SidebarHeader>
        <SidebarContent
          id={menuId}
          className={cn(
            'hidden min-w-0 p-2 xl:block xl:max-h-[calc(100dvh-15rem)]',
            open && 'block max-h-[55dvh]',
          )}
        >
          <nav aria-label="Staff workspace">
            {adminNavigationGroups.map((group) => {
              const groupLinks = links.filter((link) => link.group === group);
              if (!groupLinks.length) return null;
              return (
                <div key={group} className="mb-3">
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group}
                  </p>
                  <SidebarMenu>
                    {groupLinks.map((link) => {
                      const active =
                        pathname === link.href ||
                        (link.href !== '/admin' &&
                          pathname.startsWith(link.href + '/'));
                      const Icon = icons[link.icon];
                      return (
                        <SidebarMenuItem key={link.href}>
                          <SidebarMenuButton
                            size="lg"
                            render={
                              <Link
                                href={link.href}
                                onClick={() => {
                                  setQuery('');
                                  setOpen(false);
                                }}
                              />
                            }
                            isActive={active}
                            aria-current={active ? 'page' : undefined}
                            className="h-auto min-h-11 gap-2 rounded-xl px-3 py-2.5"
                          >
                            <Icon />
                            <span className="min-w-0 whitespace-normal">
                              {link.label}
                              {query.trim() ? (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {link.description}
                                </span>
                              ) : null}
                            </span>
                            {link.href === '/admin/riders' ? (
                              <Badge variant="outline">On hold</Badge>
                            ) : null}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </div>
              );
            })}
            {!links.length ? (
              <p className="p-3 text-sm text-muted-foreground">
                No tasks match this search. Try another word or clear the
                search.
              </p>
            ) : null}
          </nav>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
