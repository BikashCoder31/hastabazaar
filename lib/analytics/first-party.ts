import type { FirstPartyAnalyticsPolicy } from '@/lib/configuration/types';

export const trafficEventTypes = [
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'order_completed',
] as const;

export type TrafficEventType = (typeof trafficEventTypes)[number];

export type PublicTrafficEvent = Readonly<{
  eventType: 'page_view' | 'product_view' | 'checkout_started';
  path: string;
  entityKey: string | null;
}>;

export function normalizeTrafficPath(value: unknown): string {
  const hasControlCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 200 ||
    !value.startsWith('/') ||
    value.includes('?') ||
    value.includes('#') ||
    hasControlCharacter
  ) {
    throw new RangeError('Analytics path must be a query-free local path.');
  }
  return value.replace(/\/{2,}/g, '/');
}

export function normalizeTrafficEntityKey(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new RangeError('Analytics entity key is invalid.');
  }
  return value;
}

export function parsePublicTrafficEvent(value: unknown): PublicTrafficEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Analytics event must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).some(
      (key) => !['eventType', 'path', 'entityKey'].includes(key),
    )
  ) {
    throw new RangeError('Analytics event contains an unknown field.');
  }
  const path = normalizeTrafficPath(candidate.path);
  const entityKey = normalizeTrafficEntityKey(candidate.entityKey);
  if (candidate.eventType === 'product_view') {
    const product = /^\/products\/([A-Za-z0-9_-]{1,160})$/.exec(path);
    if (!product || entityKey !== product[1]) {
      throw new RangeError('Product analytics must match its product path.');
    }
    return { eventType: 'product_view', path, entityKey };
  }
  if (candidate.eventType === 'checkout_started') {
    if (path !== '/checkout' || entityKey !== null) {
      throw new RangeError('Checkout analytics must use the checkout path only.');
    }
    return { eventType: 'checkout_started', path, entityKey: null };
  }
  if (candidate.eventType === 'page_view' && entityKey === null) {
    return { eventType: 'page_view', path, entityKey: null };
  }
  throw new RangeError('Analytics event is not an allowlisted public event.');
}

export function pathIsExcluded(
  path: string,
  policy: FirstPartyAnalyticsPolicy,
): boolean {
  return policy.excludedPathPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isLikelyAutomatedRequest(request: Request): boolean {
  const agent = request.headers.get('user-agent') ?? '';
  return /bot|crawler|spider|slurp|headless|lighthouse|pagespeed|preview/i.test(
    agent,
  );
}
