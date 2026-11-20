'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

const tabs = [
  ['overview', 'Overview'],
  ['parcel-cash', 'Parcel & cash'],
  ['money', 'Money'],
  ['records', 'Records'],
] as const;

type OrderTab = (typeof tabs)[number][0];

const targets: Record<string, OrderTab> = {
  overview: 'overview',
  customer: 'overview',
  seller: 'overview',
  'parcel-cash': 'parcel-cash',
  courier: 'parcel-cash',
  exceptions: 'parcel-cash',
  'order-preparation': 'parcel-cash',
  'order-actions': 'parcel-cash',
  'confirm-cod': 'parcel-cash',
  money: 'money',
  records: 'records',
  'invoice-records': 'records',
  'cancellation-records': 'records',
};

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

export function OrderDetailTabs({
  defaultTab,
  panels,
}: {
  defaultTab: OrderTab;
  panels: Record<OrderTab, ReactNode>;
}) {
  const target = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => '',
  );
  const active = Object.hasOwn(targets, target) ? targets[target] : defaultTab;

  useEffect(() => {
    if (Object.hasOwn(targets, target))
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [target]);

  return (
    <div className="min-w-0 space-y-4">
      <nav
        aria-label="Order sections"
        className="grid grid-cols-[1fr_1.4fr_.8fr_.9fr] border-b border-[#E4DACA] sm:flex"
      >
        {tabs.map(([id, label]) => (
          <a
            key={id}
            href={'#' + id}
            aria-current={active === id ? 'location' : undefined}
            className={
              'relative inline-flex min-h-11 scroll-mt-20 items-center justify-center px-2 py-2 text-center text-sm sm:px-4 ' +
              (active === id
                ? 'font-semibold text-[#14213D] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#A8232E]'
                : 'text-[#46536F] hover:text-[#14213D]')
            }
          >
            {label}
          </a>
        ))}
      </nav>
      <div id={active} className="min-w-0 scroll-mt-20">
        {panels[active]}
      </div>
    </div>
  );
}

export function OrderMore({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      const menu = details.current;
      if (
        menu?.open &&
        event.target instanceof Element &&
        (!menu.contains(event.target) || event.target.closest('a'))
      )
        menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false;
        details.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <details ref={details} className="relative">
      <summary
        className={
          className +
          ' cursor-pointer list-none [&::-webkit-details-marker]:hidden'
        }
      >
        More <ChevronDown className="size-4" aria-hidden="true" />
      </summary>
      <ul className="absolute left-0 z-20 mt-2 w-52 max-w-[min(13rem,calc(100vw-2rem))] rounded-xl border bg-card p-1 text-sm shadow-lg md:left-auto md:right-0">
        {children}
      </ul>
    </details>
  );
}
