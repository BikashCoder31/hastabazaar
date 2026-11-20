'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Banknote, Bell, FileText, House, LayoutDashboard, Menu, Package, Plus, ReceiptText, ShieldCheck, ShoppingBag, Store, UserRound, Wallet, X, type LucideIcon } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { sellerWorkspaceSection, sellerWorkspaceSections, type SellerWorkspaceSection } from '@/lib/sellers/workspace-navigation';

const icons: Record<SellerWorkspaceSection['icon'], LucideIcon> = {
  home: LayoutDashboard, shop: Store, documents: FileText, products: ShoppingBag,
  orders: ReceiptText, earnings: Banknote, requests: Bell,
};
const dailyLinks = [
  { id: 'home', label: 'Today', icon: House },
  { id: 'orders', label: 'Orders', icon: ReceiptText },
  { id: 'add', label: 'Add product', icon: Plus },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'earnings', label: 'Earnings', icon: Wallet },
] as const;
const isCurrent = (pathname: string, href: string) => pathname === href || (href !== '/seller' && pathname.startsWith(href + '/'));
type NavigationProps = {
  tradingName: string;
  sellerId: string | null;
  canReplyToReviews: boolean;
  publicShopHref?: string | null;
  previewShopHref?: string | null;
  signOut?: string;
  addProductHref?: string;
  openOrderCount?: number | null;
  notifications?: ReactNode;
  brand?: ReactNode;
  desktopBrand?: ReactNode;
  desktopActions?: ReactNode;
  mode?: 'mobile' | 'desktop';
};
const linkClass = 'flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-primary';

export function SellerNavigation(props: NavigationProps) {
  return <SellerNavigationView {...props} pathname={usePathname()} />;
}

export function SellerNavigationView({
  pathname, tradingName, sellerId, canReplyToReviews, publicShopHref, previewShopHref,
  signOut, addProductHref, openOrderCount, notifications, brand, desktopBrand, desktopActions, mode,
}: NavigationProps & { pathname: string }) {
  const active = sellerWorkspaceSection(pathname);
  const sections = sellerWorkspaceSections.map(section => ({
    ...section,
    links: section.links.filter(link => canReplyToReviews || link.href !== '/seller/reviews'),
  }));
  const publicHref = publicShopHref && /^\/makers\/[a-zA-Z0-9_-]+$/.test(publicShopHref) ? publicShopHref : null;
  const previewHref = previewShopHref?.startsWith('/seller/') ? previewShopHref : null;
  const shopLink = publicHref ? <Link href={publicHref} className="section-link">View public shop →</Link>
    : previewHref ? <Link href={previewHref} className="section-link">Private shop preview →</Link>
    : <p className="text-xs text-muted-foreground">Your shop is not public yet.</p>;
  const reviewHelp = !canReplyToReviews ? <p className="text-xs text-muted-foreground">Public customer-review replies are not available for this account. <Link href="/seller/requests" className="inline-flex min-h-11 items-center font-semibold underline">Ask for help in Requests &amp; help</Link>.</p> : null;
  const productHref = addProductHref ?? (sellerId ? '/sell/application/products/new' : '/seller/registration');
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const close = () => dialog.current?.close();
  useEffect(() => {
    if (mode === 'desktop') return;
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeAtDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener('change', closeAtDesktop);
    return () => desktop.removeEventListener('change', closeAtDesktop);
  }, [mode]);
  return <>
    {mode !== 'desktop' ? <div className="seller-mobile-shell">
      <header className="seller-mobile-toolbar">
        <div className="shell flex min-w-0 items-center gap-1 lg:py-3">
        <Link href="/seller" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 lg:hidden">
          {brand ?? <Store className="size-7 shrink-0 rounded-md bg-secondary p-1.5" aria-hidden="true" />}
          <span className="min-w-0"><strong className="block break-words leading-tight">{tradingName || 'Your shop'}</strong>
            <span className="block text-xs font-semibold text-[#A8232E]">Seller Studio</span></span>
        </Link>
        {desktopBrand ? <div className="hidden min-w-0 flex-1 lg:block">{desktopBrand}</div> : null}
        {notifications}
        {desktopActions ? <div className="hidden flex-wrap items-center gap-2 lg:flex">{desktopActions}</div> : null}
        <button type="button" data-mobile-shortcut="menu" aria-label="Open seller menu" aria-haspopup="dialog"
          aria-controls={dialogId} onClick={() => dialog.current?.showModal()} className="grid size-11 shrink-0 place-items-center rounded-lg lg:hidden">
          <Menu className="size-5" aria-hidden="true" />
        </button>
        </div>
      </header>
      <nav aria-label="Seller quick links" className="seller-mobile-tabs">
        {dailyLinks.map(({ id, label, icon: Icon }) => {
          const section = sections.find(item => item.id === id);
          return <Link key={id} href={section?.href ?? productHref} data-mobile-shortcut={id}
            aria-label={id === 'add' ? label : undefined}
            aria-current={active?.id === id ? 'page' : undefined}>
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {id === 'add' ? <span className="sr-only">{label}</span> : <span>{label}</span>}
            {id === 'orders' && openOrderCount ? <span className="seller-mobile-count" aria-label={openOrderCount + ' orders to prepare'}>{openOrderCount}</span> : null}
          </Link>;
        })}
      </nav>
      <dialog ref={dialog} id={dialogId} className="seller-mobile-menu" aria-labelledby={titleId}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="font-heading text-2xl font-semibold">Seller Studio</h2>
          <button type="button" aria-label="Close seller menu" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-lg">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="All seller pages" className="py-3">
          <ul className="grid gap-1 sm:grid-cols-2">
            {sections.flatMap(section => [{ href: section.href, label: section.id === 'home' ? 'Today' : section.label }, ...section.links]).map(link =>
              <li key={link.href}><Link href={link.href} onClick={close} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined} className={linkClass}>{link.label}</Link></li>)}
            <li><Link href={productHref} onClick={close} className={linkClass}><Plus aria-hidden="true" className="size-4" />Add product</Link></li>
            <li><Link href="/account" prefetch={false} onClick={close} className={linkClass}><UserRound aria-hidden="true" className="size-4" />Customer dashboard</Link></li>
            <li><Link href="/security?return_to=%2Fseller" onClick={close} className={linkClass}><ShieldCheck aria-hidden="true" className="size-4" />Account security</Link></li>
            <li><Link href="/shop" onClick={close} className={linkClass}>Marketplace</Link></li>
            <li className="min-w-0 px-3 py-2">{shopLink}{reviewHelp}</li>
          </ul>
        </nav>
        {signOut ? <form data-form-id="identity.logout" method="POST" action={signOut} target="_top" className="border-t pt-2">
          <button type="submit" className={linkClass}>Sign out</button>
        </form> : null}
      </dialog>
    </div> : null}
    {mode !== 'mobile' ? <SidebarProvider className="hidden min-h-0 min-w-0 lg:flex">
      <Sidebar collapsible="none" className="h-auto w-full rounded-2xl border bg-card text-foreground">
        <SidebarHeader className="border-b p-5">
          <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Store aria-hidden="true" className="size-5" /></span>
          <p className="break-words font-semibold">{tradingName || 'Your shop'}</p>
          {sellerId ? <p className="break-all text-xs text-muted-foreground">Seller reference: {sellerId}</p> : null}
          {shopLink}{reviewHelp}
        </SidebarHeader>
        <SidebarContent className="p-2 lg:max-h-[calc(100dvh-17rem)]">
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
    </SidebarProvider> : null}
  </>;
}
