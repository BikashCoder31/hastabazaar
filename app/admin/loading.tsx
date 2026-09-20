import { Skeleton } from '@/components/ui/skeleton';
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-36 rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((id) => (
          <Skeleton key={id} className="h-48 rounded-2xl" />
        ))}
      </div>
      <output className="sr-only">Loading operations workspace…</output>
    </div>
  );
}
