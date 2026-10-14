/** Shared by immediate, manual and scheduled order updates and the staff queue. */
export const orderEmailExpiryHours = 24;
export const orderEmailMaxAgeMs = orderEmailExpiryHours * 60 * 60 * 1000;
export const manualOrderEmailBatchSize = 6;

export function orderEmailSkipReason(
  eventStatus: string,
  currentStatus: string,
  createdAt: number,
  now: number,
) {
  if (eventStatus !== currentStatus) return 'obsolete_order_state';
  if (createdAt <= now - orderEmailMaxAgeMs) return 'expired_order_update';
  return null;
}

export function orderEmailReasonLabel(reason: string | null) {
  if (reason === 'obsolete_order_state') return 'Order moved ahead';
  if (reason === 'expired_order_update')
    return `Update too old (${orderEmailExpiryHours}-hour limit)`;
  if (reason === 'delivery_failed') return 'Email attempt failed';
  return reason ? 'Review the recorded outcome' : null;
}
