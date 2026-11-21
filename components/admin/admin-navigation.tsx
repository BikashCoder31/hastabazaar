'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef } from 'react';
import {
  ChartNoAxesCombined, ChevronDown, House, Menu,
  MessageCircle, Package, Percent, ReceiptText, Search, SlidersHorizontal,
  Store, Wallet, X,
} from 'lucide-react';
import { mediaObjectClass } from '@/lib/media/responsive-media';
import { activeAdminSection, adminSections, type AdminSectionId, type AdminStaffAccess } from './admin-sections';

const icons = {
  today: House, orders: ReceiptText, care: MessageCircle, sellers: Store,
  catalog: Package, money: Wallet, growth: Percent, reports: ChartNoAxesCombined, settings: SlidersHorizontal,
};
const mobileSections: readonly AdminSectionId[] = ['today', 'orders', 'sellers', 'money'];

export type AdminNavigationCounts = Partial<Record<AdminSectionId, { value: number; label: string }>> & { bankTransfers?: number };

function useAdminSections({ role, permissions }: AdminStaffAccess) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sections = adminSections(role, permissions);
  return { sections, active: activeAdminSection(sections, pathname, params)?.section };
}

type AdminNavProps = AdminStaffAccess & { counts: AdminNavigationCounts };
type AdminAccountProps = { name: string; role: AdminStaffAccess['role']; signOut: string; procedure?: string };

function SectionLink({ section, active, counts, onClick, compact = false }: {
  section: ReturnType<typeof adminSections>[number];
  active: boolean;
  counts: AdminNavigationCounts;
  onClick?: () => void;
  compact?: boolean;
}) {
  const { id, label, tabs } = section;
  const Icon = icons[id];
  const count = counts[id];
  return <Link href={tabs[0].href} aria-current={active ? 'location' : undefined}
    className={compact ? undefined : 'admin-hub-link'} onClick={onClick}>
    <Icon className="size-[18px] shrink-0" aria-hidden="true" />
    <span className="min-w-0 whitespace-normal">{label}</span>
    {count ? <span className="admin-nav-count" title={count.label} aria-label={count.value + ' ' + count.label}>{count.value}</span> : null}
  </Link>;
}

export function AdminNavigation({ counts, ...access }: AdminNavProps) {
  const { sections, active } = useAdminSections(access);
  return <nav aria-label="Admin sections" className="hidden space-y-1 lg:block">
    {sections.map(section => <SectionLink key={section.id} section={section} active={active?.id === section.id} counts={counts} />)}
  </nav>;
}

export function AdminMobileNavigation({ counts, account, ...access }: AdminNavProps & { account: AdminAccountProps }) {
  const { sections, active } = useAdminSections(access);
  const mobile = sections.filter(section => mobileSections.includes(section.id));
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const open = () => { if (!dialog.current?.open) dialog.current?.showModal(); };
  const close = () => dialog.current?.close();

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeAtDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener('change', closeAtDesktop);
    return () => desktop.removeEventListener('change', closeAtDesktop);
  }, []);

  return <div className="lg:hidden">
    <button type="button" onClick={open} className="admin-toolbar-icon" aria-label="Open admin menu"
      aria-haspopup="dialog" aria-controls={dialogId}><Menu className="size-5" aria-hidden="true" /></button>
    <nav aria-label="Admin quick links" className="admin-mobile-nav md:hidden">
      {mobile.map(section => <SectionLink key={section.id} section={section} active={active?.id === section.id} counts={counts} compact />)}
      <button type="button" onClick={open} aria-haspopup="dialog" aria-controls={dialogId}
        aria-current={active && !mobileSections.includes(active.id) ? 'location' : undefined}>
        <Menu className="size-[18px]" aria-hidden="true" />More
      </button>
    </nav>
    <dialog ref={dialog} id={dialogId} className="admin-mobile-menu" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-heading text-2xl font-semibold">Operations</h2>
        <button type="button" onClick={close} className="admin-toolbar-icon" aria-label="Close admin menu">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="All admin sections" className="my-4 grid gap-1">
        {sections.map(section => <SectionLink key={section.id} section={section} active={active?.id === section.id} counts={counts} onClick={close} />)}
      </nav>
      <AdminAccountMenu {...account} />
    </dialog>
  </div>;
}

export function AdminBrandMark() {
  return <Image src="/brand/hastabazaar-mark-96.png" alt="" width={32} height={32} sizes="32px" priority
    data-media-mode="contain" className={mediaObjectClass('contain', 'media-shrink size-8 shrink-0 rounded-md')} />;
}

export function AdminBrand({ mobile = false, ...props }: AdminStaffAccess & { mobile?: boolean }) {
  const { sections, active } = useAdminSections(props);
  return <Link href={sections[0]?.tabs[0].href ?? '/admin'} className={mobile ? 'admin-brand admin-brand-mobile' : 'admin-brand'} aria-label={mobile ? undefined : 'Hastabazaar Operations'}>
    <AdminBrandMark />
    {mobile ? <span className="min-w-0"><span className="block font-bold leading-tight">{active?.label ?? 'Hastabazaar'}</span>
        <span className="block text-xs font-semibold text-[#ecc264]">Operations</span></span>
      : <span className="min-w-0"><span className="block font-heading text-lg font-semibold leading-none">Hastabazaar</span>
        <span className="text-xs font-semibold text-[#ecc264]">Operations</span></span>}
  </Link>;
}

export function AdminSearch() {
  const label = 'Jump to an order, seller, phone or setting…';
  return <button type="button" data-admin-command-search className="admin-search-trigger"
    aria-haspopup="dialog" aria-label={label}>
    <Search className="size-4 shrink-0" aria-hidden="true" />
    <span className="hidden min-w-0 flex-1 text-left lg:block">{label}</span>
    <kbd className="hidden rounded border px-1.5 text-xs lg:block">⌘K</kbd>
  </button>;
}

export function AdminAccountMenu({ name, role, signOut, procedure }: AdminAccountProps) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  return <details className="admin-account group">
    <summary>
      <span className="admin-avatar" aria-hidden="true">{initials}</span>
      <span className="min-w-0 flex-1"><strong className="block font-semibold">{name}</strong><span className="block opacity-75">{role === 'super_admin' ? 'Super Admin' : 'Admin'}</span></span>
      <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="admin-account-panel">
      <Link href="/shop">Open marketplace</Link>
      {procedure ? <Link href={procedure}>Staff procedure</Link> : null}
      <form data-form-id="identity.logout" method="POST" action={signOut} target="_top">
        <button type="submit">Sign out</button>
      </form>
    </div>
  </details>;
}
