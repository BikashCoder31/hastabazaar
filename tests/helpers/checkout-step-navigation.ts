import type { FixtureLocator } from './browser-fixture-types';

type CheckoutSurface = Pick<FixtureLocator, 'getByRole' | 'locator'>;

export async function openCheckoutAddress(page: CheckoutSurface) {
  const fields = page.locator('[data-checkout-fields="2"]');
  if (await fields.isVisible()) return;
  const change = page.getByRole('button', { name: 'Change: Where should it go?', exact: true });
  if (await change.isVisible()) await change.click();
  else await page.locator('[data-checkout-fields="1"]').getByRole('button', { name: 'Continue', exact: true }).click();
  await fields.waitFor();
}

export async function openCheckoutPayment(page: CheckoutSurface) {
  const payment = page.locator('[data-checkout-fields="4"]');
  if (await payment.isVisible()) return;
  const delivery = page.locator('[data-checkout-fields="3"]');
  if (!await delivery.isVisible()) {
    await openCheckoutAddress(page);
    await page.locator('[data-checkout-fields="2"]').getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await delivery.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await payment.waitFor();
}
