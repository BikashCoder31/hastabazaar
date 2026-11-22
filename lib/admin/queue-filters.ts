export type AdminQueueFilters = Readonly<{ q?: string; status?: string }>;
export const sellerQueueStatuses = [
  'draft',
  'submitted',
  'under_review',
  'needs_changes',
  'approved',
  'rejected',
  'suspended',
  'awaiting_review',
] as const;
export const emailQueueStatuses = ['ready','needs_review','queued','sending','retry','sent','sent_record','captured','uncertain','intervention','skipped','expired'] as const;
export const emailQueueStatusLabels:Readonly<Record<string,string>> = {
  ready:'Ready to send',needs_review:'Needs review',queued:'Queued',sending:'Sending',
  retry:'Retrying automatically',sent:'Sent to mail service',sent_record:'Sent record (transport unconfirmed)',captured:'Captured locally',uncertain:'Outcome uncertain',intervention:'Needs intervention',skipped:'No longer needed',expired:'Expired',
};
export const orderQueueStatuses = [
  'pending_payment',
  'awaiting_cod_confirmation',
  'confirmed',
  'packing',
  'ready_for_pickup',
  'dispatched',
  'delivered',
  'cancelled',
  'return_requested',
  'return_in_transit',
  'returned',
  'refund_processing',
  'refunded',
] as const;
export function normalizeQueueFilters(
  filters: AdminQueueFilters,
  statuses: readonly string[],
): AdminQueueFilters {
  return {
    q: typeof filters.q === 'string' ? filters.q.trim().slice(0, 120) : '',
    status:
      typeof filters.status === 'string' && statuses.includes(filters.status)
        ? filters.status
        : '',
  };
}
export function queuePageHref(
  path: string,
  filters: AdminQueueFilters,
  page = 1,
) {
  const query = new URLSearchParams();
  if (filters.q) query.set('q', filters.q);
  if (filters.status) query.set('status', filters.status);
  if (page > 1) query.set('page', String(page));
  return path + (query.size ? '?' + query.toString() : '');
}
export function sellerQueueWhere(filters: AdminQueueFilters) {
  const normalized = normalizeQueueFilters(filters, sellerQueueStatuses),
    conditions: string[] = [],
    values: string[] = [];
  if (normalized.status === 'awaiting_review')
    conditions.push("seller_profiles.status IN ('submitted','under_review')");
  else if (normalized.status) {
    conditions.push('seller_profiles.status = ?');
    values.push(normalized.status);
  }
  if (normalized.q) {
    const fields = [
      'seller_profiles.trading_name',
      'seller_profiles.legal_name',
      'seller_profiles.application_reference',
      'seller_profiles.support_email',
      'seller_profiles.support_phone',
      'owner.display_name',
      'owner.email',
      'owner.phone',
    ];
    conditions.push(
      '(' +
        fields
          .map((field) => 'INSTR(LOWER(COALESCE(' + field + ",'')),?) > 0")
          .join(' OR ') +
        ')',
    );
    values.push(...fields.map(() => normalized.q!.toLowerCase()));
  }
  return {
    sql: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
    values,
  };
}
export function orderQueueWhere(filters: AdminQueueFilters) {
  const normalized = normalizeQueueFilters(filters, orderQueueStatuses),
    conditions: string[] = [],
    values: string[] = [];
  const pending =
    "EXISTS(SELECT 1 FROM first_cod_reviews review WHERE review.order_id=orders.id AND review.status='pending')";
  if (normalized.status === 'awaiting_cod_confirmation')
    conditions.push("orders.status <> 'cancelled' AND " + pending);
  else if (normalized.status) {
    conditions.push('orders.status = ?');
    values.push(normalized.status);
    if (normalized.status === 'confirmed') conditions.push('NOT ' + pending);
  }
  if (normalized.q) {
    const fields = [
      'orders.order_number',
      'orders.customer_email',
      'orders.customer_phone',
    ];
    conditions.push(
      '(' +
        fields
          .map((field) => 'INSTR(LOWER(COALESCE(' + field + ",'')),?) > 0")
          .join(' OR ') +
        ')',
    );
    values.push(...fields.map(() => normalized.q!.toLowerCase()));
  }
  return {
    sql: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
    values,
  };
}
