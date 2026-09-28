export class WalletConflictError extends Error {}

export interface ReferralCampaign {
  enabled: number;
  friendDiscountPaisa: number;
  rewardPaisa: number;
  minimumSubtotalPaisa: number;
  returnWindowDays: number;
}

export async function getReferralCampaign(
  db: D1Database,
): Promise<ReferralCampaign> {
  const campaign = await db
    .prepare(`SELECT enabled, friend_discount_paisa AS friendDiscountPaisa,
    reward_paisa AS rewardPaisa, minimum_subtotal_paisa AS minimumSubtotalPaisa,
    return_window_days AS returnWindowDays FROM referral_campaign WHERE id = 'default'`)
    .first<ReferralCampaign>();
  if (!campaign)
    throw new WalletConflictError(
      'Referral offers are temporarily unavailable.',
    );
  return campaign;
}

export async function ensureWallet(
  db: D1Database,
  userId: string,
  now = Date.now(),
) {
  await db
    .prepare(`INSERT OR IGNORE INTO wallet_accounts (user_id,referral_code,balance_paisa,created_at)
    VALUES (?, ?, 0, ?)`)
    .bind(
      userId,
      crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
      now,
    )
    .run();
}

// One INSERT statement decides eligibility and posts the reward. Unique ids make retries safe.
// Returns/complaints pause release; paid refunds or a replacement make the order ineligible.
export async function releaseReferralRewards(
  db: D1Database,
  userId: string,
  now = Date.now(),
) {
  // Concurrent page loads can deadlock this idempotent insert in MariaDB.
  // Its unique reward/order key makes retrying only a rolled-back deadlock safe.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db
        .prepare(`INSERT OR IGNORE INTO wallet_entries
    (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
    SELECT 'reward:' || r.order_id, r.referrer_id, r.order_id, r.reward_paisa, -r.reward_paisa, 'referral_reward', ?
    FROM referral_redemptions r INNER JOIN orders o ON o.id = r.order_id
    INNER JOIN users u ON u.id = r.referrer_id
    WHERE r.referrer_id = ? AND u.status = 'active'
      AND o.status = 'delivered' AND o.payment_status = 'paid'
      AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=o.id AND (j.status NOT IN ('delivered','cancelled') OR p.remitted_paisa<>p.cod_due_paisa))
      AND o.delivered_at IS NOT NULL AND o.delivered_at + r.wait_days * 86400000 < ?
      AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'captured')
      AND NOT EXISTS (SELECT 1 FROM return_requests t INNER JOIN order_items ti ON ti.id=t.order_item_id WHERE ti.order_id = o.id AND t.status NOT IN ('rejected','cancelled'))
      AND NOT EXISTS (SELECT 1 FROM complaints c WHERE c.order_id = o.id AND c.status NOT IN ('resolved','closed'))
      AND NOT EXISTS (SELECT 1 FROM wallet_entries e WHERE e.id = 'reward:' || r.order_id)
    `)
        .bind(now, userId, now)
        .run();
      return;
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'ER_LOCK_DEADLOCK' ||
        attempt === 2
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

export async function getWallet(
  db: D1Database,
  userId: string,
  now = Date.now(),
) {
  await ensureWallet(db, userId, now);
  await releaseReferralRewards(db, userId, now);
  const account = await db
    .prepare(`SELECT balance_paisa AS balancePaisa, referral_code AS referralCode
    FROM wallet_accounts WHERE user_id = ?`)
    .bind(userId)
    .first<{ balancePaisa: number; referralCode: string }>();
  if (!account)
    throw new WalletConflictError('Your wallet could not be loaded.');
  const [entries, referrals, campaign] = await Promise.all([
    db
      .prepare(`SELECT e.id, e.kind, e.amount_paisa AS amountPaisa, e.created_at AS createdAt,
      o.order_number AS orderNumber FROM wallet_entries e LEFT JOIN orders o ON o.id=e.order_id
      WHERE e.user_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 100`)
      .bind(userId)
      .all<{
        id: string;
        kind: string;
        amountPaisa: number;
        createdAt: number;
        orderNumber: string | null;
      }>(),
    db
      .prepare(`SELECT r.order_id AS id, r.reward_paisa AS rewardPaisa, r.created_at AS createdAt,
      o.delivered_at + r.wait_days * 86400000 AS eligibleAt,
      CASE WHEN EXISTS (SELECT 1 FROM wallet_entries e WHERE e.id = 'reward:' || r.order_id) THEN 'earned'
        WHEN o.status='cancelled' OR o.payment_status IN ('refunded','part_refunded') THEN 'not_eligible'
        WHEN EXISTS (SELECT 1 FROM return_requests t INNER JOIN order_items ti ON ti.id=t.order_item_id WHERE ti.order_id=o.id AND t.status='resolved' AND t.resolution_outcome IN ('refund','replacement','return_to_origin')) THEN 'not_eligible'
        WHEN EXISTS (SELECT 1 FROM return_requests t INNER JOIN order_items ti ON ti.id=t.order_item_id WHERE ti.order_id=o.id AND t.status NOT IN ('rejected','cancelled'))
          OR EXISTS (SELECT 1 FROM complaints c WHERE c.order_id=o.id AND c.status NOT IN ('resolved','closed')) THEN 'on_hold'
        ELSE 'pending' END AS status
      FROM referral_redemptions r INNER JOIN orders o ON o.id=r.order_id
      WHERE r.referrer_id=? ORDER BY r.created_at DESC LIMIT 100`)
      .bind(userId)
      .all<{
        id: string;
        rewardPaisa: number;
        createdAt: number;
        eligibleAt: number | null;
        status: string;
      }>(),
    getReferralCampaign(db),
  ]);
  return {
    ...account,
    entries: entries.results,
    referrals: referrals.results,
    campaign,
  };
}

export function normalizeReferralPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('977') && digits.length > 10
    ? digits.slice(3)
    : digits;
}

