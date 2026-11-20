import { getLoyaltyState } from '@/lib/db/repositories/loyalty';
import {
  getReferralCampaign,
  WalletConflictError,
} from '@/lib/db/repositories/wallet';
import { GiftCardOutcomeError } from '@/lib/gift-cards/command-outcomes';
import {
  assertGiftCardViewScope,
  readGiftCardViewScope,
} from '@/lib/gift-cards/view-scope';
import { nepalRewardDay } from '@/lib/incentives/loyalty-policy';
import { incentiveDate, incentiveMoney } from '@/lib/incentives/presentation';
import { IncentiveError, type LoyaltyState } from '@/lib/incentives/types';

export const offerCategories = [
  ['all', 'All'],
  ['promo', 'Promo codes'],
  ['referral', 'Referrals'],
  ['loyalty', 'Loyalty'],
  ['gift', 'Gift cards'],
] as const;

export type OfferCategory = (typeof offerCategories)[number][0];
export const offersPerPage = 24;

type Budget = { unit: 'paisa' | 'points'; used: number; limit: number };
export interface OfferRow {
  id: string;
  kind: Exclude<OfferCategory, 'all'>;
  title: string;
  status: string;
  rule: string;
  href: string;
  orders: number | null;
  budget: Budget | null;
  budgetDescription?: string;
}

interface SavedPromotion {
  id: string;
  code: string;
  published: number;
  paused: number;
  usedCount: number;
  spentPaisa: number;
  kind: 'fixed' | 'percentage';
  fixedPaisa: number | null;
  percentBps: number | null;
  maxDiscountPaisa: number | null;
  minimumSubtotalPaisa: number;
  startsAt: number;
  endsAt: number;
  totalUseLimit: number;
  perCustomerUseLimit: number;
  budgetPaisa: number;
}

function promotion(row: SavedPromotion, now: number): OfferRow {
  const status = !row.published
    ? 'Draft'
    : row.paused
      ? 'Paused'
      : row.endsAt <= now
        ? 'Ended'
        : row.startsAt > now
          ? 'Upcoming'
          : row.spentPaisa >= row.budgetPaisa
            ? 'Budget used'
            : row.usedCount >= row.totalUseLimit
              ? 'Limit reached'
              : 'Live';
  const discount =
    row.kind === 'fixed'
      ? `${incentiveMoney(row.fixedPaisa!)} off`
      : `${row.percentBps! / 100}% off, max ${incentiveMoney(row.maxDiscountPaisa!)}`;
  const minimum = row.minimumSubtotalPaisa
    ? ` on ${incentiveMoney(row.minimumSubtotalPaisa)} or more`
    : '';
  const useLimit =
    row.perCustomerUseLimit === 1 ? ' · One use per customer' : '';
  return {
    id: row.id,
    kind: 'promo',
    title: row.code,
    status,
    rule: `Promo code · ${discount}${minimum}${useLimit}`,
    href: `/admin/promo-codes?campaign=${encodeURIComponent(row.id)}&returnTo=%2Fadmin%2Foffers#manage`,
    orders: row.usedCount,
    budget: { unit: 'paisa', used: row.spentPaisa, limit: row.budgetPaisa },
  };
}

