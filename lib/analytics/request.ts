import {
  createOpaqueToken,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { recordTrafficEvent } from '@/lib/db/repositories/analytics';
import { isLikelyAutomatedRequest, type TrafficEventType } from './first-party';

export const TRAFFIC_COOKIE = 'hastabazaar_traffic';

function trafficCookie(
  request: Request,
  token: string,
  maxAgeSeconds: number,
): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${TRAFFIC_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function recordRequestTrafficEvent(
  database: D1Database,
  request: Request,
  input: {
    eventType: TrafficEventType;
    path: string;
    entityKey?: string | null;
    now?: number;
  },
): Promise<{ recorded: boolean; cookie?: string }> {
  const now = input.now ?? Date.now();
  const effective = await getEffectiveBusinessSetting(
    database,
    'first_party_analytics_policy',
    now,
  );
  const policy = effective.value;
  if (
    !policy.enabled ||
    request.headers.get('dnt') === '1' ||
    request.headers.get('sec-gpc') === '1' ||
    isLikelyAutomatedRequest(request)
  ) {
    return { recorded: false };
  }

  const existing = readCookie(request, TRAFFIC_COOKIE);
  const validExisting =
    existing !== null &&
    existing.length >= 32 &&
    existing.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(existing);
  const token = validExisting ? existing : createOpaqueToken();
  const outcome = await recordTrafficEvent(database, {
    tokenHash: await hashOpaqueToken(token),
    eventType: input.eventType,
    path: input.path,
    entityKey: input.entityKey,
    policy,
    now,
  });
  return {
    recorded: outcome.recorded,
    cookie:
      outcome.recorded && !validExisting
        ? trafficCookie(request, token, policy.retentionDays * 86_400)
        : undefined,
  };
}
