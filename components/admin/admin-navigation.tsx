'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, ChevronDown, House, Menu,
  MessageCircle, Package, Percent, ReceiptText, Search, SlidersHorizontal,
  Store, Wallet,
} from 'lucide-react';
import { adminNavigation } from '@/lib/admin/navigation';
import { mediaObjectClass } from '@/lib/media/responsive-media';
import { activeAdminSection, adminSections, type AdminSectionId, type AdminStaffAccess } from './admin-sections';

const icons = {
  today: House, orders: ReceiptText, care: MessageCircle, sellers: Store,
  catalog: Package, money: Wallet, growth: Percent, reports: ChartNoAxesCombined, settings: SlidersHorizontal,
};
const mobileSections: readonly AdminSectionId[] = ['today', 'orders', 'sellers', 'money'];

export type AdminNavigationCounts = Partial<Record<AdminSectionId, { value: number; label: string }>>;

function useAdminSections({ role, permissions }: AdminStaffAccess) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sections = adminSections(role, permissions);
  return { sections, active: activeAdminSection(sections, pathname, params)?.section };
}

export function AdminNavigation({ counts, ...access }: AdminStaffAccess & { counts: AdminNavigationCounts }) {
  const { sections, active } = useAdminSections(access);
  const mobile = sections.filter(section => mobileSections.includes(section.id));
  const extra = sections.filter(section => !mobileSections.includes(section.id));
  const more = useRef<HTMLDetailsElement>(null);

  function sectionLink(section: typeof sections[number], mobileLink = false) {
    const { id, label, tabs } = section;
    const Icon = icons[id];
    const count = counts[id];
    return (
      <Link key={id} href={tabs[0].href} aria-current={active?.id === id ? 'location' : undefined}
        className={mobileLink ? undefined : 'admin-hub-link'} onClick={() => { if (more.current) more.current.open = false; }}>
        <span className="relative shrink-0">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 whitespace-normal">{label}</span>
        {count ? <span className="admin-nav-count" title={count.label} aria-label={count.value + ' ' + count.label}>{count.value}</span> : null}
      </Link>
    );
  }

  return (
    <>
      <nav aria-label="Admin sections" className="hidden space-y-1 lg:block">
        {sections.map(section => sectionLink(section))}
      </nav>
      <div className="admin-mobile-nav lg:hidden">
        <nav aria-label="Admin quick links" className="flex items-stretch justify-around">
          {mobile.map(section => sectionLink(section, true))}
          {extra.length ? <details ref={more}>
            <summary><Menu className="size-[18px]" aria-hidden="true" />More</summary>
            <div className="admin-mobile-menu">
              <nav aria-label="More admin sections">
                {extra.map(section => sectionLink(section, true))}
              </nav>
            </div>
          </details> : null}
        </nav>
      </div>
    </>
  );
}

export function AdminBrand({ mobile = false, ...props }: AdminStaffAccess & { mobile?: boolean }) {
  const { sections, active } = useAdminSections(props);
  return <Link href={sections[0]?.tabs[0].href ?? '/admin'} className={mobile ? 'admin-brand admin-brand-mobile' : 'admin-brand'} aria-label={mobile ? undefined : 'Hastabazaar Operations'}>
    <Image src="/brand/hastabazaar-mark-96.png" alt="" width={32} height={32} sizes="32px"
      data-media-mode="contain" className={mediaObjectClass('contain', 'media-shrink size-8 shrink-0 rounded-md')} />
    {mobile ? <span className="font-heading text-xl font-semibold">{active?.label ?? 'Operations'}</span>
      : <span className="min-w-0"><span className="block font-heading text-lg font-semibold leading-none">Hastabazaar</span>
        <span className="text-xs font-semibold text-[#ecc264]">Operations</span></span>}
  </Link>;
}

type SettingSearchItem = { key: string; label: string; description: string };

