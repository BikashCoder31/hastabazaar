import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getLoyaltyAdminReport } from '@/lib/db/repositories/incentive-reporting';
import { IncentiveError } from '@/lib/incentives/types';
import {
  filtersFromParams,
  reportCsv,
  reportWindow,
} from '@/lib/incentives/reporting';
import { incentiveDate, incentiveMoney } from '@/lib/incentives/presentation';

export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });

function reportQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const allowed = [
    'query',
    'from',
    'to',
    'page',
    'historyPage',
    'customerPage',
    'format',
  ];
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!allowed.includes(key) || Object.hasOwn(values, key))
      throw new IncentiveError('invalid');
    values[key] = value;
  }
  for (const key of ['page', 'historyPage', 'customerPage']) {
    if (values[key] !== undefined && !/^[1-9]\d{0,5}$/.test(values[key]))
      throw new IncentiveError('invalid');
  }
  if (values.format !== undefined && !['json', 'csv'].includes(values.format))
    throw new IncentiveError('invalid');
  const filters = filtersFromParams(values);
  reportWindow(filters);
  return { filters, csv: values.format === 'csv' };
}

export async function GET(request: Request) {
  try {
    const actor = await requireStaffApi('commercial_policy.manage');
    if (actor.role !== 'super_admin') throw new IncentiveError('unauthorized');
    const { filters, csv } = reportQuery(request);
    const report = await getLoyaltyAdminReport(
      requireDatabase(env as unknown as { DB?: D1Database }),
      actor,
      filters,
    );
    if (!csv) return json(report);
    return new Response(
      reportCsv(
        [
          'Activity ID',
          'Activity type',
          'Customer ID',
          'Customer',
          'Customer email',
          'Points change',
          'Wallet credit (NPR)',
          'Revision',
          'Created at (NPT)',
          'Recorded cycle day',
          'Recorded cycle number',
          'Grace used',
          'Grace applied',
          'Cycle reset reason',
          'Claim date (Nepal)',
        ],
        report.activity.map((row) => [
          row.id,
          row.kind === 'daily_claim' ? 'Daily claim' : 'Redemption',
          row.customerId,
          row.customerName,
          row.customerEmail,
          row.points,
          incentiveMoney(row.creditPaisa),
          row.revision,
          `${incentiveDate(row.createdAt)} NPT`,
          row.cycle?.day ?? null,
          row.cycle?.number ?? null,
          row.cycle ? (row.cycle.graceUsed ? 'Yes' : 'No') : null,
          row.cycle ? (row.cycle.graceApplied ? 'Yes' : 'No') : null,
          row.cycle?.resetReason === 'first_claim'
            ? 'First weekly claim'
            : row.cycle?.resetReason === 'missed_day'
              ? 'Missed Nepal day'
              : row.cycle?.resetReason === 'cycle_complete'
                ? 'Previous cycle complete'
                : null,
          row.cycle?.claimDate ?? null,
        ]),
      ),
      {
        headers: {
          ...privateHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="loyalty-activity-page.csv"',
        },
      },
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof IncentiveError)
      return json(
        { error: error.message, code: error.code },
        error.code === 'unauthorized' ? 403 : 400,
      );
    if (error instanceof RangeError) return json({ error: error.message }, 400);
    return json({ error: 'The loyalty report could not be loaded.' }, 500);
  }
}
