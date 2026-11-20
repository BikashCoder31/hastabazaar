const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' });
const dateTime = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});

export type PickupWindow = { start: number; end: number };

export function parsePickupTime(value: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return NaN;
  return Date.parse(value + ':00+05:45');
}

export function pickupWindowLabel(start: number | null, end: number | null) {
  if (start === null) return '';
  return end !== null && end >= start
    ? dateTime.formatRange(start, end)
    : dateTime.format(start);
}

export function pickupOptions(now: number) {
  const today = date.format(now);
  const tomorrow = date.format(now + 86_400_000);
  return [
    {
      label: 'Today 2–4 pm',
      start: parsePickupTime(`${today}T14:00`),
      end: parsePickupTime(`${today}T16:00`),
    },
    {
      label: 'Tomorrow 9–11 am',
      start: parsePickupTime(`${tomorrow}T09:00`),
      end: parsePickupTime(`${tomorrow}T11:00`),
    },
    {
      label: 'Tomorrow 2–4 pm',
      start: parsePickupTime(`${tomorrow}T14:00`),
      end: parsePickupTime(`${tomorrow}T16:00`),
    },
  ].filter(({ end }) => end > now);
}
