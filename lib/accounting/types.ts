export type Paisa = string;
export const accountingSections = [
  'overview',
  'sellers',
  'makers',
  'cash',
  'incentives',
  'issues',
] as const;
export type AccountingSection = (typeof accountingSections)[number];
export const accountingSourceKinds = [
  'order_service_fee',
  'service_fee_refund',
  'order_item',
  'seller_ledger_entry',
  'seller_payout',
  'maker_entitlement',
  'maker_settlement_entry',
  'maker_payout',
  'parcel_collection',
  'parcel_remittance',
  'refund',
  'wallet_entry',
  'referral_redemption',
  'promo_redemption',
  'loyalty_claim',
  'loyalty_redemption',
  'gift_card',
  'invoice_adjustment',
] as const;
export type SourceKind = (typeof accountingSourceKinds)[number];
export interface AccountingCursor {
  scope: string;
  recordedAt: number;
  sourceKind: SourceKind;
  sourceId: string;
}
export interface AccountingQuery {
  section: AccountingSection;
  period: 'today' | '7d' | '30d' | 'all' | 'custom';
  fromAt: number;
  toExclusive: number;
  pageSize: number;
  cursor: AccountingCursor | null;
}
export interface AccountingIssue {
  code:
    | 'source_unavailable'
    | 'missing_attribution'
    | 'unknown_model'
    | 'source_mismatch'
    | 'unsafe_money'
    | 'classification_required';
  message: string;
  sourceKind?: SourceKind;
  sourceId?: string;
}
export interface AccountingSourceRow {
  sourceKind: SourceKind;
  sourceId: string;
  recordedAt: number;
  amountPaisa: Paisa | null;
  points: string | null;
  model: string | null;
  state: string;
  reference: string;
}
export interface AccountingMetric {
  key: string;
  label: string;
  amountPaisa: Paisa | null;
  status: 'available' | 'unavailable' | 'needs_review';
  basis: 'period_flow' | 'current_position';
  sourceKinds: readonly SourceKind[];
  explanation: string;
}
export interface AccountingSourceBundle {
  observedAt: number;
  environment: string;
  metrics: readonly AccountingMetric[];
  rows: readonly AccountingSourceRow[];
  issues: readonly AccountingIssue[];
  nextCursor: string | null;
  coverage: readonly { source: string; available: boolean; rowCount: number }[];
}
export interface AccountingWorkspace extends AccountingSourceBundle {
  query: AccountingQuery;
}