function loyaltyOffer(state: LoyaltyState | null, now: number): OfferRow {
  const base = {
    id: 'daily-points',
    kind: 'loyalty' as const,
    title: 'Daily points',
    href: '/admin/loyalty',
    orders: null,
  };
  if (!state)
    return {
      ...base,
      status: 'Unavailable',
      rule: 'Loyalty rules are unavailable',
      budget: null,
      budgetDescription: 'Budget unavailable',
    };
  if (state.publishedRevision === 0)
    return {
      ...base,
      status: state.scheduleBlockedReason
        ? 'Review needed'
        : state.scheduledFor === null
          ? 'Off'
          : 'Upcoming',
      rule:
        state.scheduledFor === null
          ? 'Loyalty points · No published rules'
          : `Loyalty points · Scheduled for ${incentiveDate(state.scheduledFor)} NPT`,
      budget: null,
      budgetDescription: 'No current point budget set',
    };
  const terms = state.publishedTerms;
  const smallestAward = terms.weeklyPoints?.[0] ?? terms.dailyPoints;
  const status = state.scheduleBlockedReason
    ? 'Review needed'
    : !terms.enabled
      ? 'Off'
      : state.paused
        ? 'Paused'
        : terms.endsAt !== null && terms.endsAt <= now
          ? 'Ended'
          : terms.startsAt !== null && terms.startsAt > now
            ? 'Upcoming'
            : terms.lifetimeBudgetPoints !== null &&
                smallestAward > terms.lifetimeBudgetPoints - state.issuedPoints
              ? 'Budget used'
              : terms.dailyBudgetPoints !== null &&
                  smallestAward >
                    terms.dailyBudgetPoints - state.issuedTodayPoints
                ? 'Daily limit reached'
                : 'Live';
  const earning = terms.weeklyPoints
    ? `Day 1–7: ${terms.weeklyPoints.join(', ')} points`
    : `${terms.dailyPoints} points per daily claim`;
  const { pointsPerBlock, creditPaisaPerBlock } =
    state.lockedDenomination ?? terms;
  return {
    ...base,
    status,
    rule: `Loyalty points · ${earning} · ${pointsPerBlock.toLocaleString('en-NP')} points = ${incentiveMoney(creditPaisaPerBlock)}`,
    budget:
      terms.lifetimeBudgetPoints === null
        ? null
        : {
            unit: 'points',
            used: state.issuedPoints,
            limit: terms.lifetimeBudgetPoints,
          },
    budgetDescription: 'No lifetime point budget set',
  };
}

async function monthlyOfferCosts(
  db: D1Database,
  from: number,
  through: number,
) {
  // Add original recorded amounts as integers, including unlike sources and totals above the safe Number range.
  const amounts = await db
    .prepare(`
    SELECT 'promo' AS source, discount_paisa AS amount FROM promo_redemptions WHERE created_at BETWEEN ? AND ?
    UNION ALL
    SELECT 'referral', o.referral_discount_paisa FROM referral_redemptions r JOIN orders o ON o.id=r.order_id
      WHERE r.created_at BETWEEN ? AND ? AND o.status<>'cancelled'
    UNION ALL
    SELECT 'referral', amount_paisa FROM wallet_entries WHERE kind='referral_reward' AND created_at BETWEEN ? AND ?
    UNION ALL
    SELECT 'loyalty', credit_paisa FROM loyalty_redemptions WHERE created_at BETWEEN ? AND ?
  `)
    .bind(from, through, from, through, from, through, from, through)
    .all<{
      source: 'promo' | 'referral' | 'loyalty';
      amount: number;
    }>();
  const totals = { promo: BigInt(0), referral: BigInt(0), loyalty: BigInt(0) };
  for (const row of amounts.results) totals[row.source] += BigInt(row.amount);
  return {
    promo: totals.promo.toString(),
    referral: totals.referral.toString(),
    loyalty: totals.loyalty.toString(),
    total: (totals.promo + totals.referral + totals.loyalty).toString(),
  };
}

