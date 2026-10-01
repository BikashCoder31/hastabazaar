import { Skeleton } from '@/components/ui/skeleton';

export default function AccountLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <output className="sr-only">Loading your account…</output>
    </div>
  );
}
