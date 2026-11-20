'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type {KeyboardEvent} from 'react';
import { Banknote, Bell, ChevronDown, FileText, LayoutDashboard, ReceiptText, ShieldCheck, ShoppingBag, Store, UserRound, type LucideIcon } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { sellerWorkspaceSection, sellerWorkspaceSections, type SellerWorkspaceSection } from '@/lib/sellers/workspace-navigation';

const icons: Record<SellerWorkspaceSection['icon'], LucideIcon> = {
  home: LayoutDashboard, shop: Store, documents: FileText, products: ShoppingBag,
  orders: ReceiptText, earnings: Banknote, requests: Bell,
};
const primary = ['home', 'products', 'orders'] as const;
const shortLabels = { home: 'Home', products: 'Products', orders: 'Orders' };
const isCurrent = (pathname: string, href: string) => pathname === href || (href !== '/seller' && pathname.startsWith(href + '/'));
function closeMore(event:KeyboardEvent<HTMLElement>){
  if(event.key!=='Escape')return;
  const details=event.currentTarget.closest<HTMLDetailsElement>('details');
  if(details){details.open=false;details.querySelector('summary')?.focus();}
}
type NavigationProps = { tradingName: string; sellerId: string | null; canReplyToReviews:boolean; publicShopHref?: string | null; previewShopHref?: string | null };
const linkClass = 'flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-primary';

export function SellerNavigation(props: NavigationProps) {
  return <SellerNavigationView {...props} pathname={usePathname()} />;
}

export function SellerNavigationView({ pathname, tradingName, sellerId, canReplyToReviews, publicShopHref, previewShopHref }: NavigationProps & { pathname: string }) {
  const active = sellerWorkspaceSection(pathname);
  const sections=sellerWorkspaceSections.map(section=>({...section,links:section.links.filter(link=>canReplyToReviews||link.href!=='/seller/reviews')}));
  const secondary = sections.flatMap(section => primary.some(id => id === section.id)
    ? section.links : [{ href: section.href, label: section.label }, ...section.links]);
  const publicHref = publicShopHref && /^\/makers\/[a-zA-Z0-9_-]+$/.test(publicShopHref) ? publicShopHref : null;
  const previewHref = previewShopHref?.startsWith('/seller/') ? previewShopHref : null;
  const shopLink = publicHref ? <Link href={publicHref} onKeyDown={closeMore} className="section-link">View public shop →</Link>
    : previewHref ? <Link href={previewHref} onKeyDown={closeMore} className="section-link">Private shop preview →</Link>
    : <p className="text-xs text-muted-foreground">Your shop is not public yet.</p>;
  const reviewHelp=!canReplyToReviews?<p className="text-xs text-muted-foreground">Public customer-review replies are not available for this account. <Link href="/seller/requests" onKeyDown={closeMore} className="inline-flex min-h-11 items-center font-semibold underline">Ask for help in Requests &amp; help</Link>.</p>:null;
  return <>
    <div className="relative grid grid-cols-4 gap-1 rounded-2xl border bg-card p-2 xl:hidden">
      <nav aria-label="Seller quick links" className="col-span-3">
        <ul className="grid grid-cols-3 gap-1">{primary.map(id => {
          const section = sections.find(item => item.id === id)!;
          const Icon = icons[section.icon];
          return <li key={id} className="min-w-0"><Link href={section.href} data-mobile-shortcut={id}
            aria-current={active?.id === id ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active?.id === id ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
            <Icon aria-hidden="true" className="size-5 shrink-0" /><span>{shortLabels[id]}</span>
          </Link></li>;
        })}</ul>
      </nav>
      <details key={pathname} className="group">
        <summary onKeyDown={closeMore} data-mobile-shortcut="more" className="flex min-h-14 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="size-5 group-open:rotate-180" /><span>More</span>
        </summary>
        <nav aria-label="More seller pages" className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border bg-card p-2 shadow-lg">
          <ul className="grid max-h-[65dvh] gap-1 overflow-y-auto sm:grid-cols-2">{secondary.map(link => <li key={link.href}>
            <Link href={link.href} onKeyDown={closeMore} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined} className={linkClass}>{link.label}</Link>
          </li>)}
            <li className="px-3 py-3">{shopLink}{reviewHelp}</li>
            <li><Link href="/account" prefetch={false} onKeyDown={closeMore} className={linkClass}><UserRound aria-hidden="true" className="size-4" />Customer dashboard</Link></li>
            <li><Link href="/security?return_to=%2Fseller" onKeyDown={closeMore} className={linkClass}><ShieldCheck aria-hidden="true" className="size-4" />Account security</Link></li>
          </ul>
        </nav>
      </details>
    </div>
    <SidebarProvider className="hidden min-h-0 min-w-0 xl:flex">
      <Sidebar collapsible="none" className="h-auto w-full rounded-2xl border bg-card text-foreground">
        <SidebarHeader className="border-b p-5">
          <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Store aria-hidden="true" className="size-5" /></span>
          <p className="break-words font-semibold">{tradingName || 'Your shop'}</p>
          {sellerId ? <p className="break-all text-xs text-muted-foreground">Seller reference: {sellerId}</p> : null}
          {shopLink}{reviewHelp}
        </SidebarHeader>
        <SidebarContent className="p-2 xl:max-h-[calc(100dvh-17rem)]">
          <nav aria-label="Seller workspace"><SidebarMenu>{sections.map(section => {
            const Icon = icons[section.icon];
            return <SidebarMenuItem key={section.id}>
              <SidebarMenuButton size="lg" render={<Link href={section.href} />} isActive={active?.id === section.id}
                aria-current={pathname === section.href ? 'page' : active?.id === section.id ? 'location' : undefined}
                className="h-auto min-h-11 gap-2 rounded-xl px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-primary data-active:bg-secondary data-active:text-primary data-active:font-semibold">
                <Icon aria-hidden="true" /><span className="whitespace-normal">{section.label}</span>
              </SidebarMenuButton>
              {section.links.length ? <ul className="ml-5 border-l pl-2">{section.links.map(link => <li key={link.href}>
                <Link href={link.href} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined} className={linkClass}>{link.label}</Link>
              </li>)}</ul> : null}
            </SidebarMenuItem>;
          })}</SidebarMenu></nav>
          <nav aria-label="Seller account" className="mt-3 border-t pt-2">
            <Link href="/account" prefetch={false} className={linkClass}><UserRound aria-hidden="true" className="size-4" />Customer dashboard</Link>
            <Link href="/security?return_to=%2Fseller" className={linkClass}><ShieldCheck aria-hidden="true" className="size-4" />Account security</Link>
          </nav>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  </>;
}
