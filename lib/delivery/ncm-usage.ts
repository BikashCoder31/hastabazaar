import { nepalDayIso } from '../dates/nepal-calendar';
import { ncmMariaDb, ncmTransactionGuard } from './ncm-settings';

// Leave headroom for work the owner does in the portal and for other tooling.
export const ncmDailyLimit = { create: 500, view: 15_000 } as const;
export type NcmUsageBucket = keyof typeof ncmDailyLimit;

export function ncmUsageStatements(db: D1Database, bucket: NcmUsageBucket, count: number, now: number) {
  const limit = ncmDailyLimit[bucket];
  if (!Number.isSafeInteger(count) || count < 1 || count > limit) throw new Error('Invalid NCM request count.');
  const day = nepalDayIso(now);
  const insert = ncmMariaDb(db) ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
  return [
    db.prepare(`${insert} INTO ncm_api_daily_usage(usage_day,bucket,used) VALUES(?,?,0)`).bind(day, bucket),
    db.prepare('UPDATE ncm_api_daily_usage SET used=used WHERE usage_day=? AND bucket=?').bind(day, bucket),
    ...ncmTransactionGuard(db, 'EXISTS(SELECT 1 FROM ncm_api_daily_usage WHERE usage_day=? AND bucket=? AND used<=?)',
      day, bucket, limit - count),
    db.prepare('UPDATE ncm_api_daily_usage SET used=used+? WHERE usage_day=? AND bucket=?').bind(count, day, bucket),
  ];
}

export async function reserveNcmUsage(db: D1Database, bucket: NcmUsageBucket, count: number, now: number) {
  try {
    await db.batch(ncmUsageStatements(db, bucket, count, now));
    return true;
  } catch { return false; }
}

export async function ncmUsedToday(db: D1Database, bucket: NcmUsageBucket, now: number) {
  const row = await db.prepare('SELECT used FROM ncm_api_daily_usage WHERE usage_day=? AND bucket=?')
    .bind(nepalDayIso(now), bucket).first<{used:number}>();
  return Number(row?.used ?? 0);
}
