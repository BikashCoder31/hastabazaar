import Link from 'next/link';
import { nepalDateTimeInput } from '@/lib/commission/rates';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { cancellationCauseLabel } from '@/lib/cancellation/causes';
import { BusinessReportExport, type ReportCsvRow } from './business-report-export';
import type { BusinessReport } from './business-report-data';
import { reportPeriods, type BusinessReportRange } from './business-report-range';

const card = 'min-w-0 rounded-[15px] border bg-card';
const sellerRow = 'flex min-h-[51px] items-center justify-between gap-3 px-[18px] py-3 text-sm';
const empty = 'border-t px-[18px] py-4 text-sm text-muted-foreground';
const countFormat = new Intl.NumberFormat('en-NP');
const percentFormat = new Intl.NumberFormat('en-NP', { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat('en-NP', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' });

const count = (value: number) => countFormat.format(value);
const money = (paisa: number) => formatPaisaExact(paisa).replace(/\.00$/, '');
const percent = (value: number) => percentFormat.format(value) + '%';
const quantity = (value: number, singular: string, plural = singular + 's') =>
  `${count(value)} ${value === 1 ? singular : plural}`;

function comparison(current: number, previous: number, range: BusinessReportRange, fallback: string) {
  if (previous <= 0 || range.period === 'month') return { detail: fallback };
  const change = (current - previous) / previous * 100;
  return {
    detail: `${change > 0 ? '+' : ''}${percent(change)} vs previous ${range.days} days`,
    tone: change > 0 ? 'text-[#2C6A4A]' : change < 0 ? 'text-[#A8232E]' : undefined,
  };
}

function summaryCards(report: BusinessReport, range: BusinessReportRange) {
  const orders = Number(report.commerce?.orders ?? 0);
  const gross = Number(report.commerce?.grossPaisa ?? 0);
  const delivered = Number(report.commerce?.delivered ?? 0);
  const deliveredValue = Number(report.commerce?.deliveredPaisa ?? 0);
  const everDelivered = Number(report.commerce?.everDelivered ?? 0);
  const returns = Number(report.commerce?.withReturns ?? 0);
  const returnsRate = everDelivered ? returns / everDelivered * 100 : null;
  const refundValue = Number(report.refunds?.amountPaisa ?? 0);
  const payoutValue = Number(report.payouts?.amountPaisa ?? 0);
  const cash = Number(report.courierCash?.amountPaisa ?? 0);
  const couriers = Number(report.courierCash?.couriers ?? 0);
  const outstandingParcels = Number(report.courierCash?.count ?? 0);
  const ratio = orders ? `${percent(delivered / orders * 100)} of orders delivered` : 'No orders in this period';

  return [
    { label: 'Orders', value: count(orders), raw: orders, unit: 'orders', ...comparison(orders, Number(report.commerce?.previousOrders ?? 0), range, 'Placed in this period') },
    { label: 'Gross order value', value: money(gross), raw: gross, unit: 'paisa', ...comparison(gross, Number(report.commerce?.previousGrossPaisa ?? 0), range, 'Full saved order totals') },
    { label: 'Delivered value', value: money(deliveredValue), raw: deliveredValue, unit: 'paisa', detail: ratio, tone: undefined },
    { label: 'Commission earned', value: money(report.commission), raw: report.commission, unit: 'paisa', detail: 'Uses the rate saved on each order', tone: undefined },
    { label: 'Refunded', value: money(refundValue), raw: refundValue, unit: 'paisa', detail: quantity(Number(report.refunds?.count ?? 0), 'refund'), tone: undefined },
    { label: 'Paid to sellers', value: money(payoutValue), raw: payoutValue, unit: 'paisa', detail: quantity(Number(report.payouts?.count ?? 0), 'payout'), tone: undefined },
    { label: 'Courier cash outstanding', value: money(cash), raw: cash, unit: 'paisa', detail: cash && !couriers ? `${quantity(outstandingParcels, 'parcel')} · current balance` : `${quantity(couriers, 'courier')} · current balance`, tone: cash ? 'text-[#80520A]' : undefined },
    { label: 'Returns rate', value: returnsRate === null ? '—' : percent(returnsRate), raw: returnsRate, unit: '%', detail: everDelivered ? `${count(returns)} of ${quantity(everDelivered, 'delivered order')} had return requests` : 'No delivered orders in this period', tone: undefined },
  ];
}

function funnelStages(funnel: BusinessReport['funnel']) {
  return [
    ['Product views', funnel.productViews],
    ['Added to cart', funnel.addToCarts],
    ['Started checkout', funnel.checkoutStarts],
    ['Ordered', funnel.completedOrders],
  ] as const;
}

function reportCsv(report: BusinessReport, range: BusinessReportRange): ReportCsvRow[] {
  const header = ['Section', 'Measure', 'Date or seller', 'Value', 'Unit', 'Detail'];
  const rows: ReportCsvRow[] = [
    ['Period', range.label, `${range.from} to ${range.to}`, null, '', 'Nepal time'],
    ...summaryCards(report, range).map(item => ['Summary', item.label, '', item.raw, item.unit, item.detail]),
    ...report.daily.map(day => ['Orders per day', 'Orders', nepalDateTimeInput(day.at).slice(0, 10), day.orders, 'orders', '']),
    ...funnelStages(report.funnel).map(([label, value]) => ['Shopper funnel', label, '', value, 'events', 'Estimate from retained site events']),
    ...report.topSellers.map(row => ['Top sellers', 'Delivered value', row.name, Number(row.amountPaisa), 'paisa', 'Delivered item totals']),
    ...(report.sellerDelays ?? []).map(row => ['Sellers below target', 'Missed saved ready-by date', row.name, Number(row.lateOrders), 'orders', 'Open seller delays']),
  ];
  if (!report.cancellations) return [header, ...rows];
  return [
    [...header, 'Cancellation cause'],
    ...rows.map(row => [...row, '']),
    ...report.cancellations.map(row =>
      ['Cancellations', 'Recorded cancellations', '', row.count, 'cancellations', '', cancellationCauseLabel(row.cause)]),
  ];
}

function DailyOrders({ daily }: { daily: BusinessReport['daily'] }) {
  const maximum = Math.max(...daily.map(day => day.orders));
  const peak = daily.find(day => day.orders === maximum);

  return (
    <section className={`${card} p-5`} aria-labelledby="daily-orders">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily-orders" className="font-bold">Orders per day</h2>
        <span className="text-sm text-muted-foreground">{quantity(daily.length, 'day')}</span>
      </div>
      {maximum > 0 ? (
        <ul className="mt-3 flex h-35 min-w-0 items-end gap-[clamp(1px,0.45vw,6px)] border-b"
          style={daily.length > 30 ? { columnGap: '1px' } : undefined} aria-label="Daily order counts">
          {daily.map((day, index) => {
            const label = `${shortDate.format(day.at)} · ${quantity(day.orders, 'order')}`;
            return (
              <li key={day.at} className="h-full min-w-0 flex-1 content-end" title={label}>
                <span className="sr-only">{label}</span>
                <span aria-hidden className={`block rounded-t-sm ${index === daily.length - 1 ? 'bg-primary' : day === peak ? 'bg-destructive' : 'bg-[#e4d8c3]'}`}
                  style={{ height: `${day.orders / maximum * 100}%` }} />
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 grid h-35 place-items-center border-b text-center text-sm text-muted-foreground">No orders in this period.</p>}
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{shortDate.format(daily[0].at)}</span>
        {maximum > 0 && peak ? <span className="font-semibold text-destructive">Peak · {shortDate.format(peak.at)}</span> : null}
        <span>Today</span>
      </div>
    </section>
  );
}

function ShopperFunnel({ funnel, range }: { funnel: BusinessReport['funnel']; range: BusinessReportRange }) {
  const stages = funnelStages(funnel);
  const maximum = Math.max(1, ...stages.map(([, value]) => value));
  return (
    <section className={`${card} space-y-3 p-5`} aria-labelledby="shopper-funnel">
      <h2 id="shopper-funnel" className="font-bold">From product view to order</h2>
      <dl className="space-y-2.5">
        {stages.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <dt>{label}</dt>
              <dd className="font-bold tabular-nums">{count(value)}</dd>
            </div>
            <div aria-hidden className="h-2 overflow-hidden rounded-full bg-[#ebe1cf]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${value / maximum * 100}%` }} />
            </div>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Estimates from recorded site events.
        {funnel.collectionEnabled ? null : ' Collection is currently off.'}
        {funnel.retainedSince > range.start ? ' Earlier events fall outside retention.' : null}
      </p>
    </section>
  );
}

export function BusinessReportOverview({ report, range, canViewSellers, canExport }: {
  report: BusinessReport; range: BusinessReportRange; canViewSellers: boolean; canExport: boolean;
}) {
  return (
    <div className="space-y-[18px]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <nav aria-label="Report period" className="contents">
          {reportPeriods.map(([value, label]) => (
            <Link key={value} href={`/admin/analytics?period=${value}`} prefetch={false}
              aria-current={value === range.period ? 'page' : undefined}
              className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">
              {label}
            </Link>
          ))}
        </nav>
        {canExport ? <BusinessReportExport rows={reportCsv(report, range)} filename={`hastabazaar-business-report-${range.from}-to-${range.to}.csv`} /> : null}
      </div>

      <dl aria-label="Business report summary" className="grid gap-3.5 lg:grid-cols-4">
        {summaryCards(report, range).map(({ label, value, detail, tone }) => (
          <div key={label} className={`${card} flex min-h-[106px] flex-col justify-center gap-1.5 px-3.5 py-3 lg:min-h-[124px] lg:px-[18px]`}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="wrap-anywhere font-heading text-2xl leading-tight font-semibold tabular-nums xl:text-[28px]">{value}</dd>
            <dd className={`text-sm ${tone ?? 'text-muted-foreground'}`}>{detail}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DailyOrders daily={report.daily} />
        <ShopperFunnel funnel={report.funnel} range={range} />
      </div>

      {report.cancellations ? (
        <section className={card} aria-labelledby="cancellation-causes">
          <h2 id="cancellation-causes" className="px-[18px] py-3.5 font-bold">Cancellations by cause</h2>
          {report.cancellations.some(row => row.count > 0) ? (
            <dl className="grid gap-3 border-t px-[18px] py-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {report.cancellations.map(({ cause, count: total }) => (
                <div key={cause ?? 'unrecorded'} className="flex min-w-0 justify-between gap-3">
                  <dt>{cancellationCauseLabel(cause)}</dt>
                  <dd className="font-semibold tabular-nums">{count(total)}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="border-t px-[18px] py-3.5 text-sm text-muted-foreground">No cancellations in this period.</p>}
        </section>
      ) : null}

      <div className="grid gap-[18px] lg:grid-cols-2">
        <section className={card} aria-labelledby="top-sellers">
          <h2 id="top-sellers" className="px-[18px] py-3.5 font-bold">Top sellers by delivered value</h2>
          {report.topSellers.length ? (
            <ul className="divide-y border-t">
              {report.topSellers.map(seller => {
                const contents = <><span className="min-w-0 flex-1 wrap-anywhere">{seller.name}</span><strong className="text-right tabular-nums">{money(Number(seller.amountPaisa))}</strong></>;
                return <li key={seller.id}>{canViewSellers
                  ? <Link href={`/admin/sellers/${encodeURIComponent(seller.id)}`} prefetch={false} className={`${sellerRow} hover:bg-muted`}>{contents}</Link>
                  : <div className={sellerRow}>{contents}</div>}
                </li>;
              })}
            </ul>
          ) : <p className={empty}>No seller items were delivered from orders placed in this period.</p>}
        </section>
        <section className={card} aria-labelledby="sellers-below-target">
          <div className="px-[18px] py-3.5">
            <h2 id="sellers-below-target" className="font-bold">Sellers below target</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Open seller delays past their recorded ready-by date.</p>
          </div>
          {report.sellerDelays?.length ? (
            <ul className="divide-y border-t">
              {report.sellerDelays.map(seller => {
                const contents = (
                  <>
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      <strong className="block">{seller.name}</strong>
                      <span className="block text-muted-foreground">{quantity(Number(seller.lateOrders), 'order')} past the recorded date</span>
                    </span>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">Late</span>
                  </>
                );
                return <li key={seller.id}>{canViewSellers
                  ? <Link href={`/admin/sellers/${encodeURIComponent(seller.id)}`} prefetch={false} className={`${sellerRow} hover:bg-muted`}>{contents}</Link>
                  : <div className={sellerRow}>{contents}</div>}
                </li>;
              })}
            </ul>
          ) : <p className={empty}>{report.sellerDelays === null ? 'Order access is required to see recorded delays.' : 'No open seller delays past a recorded ready-by date for these orders.'}</p>}
        </section>
      </div>
    </div>
  );
}
