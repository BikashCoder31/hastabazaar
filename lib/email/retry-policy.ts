const minute = 60_000;

// Compatibility for older read-only projections; temporary failures have no
// attempt-count stop. Relevance, expiry and classified failures govern replay.
export const maximumEmailAttempts = Number.MAX_SAFE_INTEGER;

export function emailRetryDelayMs(attempt: number, options: { random?: () => number; retryAfterMs?: number } = {}): number {
  const boundedAttempt = Math.max(
    1,
    Math.min(5, Math.trunc(attempt)),
  );
  const base = Math.min(60 * minute, 5 * minute * 2 ** (boundedAttempt - 1));
  const jitter = options.random ? Math.floor(base * .1 * Math.max(0,Math.min(1,options.random()))) : 0;
  return Math.max(base + jitter, options.retryAfterMs ?? 0);
}
