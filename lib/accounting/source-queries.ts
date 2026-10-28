import { managedSettlementReadySql } from '../managed-commerce/settlement-readiness';
import { currentPlatformServiceFeeSql } from '../db/repositories/platform-service-fee';
import { managedRefundFactsColumns } from '../managed-commerce/refund-readiness';
import {
  accountingColumns,
  accountingGroups,
  type AccountingGroup,
} from './source-manifest';
import { encodeAccountingCursor } from './filters';
import { paisa } from './money';
import type {
  AccountingMetric,
  AccountingQuery,
  AccountingSourceBundle,
  AccountingSourceRow,
  SourceKind,
  AccountingIssue,
} from './types';

type Definition = AccountingMetric & {
  group: AccountingGroup;
  expression: string;
};
type Raw = {
  tag: string;
  sourceKey: string;
  amount: string | number | null;
  points: string | null;
  recordedAt: number;
  state: string;
  model: string | null;
  reference: string;
  sourceKind: SourceKind;
};
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const text = (sql: string) => `CAST((${sql}) AS CHAR)`;
/** Workerd limits each compound SELECT to five branches. Keep a single snapshot
 * by grouping branches into CTEs, rather than splitting the financial read.
 */
function boundedUnion(
  parts: readonly string[],
  ctes: string[],
  prefix: string,
): string {
  let level = [...parts],
    generation = 0;
  while (level.length > 5) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 5) {
      const name = `${prefix}_${generation}_${i / 5}`;
      ctes.push(`${name} AS (${level.slice(i, i + 5).join(' UNION ALL ')})`);
      next.push(`SELECT * FROM ${name}`);
    }
    level = next;
    generation++;
  }
  return level.join(' UNION ALL ');
}
/** Native migrations and connection literals can have different collations.
 * Normalize each branch before UNION resolution, including empty sources;
 * casting the combined result would be too late for MariaDB's type checking.
 */
