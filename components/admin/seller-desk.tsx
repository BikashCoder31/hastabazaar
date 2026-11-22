'use client';

import { useEffect, useRef, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, FileCheck, MessageSquare, Package, Store, Wallet } from 'lucide-react';
import type { SellerDeskItem } from '@/lib/admin/seller-desk';
import { deskAge, deskFilters, deskHref, deskShortcut, visibleDeskItems, type DeskFilter } from './seller-desk-navigation';

const icons = { products: Package, applications: Store, documents: FileCheck, payouts: Wallet, questions: MessageSquare };
const tones = { products: 'bg-amber-100 text-amber-900', applications: 'bg-green-100 text-green-900', documents: 'bg-blue-100 text-blue-900', payouts: 'bg-red-100 text-red-900', questions: 'bg-secondary text-foreground' };
const runDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', day:'numeric', month:'short' });

export function SellerDesk({ items, doneToday, now, filter, selectedId, showDetail, returnTo, children }: {
  items: SellerDeskItem[]; doneToday: number; now: number; filter: DeskFilter; selectedId?: string;
  showDetail: boolean; returnTo?: string; children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLElement>(null);
  const list = visibleDeskItems(items, filter);
  const oldest = items.reduce((min, item) => Math.min(min, item.startedAt), now);
  const selectedIndex = list.findIndex(item => item.id === selectedId);
  const url = (id?: string, scope = filter) => deskHref(id, scope, returnTo);
  useEffect(() => {
    const rows = visibleDeskItems(items, filter);
    const open = (id?: string) => startTransition(() => router.replace(deskHref(id, filter, returnTo), {scroll:false}));
    const keydown = (event: KeyboardEvent) => {
      const key = deskShortcut(event);
      if (!key || pending || window.matchMedia('(max-width: 767px)').matches ||
        document.querySelector('dialog[open], [role="dialog"]:not([hidden])')) return;
      if (key === 'j' || key === 'k') {
        const next = rows[selectedIndex + (key === 'j' ? 1 : -1)];
        if (next) { event.preventDefault(); open(next.id); }
      } else {
        const button = panel.current?.querySelector<HTMLButtonElement>(key === 'a' ? '[data-desk-action="approve"]' : '[data-desk-action="change"]');
        if (button && !button.disabled && button.getClientRects().length) { event.preventDefault(); button.click(); }
      }
    };
    const decided = () => {
      const next = rows[selectedIndex + 1] ?? rows.find(row => row.id !== selectedId);
      // Re-read the queue and its audit count together after a confirmed server decision.
      window.location.replace(deskHref(next?.id, filter, returnTo));
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('seller-desk-decided', decided);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('seller-desk-decided', decided);
    };
  }, [filter, items, pending, returnTo, router, selectedId, selectedIndex]);

  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p aria-live="polite"><strong className="text-foreground">{items.length} waiting for you</strong>{items.length > 0 && <> · oldest {deskAge(oldest, now)}</>} · <strong className="text-green-800">{doneToday} done today</strong></p>
      <p className="hidden md:block"><kbd>J</kbd> / <kbd>K</kbd> move · <kbd>A</kbd> approve · <kbd>C</kbd> send back</p>
    </div>
    <div className="grid min-w-0 items-start gap-5 min-[1101px]:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.35fr)]">
      <section aria-label="Seller work" className={(showDetail ? 'hidden md:block ' : '') + 'min-w-0 overflow-hidden rounded-2xl border bg-card'}>
        <nav aria-label="Filter seller work" className="flex flex-wrap gap-1.5 p-3">
          {deskFilters.map(([value,label]) => <Link key={value} href={url(undefined,value)} prefetch={false} scroll={false} aria-current={filter === value ? 'page' : undefined}
            className={'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ' + (filter === value ? 'bg-foreground text-background' : 'hover:bg-secondary')}>
            {label} <span>{value === 'all' ? items.length : items.filter(item => item.group === value).length}</span>
          </Link>)}
        </nav>
        {list.map(item => {
          const Icon = icons[item.group];
          return <Link key={item.id} href={url(item.id)} prefetch={false} scroll={false} aria-current={item.id === selectedId ? 'true' : undefined}
            className={'grid min-h-16 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-3 hover:bg-secondary ' + (item.id === selectedId ? 'bg-secondary/70 shadow-[inset_3px_0_var(--primary)]' : '')}>
            <span className={'grid size-9 place-items-center rounded-xl ' + tones[item.group]}><Icon size={18} /></span>
            <span className="min-w-0 break-words"><span className="block text-xs text-muted-foreground">{item.kind}</span><strong className="block text-sm">{item.title}</strong><span className="text-xs text-muted-foreground">{item.sellerName}</span></span>
            <span className={'rounded-full px-2 py-1 text-xs font-semibold ' + (item.dueAt !== null && item.dueAt < now ? 'bg-red-100 text-red-900' : 'bg-muted text-muted-foreground')}>{item.runAt !== null ? 'Due ' + runDate.format(item.runAt) : deskAge(item.startedAt, now)}</span>
          </Link>;
        })}
        {!list.length && <div className="space-y-1 border-t p-7 text-center"><Check aria-hidden className="mx-auto size-5 text-green-800"/><strong>All clear</strong><p className="text-sm text-muted-foreground">No seller work is waiting in this view.</p></div>}
      </section>
      {selectedId && <section ref={panel} aria-label="Selected item" aria-busy={pending} className={(!showDetail ? 'hidden md:block ' : '') + 'min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5'}>
        <Link href={url()} scroll={false} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary md:hidden"><ArrowLeft size={17}/>Back to queue</Link>
        {children}
      </section>}
    </div>
  </div>;
}
