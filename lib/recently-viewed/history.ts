import type { RecentlyViewedPolicy } from '@/lib/configuration/types';

export type GuestHistoryEntry = Readonly<{
  productId: string;
  lastViewedAt: number;
}>;

function validEntry(value: unknown): value is GuestHistoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.productId === 'string' &&
    candidate.productId.length > 0 &&
    candidate.productId.length <= 100 &&
    Number.isSafeInteger(candidate.lastViewedAt) &&
    Number(candidate.lastViewedAt) >= 0
  );
}

export function normalizeGuestHistory(
  value: unknown,
  now: number,
  policy: RecentlyViewedPolicy,
): GuestHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const cutoff = now - policy.retentionDays * 86_400_000;
  const latest = new Map<string, number>();
  for (const entry of value) {
    if (!validEntry(entry) || entry.lastViewedAt < cutoff || entry.lastViewedAt > now + 300_000) continue;
    latest.set(entry.productId, Math.max(latest.get(entry.productId) ?? 0, entry.lastViewedAt));
  }
  return [...latest.entries()]
    .map(([productId, lastViewedAt]) => ({ productId, lastViewedAt }))
    .sort((left, right) => right.lastViewedAt - left.lastViewedAt || left.productId.localeCompare(right.productId))
    .slice(0, policy.maxItems);
}

export function recordGuestProductView(
  value: unknown,
  productId: string,
  now: number,
  policy: RecentlyViewedPolicy,
): GuestHistoryEntry[] {
  return normalizeGuestHistory(
    [{ productId, lastViewedAt: now }, ...normalizeGuestHistory(value, now, policy)],
    now,
    policy,
  );
}
