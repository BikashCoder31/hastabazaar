'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, ChevronDown, CircleHelp, Eye, FileText, House, LogOut, Menu, Package,
  Plus, ReceiptText, ShieldCheck, ShoppingBag, Star, Store, Truck, Undo2, UserRound, Wallet, X, type LucideIcon,
} from 'lucide-react';
import {
  sellerSupportHref, sellerWorkspaceSection, sellerWorkspaceSections, type SellerWorkspaceSection,
} from '@/lib/sellers/workspace-navigation';

const icons: Record<SellerWorkspaceSection['icon'], LucideIcon> = {
  home: House, orders: ReceiptText, returns: Undo2, products: Package, earnings: Wallet, shop: Store,
  reviews: Star, documents: FileText, shipping: Truck, requests: CircleHelp,
};
const dailyLinks = [
  { id: 'home', label: 'Today', icon: House },
  { id: 'orders', label: 'Orders', icon: ReceiptText },
  { id: 'add', label: 'Add product', icon: Plus },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'earnings', label: 'Earnings', icon: Wallet },
] as const;
const linkClass = 'flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#344766] hover:bg-[#F3ECDF] focus-visible:outline-2 focus-visible:outline-[#14213D] [&[aria-current]]:bg-[#EBE2D0] [&[aria-current]]:font-semibold [&[aria-current]]:text-[#14213D]';

type NavigationProps = {
  tradingName: string;
  sellerId: string | null;
  canReplyToReviews: boolean;
  publicShopHref?: string | null;
  previewShopHref?: string | null;
  shopLive?: boolean;
  shopPhoto?: ReactNode;
  signOut?: string;
  addProductHref?: string;
  openOrderCount?: number | null;
  notifications?: ReactNode;
  brand?: ReactNode;
  desktopBrand?: ReactNode;
  mode?: 'toolbar' | 'sidebar';
};

export function SellerNavigation(props: NavigationProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [pathname]);
  return <SellerNavigationView {...props} pathname={pathname + hash} />;
}

