import type { BusinessWeekday } from '../configuration/types';

const weekdays: readonly BusinessWeekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

export function payoutRunCalendar(now: number, weekday: BusinessWeekday, cutoff: string, timeZone: string) {
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const [hour, minute] = cutoff.split(':').map(Number);
  // Represent the local calendar date in UTC so adding calendar days ignores offsets.
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let daysUntil = (weekdays.indexOf(weekday) - day.getUTCDay() + 7) % 7;
  if (daysUntil === 0 && local.hour * 60 + local.minute >= hour * 60 + minute) daysUntil = 7;
  day.setUTCDate(day.getUTCDate() + daysUntil);
  const date = (width: 'long' | 'short') => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: width, day: 'numeric', month: 'short',
  }).format(day);
  const cutoffTime = (hour % 12 || 12) + (minute ? ':' + String(minute).padStart(2, '0') : '') + (hour < 12 ? ' am' : ' pm');
  return {
    weekday: weekday[0].toUpperCase() + weekday.slice(1),
    runDay: date('long').replace(',', ''),
    cutoffDay: date('short').replace(',', ''),
    cutoffTime,
  };
}
