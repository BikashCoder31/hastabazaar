import {
  CURRENT_SELLER_COMMISSION_BPS,
} from '@/lib/marketplace/policy';

export const sellerCommissionSettingKey = 'seller_commission_bps:commission-9pct-v1';

export interface CommissionSetting {
  basisPoints: number;
  percent: number;
  updatedAt: number | null;
  updatedByName: string | null;
}

export async function getMarketplaceCommissionBps(
  database: D1Database,
): Promise<number> {
  const row = await database
    .prepare(
      'SELECT value FROM marketplace_settings WHERE marketplace_settings.key = ? LIMIT 1',
    )
    .bind(sellerCommissionSettingKey)
    .first<{ value: string }>();
  const value = Number(row?.value);
  return Number.isInteger(value) && value === CURRENT_SELLER_COMMISSION_BPS
    ? value
    : CURRENT_SELLER_COMMISSION_BPS;
}

export async function getCommissionSetting(
  database: D1Database,
): Promise<CommissionSetting> {
  const row = await database
    .prepare(
      `SELECT marketplace_settings.value, marketplace_settings.updated_at AS updatedAt,
        users.display_name AS updatedByName
       FROM marketplace_settings
       LEFT JOIN users ON users.id = marketplace_settings.updated_by
       WHERE marketplace_settings.key = ? LIMIT 1`,
    )
    .bind(sellerCommissionSettingKey)
    .first<{
      value: string;
      updatedAt: number;
      updatedByName: string | null;
    }>();
  const parsed = row ? Number(row.value) : Number.NaN;
  const basisPoints =
    Number.isInteger(parsed) && parsed === CURRENT_SELLER_COMMISSION_BPS
      ? parsed
      : CURRENT_SELLER_COMMISSION_BPS;
  return {
    basisPoints,
    percent: basisPoints / 100,
    updatedAt: row?.updatedAt || null,
    updatedByName: row?.updatedByName ?? null,
  };
}

export async function setMarketplaceCommission(
  database: D1Database,
  options: {
    basisPoints: number;
    actorId: string;
    requestId: string;
    now: number;
    reason: string;
  },
): Promise<void> {
  if (
    !Number.isInteger(options.basisPoints) ||
    options.basisPoints !== CURRENT_SELLER_COMMISSION_BPS
  ) {
    throw new RangeError(
      'The current Seller Marketplace Agreement requires a 9% commission.',
    );
  }
  const reason = options.reason.trim();
  if (reason.length < 8 || reason.length > 1000)
    throw new RangeError('Add a reason of 8–1,000 characters.');
  const previous = await getMarketplaceCommissionBps(database);
  await database.batch([
    database
      .prepare(
        `INSERT INTO marketplace_settings (key, value, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(
        sellerCommissionSettingKey,
        String(options.basisPoints),
        options.actorId,
        options.now,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, ?, 'marketplace.commission.updated', 'marketplace_setting', ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        sellerCommissionSettingKey,
        reason,
        JSON.stringify({ sellerCommissionBps: previous }),
        JSON.stringify({ sellerCommissionBps: options.basisPoints }),
        options.requestId,
        options.now,
      ),
  ]);
}
