import type { FeeBreakdown } from '@/lib/marketplace/fee-waivers';
import { commissionMoney } from '@/lib/commission/reporting';

/** Original order evidence. Never present these amounts as a remaining balance. */
export function MarketplaceFeeBreakdown({
  fee,
  campaignName,
}: {
  fee: FeeBreakdown;
  campaignName: string | null;
}) {
  return (
    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-3">
      <div>
        <dt>Standard marketplace fee: {fee.standardBps / 100}%</dt>
        <dd className="font-semibold tabular-nums">
          {commissionMoney(fee.standardPaisa)}
        </dd>
      </div>
      <div>
        <dt className="break-words">
          {fee.campaignId
            ? `Full fee waiver · ${campaignName ?? 'Recorded campaign'}`
            : 'No campaign waiver'}
        </dt>
        <dd className="font-semibold tabular-nums">
          {commissionMoney(fee.waivedPaisa)}
        </dd>
      </div>
      <div>
        <dt>
          Net marketplace fee: {fee.campaignId ? '0' : fee.standardBps / 100}%
        </dt>
        <dd className="font-semibold tabular-nums">
          {commissionMoney(fee.netPaisa)}
        </dd>
      </div>
    </dl>
  );
}
