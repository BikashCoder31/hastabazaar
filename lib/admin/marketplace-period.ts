export const marketplaceSummaryPeriods = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
] as const;

export type MarketplaceSummaryPeriod =
  (typeof marketplaceSummaryPeriods)[number]['value'];

export function parseMarketplaceSummaryPeriod(
  value: unknown,
): MarketplaceSummaryPeriod {
  return (
    marketplaceSummaryPeriods.find((period) => period.value === value)?.value ??
    'all'
  );
}

const day = 86_400_000;
const nepalOffset = 20_700_000;
const dateLabel = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/** Nepal calendar days, including today through the observation time. */
export function marketplaceSummaryRange(
  period: MarketplaceSummaryPeriod,
  now: number,
) {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    now > 8_640_000_000_000_000 - nepalOffset
  ) {
    throw new RangeError('Summary timestamp is invalid.');
  }
  const selected = parseMarketplaceSummaryPeriod(period);
  const label = marketplaceSummaryPeriods.find(
    (option) => option.value === selected,
  )!.label;
  const days =
    selected === 'today'
      ? 1
      : selected === '7d'
        ? 7
        : selected === '30d'
          ? 30
          : null;
  const today = Math.floor((now + nepalOffset) / day) * day - nepalOffset;
  const start = days === null ? null : today - (days - 1) * day;
  const format = (time: number) => dateLabel.format(time + nepalOffset);
  const dates =
    start === null
      ? 'All recorded dates'
      : `${format(start)}${format(start) === format(now) ? '' : ` – ${format(now)}`} · through now`;
  return {
    period: selected,
    label,
    start,
    end: now,
    description: `${dates} · Nepal time (UTC+05:45)`,
  };
}
