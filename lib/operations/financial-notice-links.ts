import type { NotificationAudience } from './notification-links';
export const financialNoticeTypes = {
  refund_obligation: ['customer', 'staff'],
  payout_transfer: ['seller', 'staff'],
  managed_live_payout: ['seller', 'staff'],
  managed_live_eligibility: ['seller', 'staff'],
  managed_live_clearance: ['seller', 'staff'],
  managed_live_financial_scope: ['staff'],
  lawful_fee_refund_authorization: ['customer', 'staff'],
  managed_live_invoice_adjustment: ['customer', 'staff'],
  company_funding_statement: ['staff'],
  promo_campaign_notice: ['staff'],
  loyalty_programme_notice: ['staff'],
  customer_fee_waiver_notice:['staff'],
  referral_campaign_notice:['staff'],
} as const;
export function financialNotificationDestination(
  workspace: NotificationAudience,
  type: string,
  id: string,
): string | null | undefined {
  if (!Object.hasOwn(financialNoticeTypes, type)) return undefined;
  if (
    !(
      financialNoticeTypes[
        type as keyof typeof financialNoticeTypes
      ] as readonly string[]
    ).includes(workspace)
  )
    return null;
  if (type === 'refund_obligation')
    return workspace === 'staff'
      ? '/admin/payments/refunds?obligation=' + encodeURIComponent(id)
      : '/account/refunds#refund-' + encodeURIComponent(id);
  return (
    '/' +
    (workspace === 'staff'
      ? 'admin'
      : workspace === 'customer'
        ? 'account'
        : 'seller') +
    '/financial-notices/' +
    encodeURIComponent(type) +
    '/' +
    encodeURIComponent(id)
  );
}
