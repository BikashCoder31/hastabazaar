import type { readOrderMarketplaceFeeViews } from '@/lib/db/repositories/fee-waivers';
import { MarketplaceFeeBreakdown } from './marketplace-fee-breakdown';

export function OrderMarketplaceFees({
  fees,
}: {
  fees: Awaited<ReturnType<typeof readOrderMarketplaceFeeViews>>;
}) {
  if (!fees.length) return null;
  return (
    <section
      className="mt-6 min-w-0 space-y-4 rounded-2xl border p-5"
      aria-label="Original marketplace fees"
    >
      <h2 className="font-heading text-2xl">Original marketplace fees</h2>
      <p className="text-sm text-muted-foreground">
        Recorded at order placement, before cancellations or refunds. Reversals
        and payout balances are separate. Managed Maker items are excluded.
      </p>
      {fees.map((view) => (
        <div key={view.itemId} className="space-y-2 border-t pt-3">
          <p className="break-words text-sm font-medium">{view.productName}</p>
          <MarketplaceFeeBreakdown
            fee={view.fee}
            campaignName={view.campaignName}
          />
        </div>
      ))}
    </section>
  );
}
