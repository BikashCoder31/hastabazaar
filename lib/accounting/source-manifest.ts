/** Static identifiers only. Readiness inspects existing columns; it never upgrades storage. */
export const accountingColumns: Record<string, string> = {
  orders: 'id,order_number,status,payment_status,created_at,delivered_at,buyer_platform_fee_paisa',
  order_cancellation_events: 'order_id,version,next_json',
  audit_logs: 'id,subject_type,subject_id,action,next_json,created_at',
  order_items:
    'id,order_id,seller_id,commission_rule_version,commission_paisa,fulfillment_status',
  order_item_marketplace_fees: 'order_item_id,standard_bps,base_paisa,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision,created_at',
  seller_ledger_entries:
    'id,seller_id,order_item_id,type,amount_paisa,available_at,created_at',
  payout_entries: 'ledger_entry_id,released_at',
  payouts: 'id,seller_id,payout_number,status,amount_paisa,paid_at,created_at',
  shipping_jobs: 'id,order_id,seller_id,direction,status',
  managed_commercial_snapshots:
    'id,order_item_id,seller_id,commercial_model,eligible_base_paisa,platform_retained_paisa,platform_retention_bps,maker_entitlement_paisa,delivery_hold_days,created_at',
  managed_entitlements:
    'id,snapshot_id,seller_id,status,calculated_paisa,earned_at,hold_until,eligible_at,dispute_hold_reason,created_at',
  managed_settlement_entries:
    'id,entitlement_id,type,amount_paisa,base_amount_paisa,created_at',
  managed_payouts:
    'id,seller_id,payout_number,status,amount_paisa,paid_at,created_at',
  managed_payout_allocations:
    'payout_id,entitlement_id,amount_paisa,disposition',
  managed_payout_entries: 'payout_id,settlement_entry_id',
  return_requests: 'id,order_item_id,status',
  complaints: 'order_id,order_item_id,seller_id,status',
  refunds:
    'id,order_id,return_request_id,status,amount_paisa,wallet_credit_paisa,referral_discount_paisa,promo_discount_paisa,commission_base_refunded_paisa,requested_at,processed_at',
  parcel_cash_records: 'id,kind,status,amount_paisa,created_at,approved_at',
  wallet_accounts: 'user_id,balance_paisa',
  wallet_entries: 'id,amount_paisa,kind,created_at',
  referral_redemptions: 'order_id,reward_paisa,created_at',
  promo_redemptions: 'id,discount_paisa,created_at',
  loyalty_daily_claims: 'id,awarded_points,created_at',
  loyalty_redemptions: 'id,points,credit_paisa,created_at',
  gift_cards: 'id,amount_paisa,issued_at,redeemed_at',
  managed_invoice_adjustments:
    'id,adjustment_number,kind,amount_paisa,issued_at',
  managed_supplier_obligations: 'id,status',
};
export const accountingGroups = {
  service_fees: ['orders','order_cancellation_events'],
  sellers: [
    'orders',
    'order_items',
    'order_item_marketplace_fees',
    'seller_ledger_entries',
    'payout_entries',
    'payouts',
    'managed_commercial_snapshots',
    'shipping_jobs',
  ],
  makers: [
    'orders',
    'order_items',
    'managed_commercial_snapshots',
    'managed_entitlements',
    'managed_settlement_entries',
    'managed_payouts',
    'managed_payout_allocations',
    'managed_payout_entries',
    'return_requests',
    'complaints',
    'refunds',
  ],
  cash: ['parcel_cash_records'],
  refunds: ['refunds', 'audit_logs'],
  wallet: ['wallet_accounts', 'wallet_entries'],
  referrals: ['referral_redemptions'],
  promo: ['promo_redemptions'],
  loyalty: ['loyalty_daily_claims', 'loyalty_redemptions'],
  gifts: ['gift_cards'],
  documents: ['managed_invoice_adjustments'],
  suppliers: ['managed_supplier_obligations'],
} as const;
export type AccountingGroup = keyof typeof accountingGroups;
