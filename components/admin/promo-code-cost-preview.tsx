'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  incentiveMoney,
  moneyInput,
  nprToPaisa,
  percentageToBps,
  promoCostPreview,
  incentiveDate,
} from '@/lib/incentives/presentation';
import type { PromoTerms } from '@/lib/incentives/types';
import type { FeeWaiverCampaign } from '@/lib/marketplace/fee-waivers';

export function PromoCodeCostPreview({
  terms,
  error = '',
  defaultCommissionBps,
  feeWaiver = null,
  disabled = false,
}: {
  terms: PromoTerms | null;
  error?: string;
  defaultCommissionBps?: number;
  feeWaiver?: FeeWaiverCampaign | null;
  disabled?: boolean;
}) {
  const [subtotal, setSubtotal] = useState('1000.00');
  const [commission, setCommission] = useState(() =>
    defaultCommissionBps === undefined ? '' : moneyInput(defaultCommissionBps),
  );
  let result: ReturnType<typeof promoCostPreview> | null = null;
  let message = error;
  try {
    const subtotalPaisa = nprToPaisa(subtotal, 'the sample products subtotal');
    const commissionBps = percentageToBps(commission);
    if (terms) result = promoCostPreview(terms, subtotalPaisa, commissionBps, feeWaiver);
  } catch (reason) {
    message =
      reason instanceof Error
        ? reason.message
        : 'Review the sample subtotal and commission percentage.';
  }
  return (
    <section
      id="cost-preview"
      aria-label="Promo cost preview"
      className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">Promo cost preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A registered-seller illustration using the unsaved discount and
          minimum subtotal above.
        </p>
        {defaultCommissionBps === undefined ? <output className="mt-2 block text-sm">The current saved commission rate is unavailable. Enter an explicit illustration rate or review Business Settings. No replacement rate is assumed.</output> : null}
        {feeWaiver ? <p className="mt-2 text-sm">This estimate uses the saved marketplace fee waiver “{feeWaiver.name}”, {incentiveDate(feeWaiver.startsAt)} to {incentiveDate(feeWaiver.endsAt)} (Nepal time). Checkout confirms eligibility when the order is placed.</p> : null}
      </div>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Illustration assumptions</legend>
        <div className="space-y-2">
          <Label htmlFor="promo-preview-subtotal">
            Sample products subtotal (NPR)
          </Label>
          <Input
            id="promo-preview-subtotal"
            type="text"
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
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Hatskala discount cost
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
                Hatskala would fund {incentiveMoney(-result.contributionPaisa)}{' '}
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
        products subtotal before the Hatskala-funded promo, assuming a
        completed, paid sale, after the illustrated marketplace fee waiver.
        Contribution is net commission less promo cost. Waived fees do not fund the discount.
        Campaign dates, usage limits, remaining budget and customer eligibility
        are not verified here. Changing these assumptions only updates this
        illustration.
      </p>
    </section>
  );
}