function unionBranch(sql: string, mariaDb: boolean, row: boolean): string {
  if (!mariaDb) return sql;
  const columns = row
    ? ['sourceKind', 'sourceId', 'recordedAt', 'amount', 'points', 'state', 'model', 'reference']
    : ['tag', 'sourceKey', 'amount', 'points', 'recordedAt', 'state', 'model', 'reference', 'sourceKind'];
  return `SELECT ${columns.map(column => column === 'recordedAt' ? column
    : `CAST(${column} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin AS ${column}`).join(',')}
    FROM (${sql}) accounting_branch`;
}
const total = (table: string, expression: string, where = '1=1') =>
  `SELECT COALESCE(SUM(${expression}),0) FROM ${table} WHERE ${where}`;
const independent = (alias: string) =>
  `NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=${alias}.order_item_id) AND NOT EXISTS(SELECT 1 FROM order_items mi WHERE mi.id=${alias}.order_item_id AND mi.commission_rule_version LIKE 'managed-%')`;
const independentItem =
  "NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=i.id) AND COALESCE(i.commission_rule_version,'') NOT LIKE 'managed-%'";
const net = `COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id),0)
 -COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND a.disposition='paid'),0)
 -COALESCE((SELECT SUM(x.amount_paisa) FROM managed_payout_entries pe JOIN managed_payouts p ON p.id=pe.payout_id JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND p.status='paid' AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=e.id)),0)`;

function makerCte(now: number, mariaDb: boolean) {
  // SQLite would otherwise inline the refund aggregates repeatedly and exceed
  // workerd's100 aggregate/column limit. MariaDB has no MATERIALIZED syntax.
  const as = mariaDb ? 'AS' : 'AS MATERIALIZED';
  // Integer half-up refund parity, guarded below before any potentially unsafe product.
  const base =
    'CASE WHEN refundPaidBase>refundRecordedBase THEN refundPaidBase ELSE refundRecordedBase END';
  const safe = `refundEligibleBase>=0 AND refundEligibleBase<=9007199254740991 AND refundRetained>=0 AND refundRetained<=refundEligibleBase
    AND refundPaidBase>=0 AND refundRecordedBase>=0 AND (${base})<=refundEligibleBase AND refundReversed>=0
    AND (refundRetained=0 OR (${base})<=(9007199254740991-FLOOR(refundEligibleBase/2))/(refundRetained+1))`;
  const numerator = `((${base})*refundRetained+FLOOR(refundEligibleBase/2))`;
  // Remove the remainder first: MariaDB decimal division can round a near-integer quotient.
  const retained = `CASE WHEN (${base})=refundEligibleBase THEN refundRetained WHEN refundEligibleBase=0 THEN 0 ELSE (${numerator}-(${numerator}%refundEligibleBase))/refundEligibleBase END`;
  return `maker_facts ${as} (SELECT e.*,${net} AS netPaisa,${managedRefundFactsColumns()},CASE WHEN ${managedSettlementReadySql('e', now)} AND e.status IN ('eligible','part_paid','paid') AND e.eligible_at<=${now} THEN 1 ELSE 0 END AS eligible FROM managed_entitlements e),
    maker_positions ${as} (SELECT maker_facts.*,CASE WHEN eligible=1 AND ${safe} AND refundReversed=((${base})-(${retained})) THEN 1 ELSE 0 END AS ready FROM maker_facts),
    maker_sellers AS (SELECT seller_id FROM managed_entitlements UNION SELECT seller_id FROM managed_payouts),
    maker_by_seller AS (SELECT ms.seller_id,COALESCE(SUM(mp.netPaisa),0) AS positionNet,COALESCE(SUM(CASE WHEN mp.ready=1 THEN mp.netPaisa ELSE 0 END),0) AS available,
      SUM(CASE WHEN mp.ready=0 AND mp.netPaisa<0 THEN 1 ELSE 0 END) AS blockedNegative,
      COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=ms.seller_id),0)
       -COALESCE((SELECT SUM(p.amount_paisa) FROM managed_payouts p WHERE p.seller_id=ms.seller_id AND p.status='paid'),0) AS ledgerBalance,
      COALESCE((SELECT SUM(p.amount_paisa) FROM managed_payouts p WHERE p.seller_id=ms.seller_id AND p.status IN ('prepared','approved','processing','failed')),0) AS reserved
      FROM maker_sellers ms LEFT JOIN maker_positions mp ON mp.seller_id=ms.seller_id GROUP BY ms.seller_id)`;
}

function definitions(q: AccountingQuery, now: number): Definition[] {
  const flow = (column: string) =>
    `${column}>=${q.fromAt} AND ${column}<${q.toExclusive}`;
  const out: Definition[] = [];
  function metric(
    group: AccountingGroup,
    key: string,
    label: string,
    expression: string,
    basis: AccountingMetric['basis'],
    sourceKinds: SourceKind[],
    explanation: string,
  ) {
    out.push({
      group,
      key,
      label,
      expression,
      basis,
      sourceKinds,
      explanation,
      amountPaisa: null,
      status: 'available',
    });
  }
  const m = (
    group: AccountingGroup,
    key: string,
    label: string,
    table: string,
    expression: string,
    where: string,
    basis: AccountingMetric['basis'],
    kinds: SourceKind[],
    note: string,
  ) =>
    metric(
      group,
      key,
      label,
      total(table, expression, where),
      basis,
      kinds,
      note,
    );
  const sellerNote =
    'Recorded independent-seller ledger events in this period; not company net profit.';
  const originalFeeSource = 'order_items i JOIN orders o ON o.id=i.order_id LEFT JOIN order_item_marketplace_fees f ON f.order_item_id=i.id';
  m('sellers', 'seller_original_standard_commission', 'Original standard marketplace fees', originalFeeSource,
    'COALESCE(f.standard_paisa,i.commission_paisa)', `${independentItem} AND ${flow('o.created_at')}`, 'period_flow', ['order_item'],
    'Original checkout snapshots including subsequently cancelled/refunded lines. Historical lines use recorded fees. Not earned revenue; reversals and remaining balances are separate.');
  m('sellers', 'seller_original_waived_commission', 'Original marketplace fee waivers', originalFeeSource,
    'COALESCE(f.waived_paisa,0)', `${independentItem} AND ${flow('o.created_at')}`, 'period_flow', ['order_item'],
    'Original checkout fee relief, including subsequently cancelled/refunded lines. Evidence only, not a cash expense or earned commission.');
  const customerFeeSource = 'orders o LEFT JOIN order_customer_service_fees f ON f.order_id=o.id';
  m('service_fees', 'service_fee_standard', 'Standard customer service fees', customerFeeSource, 'COALESCE(f.standard_paisa,o.buyer_platform_fee_paisa)', flow('o.created_at'), 'period_flow', ['order_service_fee'], 'Original standard fee once per order; legacy orders use only the recorded charge. Not an additional cash charge or revenue.');
  m('service_fees', 'service_fee_campaign_waived', 'Customer campaign fee waivers', customerFeeSource, 'COALESCE(f.waived_paisa,0)', flow('o.created_at'), 'period_flow', ['order_service_fee'], 'Original customer campaign relief once per order, including zero-net orders. Not a refund, commission waiver or cash expense.');
  m('service_fees', 'service_fee_charged', 'Platform service fees at checkout', 'orders', 'buyer_platform_fee_paisa', flow('created_at'), 'period_flow', ['order_service_fee'], 'Original saved customer fees, once per order. Includes pending/uncollected charges; not collected revenue or seller commission.');
  m('service_fees', 'service_fee_current', 'Platform service fees after cancellations', 'orders', currentPlatformServiceFeeSql(), flow('created_at'), 'period_flow', ['order_service_fee'], 'Saved order charges after uncollected COD cancellation waivers. Not proof of cash collection; lawful refunds are reported separately.');
  m(
    'sellers',
    'seller_commission_earned',
    'Seller commission earned',
    'seller_ledger_entries l',
    '-l.amount_paisa',
    `${independent('l')} AND l.type='commission' AND ${flow('l.created_at')}`,
    'period_flow',
    ['seller_ledger_entry'],
    sellerNote,
  );
  m(
    'sellers',
    'seller_commission_reversed',
    'Commission refund reversals',
    'seller_ledger_entries l',
    'l.amount_paisa',
    `${independent('l')} AND l.type='commission_reversal' AND ${flow('l.created_at')}`,
    'period_flow',
    ['seller_ledger_entry'],
    sellerNote,
  );
  m(
    'sellers',
    'seller_available',
    'Seller available position',
    'seller_ledger_entries l',
    'l.amount_paisa',
    `${independent('l')} AND l.available_at<=${now} AND NOT EXISTS(SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=l.id AND pe.released_at IS NULL)`,
    'current_position',
    ['seller_ledger_entry'],
    'Current unallocated recorded entries after their availability date. This does not send a payment.',
  );
  m(
    'sellers',
    'seller_pending',
    'Seller pending position',
    'seller_ledger_entries l',
    'l.amount_paisa',
    `${independent('l')} AND l.available_at>${now} AND NOT EXISTS(SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=l.id AND pe.released_at IS NULL)`,
    'current_position',
    ['seller_ledger_entry'],
    'Current recorded entries still under their saved holding/reserve dates.',
  );
  m(
    'sellers',
    'seller_paid',
    'Seller payouts paid',
    'payouts p',
    'p.amount_paisa',
    `p.status='paid' AND ${flow('p.paid_at')}`,
    'period_flow',
    ['seller_payout'],
    'Recorded completed payouts; approvals and requests are excluded.',
  );
  const pending = `${independentItem} AND NOT EXISTS(SELECT 1 FROM seller_ledger_entries l WHERE l.order_item_id=i.id AND l.seller_id=i.seller_id AND l.type='commission')
    AND i.fulfillment_status NOT IN ('cancelled','returned','refunded') AND o.status<>'cancelled' AND o.payment_status NOT IN ('cancelled','refunded')
    AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=o.id AND j.seller_id=i.seller_id AND j.direction='outbound' AND j.status IN ('returned','cancelled'))`;
  m(
    'sellers',
    'seller_pending_commission',
    'Pending commission estimate',
    'order_items i JOIN orders o ON o.id=i.order_id',
    'i.commission_paisa',
    pending,
    'current_position',
    ['order_item'],
    'Saved order-item commission awaiting a recorded earning. Uses the original rate, not today’s default.',
  );
  m(
    'makers',
    'maker_calculated',
    'Maker calculated allocation',
    'managed_entitlements',
    'calculated_paisa',
    '1=1',
    'current_position',
    ['maker_entitlement'],
    'Recorded allocation before payment eligibility; historical maker balances remain visible after a route change.',
  );
  m(
    'makers',
    'maker_earned',
    'Recorded maker earnings',
    'managed_entitlements',
    'calculated_paisa',
    `earned_at IS NOT NULL AND earned_at<=${now}`,
    'current_position',
    ['maker_entitlement'],
    'Original recorded earned allocation; adjustments, holds and payments are shown separately.',
  );
  m(
    'makers',
    'maker_company_retention',
    'Original company retention on maker earnings',
    'managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id',
    's.platform_retained_paisa',
    `e.earned_at IS NOT NULL AND ${flow('e.earned_at')}`,
    'period_flow',
    ['maker_entitlement'],
    'Original recorded company amount before later adjustments. Not company net profit; saved historical terms remain authoritative.',
  );
  m(
    'makers',
    'maker_held',
    'Maker held position',
    'maker_positions',
    'netPaisa',
    "status='held'",
    'current_position',
    ['maker_entitlement', 'maker_settlement_entry'],
    'Recorded held entitlements after paid allocations. No hold is shortened.',
  );
  m(
    'makers',
    'maker_reserved',
    'Maker payment reservations',
    'maker_by_seller',
    'reserved',
    '1=1',
    'current_position',
    ['maker_payout'],
    'Prepared, approved, processing and failed reservations remain reserved.',
  );
  m(
    'makers',
    'maker_balance',
    'Maker unpaid ledger balance',
    'maker_by_seller',
    'ledgerBalance',
    '1=1',
    'current_position',
    ['maker_settlement_entry', 'maker_payout'],
    'Recorded settlement entries less completed payments. This is an obligation, not available bank cash.',
  );
  m(
    'makers',
    'maker_payable',
    'Maker eligible position',
    'maker_by_seller',
    'CASE WHEN reserved<>0 OR positionNet<>ledgerBalance OR blockedNegative>0 THEN 0 WHEN available>0 THEN available ELSE 0 END',
    '1=1',
    'current_position',
    ['maker_entitlement', 'maker_payout'],
    'Uses saved delivery/payment, hold, case, refund and reservation checks. Payment preparation still requires its existing workflow.',
  );
  m(
    'makers',
    'maker_paid',
    'Maker payments paid',
    'managed_payouts',
    'amount_paisa',
    `status='paid' AND ${flow('paid_at')}`,
    'period_flow',
    ['maker_payout'],
    'Completed recorded maker payments in this period, separate from seller payouts.',
  );
  m(
    'cash',
    'cod_collected',
    'Posted COD collections',
    'parcel_cash_records',
    'amount_paisa',
    `kind='collection' AND status='posted' AND ${flow('COALESCE(approved_at,created_at)')}`,
    'period_flow',
    ['parcel_collection'],
    'Recorded customer collections. Not proof of a bank deposit.',
  );
  m(
    'cash',
    'cod_remitted',
    'Posted COD remittances',
    'parcel_cash_records',
    'amount_paisa',
    `kind='remittance' AND status='posted' AND ${flow('COALESCE(approved_at,created_at)')}`,
    'period_flow',
    ['parcel_remittance'],
    'A separate cash stage; never add remittance to collection as revenue.',
  );
  const refundWhere = `status='paid' AND ${flow('processed_at')}`;
  m('refunds', 'service_fee_refunded', 'Legally required Platform service fee refunds', 'audit_logs a', "json_extract(a.next_json,'$.request.amountPaisa')", `a.action='platform_service_fee.refunded' AND a.subject_type='order' AND ${flow('a.created_at')}`, 'period_flow', ['service_fee_refund'], 'Separate fee-only cash refund records with a legal basis and payment reference. Seller commission and merchandise credits are unchanged.');
  m(
    'refunds',
    'refund_cash',
    'Product and delivery cash refunds paid',
    'refunds',
    'amount_paisa-wallet_credit_paisa-referral_discount_paisa-promo_discount_paisa',
    refundWhere,
    'period_flow',
    ['refund'],
    'Paid gross merchandise/delivery refund minus restored shopping credit and voided referral/promo discounts. Platform service fee refunds are shown separately.',
  );
  m(
    'refunds',
    'refund_credit',
    'Refund credit restored',
    'refunds',
    'wallet_credit_paisa',
    refundWhere,
    'period_flow',
    ['refund'],
    'Credit component of paid refunds, not a cash payment.',
  );
  m(
    'refunds',
    'refund_discount',
    'Refund discount voided',
    'refunds',
    'referral_discount_paisa+promo_discount_paisa',
    refundWhere,
    'period_flow',
    ['refund'],
    'Voided discount component; not money refunded to a customer.',
  );
  m(
    'wallet',
    'wallet_balance',
    'Recorded shopping-credit balances',
    'wallet_accounts',
    'balance_paisa',
    '1=1',
    'current_position',
    ['wallet_entry'],
    'Stored promotional shopping-credit balances; no reward release is performed.',
  );
  m(
    'wallet',
    'wallet_movement',
    'Net recorded credit movements',
    'wallet_entries',
    'amount_paisa',
    flow('created_at'),
    'period_flow',
    ['wallet_entry'],
    'Signed wallet entries. Funding and redemption references are not additional income.',
  );
  m(
    'referrals',
    'referral_promised',
    'Recorded referral reward amounts',
    'referral_redemptions',
    'reward_paisa',
    flow('created_at'),
    'period_flow',
    ['referral_redemption'],
    'Saved referral amounts; earning/release conditions still apply. Not an automatic new wallet credit.',
  );
  m(
    'promo',
    'promo_discounts',
    'Recorded promo discounts',
    'promo_redemptions',
    'discount_paisa',
    flow('created_at'),
    'period_flow',
    ['promo_redemption'],
    'Original recorded discounts; not completed-order revenue or a second wallet cost.',
  );
  m(
    'loyalty',
    'loyalty_credit',
    'Recorded loyalty credit redemptions',
    'loyalty_redemptions',
    'credit_paisa',
    flow('created_at'),
    'period_flow',
    ['loyalty_redemption'],
    'Actual stored redemptions only. Unsaved weekly values and paused setup create no amount.',
  );
  m(
    'gifts',
    'gift_issued',
    'Gift credit issued (face value)',
    'gift_cards',
    'amount_paisa',
    flow('issued_at'),
    'period_flow',
    ['gift_card'],
    'Promotional/shopping-credit face values; not proof the cards were sold for cash. Linked wallet credit is not added again.',
  );
  return out;
}

function sourceRows(group: AccountingGroup): string[] {
  function row(
    kind: SourceKind,
    table: string,
    id: string,
    amount: string,
    at: string,
    state: string,
    model = 'NULL',
    reference = id,
    points = 'NULL',
  ) {
    return `SELECT ${quote(kind)} AS sourceKind,${text(id)} AS sourceId,${at} AS recordedAt,${amount === 'NULL' ? 'NULL' : text(amount)} AS amount,${points === 'NULL' ? 'NULL' : text(points)} AS points,${state} AS state,${model} AS model,${text(reference)} AS reference FROM ${table}`;
  }
  switch (group) {
    case 'service_fees': return [row('order_service_fee', 'orders o LEFT JOIN order_customer_service_fees f ON f.order_id=o.id LEFT JOIN customer_fee_waiver_revisions r ON r.campaign_id=f.campaign_id AND r.revision=f.campaign_revision WHERE o.buyer_platform_fee_paisa>0 OR f.waived_paisa>0', 'o.id', 'o.buyer_platform_fee_paisa', 'o.created_at', 'o.payment_status', "COALESCE(r.name,'recorded customer service fee')", 'o.order_number')];
    case 'sellers':
      return [
        row(
          'seller_ledger_entry',
          `seller_ledger_entries l WHERE ${independent('l')}`,
          'l.id',
          'l.amount_paisa',
          'l.created_at',
          'l.type',
          "'independent_seller'",
        ),
        row(
          'seller_payout',
          'payouts',
          'id',
          'amount_paisa',
          "CASE WHEN status='paid' THEN paid_at ELSE created_at END",
          'status',
          "'independent_seller'",
          'payout_number',
        ),
        row(
          'order_item',
          `order_items i JOIN orders o ON o.id=i.order_id WHERE ${independentItem}`,
          'i.id',
          'i.commission_paisa',
          'o.created_at',
          "'stored commission estimate'",
          "'independent_seller'",
          'o.order_number',
        ),
      ];
    case 'makers':
      return [
        row(
          'maker_entitlement',
          'managed_entitlements e LEFT JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id',
          'e.id',
          'e.calculated_paisa',
          'e.created_at',
          'e.status',
          's.commercial_model',
        ),
        row(
          'maker_settlement_entry',
          'managed_settlement_entries x LEFT JOIN managed_entitlements e ON e.id=x.entitlement_id LEFT JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id',
          'x.id',
          'x.amount_paisa',
          'x.created_at',
          'x.type',
          's.commercial_model',
        ),
        row(
          'maker_payout',
          'managed_payouts',
          'id',
          'amount_paisa',
          "CASE WHEN status='paid' THEN paid_at ELSE created_at END",
          'status',
          "'recorded maker payment'",
          'payout_number',
        ),
      ];
    case 'cash':
      return [
        row(
          'parcel_collection',
          "parcel_cash_records WHERE kind='collection'",
          'id',
          'amount_paisa',
          'COALESCE(approved_at,created_at)',
          'status',
        ),
        row(
          'parcel_remittance',
          "parcel_cash_records WHERE kind='remittance'",
          'id',
          'amount_paisa',
          'COALESCE(approved_at,created_at)',
          'status',
        ),
      ];
    case 'refunds':
      return [
        row('service_fee_refund', "audit_logs WHERE action='platform_service_fee.refunded' AND subject_type='order'", 'id', "json_extract(next_json,'$.request.amountPaisa')", 'created_at', "'paid'", "'lawful fee refund'", 'subject_id'),
        row(
          'refund',
          'refunds',
          'id',
          'amount_paisa-wallet_credit_paisa-referral_discount_paisa-promo_discount_paisa',
          'COALESCE(processed_at,requested_at)',
          'status',
        ),
      ];
    case 'wallet':
      return [
        row(
          'wallet_entry',
          'wallet_entries',
          'id',
          'amount_paisa',
          'created_at',
          'kind',
        ),
      ];
    case 'referrals':
      return [
        row(
          'referral_redemption',
          'referral_redemptions',
          'order_id',
          'reward_paisa',
          'created_at',
          "'recorded offer; conditions apply'",
        ),
      ];
    case 'promo':
      return [
        row(
          'promo_redemption',
          'promo_redemptions',
          'id',
          'discount_paisa',
          'created_at',
          "'recorded discount'",
        ),
      ];
    case 'loyalty':
      return [
        row(
          'loyalty_claim',
          'loyalty_daily_claims',
          'id',
          'NULL',
          'created_at',
          "'points claim'",
          'NULL',
          'id',
          'awarded_points',
        ),
        row(
          'loyalty_redemption',
          'loyalty_redemptions',
          'id',
          'credit_paisa',
          'created_at',
          "'credit redemption'",
          'NULL',
          'id',
          'points',
        ),
      ];
    case 'gifts':
      return [
        row(
          'gift_card',
          'gift_cards',
          'id',
          'amount_paisa',
          'issued_at',
          "CASE WHEN redeemed_at IS NULL THEN 'issued' ELSE 'redeemed' END",
        ),
      ];
    case 'documents':
      return [
        row(
          'invoice_adjustment',
          'managed_invoice_adjustments',
          'id',
          'amount_paisa',
          'issued_at',
          'kind',
          "'simulated document only'",
          'adjustment_number',
        ),
      ];
    default:
      return [];
  }
}

const sectionKinds: Record<
  AccountingQuery['section'],
  readonly SourceKind[] | null
> = {
  overview: null,
  issues: [],
  sellers: ['order_item', 'seller_ledger_entry', 'seller_payout'],
  makers: ['maker_entitlement', 'maker_settlement_entry', 'maker_payout'],
  cash: [
    'service_fee_refund',
    'order_service_fee',
    'parcel_collection',
    'parcel_remittance',
    'refund',
    'invoice_adjustment',
  ],
  incentives: [
    'wallet_entry',
    'referral_redemption',
    'promo_redemption',
    'loyalty_claim',
    'loyalty_redemption',
    'gift_card',
  ],
};
function blank(
  tag: string,
  key: string,
  amount = 'NULL',
  state = "''",
  reference = "''",
  sourceKind = "''",
) {
  return `SELECT ${quote(tag)} AS tag,${quote(key)} AS sourceKey,${amount} AS amount,NULL AS points,0 AS recordedAt,${state} AS state,NULL AS model,${reference} AS reference,${sourceKind} AS sourceKind`;
}
function missingMetrics(
  defs: Definition[],
  available: ReadonlySet<AccountingGroup>,
): AccountingMetric[] {
  return defs
    .filter((d) => !available.has(d.group))
    .map(({ expression: _expression, group: _group, ...d }) => ({
      ...d,
      status: 'unavailable',
      explanation:
        'Source records are unavailable. No zero balance has been assumed.',
    }));
}
function safeCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError('Invalid record count');
  return n;
}

