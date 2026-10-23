import { incentiveMoney } from '@/lib/incentives/presentation';
import { PLATFORM_SERVICE_FEE_NOTICE } from '@/lib/checkout/platform-service-fee';

/** Presentation only: money and campaign attribution come from a server snapshot. */
export function CustomerServiceFeeBreakdown({
  standardPaisa,
  waivedPaisa,
  netPaisa,
  campaignName,
  source,
}: {
  standardPaisa: number;
  waivedPaisa: number;
  netPaisa: number;
  campaignName: string | null;
  source: 'estimate' | 'recorded' | 'historical';
}) {
  return (
    <section aria-label="Customer service fee" className="space-y-2 text-sm">
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
        {source === 'estimate' && standardPaisa === 0 ? 'No customer service fee is currently charged. ' : ''}
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