export async function quoteOrderCredit(
  db: D1Database,
  options: {
    userId: string | null;
    subtotalPaisa: number;
    useWallet?: boolean;
    referralCode?: string;
    merchandiseDiscountPaisa?: number;
    phone: string;
    now: number;
  },
) {
  const { userId, subtotalPaisa, now } = options;
  const code = options.referralCode?.trim().toUpperCase() || '';
  const merchandiseDiscountPaisa = options.merchandiseDiscountPaisa ?? 0;
  if (!Number.isSafeInteger(merchandiseDiscountPaisa) || merchandiseDiscountPaisa < 0 || merchandiseDiscountPaisa > subtotalPaisa ||
    (options.merchandiseDiscountPaisa !== undefined && code))
    throw new WalletConflictError('Review the selected merchandise discount.');
  if (!userId) {
    if (options.useWallet || code || options.merchandiseDiscountPaisa !== undefined)
      throw new WalletConflictError(
        'Sign in to use shopping credit or a referral code.',
      );
    return {
      walletPaisa: 0,
      discountPaisa: 0,
      referrerId: null,
      rewardPaisa: 0,
      waitDays: 7,
      phoneKey: '',
    };
  }
  // Promo checkout provisions its wallet in the order batch; financial preflight stays read-only.
  if (options.merchandiseDiscountPaisa === undefined) {
    await ensureWallet(db, userId, now);
    await releaseReferralRewards(db, userId, now);
  }
  let discountPaisa = 0;
  let referrerId: string | null = null;
  const campaign = await getReferralCampaign(db);
  const phoneKey = normalizeReferralPhone(options.phone);
  if (code) {
    if (!/^[A-Z0-9]{16}$/.test(code))
      throw new WalletConflictError('Enter a valid referral code.');
    if (!campaign.enabled)
      throw new WalletConflictError('The referral offer is currently paused.');
    if (subtotalPaisa < campaign.minimumSubtotalPaisa)
      throw new WalletConflictError(
        `Referral orders need at least Rs. ${campaign.minimumSubtotalPaisa / 100} in products, before delivery.`,
      );
    const referrer = await db
      .prepare(`SELECT w.user_id AS id, u.phone FROM wallet_accounts w
      INNER JOIN users u ON u.id=w.user_id WHERE w.referral_code=? AND u.status='active'`)
      .bind(code)
      .first<{ id: string; phone: string | null }>();
    if (
      !referrer ||
      referrer.id === userId ||
      (referrer.phone && normalizeReferralPhone(referrer.phone) === phoneKey)
    )
      throw new WalletConflictError(
        'This referral code cannot be used for this account.',
      );
    const ownPhone = await db
      .prepare(`SELECT id FROM orders WHERE customer_id=? AND
      (CASE WHEN LENGTH(REPLACE(customer_phone,'+',''))>10 THEN SUBSTR(REPLACE(customer_phone,'+',''),4) ELSE REPLACE(customer_phone,'+','') END)=? LIMIT 1`)
      .bind(referrer.id, phoneKey)
      .first();
    if (ownPhone)
      throw new WalletConflictError(
        'This referral code cannot be used with this phone number.',
      );
    const prior = await db
      .prepare(`SELECT id FROM orders WHERE (customer_id=? OR customer_email=(SELECT email FROM users WHERE id=?))
      AND status<>'cancelled' LIMIT 1`)
      .bind(userId, userId)
      .first();
    const claimed = await db
      .prepare(
        `SELECT customer_id FROM referral_redemptions WHERE customer_id=? OR phone_key=?`,
      )
      .bind(userId, phoneKey)
      .first();
    if (prior || claimed)
      throw new WalletConflictError(
        'Referral offers are for a new customer’s first order, once per customer and phone number.',
      );
    referrerId = referrer.id;
    discountPaisa = campaign.friendDiscountPaisa;
  }
  const wallet = await db
    .prepare(
      'SELECT balance_paisa AS balance FROM wallet_accounts WHERE user_id=?',
    )
    .bind(userId)
    .first<{ balance: number }>();
  return {
    walletPaisa: options.useWallet
      ? Math.min(wallet?.balance ?? 0, subtotalPaisa - discountPaisa - merchandiseDiscountPaisa)
      : 0,
    discountPaisa,
    referrerId,
    rewardPaisa: campaign.rewardPaisa,
    waitDays: campaign.returnWindowDays,
    phoneKey,
  };
}

