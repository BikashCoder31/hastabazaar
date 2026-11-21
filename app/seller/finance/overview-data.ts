import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { payoutRunCalendar } from '@/lib/payments/payout-run-calendar';
import { sellerBankState } from '@/lib/sellers/bank-details';

const localTime = 'Asia/Kathmandu';

function monthBounds(now: number) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: localTime, month: '2-digit', year: 'numeric' }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const nepalStart = (y: number, m: number) => Date.parse(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+05:45`);
  return [nepalStart(year, month), month === 12 ? nepalStart(year + 1, 1) : nepalStart(year, month + 1)] as const;
}

export async function readEarningsOverview(db: D1Database, sellerId: string, ownerId: string, now: number) {
  const [monthStart, monthEnd] = monthBounds(now);
  const [upcoming, paid, bank, weekday, cutoff, timezone, hold, fee, example] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT i.order_id) AS orders, COALESCE(SUM(i.line_total_paisa - i.commission_paisa), 0) AS amountPaisa
      FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE i.seller_id=? AND o.status IN ('pending_payment','confirmed','packing','ready_for_pickup','dispatched')
       AND i.fulfillment_status IN ('pending_payment','confirmed','packing','ready_for_pickup','dispatched')
       AND COALESCE(i.commission_rule_version,'') NOT LIKE 'managed-%'
       AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=i.id)`)
      .bind(sellerId).first<{ orders: number; amountPaisa: number }>(),
    db.prepare(`SELECT COUNT(*) AS payouts, COALESCE(SUM(amount_paisa), 0) AS amountPaisa FROM payouts
      WHERE seller_id=? AND status='paid' AND paid_at>=? AND paid_at<?`)
      .bind(sellerId, monthStart, monthEnd).first<{ payouts: number; amountPaisa: number }>(),
    readMaskedBank(db, sellerId, ownerId, now),
    getEffectiveBusinessSetting(db, 'payout_processing_weekday', now),
    getEffectiveBusinessSetting(db, 'payout_cutoff_local_time', now),
    getEffectiveBusinessSetting(db, 'payout_timezone', now),
    getEffectiveBusinessSetting(db, 'seller_delivery_hold_days', now),
    getEffectiveBusinessSetting(db, 'platform_service_fee_policy', now),
    db.prepare(`SELECT price_paisa AS amountPaisa FROM products WHERE seller_id=? AND status='published' AND price_paisa>0
      ORDER BY updated_at DESC, id LIMIT 1`).bind(sellerId).first<{ amountPaisa: number }>(),
  ]);
  return {
    upcoming, paid, bank,
    payoutCalendar: payoutRunCalendar(now, weekday.value, cutoff.value, timezone.value),
    cutoff: cutoff.value,
    holdDays: hold.value,
    marketplaceFee: fee.value,
    exampleSalePaisa: example?.amountPaisa ?? null,
  };
}

async function readMaskedBank(db: D1Database, sellerId: string, ownerId: string, now: number) {
  const state = await sellerBankState(db, sellerId, undefined, now);
  if (state.status !== 'verified') return null;
  const extract = (key: 'bankName' | 'bankAccountNumber' | 'payoutBeneficiary') => {
    const expression = `json_extract(b.details_json, '$.${key}')`;
    return (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? `JSON_UNQUOTE(${expression})` : expression;
  };
  return db.prepare(`SELECT ${extract('bankName')} AS bankName, substr(${extract('bankAccountNumber')}, -4) AS lastFour,
    ${extract('payoutBeneficiary')} AS beneficiary, s.payout_account_reference AS reference
    FROM seller_profiles s JOIN seller_beneficiary_versions b
      ON b.seller_id=s.id AND b.id=substr(s.payout_account_reference,13)
    WHERE s.id=? AND s.user_id=? AND s.payout_account_reference=?`)
    .bind(sellerId, ownerId, state.reference).first<{ bankName: string; lastFour: string; beneficiary: string; reference: string }>();
}

export function payoutCutoffLabel(time: string) {
  return new Intl.DateTimeFormat('en-NP', { hour: 'numeric', minute: 'numeric', timeZone: localTime })
    .format(new Date('2000-01-01T' + time + ':00+05:45'));
}
