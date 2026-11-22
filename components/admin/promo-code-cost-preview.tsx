'use client';

import { Coins } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  incentiveMoney,
  moneyInput,
  nprToPaisa,
  percentageToBps,
  promoCostPreview,
} from '@/lib/incentives/presentation';
import type { PromoTerms } from '@/lib/incentives/types';
import type { FeeWaiverCampaign } from '@/lib/marketplace/fee-waivers';

function estimatedOrders(budgetPaisa: number, discountPaisa: number) {
  return BigInt(budgetPaisa) / BigInt(discountPaisa);
}

export function PromoCodeCostPreview({
  terms,
  averageSubtotalPaisa,
  compact,
  error = '',
  defaultCommissionBps,
  disabled = false,
}: {
  terms: PromoTerms | null;
  averageSubtotalPaisa?: number | null;
  compact?: { estimatedBudgetPaisa: number | null };
  error?: string;
  defaultCommissionBps?: number;
  feeWaiver?: FeeWaiverCampaign | null;
  disabled?: boolean;
}) {
  const [subtotal, setSubtotal] = useState(() =>
    averageSubtotalPaisa === undefined ? '1000.00'
      : averageSubtotalPaisa === null ? ''
      : moneyInput(averageSubtotalPaisa),
  );
  const [commission, setCommission] = useState(() =>
    defaultCommissionBps === undefined ? '' : moneyInput(defaultCommissionBps),
  );
  let result: ReturnType<typeof promoCostPreview> | null = null;
  let message = error;
  try {
    const subtotalPaisa = nprToPaisa(subtotal, 'the sample products subtotal');
    const commissionBps = percentageToBps(commission);
    if (terms) result = promoCostPreview(terms, subtotalPaisa, commissionBps);
  } catch (reason) {
    message =
      reason instanceof Error
        ? reason.message
        : 'Review the sample subtotal and commission percentage.';
  }
  if (compact) {
    const discount = result?.discountPaisa ?? 0;
    const coverage = compact.estimatedBudgetPaisa && discount
      ? estimatedOrders(compact.estimatedBudgetPaisa, discount)
      : null;
    return (
      <section aria-label="Promo cost preview" className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl bg-[#e1e7f3] p-4 text-sm leading-5 text-[#243e6f]">
        <Coins className="mt-0.5 size-4" aria-hidden="true" />
        <p aria-live="polite">
          <strong className="text-[#14213d]">Cost preview:</strong>{' '}
          {averageSubtotalPaisa == null
            ? 'Enter a product subtotal in the draft editor to preview the discount.'
            : defaultCommissionBps === undefined
              ? 'The current commission rate is unavailable. Enter a rate in the draft editor to review cost.'
              : result
                ? <>On this month’s average products subtotal of {incentiveMoney(averageSubtotalPaisa)}, Hastabazaar would fund {incentiveMoney(discount)} before a maximum discount or minimum subtotal is applied.
                    {coverage !== null ? ` The budget would cover ${coverage.toLocaleString('en-NP')} orders at this subtotal, before other limits.` : ''}
                    {' '}Seller earnings use the original products subtotal.</>
                : 'Enter a discount percentage to estimate what Hastabazaar would fund on this month’s average products subtotal.'}
        </p>
      </section>
    );
  }
  return (
    <section
      id="cost-preview"
      aria-label="Promo cost preview"
      className="min-w-0 space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">Promo cost preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A registered-seller illustration using the unsaved discount and
          minimum subtotal above.
        </p>
        {defaultCommissionBps === undefined ? <output className="mt-2 block text-sm">The current saved commission rate is unavailable. Enter an explicit illustration rate or review Business Settings. No replacement rate is assumed.</output> : null}
      </div>
      <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Illustration assumptions</legend>
        <div className="space-y-2">
          <Label htmlFor="promo-preview-subtotal">
            Sample products subtotal (NPR)
          </Label>
          <Input
            id="promo-preview-subtotal"
            type="text"
            className="min-h-11"
            inputMode="decimal"
            value={subtotal}
            onChange={(event) => setSubtotal(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promo-preview-commission">
            Assumed seller commission (%)
          </Label>
          <Input
            id="promo-preview-commission"
            type="text"
            className="min-h-11"
            inputMode="decimal"
            value={commission}
            onChange={(event) => setCommission(event.target.value)}
          />
        </div>
      </fieldset>
      <div aria-live="polite" aria-atomic="true">
        {result ? (
          <>
            {!result.eligible ? (
              <p className="mb-3 text-sm">
                This sample subtotal is below the draft minimum. No promo
                discount is included.
              </p>
            ) : null}
            <dl className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Hastabazaar discount cost
                </dt>
                <dd
                  className="mt-1 font-semibold tabular-nums"
                  data-promo-preview-discount-paisa={result.discountPaisa}
                >
                  {incentiveMoney(result.discountPaisa)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Customer products subtotal
                </dt>
                <dd
                  className="mt-1 font-semibold tabular-nums"
                  data-promo-preview-customer-subtotal-paisa={
                    result.customerSubtotalPaisa
                  }
                >
                  {incentiveMoney(result.customerSubtotalPaisa)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Estimated net commission revenue
                </dt>
                <dd
                  className="mt-1 font-semibold tabular-nums"
                  data-promo-preview-commission-paisa={result.commissionPaisa}
                >
                  {incentiveMoney(result.commissionPaisa)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Contribution after promo
                </dt>
                <dd
                  className={
                    'mt-1 font-semibold tabular-nums ' +
                    (result.contributionPaisa < 0 ? 'text-destructive' : '')
                  }
                  data-promo-preview-contribution-paisa={
                    result.contributionPaisa
                  }
                >
                  {incentiveMoney(result.contributionPaisa)}
                </dd>
              </div>
            </dl>
            {result.contributionPaisa < 0 ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                The discount exceeds the illustrated commission revenue.
                Hastabazaar would fund {incentiveMoney(-result.contributionPaisa)}{' '}
                beyond this revenue.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {message ||
              'Enter a discount and minimum products subtotal to see the cost illustration.'}
          </p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Excludes delivery, taxes and other fees. Commission is calculated on the
        products subtotal before the Hastabazaar-funded promo, assuming a
        completed, paid sale. Customer service fee campaigns do not change this commission.
        Contribution is net commission less promo cost.
        Campaign dates, usage limits, remaining budget and customer eligibility
        are not verified here. Changing these assumptions only updates this
        illustration.
      </p>
    </section>
  );
}