function SwitchCustomer({ close }: { close?: () => void }) {
  return (
    <Link href="/account" prefetch={false} onClick={close}
      className="flex min-h-11 items-center gap-3 rounded-xl bg-[#14213D] p-3 text-white hover:bg-[#1E2F55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">
      <ShoppingBag aria-hidden="true" className="size-8 shrink-0 rounded-lg bg-white/15 p-2" />
      <span className="min-w-0 flex-1"><span className="block text-xs text-[#C9D3E6]">Switch to</span><strong className="block text-sm">Customer account</strong></span>
      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function AccountActions({ signOut, close }: { signOut?: string; close: () => void }) {
  return (
    <div className="grid gap-0.5">
      <Link href="/security?return_to=%2Fseller" onClick={close} className={linkClass}><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Account security</Link>
      <Link href="/shop" onClick={close} className={linkClass}><Store className="size-4 shrink-0" aria-hidden="true" />Marketplace</Link>
      {signOut ? <form data-form-id="identity.logout" method="POST" action={signOut} target="_top" className="mt-1 border-t pt-1">
        <button type="submit" className={linkClass + ' w-full text-left'}><LogOut className="size-4 shrink-0" aria-hidden="true" />Sign out</button>
      </form> : null}
    </div>
  );
}

function WorkspaceLinks({ pathname, canReplyToReviews, orderCount, label, close }: {
  pathname: string; canReplyToReviews: boolean; orderCount: number; label: string; close?: () => void;
}) {
  const current = sellerWorkspaceSection(pathname);
  const activePath = pathname.split(/[?#]/, 1)[0];
  const sections = sellerWorkspaceSections.filter(section => canReplyToReviews || section.id !== 'reviews');
  const rows = (shop: boolean) => sections.filter(section => Boolean(section.shop) === shop).map(section => {
    const Icon = icons[section.icon];
    return <li key={section.id}>
      <Link href={section.href} onClick={close} className={linkClass}
        aria-current={current?.id === section.id ? activePath === section.href ? 'page' : 'location' : undefined}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{section.label}</span>
        {section.id === 'orders' && orderCount > 0 ? <span aria-label={orderCount + ' orders to prepare'}
          className="rounded-full bg-[#A8232E] px-1.5 text-xs font-semibold text-white">{orderCount}</span> : null}
      </Link>
    </li>;
  });
  return <nav aria-label={label}>
    <ul className="grid gap-0.5">{rows(false)}</ul>
    <p className="mb-1 mt-3 px-3 text-xs font-semibold text-[#655848]">Your shop</p>
    <ul className="grid gap-0.5">{rows(true)}</ul>
  </nav>;
}

function SellerAccountMenu({ name, initials, signOut }: { name: string; initials: string; signOut?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.current?.open) return;
      event.preventDefault();
      close();
      summary.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return <details ref={menu} className="relative">
    <summary ref={summary} aria-label="Seller account menu" className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-full border bg-white px-1.5 pr-2.5 focus-visible:outline-2 focus-visible:outline-[#14213D] [&::-webkit-details-marker]:hidden">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[#14213D] text-xs font-semibold text-white">{initials}</span>
      <ChevronDown aria-hidden="true" className="size-3.5" />
    </summary>
    <div className="absolute top-full right-0 z-40 mt-2 w-64 rounded-xl border bg-white p-2 shadow-lg">
      <div className="mb-1 border-b px-3 py-2">
        <p className="wrap-anywhere font-semibold">{name}</p>
        <p className="text-xs font-semibold text-[#A8232E]">Seller Studio</p>
      </div>
      <Link href="/account" prefetch={false} onClick={close} className={linkClass}><UserRound className="size-4 shrink-0" aria-hidden="true" />Switch to customer account</Link>
      <AccountActions signOut={signOut} close={close} />
    </div>
  </details>;
}

export function SellerNavigationView({
  pathname, tradingName, sellerId, canReplyToReviews, publicShopHref, previewShopHref, shopLive = false, shopPhoto,
  signOut, addProductHref, openOrderCount, notifications, brand, desktopBrand, mode,
}: NavigationProps & { pathname: string }) {
  const name = tradingName.trim() || 'Your shop';
  const initials = name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  const current = sellerWorkspaceSection(pathname);
  const orderCount = openOrderCount ?? 0;
  const publicHref = publicShopHref && /^\/makers\/[a-zA-Z0-9_-]+$/.test(publicShopHref) ? publicShopHref : null;
  const shopHref = publicHref ?? (previewShopHref?.startsWith('/seller/') ? previewShopHref : null);
  const productHref = addProductHref ?? (sellerId ? '/sell/application/products/new' : '/seller/registration');
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const close = () => dialog.current?.close();
  useEffect(() => {
    if (mode === 'sidebar') return;
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeAtDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener('change', closeAtDesktop);
    return () => desktop.removeEventListener('change', closeAtDesktop);
  }, [mode]);
  const navigation = { pathname, canReplyToReviews, orderCount };

  return <>
    {mode !== 'sidebar' ? <div className="seller-mobile-shell">
      <header className="seller-mobile-toolbar">
        <div className="flex w-full min-w-0 items-center gap-1 px-3 md:px-5 lg:justify-end lg:gap-2 lg:px-7">
          <Link href="/seller" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 lg:hidden">
            {brand ?? <Store className="size-7 shrink-0 rounded-md bg-secondary p-1.5" aria-hidden="true" />}
            <span className="min-w-0"><strong className="block wrap-anywhere leading-tight">{name}</strong>
              <span className="block text-xs font-semibold text-[#A8232E]">Seller Studio</span></span>
          </Link>
          {shopHref ? <Link href={shopHref} className="header-action hidden lg:inline-flex"><Eye className="size-4" aria-hidden="true" />View shop</Link> : null}
          {notifications}
          <div className="hidden items-center gap-2 lg:flex">
            <Link href={productHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#A8232E] px-4 text-sm font-semibold text-white hover:bg-[#8D1D27]">
              <Plus className="size-4" aria-hidden="true" />Add product
            </Link>
            <SellerAccountMenu name={name} initials={initials} signOut={signOut} />
          </div>
          <button type="button" data-mobile-shortcut="menu" aria-label="Open seller menu" aria-haspopup="dialog"
            aria-controls={dialogId} onClick={() => dialog.current?.showModal()} className="grid size-11 shrink-0 place-items-center rounded-lg lg:hidden">
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <nav aria-label="Seller quick links" className="seller-mobile-tabs">
        {dailyLinks.map(({ id, label, icon: Icon }) => {
          const section = sellerWorkspaceSections.find(item => item.id === id);
          return <Link key={id} href={section?.href ?? productHref} data-mobile-shortcut={id}
            aria-label={id === 'add' ? label : undefined} aria-current={current?.id === id ? 'page' : undefined}>
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {id === 'add' ? <span className="sr-only">{label}</span> : <span>{label}</span>}
            {id === 'orders' && orderCount > 0 ? <span className="seller-mobile-count" aria-label={orderCount + ' orders to prepare'}>{orderCount}</span> : null}
          </Link>;
        })}
      </nav>
      <dialog ref={dialog} id={dialogId} className="seller-mobile-menu" aria-labelledby={titleId}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#14213D] text-sm font-semibold text-white" aria-hidden="true">{initials}</span>
            <div className="min-w-0"><p className="wrap-anywhere font-semibold">{name}</p><h2 id={titleId} className="text-xs font-semibold text-[#A8232E]">Seller Studio</h2></div>
          </div>
          <button type="button" aria-label="Close seller menu" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-lg">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <SwitchCustomer close={close} />
        <div className="mt-3 border-t pt-2"><WorkspaceLinks {...navigation} label="All seller pages" close={close} /></div>
        <div className="mt-3 border-t pt-2"><AccountActions signOut={signOut} close={close} /></div>
      </dialog>
    </div> : null}
    {mode !== 'toolbar' ? <div className="sticky top-0 flex max-h-dvh min-h-dvh flex-col gap-3 overflow-y-auto p-3">
      {desktopBrand ?? <Link href="/seller" className={linkClass}>Hastabazaar · Seller Studio</Link>}
      <div className="flex min-w-0 items-center gap-2.5 rounded-xl border bg-white p-2.5">
        {shopPhoto ?? <Store className="size-10 shrink-0 rounded-lg bg-[#F3ECDF] p-2.5 text-[#655848]" aria-hidden="true" />}
        <div className="min-w-0">
          <p className="wrap-anywhere text-sm font-semibold">{name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#465573]">
            <span aria-hidden="true" className={'size-2 shrink-0 rounded-full ' + (shopLive ? 'bg-[#236548]' : 'bg-[#A96D11]')} />
            {shopLive ? 'Shop is live' : 'Not live yet'}
          </p>
        </div>
      </div>
      <SwitchCustomer />
      <WorkspaceLinks {...navigation} label="Seller workspace" />
      <div className="mt-auto rounded-xl border bg-white px-3 pt-3">
        <p className="text-sm font-semibold">Stuck on something?</p>
        <Link href={sellerSupportHref} className="section-link"><CircleHelp className="size-4 shrink-0" aria-hidden="true" />Ask for help</Link>
      </div>
    </div> : null}
  </>;
}
