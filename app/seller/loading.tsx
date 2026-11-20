'use client';

import { usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

function Rows({ count = 3 }: { count?: number }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className="flex min-w-0 items-center gap-3 p-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5 max-w-52" />
            <Skeleton className="h-3 w-3/5 max-w-36" />
          </div>
          <Skeleton className="hidden h-11 w-20 shrink-0 rounded-lg md:block" />
        </div>
      ))}
    </div>
  );
}

function SellerTodaySkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#14213D] p-5 md:p-6">
        <div className="min-w-0 grow basis-56 space-y-2">
          <Skeleton className="h-3 w-24 bg-white/20" />
          <Skeleton className="h-6 w-64 max-w-full bg-white/20" />
          <Skeleton className="h-4 w-72 max-w-full bg-white/15" />
        </div>
        <Skeleton className="h-11 w-28 rounded-lg bg-white/20" />
      </div>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Rows />
        <Rows count={2} />
      </div>
    </>
  );
}

function SellerEarningsSkeleton() {
  return (
    <>
      <div className="space-y-5 rounded-2xl border bg-card p-4 md:p-5">
        <Skeleton className="h-6 w-40" />
        <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((step) => (
            <div key={step} className="min-w-0 space-y-2">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3 w-full max-w-28" />
            </div>
          ))}
        </div>
        <Skeleton className="h-14 rounded-xl" />
      </div>
      <Rows count={2} />
    </>
  );
}

function SellerListSkeleton({ showOrderDetail }: { showOrderDetail: boolean }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {Array.from({ length: showOrderDetail ? 6 : 5 }, (_, tab) => (
          <Skeleton key={tab} className="h-11 w-24 rounded-lg" />
        ))}
      </div>
      <div className={showOrderDetail ? 'grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]' : 'min-w-0'}>
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-11 w-full max-w-md rounded-lg" />
          <Rows />
        </div>
        {showOrderDetail ? <Skeleton className="hidden h-64 rounded-2xl lg:block" /> : null}
      </div>
    </>
  );
}

function SellerBodySkeleton({ pathname }: { pathname: string }) {
  if (pathname === '/seller') return <SellerTodaySkeleton />;
  if (pathname === '/seller/finance') return <SellerEarningsSkeleton />;
  if (pathname === '/seller/orders') return <SellerListSkeleton showOrderDetail />;
  if (pathname === '/seller/products') return <SellerListSkeleton showOrderDetail={false} />;
  return (
    <>
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-24 rounded-xl" />
      <Rows />
    </>
  );
}

export default function SellerLoading() {
  const pathname = usePathname();
  return (
    <div className="min-w-0 motion-reduce:[&_[data-slot=skeleton]]:animate-none" data-workspace-loading="seller">
      <output className="sr-only">Loading your Seller Studio…</output>
      <div className="min-w-0 space-y-5" aria-hidden="true">
        <Skeleton className="h-9 w-64 max-w-full md:h-10" />
        <SellerBodySkeleton pathname={pathname} />
      </div>
    </div>
  );
}