export async function readOffersOverview(
  db: D1Database,
  actor: { id: string; authSubject: string; role: 'admin' | 'super_admin' },
  category: OfferCategory,
  page: number,
  now = Date.now(),
) {
  if (actor.role !== 'super_admin')
    throw new GiftCardOutcomeError('Super Admin access is required.', 403);
  const scope = await readGiftCardViewScope(db, actor.id, 'staff');
  if (scope.role !== 'super_admin' || scope.authSubject !== actor.authSubject)
    throw new GiftCardOutcomeError(
      'Your current staff access has changed.',
      403,
    );

  const monthStart = Date.parse(
    nepalRewardDay(now).localDate.slice(0, 7) + '-01T00:00:00+05:45',
  );
  const include = (kind: OfferRow['kind']) =>
    category === 'all' || category === kind;
  const [counts, promos, campaign, loyalty, gift, monthly, average] =
    await Promise.all([
      db
        .prepare(`SELECT (SELECT COUNT(*) FROM promo_campaigns) AS promo,
      (SELECT COUNT(*) FROM referral_redemptions) AS referralOrders`)
        .first<{ promo: number; referralOrders: number }>(),
      include('promo')
        ? db
            .prepare(`
      SELECT c.id, c.code, CASE WHEN c.status='published' THEN 1 ELSE 0 END AS published,
        c.paused, c.used_count AS usedCount, c.spent_paisa AS spentPaisa,
        r.kind, r.fixed_paisa AS fixedPaisa, r.percent_bps AS percentBps, r.max_discount_paisa AS maxDiscountPaisa,
        r.minimum_subtotal_paisa AS minimumSubtotalPaisa, r.starts_at AS startsAt, r.ends_at AS endsAt,
        r.total_use_limit AS totalUseLimit, r.per_customer_use_limit AS perCustomerUseLimit,
        r.budget_paisa AS budgetPaisa
      FROM promo_campaigns c JOIN promo_revisions r
        ON r.campaign_id=c.id AND r.revision=COALESCE(c.current_revision,c.draft_revision)
      ORDER BY c.created_at DESC,c.id DESC LIMIT ? OFFSET ?
    `)
            .bind(offersPerPage, (page - 1) * offersPerPage)
            .all<SavedPromotion>()
        : null,
      include('referral')
        ? getReferralCampaign(db).catch((error: unknown) => {
            if (error instanceof WalletConflictError) return null;
            throw error;
          })
        : null,
      include('loyalty')
        ? getLoyaltyState(db, actor.id, now, actor.authSubject, {
            publishedOnly: true,
          }).catch((error: unknown) => {
            if (error instanceof IncentiveError && error.code === 'unavailable')
              return null;
            throw error;
          })
        : null,
      include('gift')
        ? db
            .prepare(
              `SELECT COUNT(*) AS available FROM gift_cards WHERE issued_at<=? AND redeemed_at IS NULL`,
            )
            .bind(now)
            .first<{ available: number }>()
        : null,
      monthlyOfferCosts(db, monthStart, now),
      db
        .prepare(`SELECT AVG(item_subtotal_paisa) AS amount FROM orders
      WHERE status<>'cancelled' AND item_subtotal_paisa>0 AND created_at BETWEEN ? AND ?`)
        .bind(monthStart, now)
        .first<{ amount: number | string | null }>(),
    ]);
  const offers = promos?.results.map((row) => promotion(row, now)) ?? [];
  if (include('referral')) {
    offers.push({
      id: 'invite-a-friend',
      kind: 'referral',
      title: 'Invite a friend',
      status: campaign ? (campaign.enabled ? 'Live' : 'Paused') : 'Unavailable',
      rule: campaign
        ? `Referrals & wallet · ${incentiveMoney(campaign.friendDiscountPaisa)} off an eligible first order of ${incentiveMoney(campaign.minimumSubtotalPaisa)} or more · ${incentiveMoney(campaign.rewardPaisa)} credit after the ${campaign.returnWindowDays}-day wait`
        : 'Referral rules are unavailable',
      href: '/admin/referrals',
      orders: counts?.referralOrders ?? null,
      budget: null,
      budgetDescription: 'No campaign budget set',
    });
  }
  if (include('loyalty')) offers.push(loyaltyOffer(loyalty, now));
  if (include('gift'))
    offers.push({
      id: 'gift-cards',
      kind: 'gift',
      title: 'Gift cards',
      status: gift?.available ? 'Available' : 'No active cards',
      rule: 'Gift cards · Redeem a code for shopping credit',
      href: '/admin/gift-cards',
      orders: null,
      budget: null,
      budgetDescription: 'No campaign budget set',
    });
  const averageSubtotal = Math.round(Number(average?.amount));
  await assertGiftCardViewScope(db, scope);
  return {
    offers,
    counts: {
      all: (counts?.promo ?? 0) + 3,
      promo: counts?.promo ?? 0,
      referral: 1,
      loyalty: 1,
      gift: 1,
    },
    monthly,
    averageSubtotalPaisa:
      Number.isSafeInteger(averageSubtotal) && averageSubtotal > 0
        ? averageSubtotal
        : null,
  };
}
