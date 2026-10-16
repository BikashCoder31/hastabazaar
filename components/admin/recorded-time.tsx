import {
  formatBsDate,
  nepalDayIso,
  nepalClock,
} from '@/lib/dates/nepal-calendar';

export function RecordedTime({ timestamp }: { timestamp: number }) {
  const ad = nepalDayIso(timestamp),
    bs = formatBsDate(ad);
  return (
    <time
      dateTime={new Date(timestamp).toISOString()}
      className="block whitespace-nowrap"
    >
      <span className="block">{ad} AD</span>
      <span className="block text-xs text-muted-foreground">
        {bs ?? 'BS conversion unavailable'}
      </span>
      <span className="block text-xs text-muted-foreground">
        {nepalClock(timestamp)} Nepal time
      </span>
    </time>
  );
}
