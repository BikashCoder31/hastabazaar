import { Skeleton } from '@/components/ui/skeleton';
export default function SellerLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 max-w-xl rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((id) => (
          <Skeleton key={id} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <output className="sr-only">Loading your seller workspace…</output>
    </div>
  );
}
