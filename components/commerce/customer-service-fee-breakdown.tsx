import { incentiveMoney } from '@/lib/incentives/presentation';
import { PLATFORM_SERVICE_FEE_NOTICE } from '@/lib/checkout/platform-service-fee';
import { cn } from '@/lib/utils';

type FeeAmounts = { standardPaisa: number; waivedPaisa: number; netPaisa: number };

export function hasCustomerServiceFee({ standardPaisa, waivedPaisa, netPaisa }: FeeAmounts) {
  return standardPaisa > 0 || waivedPaisa > 0 || netPaisa > 0;
}

/** Presentation only: money and campaign attribution come from a server snapshot. */
export function CustomerServiceFeeBreakdown({
  standardPaisa,
  waivedPaisa,
  netPaisa,
  campaignName,
  source,
  className,
}: FeeAmounts & {
  campaignName: string | null;
  source: 'estimate' | 'recorded' | 'historical';
  className?: string;
}) {
  if (!hasCustomerServiceFee({ standardPaisa, waivedPaisa, netPaisa })) return null;
  return (
    <section aria-label="Customer service fee" className={cn('space-y-2 text-sm', className)}>
      <dl className="space-y-2">
        {source !== 'historical' ? <div className="flex justify-between gap-3">
          <dt>Standard customer service fee</dt>
          <dd>{incentiveMoney(standardPaisa)}</dd>
        </div> : null}
        {source !== 'historical' && waivedPaisa > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="break-words">Full customer fee waiver · {campaignName}</dt>
            <dd>−{incentiveMoney(waivedPaisa)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 font-semibold">
          <dt>{source === 'historical' ? 'Recorded customer service fee' : 'Net customer service fee'}</dt>
          <dd>{incentiveMoney(netPaisa)}</dd>
        </div>
      </dl>
      <p className="text-xs leading-5 text-muted-foreground">
        {PLATFORM_SERVICE_FEE_NOTICE}{' '}
        {source === 'estimate'
          ? 'Estimate for this order. The final fee and any campaign are checked again at checkout.'
          : source === 'historical'
            ? 'Shown from the original recorded order amount.'
            : 'Recorded when this order was placed.'}
      </p>
    </section>
  );
}
