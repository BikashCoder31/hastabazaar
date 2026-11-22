'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- An editable combobox with linked results needs the ARIA listbox pattern. */

import Image from 'next/image';
import { Clock3, Package, Store, Tag } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import type { SearchSuggestion } from '@/lib/catalog/search-suggestions';

const recentKey = 'hastabazaar:recent-searches:v1';
const groups = ['Products', 'Categories & makers', 'Your recent searches'] as const;

type Choice = (SearchSuggestion | { kind: 'recent'; href: string; label: string }) & { group: typeof groups[number] };

function getRecent(): string[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
    return Array.isArray(entries)
      ? entries.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 100).slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

function remember(value: string) {
  const query = value.trim().slice(0, 100);
  if (!query) return;
  try {
    localStorage.setItem(recentKey, JSON.stringify([query, ...getRecent().filter(entry => entry.toLowerCase() !== query.toLowerCase())].slice(0, 4)));
  } catch {
    // Search still works if local storage is blocked.
  }
}

function choiceIcon(choice: Choice) {
  if (choice.kind === 'product' && choice.imageId) return (
    <Image src={`/api/product-media/${encodeURIComponent(choice.imageId)}`} alt="" width={36} height={36} data-media-mode="cover"
      className="size-9 rounded-md border bg-white object-cover" unoptimized />
  );
  const Icon = choice.kind === 'product' ? Package : choice.kind === 'category' ? Tag : choice.kind === 'maker' ? Store : Clock3;
  return <span className="inline-flex size-9 items-center justify-center rounded-md bg-secondary text-primary"><Icon className="size-4" aria-hidden="true" /></span>;
}

export function SearchSuggestionField({ id, label, placeholder, helpId, initialQuery = '', className }: {
  id: string;
  label: string;
  placeholder?: string;
  helpId?: string;
  initialQuery?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [engaged, setEngaged] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [result, setResult] = useState<{ query: string; rows: SearchSuggestion[] } | null>(null);
  const needle = query.trim();
  const suggestions = result?.query === needle ? result.rows : [];
  const options: Choice[] = [
    ...suggestions.map((item): Choice => ({ ...item, group: item.kind === 'product' ? 'Products' : 'Categories & makers' })),
    ...recent.filter(item => item.toLowerCase() !== needle.toLowerCase()).map((item): Choice => ({
      kind: 'recent', label: item, href: `/shop?${new URLSearchParams({ q: item })}`, group: 'Your recent searches',
    })),
  ];
  const open = engaged && options.length > 0;
  const listId = `${id}-suggestions`;

  useEffect(() => {
    const field = input.current;
    const form = field?.form;
    if (!field || !form) return;
    const saveQuery = () => remember(field.value);
    form.addEventListener('submit', saveQuery);
    return () => form.removeEventListener('submit', saveQuery);
  }, []);

  useEffect(() => {
    if (!engaged || needle.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?${new URLSearchParams({ q: needle })}`, { signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as { suggestions: SearchSuggestion[] };
        if (!controller.signal.aborted) setResult({ query: needle, rows: body.suggestions });
      } catch {
        // The native search submission remains available if suggestions fail.
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [engaged, needle]);

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId, open]);

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setEngaged(false);
      setActive(-1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      setEngaged(true);
      setActive(current => event.key === 'ArrowDown'
        ? (current + 1) % options.length
        : current <= 0 ? options.length - 1 : current - 1);
    } else if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault();
      const choice = options[active];
      remember(choice.kind === 'recent' ? choice.label : query);
      window.location.assign(choice.href);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Input ref={input} id={id} name="q" type="search" autoComplete="off" maxLength={100}
        role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined} aria-describedby={helpId}
        placeholder={placeholder} value={query} className={className}
        onFocus={() => { setRecent(getRecent()); setEngaged(true); }}
        onBlur={() => { setEngaged(false); setActive(-1); }}
        onChange={event => { setQuery(event.target.value); setEngaged(true); setActive(-1); }}
        onKeyDown={handleKeys} />
      {open ? (
        <div id={listId} role="listbox" aria-label="Search suggestions"
          className="absolute inset-x-0 top-full z-20 mt-3 max-h-[min(55dvh,26rem)] min-w-[min(15rem,75vw)] overflow-y-auto overscroll-contain rounded-2xl border border-[#e2d6c2] bg-[#fffdf9] p-2 text-sm text-[#14213d] shadow-lg">
          {groups.map(group => {
            const rows = options.map((choice, index) => ({ choice, index })).filter(({ choice }) => choice.group === group);
            return rows.length ? (
              <div key={group} role="group" aria-label={group} className="not-first:mt-2 not-first:border-t not-first:pt-2">
                <p aria-hidden="true" className="px-2 py-1 text-xs font-semibold text-[#675b4e]">{group}</p>
                {rows.map(({ choice, index }) => (
                  <a key={`${choice.kind}:${choice.href}`} id={`${listId}-${index}`} role="option" aria-selected={index === active}
                    href={choice.href} tabIndex={-1} onMouseDown={event => event.preventDefault()}
                    onClick={() => remember(choice.kind === 'recent' ? choice.label : query)}
                    className="flex min-h-11 items-center gap-2 rounded-lg p-1.5 text-left hover:bg-secondary aria-selected:bg-secondary aria-selected:ring-2 aria-selected:ring-inset aria-selected:ring-primary">
                    <span className="shrink-0" aria-hidden="true">{choiceIcon(choice)}</span>
                    <span className="min-w-0 wrap-break-word">{choice.label}{choice.kind === 'maker' ? <span className="text-muted-foreground"> · Maker</span> : null}</span>
                  </a>
                ))}
              </div>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
