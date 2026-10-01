/** Product-price savings only; wallet and referral discounts are separate. */
export function productDiscountLabel(pricePaisa: number, originalPaisa: number | null | undefined): string | null {
  if (!Number.isSafeInteger(pricePaisa) || !Number.isSafeInteger(originalPaisa) || pricePaisa <= 0 || !originalPaisa || originalPaisa <= pricePaisa) return null;
  const percent = (originalPaisa - pricePaisa) / originalPaisa * 100;
  if (percent < 0.1) return '<0.1% off';
  return Math.min(99.9, Math.round(percent * 10) / 10) + '% off';
}
