import { formatPaisaExact } from '@/lib/marketplace/money-display';

export function CustomerParcelCash({ amountPaisa }: { amountPaisa: number }) {
  return (
    <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[#E3D6C3] pt-3.5 text-sm">
      <dt className="text-[#465573]">Cash to give the courier</dt>
      <dd className="font-bold tabular-nums text-[#14213D]">{formatPaisaExact(amountPaisa)}</dd>
    </dl>
  );
}