/** Only readiness SELECTs followed by ONE financial SELECT: also consistent under MariaDB READ COMMITTED. */
export async function readAccountingSources(
  db: D1Database,
  query: AccountingQuery,
  observedAt: number,
  environment: string,
): Promise<AccountingSourceBundle> {
  const mariaDb = (db as unknown as { dialect?: string }).dialect === 'mariadb';
  const defs = definitions(query, observedAt),
    available = new Set<AccountingGroup>(),
    issues: AccountingIssue[] = [];
  const probes = new Map<string, Promise<boolean>>();
  for (const table of Object.keys(accountingColumns))
    probes.set(
      table,
      (async () => {
        try {
          await db
            .prepare(
              `SELECT ${accountingColumns[table]} FROM ${table} WHERE 1=0`,
            )
            .all();
          return true;
        } catch {
          return false;
        }
      })(),
    );
  for (const [group, tables] of Object.entries(accountingGroups)) {
    if ((await Promise.all(tables.map((t) => probes.get(t)!))).every(Boolean))
      available.add(group as AccountingGroup);
    else
      issues.push({
        code: 'source_unavailable',
        message: `${group}: required source records are unavailable. Review readiness; no data was created or repaired.`,
      });
  }
  const metrics = missingMetrics(defs, available);
  const parts: string[] = [],
    ctes: string[] = [];
  if (available.has('makers'))
    ctes.push(
      makerCte(
        observedAt,
        mariaDb,
      ),
    );
  const rows = [...available].flatMap(sourceRows).map(sql => unionBranch(sql, mariaDb, true));
  const emptyRows =
    "SELECT '' AS sourceKind,'' AS sourceId,0 AS recordedAt,NULL AS amount,NULL AS points,'' AS state,NULL AS model,'' AS reference WHERE 1=0";
  ctes.push(
    `source_rows AS (${rows.length ? boundedUnion(rows, ctes, 'source_group') : emptyRows})`,
  );
  for (const d of defs.filter((d) => available.has(d.group)))
    parts.push(blank('metric', d.key, text(d.expression)));
  for (const group of Object.keys(accountingGroups) as AccountingGroup[]) {
    const count = available.has(group)
      ? group === 'suppliers'
        ? '(SELECT COUNT(*) FROM managed_supplier_obligations)'
        : `(SELECT COUNT(*) FROM (${sourceRows(group).map(sql => unionBranch(sql, mariaDb, true)).join(' UNION ALL ')}) counted)`
      : 'NULL';
    parts.push(blank('coverage', group, text(count)));
  }
  if (available.has('makers')) {
    parts.push(
      blank(
        'issue_count',
        'unsafe_money',
        text(
          'SELECT COUNT(*) FROM maker_positions WHERE eligible=1 AND ready=0',
        ),
        "''",
        quote(
          'Maker refund parity could not be confirmed exactly. Use the existing maker finance workflow to review the original facts.',
        ),
      ),
    );
    parts.push(
      blank(
        'issue_count',
        'source_mismatch',
        text(
          'SELECT COUNT(*) FROM managed_commercial_snapshots WHERE eligible_base_paisa IS NULL OR platform_retained_paisa IS NULL OR maker_entitlement_paisa IS NULL OR eligible_base_paisa<>platform_retained_paisa+maker_entitlement_paisa',
        ),
        "''",
        quote(
          'Original maker snapshot amounts do not reconcile; no split was recalculated.',
        ),
      ),
    );
    parts.push(
      blank(
        'issue_count',
        'source_mismatch',
        text(
          'SELECT COUNT(*) FROM maker_by_seller WHERE positionNet<>ledgerBalance',
        ),
        "''",
        quote(
          'Maker paid allocations and the recorded ledger balance need reconciliation.',
        ),
      ),
    );
    parts.push(
      `SELECT 'issue' AS tag,e.id AS sourceKey,NULL AS amount,NULL AS points,0 AS recordedAt,'missing_attribution' AS state,NULL AS model,'Maker earning has no original commercial snapshot.' AS reference,'maker_entitlement' AS sourceKind FROM managed_entitlements e WHERE NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots s WHERE s.id=e.snapshot_id) LIMIT 50`,
    );
    // Keep LIMIT inside a subquery before UNION-ing the other result classes.
    parts[parts.length - 1] =
      `SELECT * FROM (${parts[parts.length - 1]}) missing_maker`;
    parts.push(
      `SELECT * FROM (SELECT 'issue' AS tag,s.id AS sourceKey,NULL AS amount,NULL AS points,0 AS recordedAt,'unknown_model' AS state,NULL AS model,'Recorded maker model needs review; no new split was inferred.' AS reference,'maker_entitlement' AS sourceKind FROM managed_commercial_snapshots s WHERE s.commercial_model IS NULL OR s.commercial_model NOT IN ('managed_sale_linked_percentage_v1','managed_fixed_supplier_price_v1') LIMIT 50) unknown_model`,
    );
  }
  if (available.has('suppliers'))
    parts.push(
      blank(
        'issue_count',
        'classification_required',
        text('SELECT COUNT(*) FROM managed_supplier_obligations'),
        "''",
        quote(
          'Fixed-supplier obligations require their own source review and retain their recorded commercial terms.',
        ),
      ),
    );
  const kinds = sectionKinds[query.section],
    conditions = ['recordedAt>=?', 'recordedAt<?'];
  const bindings: (number | string)[] = [query.fromAt, query.toExclusive];
  if (kinds)
    conditions.push(
      kinds.length ? `sourceKind IN (${kinds.map(quote).join(',')})` : '1=0',
    );
  if (query.cursor) {
    conditions.push(
      '(recordedAt<? OR (recordedAt=? AND sourceKind<?) OR (recordedAt=? AND sourceKind=? AND HEX(sourceId)<HEX(?)))',
    );
    const c = query.cursor;
    bindings.push(
      c.recordedAt,
      c.recordedAt,
      c.sourceKind,
      c.recordedAt,
      c.sourceKind,
      c.sourceId,
    );
  }
  bindings.push(query.pageSize + 1);
  ctes.push(
    `page_rows AS (SELECT * FROM source_rows WHERE ${conditions.join(' AND ')} ORDER BY recordedAt DESC,sourceKind DESC,HEX(sourceId) DESC LIMIT ?)`,
  );
  parts.push(
    "SELECT 'row' AS tag,sourceId AS sourceKey,amount,points,recordedAt,state,model,reference,sourceKind FROM page_rows",
  );
  const output: AccountingSourceBundle = {
    observedAt,
    environment,
    metrics,
    rows: [],
    issues,
    nextCursor: null,
    coverage: [],
  };
  try {
    ctes.push(`combined AS (${boundedUnion(parts.map(sql => unionBranch(sql, mariaDb, false)), ctes, 'result_group')})`);
    const result = await db
      .prepare(
        `WITH ${ctes.join(',')} SELECT * FROM combined ORDER BY tag,recordedAt DESC,sourceKind DESC,HEX(sourceKey) DESC`,
      )
      .bind(...bindings)
      .all<Raw>();
    const dataRows: AccountingSourceRow[] = [];
    const coverage: { source: string; available: boolean; rowCount: number }[] =
      [];
    for (const r of result.results) {
      if (r.tag === 'metric') {
        const d = defs.find((d) => d.key === r.sourceKey)!;
        const { expression: _expression, group: _group, ...meta } = d;
        metrics.push({
          ...meta,
          amountPaisa: paisa(r.amount!),
          status: 'available',
        });
      } else if (r.tag === 'coverage')
        coverage.push({
          source: r.sourceKey,
          available: r.amount !== null,
          rowCount: r.amount === null ? 0 : safeCount(r.amount),
        });
      else if (r.tag === 'issue_count' && safeCount(r.amount) > 0)
        issues.push({
          code: r.sourceKey as AccountingIssue['code'],
          message: `${r.reference} (${r.amount} records)`,
        });
      else if (r.tag === 'issue')
        issues.push({
          code: r.state as AccountingIssue['code'],
          message: r.reference,
          sourceKind: r.sourceKind,
          sourceId: r.sourceKey,
        });
      else if (r.tag === 'row') {
        const at = Number(r.recordedAt);
        if (!Number.isSafeInteger(at) || at < 0)
          throw new RangeError('Invalid source time');
        dataRows.push({
          sourceKind: r.sourceKind,
          sourceId: r.sourceKey,
          recordedAt: at,
          amountPaisa: r.amount === null ? null : paisa(r.amount),
          points: r.points === null ? null : paisa(r.points),
          model: r.model,
          state: r.state,
          reference: r.reference || r.sourceKey,
        });
      }
    }
    output.rows = dataRows.slice(0, query.pageSize);
    output.nextCursor =
      dataRows.length > query.pageSize
        ? encodeAccountingCursor(query, output.rows[output.rows.length - 1])
        : null;
    output.coverage = coverage;
    if (issues.some((i) => i.code !== 'source_unavailable'))
      for (const m of metrics)
        if (m.sourceKinds.some((k) => k.startsWith('maker_'))) {
          m.status = 'needs_review';
          if (m.key === 'maker_payable') m.amountPaisa = null;
        }
  } catch {
    output.metrics = defs.map(
      ({ expression: _expression, group: _group, ...d }) => ({
        ...d,
        status: 'unavailable',
        amountPaisa: null,
        explanation:
          'A consistent exact financial read was unavailable. Reload or review source readiness; no balance has been assumed.',
      }),
    );
    output.rows = [];
    output.nextCursor = null;
    output.coverage = Object.keys(accountingGroups).map((source) => ({
      source,
      available: false,
      rowCount: 0,
    }));
    issues.push({
      code: 'source_unavailable',
      message:
        'The financial snapshot could not be read safely. No data was changed.',
    });
  }
  const finalMetrics = [...output.metrics];
  for (const [key, label] of [
    ['bank_balance', 'Bank balance'],
    ['operating_expenses', 'Company operating expenses'],
    ['tax_payable', 'Tax payable'],
    ['net_profit', 'Company net profit'],
  ])
    finalMetrics.push({
      key,
      label,
      amountPaisa: null,
      status: 'unavailable',
      basis: 'current_position',
      sourceKinds: [],
      explanation:
        'Not connected. Company books and bank balances are outside this read-only release.',
    });
  finalMetrics.sort((a, b) => a.key.localeCompare(b.key));
  return { ...output, metrics: finalMetrics };
}
