import { Skeleton } from '@/components/ui/skeleton';

export default function OrdersLoading() {
  return (
    <div className="min-w-0 space-y-4" aria-busy="true">
      <output className="sr-only">Loading orders…</output>
      <Skeleton className="h-9 w-28 rounded-lg" />
      <div
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_17rem] 2xl:grid-cols-[minmax(0,1fr)_19rem]"
        aria-hidden="true"
      >
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-[minmax(0,1fr)_5.75rem_8rem_5.75rem]">
            <Skeleton className="col-span-3 h-11 rounded-lg sm:col-span-1" />
            {[0, 1, 2].map((id) => (
              <Skeleton key={id} className="h-11 rounded-lg" />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[16, 28, 20, 24, 24].map((width, index) => (
              <Skeleton
                key={index}
                className="h-11 max-w-full rounded-full"
                style={{ width: width / 4 + 'rem' }}
              />
            ))}
          </div>
          <div className="space-y-2 md:space-y-0 md:overflow-hidden md:rounded-xl md:border md:bg-card">
            <Skeleton className="hidden h-11 rounded-none md:block" />
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="grid gap-2 rounded-xl border bg-card p-3 md:grid-cols-7 md:items-center md:rounded-none md:border-x-0 md:border-t-0"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((cell) => (
                  <Skeleton
                    key={cell}
                    className={
                      'h-6 rounded-full ' +
                      (cell > 1
                        ? 'hidden md:block'
                        : cell === 0
                          ? 'w-2/3'
                          : 'w-1/2')
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-60 rounded-xl" />
      </div>
    </div>
  );
}
