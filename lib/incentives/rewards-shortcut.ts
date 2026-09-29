export interface RewardsShortcutState {
  readonly available: boolean;
  readonly recheckAt: number | null;
}

const MAX_TIME = 253402300799999;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const time = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= MAX_TIME;
const optionalTime = (value: unknown): value is number | null =>
  value === null || time(value);

/** Keep only server-verified availability and its next expiry; never infer a future claim. */
export function projectRewardsShortcut(
  value: unknown,
  now: number,
): RewardsShortcutState | null {
  if (
    !time(now) ||
    !object(value) ||
    typeof value.claimedToday !== 'boolean' ||
    !time(value.nextClaimAt) ||
    !object(value.state)
  )
    return null;
  const state = value.state;
  if (
    typeof state.enabled !== 'boolean' ||
    typeof state.paused !== 'boolean' ||
    typeof state.dailyPoints !== 'number' ||
    !Number.isSafeInteger(state.dailyPoints) ||
    state.dailyPoints < 0 ||
    typeof state.status !== 'string' ||
    ![
      'active',
      'scheduled',
      'expired',
      'paused',
      'disabled',
      'exhausted',
    ].includes(state.status) ||
    !optionalTime(state.startsAt) ||
    !optionalTime(state.endsAt) ||
    (state.startsAt !== null &&
      state.endsAt !== null &&
      state.startsAt >= state.endsAt)
  )
    return null;
  const boundaries = [value.nextClaimAt, state.startsAt, state.endsAt].filter(
    (boundary): boundary is number => boundary !== null && boundary > now,
  );
  return {
    available:
      state.status === 'active' &&
      state.enabled &&
      !state.paused &&
      state.dailyPoints > 0 &&
      !value.claimedToday &&
      now < value.nextClaimAt &&
      (state.startsAt === null || now >= state.startsAt) &&
      (state.endsAt === null || now < state.endsAt),
    recheckAt: boundaries.length ? Math.min(...boundaries) : null,
  };
}

/** Each mounted identity owns a reader; cancellation also guards fetch implementations that ignore abort. */
export function createRewardsShortcutReader(
  subjectId: string | null,
  options: {
    now: () => number;
    onChange: (state: RewardsShortcutState | null) => void;
    fetcher: typeof fetch;
  },
) {
  const fetcher = options.fetcher;
  let stopped = false;
  let generation = 0;
  let controller: AbortController | null = null;
  async function refresh() {
    if (!subjectId || stopped) return;
    const current = ++generation;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    options.onChange(null);
    try {
      const response = await fetcher('/api/account/rewards?limit=1', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal: request.signal,
      });
      const value: unknown = response.ok ? await response.json() : null;
      if (!stopped && current === generation && !request.signal.aborted)
        options.onChange(projectRewardsShortcut(value, options.now()));
    } catch {
      if (!stopped && current === generation && !request.signal.aborted)
        options.onChange(null);
    }
  }
  return {
    refresh,
    stop() {
      stopped = true;
      generation += 1;
      controller?.abort();
    },
  };
}
