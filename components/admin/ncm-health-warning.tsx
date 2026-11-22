import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { formatOrderTime } from '@/app/admin/orders/order-queue-presentation';
import type { NcmHealthWarning } from '@/lib/delivery/ncm-health';

export function NcmHealthWarningCard({ warning, superAdmin }: { warning: NcmHealthWarning; superAdmin: boolean }) {
  const parcelCount = `${warning.openParcels} open ${warning.openParcels === 1 ? 'parcel' : 'parcels'}`;
  return (
    <section aria-labelledby="ncm-health-heading" className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl bg-[#F7DFDF] px-4 py-3 text-[#811B24]">
      <span className="rounded-lg bg-white p-2"><CircleAlert aria-hidden="true" className="size-4" /></span>
      <div className="min-w-0 flex-[1_1_12rem]">
        <h2 id="ncm-health-heading" className="font-bold">NCM parcel updates overdue</h2>
        <p className="text-sm">{parcelCount} · Last check {warning.lastCheckAt === null ? 'never run' : formatOrderTime(warning.lastCheckAt)}</p>
      </div>
      <Link href={superAdmin ? '/admin/orders/delivery-partners' : '/admin/orders/dispatch'}
        className="inline-flex min-h-11 min-w-11 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#14213D] outline-offset-2 focus-visible:outline-2">
        {superAdmin ? 'Open Delivery partners' : 'Open Dispatch'}
      </Link>
    </section>
  );
}
