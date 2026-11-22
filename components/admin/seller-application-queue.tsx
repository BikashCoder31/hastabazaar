import Link from 'next/link';
import type { SellerReviewQueueRow } from '@/lib/db/repositories/seller-applications';

export function sellerInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'S';
}

export function SellerApplicationQueue({ applications, selected }: {
  applications: readonly SellerReviewQueueRow[];
  selected?: string;
}) {
  return (
    <section aria-label="Seller applications" className="min-w-0">
      <h2 className="mb-3 text-sm font-bold">Applications</h2>
      {applications.length ? <ul className="space-y-2">
        {applications.map(seller => {
          const name = seller.tradingName.trim() || seller.legalName.trim() || seller.applicationReference;
          const status = seller.status === 'needs_changes' ? 'Waiting on seller'
            : seller.applicationStage === 'approved_for_activation' ? 'Ready for activation'
            : seller.documentCount > 0 ? 'Documents in' : 'No documents yet';
          return <li key={seller.id}>
            <Link href={'/admin/sellers/' + encodeURIComponent(seller.id)} aria-current={seller.id === selected ? 'page' : undefined}
              className={'flex min-w-0 gap-3 rounded-xl border p-3 hover:border-[#14213D] ' +
                (seller.id === selected ? 'border-[#14213D] bg-card ring-1 ring-[#14213D]' : 'border-transparent')}>
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#A8232E] text-sm font-bold text-white">
                {sellerInitials(name)}
              </span>
              <span className="min-w-0 break-words">
                <span className="block font-bold">{name}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{seller.district}</span>
                <span className={'mt-1.5 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ' +
                  (seller.status === 'needs_changes' ? 'bg-[#f7e7be] text-[#744a0b]' : seller.documentCount ? 'bg-[#e1e8f4] text-[#24427a]' : 'bg-[#EEE5D5] text-[#46536F]')}>
                  {status}
                </span>
              </span>
            </Link>
          </li>;
        })}
      </ul> : <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No applications to review.</p>}
    </section>
  );
}