// Refund discounts and shopping credit proportionately over merchandise, never delivery.
// Integer rounding residue is allocated to the last merchandise refund.
export async function splitCreditRefund(
  db: D1Database,
  orderId: string,
  itemPaisa: number,
) {
  const row = await db
    .prepare(`SELECT COALESCE(o.current_subtotal_paisa,o.item_subtotal_paisa) AS subtotal, COALESCE(o.current_wallet_paisa,o.wallet_credit_paisa) AS wallet,
    COALESCE(o.current_discount_paisa,o.referral_discount_paisa) AS discount,
    COALESCE((SELECT SUM(r.item_amount_paisa) FROM refunds r WHERE r.order_id=o.id AND r.status <> 'rejected'),0) AS refunded,
    COALESCE((SELECT SUM(r.wallet_credit_paisa) FROM refunds r WHERE r.order_id=o.id AND r.status <> 'rejected'),0) AS walletRefunded,
    COALESCE((SELECT SUM(r.referral_discount_paisa) FROM refunds r WHERE r.order_id=o.id AND r.status <> 'rejected'),0) AS discountRefunded
    FROM orders o WHERE o.id=?`)
    .bind(orderId)
    .first<{
      subtotal: number;
      wallet: number;
      discount: number;
      refunded: number;
      walletRefunded: number;
      discountRefunded: number;
    }>();
  if (!row) throw new WalletConflictError('Order not found.');
  if(![row.subtotal,row.wallet,row.discount,row.refunded,row.walletRefunded,row.discountRefunded,itemPaisa].every(n=>Number.isSafeInteger(n)&&n>=0)||row.subtotal===0)throw new WalletConflictError('Refund allocation requires valid remaining merchandise.');
  const subtotal=BigInt(row.subtotal),cumulative=BigInt(row.refunded)+BigInt(itemPaisa),total=BigInt(row.wallet)+BigInt(row.discount);
  const allocatedBig=total*(cumulative<subtotal?cumulative:subtotal)/subtotal;
  const wallet=Number(total?allocatedBig*BigInt(row.wallet)/total:BigInt(0)),allocated=Number(allocatedBig);
  return {
    basePaisa: row.refunded,
    walletPaisa: Math.max(0, wallet - row.walletRefunded),
    discountPaisa: Math.max(0, allocated - wallet - row.discountRefunded),
  };
}
