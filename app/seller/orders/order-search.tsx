'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SellerOrdersSearch({ status, initialQuery }: { status: string; initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function search() {
    const params = new URLSearchParams({ status });
    if (query.trim()) params.set('q', query.trim());
    router.push('/seller/orders?' + params);
  }

  return <search className="flex flex-wrap items-center gap-2" aria-label="Search your orders">
    <label className="relative block min-w-0 flex-1 md:max-w-sm">
      <span className="sr-only">Order number, product or customer</span>
      <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={query} maxLength={100} placeholder="Order, product or customer"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            search();
          }
        }}
        className="min-h-11 w-full rounded-lg border bg-card pr-3 pl-9 text-sm" />
    </label>
    <button type="button" onClick={search} className="inline-flex min-h-11 items-center rounded-lg border bg-card px-3 text-sm font-semibold">Search</button>
  </search>;
}
