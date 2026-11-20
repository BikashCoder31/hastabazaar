'use client';

import { Download, ListFilter, RefreshCw, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  payoutAmount, payoutDate, payoutMonthLabel, payoutStageDetails, payoutStages,
  type PayoutBoardRow, type PayoutFilters, type PayoutStage,
} from '@/app/admin/payouts/workspace-data';

const button = 'admin-button shrink-0';
const field = 'block min-h-11 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm';
const tones: Record<string, string> = {
  Ready: 'bg-[#F8DEDB] text-[#A8232E]',
  'Needs review': 'bg-[#F5E7C7] text-[#754B08]',
  'Instruction in progress': 'bg-[#E2EAF7] text-[#284788]',
  Paid: 'bg-[#DFECE4] text-[#236548]',
};

export function PayoutBadge({ label }: { label: string }) {
  return <span className={cn('inline-block max-w-full break-words rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[label] ?? 'bg-secondary text-foreground')}>{label}</span>;
}

function FilterMenu({ filters, sellers, months, onApply }: {
  filters: PayoutFilters;
  sellers: readonly { id: string; name: string }[];
  months: readonly string[];
  onApply: (filters: PayoutFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  return (
    <Popover open={open} onOpenChange={next => { if (next) setDraft(filters); setOpen(next); }}>
      <PopoverTrigger className={button} type="button"><ListFilter className="size-4" aria-hidden="true" /> Filters</PopoverTrigger>
      <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] border border-[#E3D8C7] bg-white p-4 text-[#14213D]">
        <PopoverTitle>Filter payouts</PopoverTitle>
        <fieldset className="grid min-w-0 gap-3">
          <legend className="sr-only">Payout filter options</legend>
          <label className="grid gap-1">Seller
            <select className={field} value={draft.seller} onChange={event => setDraft({ ...draft, seller: event.target.value })}>
              <option value="">All sellers</option>
              {sellers.map(seller => <option value={seller.id} key={seller.id}>{seller.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Month
            <select className={field} value={draft.month} onChange={event => setDraft({ ...draft, month: event.target.value })}>
              <option value="">All months</option>
              {months.map(month => <option key={month} value={month}>{payoutMonthLabel(month)}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Minimum amount (NPR)
            <input className={field} type="number" min="0" max="999999999.99" step="0.01" value={draft.minimum}
              onChange={event => setDraft({ ...draft, minimum: event.target.value })}
              onKeyDown={event => {
                if (event.key === 'Enter' && event.currentTarget.reportValidity()) {
                  onApply(draft);
                  setOpen(false);
                }
              }} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="min-h-11 rounded-lg border border-[#CDBFA9] px-3 font-semibold hover:bg-[#F0EBE1]" onClick={() => { onApply({ ...draft, seller: '', month: '', minimum: '' }); setOpen(false); }}>Clear</button>
            <button className="min-h-11 rounded-lg bg-[#14213D] px-3 font-semibold text-white disabled:opacity-50" type="button" disabled={Boolean(draft.minimum && !/^\d{1,9}(?:\.\d{1,2})?$/.test(draft.minimum))}
              onClick={() => { onApply(draft); setOpen(false); }}>Show payouts</button>
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

function exportPayouts(rows: readonly PayoutBoardRow[]) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv = [
    ['Reference', 'Seller', 'Status', 'Amount (NPR)', 'Date'],
    ...rows.map(row => [row.reference, row.sellerName, row.badge, (row.amountPaisa / 100).toFixed(2), row.at ? payoutDate(row.at, true) : '']),
  ].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'payouts.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function PayoutWorkspace({ stage, selected, filters, sellers, months, metrics, rows, approvedRows, baseQuery, observedAt, holdDays, detail }: {
  stage: PayoutStage;
  selected: string | null;
  filters: PayoutFilters;
  sellers: readonly { id: string; name: string }[];
  months: readonly string[];
  metrics: Record<PayoutStage, { count: number; total: number }>;
  rows: readonly PayoutBoardRow[];
  approvedRows: readonly PayoutBoardRow[];
  baseQuery: string;
  observedAt: number;
  holdDays: number;
  detail: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [clock, setClock] = useState(observedAt);
  const searchTimer = useRef<number | undefined>(undefined);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const refreshAge = Math.max(0, Math.floor((clock - observedAt) / 1000));
  const ageLabel = refreshAge < 1 ? 'just now' : refreshAge < 60 ? `${refreshAge} s ago` : `${Math.floor(refreshAge / 60)} min ago`;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshButton.current?.click();
    }, 60_000);
    function restoreSearch() {
      window.clearTimeout(searchTimer.current);
      setSearch(new URL(window.location.href).searchParams.get('q') ?? '');
    }
    window.addEventListener('popstate', restoreSearch);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.clearTimeout(searchTimer.current);
      window.removeEventListener('popstate', restoreSearch);
    };
  }, []);

  function show(nextFilters: PayoutFilters, nextStage: PayoutStage, nextSelected?: string) {
    window.clearTimeout(searchTimer.current);
    const query = new URLSearchParams(baseQuery);
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value.trim()) query.set(key, value.trim());
    }
    query.set('stage', nextStage);
    if (nextSelected) query.set('selected', nextSelected);
    startTransition(() => router.replace('/admin/payouts?' + query, { scroll: false }));
  }

  const hints = {
    earning: holdDays ? `Earnings held for ${holdDays} ${holdDays === 1 ? 'day' : 'days'} after delivery` : 'No delivery hold is configured',
    ready: 'Seller asked to be paid',
    sent: 'Bank instructions in progress',
    paid: 'Paid out this month',
  };
  const activeFilters = [
    { key: 'seller', label: sellers.find(seller => seller.id === filters.seller)?.name ?? 'Selected seller' },
    { key: 'month', label: filters.month ? payoutMonthLabel(filters.month) : '' },
    { key: 'minimum', label: filters.minimum ? 'From ' + payoutAmount(Math.round(Number(filters.minimum) * 100)) : '' },
  ] as const;
  const allVisible = [...rows, ...approvedRows];

  const renderRow = (row: PayoutBoardRow) => (
    <button key={row.id} type="button" aria-pressed={row.id === selected}
      onClick={() => show({ ...filters, q: search }, stage, row.id)}
      className={cn('grid min-w-0 gap-1.5 rounded-xl border border-border bg-[#FFFCF7] p-3.5 text-left hover:border-foreground', row.id === selected && 'border-foreground bg-white ring-1 ring-foreground')}>
      <span className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="break-all font-mono text-xs font-bold">{row.reference}</span>
        <PayoutBadge label={row.badge} />
      </span>
      <span className="break-words font-semibold">{row.sellerName}</span>
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {row.at === null ? <span>Unrequested</span> : <span>{row.status === 'submitted' ? 'Asked ' : ''}{payoutDate(row.at)}</span>}
        <strong className="tabular-nums text-foreground">{payoutAmount(row.amountPaisa)}</strong>
      </span>
    </button>
  );

  return (
    <div className="space-y-[18px]" aria-busy={pending}>
      <div className="relative flex flex-wrap items-center gap-2.5 pb-1" aria-label="Payout filters">
        <search className="w-full max-w-80 md:w-80">
          <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-input bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-[#675B4E]" aria-hidden="true" />
            <input className="w-full min-w-0 bg-transparent py-2 outline-none" aria-label="Search payouts"
              placeholder="Seller or payout number" type="search" value={search} maxLength={100}
              onKeyDown={event => { if (event.key === 'Enter') show({ ...filters, q: search }, stage); }}
              onChange={event => {
                const q = event.target.value;
                setSearch(q);
                window.clearTimeout(searchTimer.current);
                searchTimer.current = window.setTimeout(() => show({ ...filters, q }, stage), 300);
              }} />
          </label>
        </search>
        <FilterMenu filters={filters} sellers={sellers} months={months} onApply={next => show({ ...next, q: search }, stage)} />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {activeFilters.map(({ key, label }) => filters[key] ? (
            <button key={key} className="min-h-11 max-w-full rounded-full px-2.5 text-sm font-semibold hover:bg-secondary"
              aria-label={`Remove ${key} filter`} type="button" onClick={() => show({ ...filters, q: search, [key]: '' }, stage)}>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1">
                <span className="min-w-0 break-words">{label}</span><X className="size-3.5 shrink-0" aria-hidden="true" />
              </span>
            </button>
          ) : null)}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button ref={refreshButton} type="button" aria-label="Refresh payouts" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => startTransition(() => router.refresh())} disabled={pending}>
            <RefreshCw className={cn('size-4', pending && 'motion-safe:animate-spin')} aria-hidden="true" />
            {pending ? 'Refreshing…' : 'Updated ' + ageLabel}
          </button>
          <button className={button} type="button" disabled={!allVisible.length} onClick={() => exportPayouts(allVisible)}>
            <Download className="size-4" aria-hidden="true" /> Export
          </button>
        </div>
        {pending ? <progress className="absolute inset-x-0 -bottom-1 h-0.5 w-full appearance-none rounded bg-[#A8232E] [&::-webkit-progress-bar]:bg-[#A8232E]" aria-label="Refreshing payouts" /> : null}
      </div>
      <fieldset className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
        <legend className="sr-only">Payout stages</legend>
        {payoutStages.map(item => (
          <button key={item.id} type="button" aria-pressed={stage === item.id}
            onClick={() => show({ ...filters, q: search }, item.id)}
            className={cn('flex min-h-[7.75rem] min-w-0 flex-col gap-1 rounded-2xl border border-border bg-white px-3 py-3.5 text-left hover:border-foreground xl:px-4', stage === item.id && 'border-foreground shadow-sm ring-1 ring-foreground')}>
            <span className="mb-2 h-1 w-full shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="flex w-full items-start justify-between gap-1.5 text-sm leading-tight font-bold">
              <span>{item.label}</span><span style={{ color: item.color }} className="tabular-nums">{metrics[item.id].count}</span>
            </span>
            <span className="max-w-full break-words font-heading text-[clamp(1.15rem,2.75vw,1.55rem)] leading-tight tracking-tight tabular-nums">{payoutAmount(metrics[item.id].total)}</span>
            <span className="text-xs leading-relaxed text-[#675B4E]">{hints[item.id]}</span>
          </button>
        ))}
      </fieldset>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <section className="grid min-w-0 gap-2" aria-label="Payouts in this stage">
          <h2 className="px-0.5 text-sm text-muted-foreground">{payoutStageDetails[stage]}</h2>
          {rows.map(renderRow)}
          {approvedRows.length ? (
            <div className="grid gap-2 pt-2">
              <h3 className="px-0.5 text-sm text-muted-foreground">Approved and ready for the bank</h3>
              {approvedRows.map(renderRow)}
            </div>
          ) : null}
          {!allVisible.length ? (
            <div className="space-y-1 rounded-xl border border-dashed border-input p-5 text-center">
              <p className="break-words font-semibold">{filters.q ? `No payouts match “${filters.q}”` : 'No payouts in this stage'}</p>
              <p className="text-sm text-muted-foreground">{Object.values(filters).some(Boolean) ? 'Try another seller or payout number, or clear the filters.' : 'Choose another stage to see its payouts.'}</p>
            </div>
          ) : null}
        </section>
        {detail}
      </div>
    </div>
  );
}
