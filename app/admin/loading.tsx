'use client';

import { usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

function TaskRows() {
  return (
    <div className="divide-y">
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 p-4 lg:grid-cols-[2.5rem_minmax(0,1fr)_6rem]">
          <Skeleton className="size-10 rounded-lg" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-4/5 max-w-52" />
            <Skeleton className="h-3 w-3/5 max-w-40" />
          </div>
          <Skeleton className="col-start-2 h-11 w-24 max-w-full rounded-lg lg:col-start-3" />
        </div>
      ))}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="today-overview">
      <div className="today-heading">
        <div className="w-full space-y-2 md:w-auto">
          <Skeleton className="h-8 w-72 max-w-full md:h-10" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-44 rounded-lg" />
      </div>
      <div className="today-panel today-metrics">
        {[0, 1, 2, 3].map((metric) => (
          <div key={metric} className="space-y-2">
            <Skeleton className="h-3 w-4/5 max-w-28" />
            <Skeleton className="h-6 w-3/5 max-w-24" />
            <Skeleton className="h-3 w-full max-w-36" />
          </div>
        ))}
      </div>
      <div className="today-grid">
        <div className="today-panel">
          <div className="flex flex-wrap items-center gap-2 border-b p-4">
            <Skeleton className="mr-2 h-5 w-14" />
            {[0, 1, 2, 3].map((filter) => (
              <Skeleton key={filter} className="h-11 w-20 rounded-full" />
            ))}
          </div>
          <TaskRows />
        </div>
        <div className="today-sidebar">
          {[0, 1, 2].map((panel) => (
            <div key={panel} className="today-panel today-side-panel">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminLoading() {
  const pathname = usePathname();
  const today = pathname === '/admin';
  const settings = pathname === '/admin/business-settings';
  const detail = pathname.split('/').filter(Boolean).length > 2;

  return (
    <div className="min-w-0 motion-reduce:[&_[data-slot=skeleton]]:animate-none" data-workspace-loading="admin">
      <output className="sr-only">Loading operations workspace…</output>
      <div aria-hidden="true">
        {today ? <TodaySkeleton /> : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-9 w-64 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            {settings ? (
              <div className="grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <div className="flex flex-wrap gap-2 lg:flex-col">
                  {[0, 1, 2, 3].map((tab) => (
                    <Skeleton key={tab} className="h-11 w-28 rounded-lg lg:w-full" />
                  ))}
                </div>
                <div className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
                  <Skeleton className="h-5 w-40 max-w-full" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-32 rounded-lg" />
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-4">
                {detail ? <Skeleton className="h-24 rounded-xl" /> : (
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-11 w-full rounded-lg md:max-w-64" />
                    <Skeleton className="h-11 w-28 rounded-lg" />
                  </div>
                )}
                <div className="rounded-2xl border bg-card"><TaskRows /></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
