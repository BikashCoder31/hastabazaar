import { NEPAL_OFFSET_MS, nepalDateTimeInput } from '@/lib/commission/rates';

export const reportPeriods = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['month', 'This month'],
] as const;

export const dayMs = 86_400_000;

export function businessReportRange(value: unknown, now: number) {
  const [period, label] = reportPeriods.find(([key]) => key === value) ?? reportPeriods[1];
  const localNow = new Date(now + NEPAL_OFFSET_MS);
  const days = period === 'month' ? localNow.getUTCDate() : Number(period);
  const today = localNow.setUTCHours(0, 0, 0, 0) - NEPAL_OFFSET_MS;
  const start = today - (days - 1) * dayMs;
  return {
    period, label, days, start, now,
    from: nepalDateTimeInput(start).slice(0, 10),
    to: nepalDateTimeInput(today).slice(0, 10),
    previousStart: start - days * dayMs,
  };
}

export type BusinessReportRange = ReturnType<typeof businessReportRange>;
