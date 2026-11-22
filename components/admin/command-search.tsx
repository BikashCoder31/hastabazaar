'use client';

// A custom combobox keeps each result's destination and description in the option.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FileText, ReceiptText, Search, SlidersHorizontal, Store, Truck, UserRound, Wallet } from 'lucide-react';
import type { SearchGroup, SearchResult } from '@/app/api/admin/search/results';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

const groupIcons = {
  Actions: Truck, Orders: ReceiptText, Sellers: Store, Payouts: Wallet,
  Customers: UserRound, Settings: SlidersHorizontal, Pages: FileText,
} satisfies Record<SearchGroup, typeof Search>;

const keyClass = 'inline-flex min-h-5 min-w-5 items-center justify-center rounded-md border border-[#CFBEA6] bg-[#FCF9F3] px-1.5 font-mono text-xs leading-none';
const listId = 'admin-command-search-results';
const optionId = (index: number) => 'admin-command-search-option-' + index;

type SearchResponse = {
  query: string;
  actorId: string;
  results: SearchResult[];
  failed?: boolean;
};

export function CommandSearch({ actorId }: { actorId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const openOnResponse = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<number | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const router = useRouter();
  const term = query.trim();
  const data = response?.query === term && response.actorId === actorId ? response : null;
  const results = data?.results ?? [];
  const selected = results.length ? Math.min(selection ?? 0, results.length - 1) : -1;

  const navigate = useCallback((result: SearchResult) => {
    dialog.current?.close();
    router.push(result.href);
  }, [router]);

  useEffect(() => {
    const modal = dialog.current;
    function show() {
      if (!modal) return;
      if (!modal.open) modal.showModal();
      setOpen(true);
      input.current?.focus();
    }
    function shortcut(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      show();
    }
    function triggerClick(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('[data-admin-command-search]')) show();
    }
    function backdropClick(event: MouseEvent) {
      if (event.target === modal) modal?.close();
    }
    window.addEventListener('keydown', shortcut);
    document.addEventListener('click', triggerClick);
    modal?.addEventListener('click', backdropClick);
    return () => {
      window.removeEventListener('keydown', shortcut);
      document.removeEventListener('click', triggerClick);
      modal?.removeEventListener('click', backdropClick);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: term });
        const search = await fetch('/api/admin/search?' + params, {
          headers: { [ACTOR_INTENT_HEADER]: actorId },
          cache: 'no-store', signal: controller.signal,
        });
        if (!search.ok) throw new Error('Search unavailable');
        const payload = await search.json() as { results: SearchResult[] };
        if (controller.signal.aborted) return;
        setResponse({ query: term, actorId, results: payload.results });
        if (openOnResponse.current === term) {
          openOnResponse.current = null;
          if (payload.results[0]) navigate(payload.results[0]);
        }
      } catch {
        if (!controller.signal.aborted) {
          openOnResponse.current = null;
          setResponse({ query: term, actorId, results: [], failed: true });
        }
      }
    }, term ? 150 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, term, actorId, navigate]);

  function dismiss() {
    openOnResponse.current = null;
    setOpen(false);
    setQuery('');
    setSelection(null);
    setResponse(null);
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (selected >= 0) navigate(results[selected]);
      else if (!data && term) openOnResponse.current = term;
      return;
    }
    if (!results.length) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const next = (selected + direction + results.length) % results.length;
    setSelection(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
  }

  const groups = new Map<SearchGroup, { result: SearchResult; index: number }[]>();
  results.forEach((result, index) => {
    const rows = groups.get(result.group) ?? [];
    if (!groups.has(result.group)) groups.set(result.group, rows);
    rows.push({ result, index });
  });

  return (
    <dialog
      ref={dialog}
      id="admin-command-search"
      aria-label="Search everything"
      aria-modal="true"
      onClose={dismiss}
      className="inset-x-0 top-20 bottom-auto mx-auto max-h-[calc(100dvh-6rem)] w-[calc(100%-2rem)] max-w-[40rem] flex-col overflow-hidden rounded-2xl bg-white p-0 font-['Instrument_Sans',sans-serif] text-[#14213D] shadow-[0_30px_70px_-30px_#14213D99] open:flex backdrop:bg-[#14213D]/40"
    >
      <search className="flex shrink-0 items-center gap-2 border-b border-[#E4DACA] px-[18px]">
        <Search className="size-4 shrink-0 text-[#675B4E]" aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="Search everything"
          aria-expanded={Boolean(results.length)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={selected >= 0 ? optionId(selected) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={120}
          placeholder="Order, seller, customer, phone or setting"
          value={query}
          onKeyDown={handleSearchKey}
          onChange={event => {
            openOnResponse.current = null;
            if (event.currentTarget.value.trim() !== term) {
              setSelection(null);
              setResponse(null);
            }
            setQuery(event.currentTarget.value);
          }}
          className="my-1.5 min-h-11 min-w-0 flex-1 rounded-[10px] px-1 text-base text-[#14213D] outline-none placeholder:text-[#675B4E] focus:ring-2 focus:ring-inset focus:ring-[#14213D] md:text-[17px]"
        />
        <button type="button" className="-mr-1 grid size-11 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-[#A8232E]" aria-label="Close search" onClick={() => dialog.current?.close()}>
          <kbd className={keyClass + ' text-[#675B4E]'}>esc</kbd>
        </button>
      </search>
      <div className="max-h-[460px] min-h-0 overflow-y-auto overscroll-contain pb-2">
        <div id={listId} role="listbox" aria-label="Search results" aria-busy={!data}>
          {[...groups].map(([group, rows]) => (
            <div key={group} role="group" aria-label={group}>
              <div aria-hidden="true" className="px-[18px] pt-2.5 pb-1 text-xs font-semibold text-[#675B4E]">{group}</div>
              {rows.map(({ result, index }) => {
                const Icon = group === 'Actions' && result.href === '/admin/payouts/run' ? Wallet : groupIcons[group];
                const active = index === selected;
                return (
                  <Link
                    key={result.href}
                    id={optionId(index)}
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    href={result.href}
                    prefetch={false}
                    onClick={() => dialog.current?.close()}
                    onPointerMove={event => { if (event.pointerType === 'mouse') setSelection(index); }}
                    className={'flex min-h-11 items-center gap-3 px-[18px] py-2.5 text-[0.90625rem] focus:outline-none ' + (active ? 'bg-[#F3EDE2]' : '')}
                  >
                    <Icon className="size-4 shrink-0 text-[#46536F]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      <span className="block font-semibold leading-snug">{result.title}</span>
                      {result.detail ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-[#46536F]">{result.detail}</span> : null}
                    </span>
                    {active ? <span className="hidden shrink-0 whitespace-nowrap text-xs text-[#675B4E] min-[390px]:inline" aria-hidden="true">↵ open</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        {!results.length ? <output className="block px-[18px] py-7 text-center text-sm text-[#46536F] [overflow-wrap:anywhere]">
          {!data ? 'Searching…' : data.failed ? 'Search could not load. Reopen search to try again.'
            : term ? <>Nothing matches “{term}”. Try an order number, name or setting.</>
              : 'No destinations are available.'}
        </output> : null}
      </div>
      <div aria-hidden="true" className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-[#E4DACA] px-[18px] py-2.5 text-[0.78125rem] text-[#675B4E]">
        <span className="flex items-center gap-1"><kbd className={keyClass}>↑</kbd><kbd className={keyClass}>↓</kbd> move</span>
        <span className="flex items-center gap-1"><kbd className={keyClass}>↵</kbd> open</span>
        <span className="flex items-center gap-1"><kbd className={keyClass}>esc</kbd> close</span>
      </div>
    </dialog>
  );
}
