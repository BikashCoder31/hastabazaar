import DateConverter from '@remotemerge/nepali-date-converter';

export type DateCalendar = 'ad' | 'bs';
export const bsFirstYear = 1975,
  bsLastYear = 2099;
export const bsMonths = [
  'Baishakh',
  'Jestha',
  'Asar',
  'Saun',
  'Bhadau',
  'Ashoj',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (value: { year: number; month: number; date: number }) =>
  `${value.year}-${pad(value.month)}-${pad(value.date)}`;
const englishDigits = (value: string) =>
  value.replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)));
export const dateCalendar = (value: string | undefined): DateCalendar =>
  value === 'bs' ? 'bs' : 'ad';

export function isGregorianDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function adToBs(value: string): string | null {
  if (!isGregorianDate(value)) return null;
  try {
    return iso(new DateConverter(value).toBs());
  } catch {
    return null;
  }
}
export function bsToAd(value: string): string | null {
  const normalized = englishDigits(value.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  try {
    return iso(new DateConverter(normalized).toAd());
  } catch {
    return null;
  }
}
export function bsDaysInMonth(year: number, month: number): number {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < bsFirstYear ||
    year > bsLastYear ||
    month < 1 ||
    month > 12
  )
    return 0;
  for (let day = 32; day >= 29; day--)
    if (bsToAd(`${year}-${pad(month)}-${pad(day)}`)) return day;
  return 0;
}
export function formatBsDate(ad: string): string | null {
  const value = adToBs(ad);
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${bsMonths[month - 1]} ${year} BS`;
}
const nepalDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kathmandu',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function nepalDayIso(timestamp: number): string {
  const parts = Object.fromEntries(
    nepalDayFormatter
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const nepalClock = (timestamp: number) =>
  new Intl.DateTimeFormat('en-NP', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));

// Product date-only values use fixed UTC+05:45 midnight, including older dates.
// Keep that storage convention separate from historical offsets for real events.
const nepalDateOnlyOffset = 20_700_000;
const nepalDateOnlyFormatter = new Intl.DateTimeFormat('en-NP', {
  timeZone: 'UTC',
});
export const nepalDateOnlyIso = (timestamp: number): string =>
  new Date(timestamp + nepalDateOnlyOffset).toISOString().slice(0, 10);
export const formatNepalDateOnly = (timestamp: number): string =>
  nepalDateOnlyFormatter.format(timestamp + nepalDateOnlyOffset);

// auditFilters uses fixed UTC+05:45 day boundaries, including historical AD inputs.
// Use this for synthetic report bounds; Intl retains historical offsets for real events.
export const reportingDayIso=(timestamp:number)=>new Date(timestamp+20700000).toISOString().slice(0,10);
