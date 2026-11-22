'use client';

import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReferralLoading() {
  const tab = useSearchParams().get('view');
  const overview = tab !== 'settings' && tab !== 'activity' && tab !== 'history';

  return (
    <div className="min-w-0 motion-reduce:[&_[data-slot=skeleton]]:animate-none" data-workspace-loading="referrals">
      <output className="sr-only">Loading referral offers and activity…</output>
      <div className="space-y-5" aria-hidden="true">
        <div className="space-y-2">
          <Skeleton className="h-9 w-96 max-w-full md:h-11" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-11 w-28 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-4/5 max-w-lg" />
        </div>
        {overview || tab === 'activity' ? (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((period) => (
              <Skeleton key={period} className="h-11 w-20 rounded-lg" />
            ))}
          </div>
        ) : null}
        {overview ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((metric) => (
              <div key={metric} className="min-w-0 space-y-3 rounded-2xl border bg-card p-4">
                <Skeleton className="h-4 w-full max-w-36" />
                <Skeleton className="h-7 w-24 max-w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        )}
      </div>
    </div>
  );
}
