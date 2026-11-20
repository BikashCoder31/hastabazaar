import { Skeleton } from '@/components/ui/skeleton';
export default function AccountingLoading() {
  return (
    <div aria-live="polite" className="space-y-5">
      <h1 className="section-title">Accounting</h1>
      <p>Reading existing financial records…</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((n) => (
          <Skeleton key={n} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