export function AdminSearch({ role, permissions, settings }: AdminStaffAccess & { settings: readonly SettingSearchItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const open = () => {
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      open();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const term = query.trim();
  const destinations = adminNavigation(role, permissions);
  const matching = new Map([
    ...adminNavigation(role, permissions, query).filter(({ href }) => href !== '/admin/riders')
      .map(({ href, label }) => [href, label] as const),
    ...adminSections(role, permissions).flatMap(section => section.tabs
      .flatMap(tab => [tab, ...tab.related])
      .filter(({ label }) => (section.label + ' ' + label).toLowerCase().includes(term.toLowerCase()))
      .map(({ href, label }) => [href, label] as const)),
  ]);
  const searches = [
    ['/admin/orders', 'Search orders', { q: term }],
    ['/admin/sellers', 'Search sellers', { q: term, workspace: 'directory' }],
    ['/admin', 'Search review tasks', { workspace: 'reviews', reviewQ: term, reviewView: 'all' }],
  ] as const;
  const settingMatches = term ? settings.filter(({ key, label, description }) =>
    term.toLowerCase().split(/\s+/).every(word => (key.replaceAll('_', ' ') + ' ' + label + ' ' + description).toLowerCase().includes(word)),
  ).slice(0, 8) : [];
  const label = 'Jump to an order, seller, phone or setting…';
  return <>
    <button type="button" onClick={open} className="admin-search-trigger" aria-haspopup="dialog" aria-label={label}>
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden min-w-0 flex-1 text-left sm:block">{label}</span>
      <kbd className="hidden rounded border px-1.5 text-xs sm:block">⌘K</kbd>
    </button>
    <dialog ref={dialog} className="admin-search-dialog" aria-labelledby="admin-search-title" onClose={() => setQuery('')}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="admin-search-title" className="font-heading text-xl">Jump to anything</h2>
        <button type="button" className="admin-button" onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <input ref={input} type="search" aria-label="Find a task" placeholder="Order, seller, phone or setting"
        className="my-3 w-full rounded-lg border bg-card px-3 py-2" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} />
      <ul className="divide-y">
        {term && searches.filter(([href]) => destinations.some(item => item.href === href)).map(([href, label, params]) => (
          <li key={href}><Link className="admin-search-result" href={href + '?' + new URLSearchParams(Object.entries(params))}
            onClick={() => dialog.current?.close()}><span>{label} for “{term}”</span><ArrowDownRight className="size-4 shrink-0" /></Link></li>
        ))}
        {settingMatches.map(({ key, label }) => <li key={key}>
          <Link className="admin-search-result" href={'/admin/business-settings?' + new URLSearchParams({ setting: key })} onClick={() => dialog.current?.close()}>
            <span>{label}</span><ArrowUpRight className="size-4 shrink-0" />
          </Link>
        </li>)}
        {[...matching].map(([href, label]) => <li key={href}><Link className="admin-search-result" href={href} onClick={() => dialog.current?.close()}>
          <span>{label}</span><ArrowUpRight className="size-4 shrink-0" /></Link></li>)}
      </ul>
    </dialog>
  </>;
}

export function AdminAccountMenu({ name, role, signOut, procedure }: { name: string; role: AdminStaffAccess['role']; signOut: string; procedure?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  return <details className="admin-account group">
    <summary>
      <span className="admin-avatar" aria-hidden="true">{initials}</span>
      <span className="sr-only lg:not-sr-only lg:min-w-0 lg:flex-1"><strong className="block font-semibold">{name}</strong><span className="block opacity-75">{role === 'super_admin' ? 'Super Admin' : 'Admin'}</span></span>
      <ChevronDown className="hidden size-4 shrink-0 group-open:rotate-180 lg:block" aria-hidden="true" />
    </summary>
    <div className="admin-account-panel">
      <p className="border-b p-3 font-semibold lg:hidden">{name}<span className="block text-xs font-normal">{role === 'super_admin' ? 'Super Admin' : 'Admin'}</span></p>
      <Link href="/shop">Open marketplace</Link>
      {procedure ? <Link href={procedure}>Staff procedure</Link> : null}
      <form data-form-id="identity.logout" method="POST" action={signOut} target="_top">
        <button type="submit">Sign out</button>
      </form>
    </div>
  </details>;
}
