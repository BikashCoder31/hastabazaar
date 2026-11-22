'use client';

import { Download, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type SyntheticEvent,
  type ReactNode,
} from 'react';

function csvCell(value: string | number) {
  let text = String(value);
  if (
    typeof value === 'string' &&
    (/^[=+\-@]/.test(text.trimStart()) ||
      ['\t', '\r', '\n'].includes(text.charAt(0)))
  ) {
    text = "'" + text;
  }
  return '"' + text.replaceAll('"', '""') + '"';
}

const Navigation = createContext<(href: string, selection: boolean) => void>(
  () => undefined,
);

export function OrderQueueLink({
  href,
  selection = false,
  children,
  ...props
}: {
  href: string;
  selection?: boolean;
  className?: string;
  'aria-current'?: 'page' | 'true';
  'aria-label'?: string;
  children: ReactNode;
}) {
  const navigate = useContext(Navigation);
  return (
    <Link
      href={href}
      {...props}
      prefetch={false}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(href, selection);
      }}
    >
      {children}
    </Link>
  );
}

export function OrderQueueNavigation({
  children,
  formId,
  toolbar,
  updatedAt,
  exportRows,
}: {
  children: ReactNode;
  formId: string;
  toolbar: ReactNode;
  updatedAt: number;
  exportRows: (string | number)[][];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clock, setClock] = useState(0);
  const refresh = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh.current?.click();
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
    };
  }, []);

  function submit(event: SyntheticEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.formId !== formId)
      return;
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string' && value.trim())
        params.set(key, value.trim());
    });
    form.querySelector('details')?.removeAttribute('open');
    startTransition(() =>
      router.push('/admin/orders' + (params.size ? '?' + params : ''), {
        scroll: false,
      }),
    );
  }

  function navigate(href: string, selection: boolean) {
    startTransition(() =>
      router.push(href, { scroll: selection && window.innerWidth < 1280 }),
    );
  }

  function download() {
    const data = exportRows
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob([data], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders-current-page.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const seconds = Math.max(0, Math.floor((clock - updatedAt) / 1000));
  const age =
    seconds < 1
      ? 'just now'
      : seconds < 60
        ? seconds + ' s ago'
        : Math.floor(seconds / 60) + ' min ago';
  return (
    <Navigation.Provider value={navigate}>
      <div className="min-w-0 space-y-4" onSubmit={submit}>
        <div className="relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
          {toolbar}
          <button
            ref={refresh}
            type="button"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm text-[#46536F] hover:bg-[#EEE5D5] disabled:opacity-75"
            aria-label={pending ? 'Refreshing orders' : 'Refresh orders'}
            onClick={() => startTransition(() => router.refresh())}
          >
            <RotateCw
              className={pending ? 'size-4 motion-safe:animate-spin' : 'size-4'}
              aria-hidden="true"
            />
            {pending ? 'Refreshing…' : 'Updated ' + age}
          </button>
          <button
            type="button"
            disabled={exportRows.length <= 1}
            title="Export the current page as CSV"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#D4C2A6] px-3 text-sm font-semibold hover:bg-[#EEE5D5] disabled:opacity-50"
            onClick={download}
          >
            <Download className="size-4" aria-hidden="true" /> Export
          </button>
          {pending ? (
            <div
              className="pointer-events-none absolute inset-x-0 -bottom-1 overflow-hidden"
              aria-hidden="true"
            >
              <div className="h-[2px] w-full bg-[#A8232E] motion-safe:animate-pulse" />
            </div>
          ) : null}
          <output className="sr-only">
            {pending ? 'Refreshing orders…' : ''}
          </output>
        </div>
        {children}
      </div>
    </Navigation.Provider>
  );
}
