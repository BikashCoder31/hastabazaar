import Link from 'next/link';
import type { SellerPayoutFix } from '@/lib/sellers/payout-fixes';

export function AdminSellerPayoutFixes({ fixes }: { fixes: readonly SellerPayoutFix[] }) {
  if (!fixes.length) return null;
  return <section id="payout-fixes" className="scroll-mt-24 space-y-3 rounded-xl border bg-card p-4" aria-labelledby="payout-fixes-title">
    <h2 id="payout-fixes-title" className="font-heading text-xl">Open fixes before first payout</h2>
    <ul className="divide-y">
      {fixes.map(fix => <li key={fix.id} className="flex min-w-0 flex-col gap-2 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{fix.label}</p>
          <p className="break-words text-sm text-muted-foreground">{fix.note}</p>
          <p className="text-sm">{fix.waitingFor === 'staff' ? 'New file needs review' : 'Waiting for seller'}</p>
        </div>
        <Link className="admin-button shrink-0" href={fix.staffHref}>{fix.waitingFor === 'staff' ? 'Recheck document' : 'Open document'}</Link>
      </li>)}
    </ul>
  </section>;
}
