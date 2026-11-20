import type { ReactNode } from 'react';
import Link from 'next/link';
import { CatalogProductPhoto } from './catalog-product-photo';
import { AdminPageTitle } from '@/components/admin/page-help';
import { SharedReviewQueue } from '@/components/admin/shared-review-queue';
import {
  helpQueuePath,
  publishingQueuePath,
  type CatalogQueueRow,
  type ReviewTask,
} from './catalog-queue-data';

const labels = {
  help: 'Sellers asking for help',
  publishing: 'Approved, not live yet',
};
const localDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kathmandu',
});
const panel = 'min-w-0 rounded-[14px] border border-[#E4DACA] bg-white';

export function CatalogQueue({
  view,
  rows,
  counts,
  selected,
  actorId,
  tasks,
  historyOpen,
  children,
}: {
  view: keyof typeof labels;
  rows: CatalogQueueRow[];
  counts: Partial<Record<keyof typeof labels, number>>;
  selected?: string;
  actorId: string;
  tasks: ReviewTask[];
  historyOpen: boolean;
  children?: ReactNode;
}) {
  const help = view === 'help';
  const path = help ? helpQueuePath : publishingQueuePath;
  return (
    <div className="min-w-0 space-y-4 text-[#14213D]">
      <header>
        <AdminPageTitle>
          <h1 className="font-heading text-[28px] font-medium leading-tight md:text-[30px]">
            Catalog
          </h1>
        </AdminPageTitle>
      </header>
      <nav
        aria-label="Catalog queues"
        className="flex flex-col flex-wrap items-start gap-2 md:flex-row md:gap-2.5"
      >
        {(['help', 'publishing'] as const).map(
          (tab) =>
            counts[tab] !== undefined && (
              <Link
                key={tab}
                href={tab === 'help' ? helpQueuePath : publishingQueuePath}
                aria-current={view === tab ? 'page' : undefined}
                className={
                  'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A8232E] ' +
                  (view === tab
                    ? 'border-[#14213D] bg-[#14213D] text-white'
                    : 'border-[#D3C5AD] bg-white text-[#46536F] hover:border-[#14213D]')
                }
              >
                {labels[tab]}{' '}
                <span className="tabular-nums opacity-80">{counts[tab]}</span>
              </Link>
            ),
        )}
      </nav>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className={panel} aria-labelledby="catalog-queue-title">
          <header className="px-[18px] py-3.5">
            <h2 id="catalog-queue-title" className="text-[15px] font-bold">
              {labels[view]}
            </h2>
            <p className="mt-1 text-sm text-[#46536F]">
              {help
                ? 'Sellers who pressed “Ask Hastabazaar to help fill this in”.'
                : 'Approved products waiting to be published.'}
            </p>
          </header>
          {rows.length ? (
            <ul>
              {rows.map((row) => (
                <li key={row.id} className="border-t border-[#E4DACA]">
                  <Link
                    href={`${path}?case=${encodeURIComponent(row.id)}#catalog-request-detail`}
                    aria-current={row.id === selected ? 'true' : undefined}
                    className={
                      'grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-[18px] py-3.5 hover:bg-[#FFFCF7] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#A8232E] md:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto] ' +
                      (row.id === selected
                        ? 'shadow-[inset_3px_0_0_#A8232E]'
                        : '')
                    }
                  >
                    <CatalogProductPhoto
                      caseId={row.id}
                      photoId={row.photoId}
                    />
                    <span className="grid min-w-0 gap-0.5 text-sm [overflow-wrap:anywhere]">
                      <strong>{row.title}</strong>
                      <span className="text-[#46536F]">
                        {help ? 'Asked ' : 'Approved '}
                        {localDate.format(row.at)}
                        {help &&
                          !!row.missing &&
                          ` · ${row.missing} ${row.missing === 1 ? 'thing' : 'things'} missing`}
                      </span>
                    </span>
                    <span
                      className={
                        'col-span-full w-fit rounded-full px-2.5 py-1 text-xs font-semibold leading-4 md:col-span-1 lg:col-span-full xl:col-span-1 ' +
                        (row.waitingForSeller
                          ? 'bg-[#EDE4D3] text-[#46536F]'
                          : 'bg-[#14213D] text-white')
                      }
                    >
                      {help
                        ? row.waitingForSeller
                          ? 'With seller'
                          : 'Your turn'
                        : 'Publish'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-[#E4DACA] p-8 text-center text-sm text-[#46536F]">
              <strong className="block text-[#14213D]">All clear</strong>Nothing
              waiting here.
            </p>
          )}
        </section>
        {children && (
          <div id="catalog-request-detail" className="min-w-0 scroll-mt-20">
            {children}
          </div>
        )}
      </div>
      {tasks.length > 0 && (
        <details
          className={`${panel} px-[18px]`}
          open={historyOpen || undefined}
        >
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
            Review tasks and history
          </summary>
          <div className="pb-4">
            <SharedReviewQueue tasks={tasks} actorId={actorId} />
          </div>
        </details>
      )}
    </div>
  );
}
