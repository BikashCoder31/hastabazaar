const minute = 60_000;

export const maximumEmailAttempts = 5;

export function emailRetryDelayMs(attempt: number): number {
  const boundedAttempt = Math.max(
    1,
    Math.min(maximumEmailAttempts, Math.trunc(attempt)),
  );
  return Math.min(60 * minute, 5 * minute * 2 ** (boundedAttempt - 1));
}
