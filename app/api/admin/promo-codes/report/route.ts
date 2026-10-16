import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getPromoAdminReport } from '@/lib/db/repositories/incentive-reporting';
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
    const actor = await requireStaffApi('admin.invite');
    if (actor.role !== 'super_admin') throw new IncentiveError('unauthorized');
    const { filters, csv } = reportQuery(request);
    const report = await getPromoAdminReport(
      requireDatabase(env as unknown as { DB?: D1Database }),
      actor,
      filters,
    );
    if (!csv) return json(report);
    return new Response(
      reportCsv(
        [
          'Redemption ID',
          'Promo code',
          'Campaign label',
          'Customer',
          'Customer email',
          'Order ID',
          'Order number',
          'Order status',
          'Payment status',
          'Product subtotal (NPR)',
          'Promo discount (NPR)',
          'Snapshot commission (NPR)',
          'Revision',
          'Redeemed at (NPT)',
        ],
        report.activity.map((row) => [
          row.id,
          row.code,
          row.label,
          row.customerName,
          row.customerEmail,
          row.orderId,
          row.orderNumber,
          row.orderStatus,
          row.paymentStatus,
          incentiveMoney(row.subtotalPaisa),
          incentiveMoney(row.discountPaisa),
          incentiveMoney(row.commissionPaisa),
          row.revision,
          `${incentiveDate(row.createdAt)} NPT`,
        ]),
      ),
      {
        headers: {
          ...privateHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="promo-activity-page.csv"',
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
    return json({ error: 'The promo report could not be loaded.' }, 500);
  }
}
