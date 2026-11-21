import type { ReactNode } from 'react';
import { ChevronRight, Mail, Phone } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { AdminPageTitle } from '@/components/admin/page-help';
import { sellerInitials } from '@/components/admin/seller-application-queue';
import { sellerDocumentLabel } from '@/components/admin/seller-document-label';
import { StatusBadge } from '@/components/admin/status-badge';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import type { SellerApplicationDetail } from '@/lib/db/repositories/seller-applications';
import type { SellerRestrictionRow } from '@/lib/db/repositories/seller-governance';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { SellerOrderControls } from './seller-order-controls';
import {
  type RecordListItem, type SellerRecordTab, type readSellerMoney, type readSellerStanding,
  recordPageSize, sellerRecordDate, sellerRecordTabs,
} from './seller-record-data';

const panelClass = 'min-w-0 rounded-[14px] border border-[#E4D7C3] bg-[#FFFEFD]';
const actionClass = 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D4C3A8] px-3 text-sm font-semibold hover:bg-[#EEE6D8] focus-visible:outline-2 focus-visible:outline-offset-2';
const textLink = 'inline-flex min-h-11 w-fit max-w-full items-center font-semibold text-[#A8232E] underline underline-offset-4';
const countFormat = new Intl.NumberFormat('en-NP');
const decimalFormat = new Intl.NumberFormat('en-NP', { maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat('en-NP', { style: 'percent', maximumFractionDigits: 1 });

type Standing = Awaited<ReturnType<typeof readSellerStanding>>;
type Money = Awaited<ReturnType<typeof readSellerMoney>>;
type Status = { label: string; good?: boolean };

function statusText(status: string) {
  return {
    confirmed: 'To prepare', packing: 'Packing', ready_for_pickup: 'Ready for pickup',
    dispatched: 'With courier', pending_payment: 'Payment pending', published: 'Live',
  }[status] ?? status.replaceAll('_', ' ');
}

function StandingScore({ label, value, note, meter }: {
  label: string; value: string | null; note: string; meter?: number;
}) {
  const color = value === null ? 'text-[#46536F]' : 'text-[#236548]';
  return (
    <div className={`${panelClass} flex flex-col gap-1 px-3.5 py-3.5 lg:px-4 lg:py-4`}>
      <dt className="text-sm leading-5 text-[#46536F]">{label}</dt>
      <dd className={`font-heading text-[1.6rem] font-semibold leading-tight tabular-nums xl:text-[1.8rem] ${color}`}>
        {value ?? <><span aria-hidden="true">—</span><span className="sr-only">Unavailable</span></>}
      </dd>
      <div aria-hidden="true" className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#EAE1D0]">
        {meter !== undefined ? <div className="h-full rounded-full bg-[#236548]" style={{ width: `${meter * 100}%` }} /> : null}
      </div>
      <p className="text-xs leading-4 text-[#46536F] xl:text-sm xl:leading-5">{note}</p>
    </div>
  );
}

function SellerStanding({ standing }: { standing: Standing }) {
  const { ready, returns, rating } = standing;
  const onTime = ready?.recorded ? ready.onTime / ready.recorded : undefined;
  const returnRate = returns?.orders ? returns.withReturn / returns.orders : undefined;
  const average = rating?.average ?? null;
  return (
    <dl aria-label="Seller standing" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      <StandingScore label="Ready on time" value={onTime === undefined ? null : percentFormat.format(onTime)} meter={onTime}
        note={ready?.recorded ? `${countFormat.format(ready.onTime)} of ${countFormat.format(ready.recorded)} items with a proposed date` : ready ? 'No comparable ready times' : 'Orders access required'} />
      <StandingScore label="Cancelled by seller" value={standing.cancellations} note="Seller attribution unavailable" />
      <StandingScore label="Returns" value={returnRate === undefined ? null : percentFormat.format(returnRate)} meter={returnRate}
        note={returns?.orders ? `${countFormat.format(returns.withReturn)} of ${countFormat.format(returns.orders)} delivered orders` : returns ? 'No delivered orders yet' : 'Orders or care access required'} />
      <StandingScore label="Replies to returns"
        value={returns?.averageDays == null ? null : `${decimalFormat.format(returns.averageDays)} ${returns.averageDays === 1 ? 'day' : 'days'}`}
        note={returns?.replies ? `${countFormat.format(returns.replies)} timed ${returns.replies === 1 ? 'reply' : 'replies'}` : returns ? 'No timed replies yet' : 'Orders or care access required'} />
      <StandingScore label="Customer rating" value={average === null ? null : decimalFormat.format(average)} meter={average === null ? undefined : average / 5}
        note={rating?.reviews ? `${countFormat.format(rating.reviews)} published ${rating.reviews === 1 ? 'review' : 'reviews'}` : 'No published reviews yet'} />
    </dl>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${panelClass} space-y-2 px-5 py-4`}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

function MoneyPanel({ money, registered, payoutsHref, recoveryHref }: {
  money: Money | null; registered: boolean; payoutsHref: string | null; recoveryHref: string | null;
}) {
  const rows = money ? [
    ['Paid this month', formatPaisaExact(money.paid)],
    ['Waiting for approval', formatPaisaExact(money.waiting) + (money.waitingCount === 1 ? ' · ' + money.approvals[0]?.reference : '')],
    ['In the ' + money.holdDays + '-day hold', formatPaisaExact(money.held)],
    ['Owed to Hastabazaar', recoveryHref ? <Link key="recovery" href={recoveryHref} className={textLink}>Open recovery</Link> : '—'],
    ['Commission', decimalFormat.format(money.commission) + '%'],
  ] as const : [];
  return (
    <Panel title="Money">
      {money ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm md:grid-cols-[minmax(0,1fr)_auto]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="break-words text-[#46536F]">{label}</dt>
              <dd className="min-w-0 max-w-full break-words tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="text-sm text-[#46536F]">{registered ? 'Finance access required.' : 'See the Managed Maker payment records.'}</p>}
      {payoutsHref ? <Link href={payoutsHref} className={textLink}>Open payouts</Link> : null}
    </Panel>
  );
}

function RecordStatus({ status, work }: { status: string; work: boolean }) {
  const labels = ['Late', 'Your turn', 'Seller’s turn', 'Customer’s turn', 'Courier’s turn', 'Open'];
  if (!work || !labels.includes(status)) return <StatusBadge status={statusText(status)} />;
  const tone = status === 'Late' ? 'bg-[#A8232E] text-white'
    : status === 'Your turn' ? 'bg-[#14213D] text-white' : 'bg-[#E0E7F3] text-[#284788]';
  return <span className={`break-words rounded-full px-2.5 py-1 text-center text-xs font-semibold ${tone}`}>{status}</span>;
}

type RecordProps = {
  name: string;
  avatar: string | undefined;
  meta: string[];
  status: Status;
  sellerId: string;
  phone: string;
  email: string;
  restriction: Pick<SellerRestrictionRow, 'mode' | 'obligationMode' | 'reasonCode' | 'suspendedUntil' | 'version'> | null;
  restricted: boolean;
  mayManageSeller: boolean;
  tabs: readonly (readonly [SellerRecordTab, string])[];
  tab: SellerRecordTab;
  hrefFor: (tab: SellerRecordTab, page?: number) => string;
  rows: readonly RecordListItem[];
  workCount: number;
  workLimited: boolean;
  page: number;
  standing: Standing;
  money: Money | null;
  registered: boolean;
  payoutsHref: string | null;
  recoveryHref: string | null;
  documents: SellerApplicationDetail['documents'];
  bank: { label: string; status: string; href: string } | null;
  agreement: number | null;
  notes: ReactNode;
  workUnavailable: boolean;
};

export function SellerRecord(props: RecordProps) {
  const {
    name, avatar, meta, status, sellerId, phone, email, restriction, restricted, mayManageSeller, tabs, tab, hrefFor, rows,
    workCount, workLimited, page, standing, money, registered, payoutsHref, recoveryHref, documents, bank, agreement, notes, workUnavailable,
  } = props;
  const phoneTarget = phone.replace(/[().\s-]/g, '');
  const validPhone = /^\+?\d{6,15}$/.test(phoneTarget);
  const validEmail = /^[^\s?&#@]+@[^\s?&#@]+\.[^\s?&#@]+$/.test(email);
  const tabTitle = tab === 'work' ? 'Open work for this seller' : sellerRecordTabs.find(([id]) => id === tab)?.[1];
  const paginated = tab === 'orders' || tab === 'products';
  const visibleRows = paginated ? rows.slice(0, recordPageSize) : rows;
  const sideDocuments = [...new Map(documents.map(document => [document.kind, document] as const)).values()];
  const returnTo = hrefFor(tab, page);
  const detailLink = (href: string) => href.startsWith('#') ? href : withAdminReturnTo(href, returnTo);

  return (
    <article className="min-w-0 space-y-5 break-words text-[#14213D]" data-seller-record>
      <header className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[#E4D7C3] bg-[#EEE5D5] text-lg font-bold">
            {avatar ? <Image data-media-mode="cover" src={avatar} alt="" width={64} height={64} className="size-full object-cover" unoptimized /> : <span aria-hidden="true">{sellerInitials(name)}</span>}
          </span>
          <div className="min-w-0">
            <AdminPageTitle><h1 className="break-words font-heading text-[1.65rem] leading-tight tracking-tight xl:text-[2rem]">{name}</h1></AdminPageTitle>
            <p className="mt-1 text-sm leading-6 text-[#46536F]">
              {meta.length > 0 ? <>{meta.join(' · ')}{' '}</> : null}
              <span className={`inline-block rounded-full px-2.5 text-xs font-semibold ${status.good ? 'bg-[#DDEBE1] text-[#236548]' : 'bg-[#EDE4D2] text-[#664A1A]'}`}>{status.label}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:max-w-[52%] md:justify-end">
          {validPhone ? <a href={'tel:' + phoneTarget} className={actionClass}><Phone aria-hidden="true" className="size-4" />Call seller</a> : null}
          {validEmail ? <a href={'mailto:' + email} className={actionClass}><Mail aria-hidden="true" className="size-4" />Message</a> : null}
          {mayManageSeller ? <div className="basis-full min-[420px]:basis-auto"><SellerOrderControls sellerId={sellerId} sellerName={name} restricted={restricted} restriction={restriction} /></div> : null}
        </div>
      </header>
      <SellerStanding standing={standing} />
      <nav aria-label="Seller record" className="flex flex-wrap items-center border-b border-[#E4D7C3]">
        {tabs.map(([id, label]) => (
          <Link key={id} href={hrefFor(id)} scroll={false} aria-current={id === tab ? 'page' : undefined}
            style={{ borderBottomColor: id === tab ? '#A8232E' : 'transparent' }}
            className={`inline-flex min-h-11 items-center gap-1 border-b-2 px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-3 ${id === tab ? 'font-bold text-[#14213D]' : 'text-[#46536F] hover:text-[#A8232E]'}`}>
            {label}{id === 'work' && workCount > 0 ? <span>{workCount}{workLimited ? '+' : ''}</span> : null}
          </Link>
        ))}
      </nav>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={panelClass} aria-label={tabTitle}>
          <h2 className="px-4 py-3.5 text-base font-bold sm:px-5">{tabTitle}</h2>
          {workUnavailable && tab === 'work' ? <p className="border-t border-[#E4D7C3] px-4 py-3 text-sm text-[#46536F]">The review queue is unavailable.</p> : null}
          {visibleRows.length > 0 ? (
            <ul className="divide-y divide-[#E4D7C3] border-t border-[#E4D7C3]">
              {visibleRows.map(row => (
                <li key={row.id}>
                  <Link href={detailLink(row.href)} prefetch={false} className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-sm px-4 py-3.5 hover:bg-[#F7F3EC] focus-visible:outline-2 focus-visible:-outline-offset-2 sm:gap-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{row.title}</p>
                      {row.detail ? <p className="mt-0.5 text-xs leading-5 text-[#46536F] sm:text-sm">{row.detail}</p> : null}
                    </div>
                    <div className="max-w-28 sm:max-w-40"><RecordStatus status={row.status} work={tab === 'work'} /></div>
                    <ChevronRight aria-hidden="true" className="size-4 text-[#675B4E]" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="border-t border-[#E4D7C3] px-4 py-4 text-sm text-[#46536F]">{
            tab === 'work' ? 'No open work to show.' : tab === 'history' ? 'No history has been recorded.' : `No ${tab} on this page.`
          }</p>}
          {paginated && (page > 1 || rows.length > recordPageSize) ? (
            <nav aria-label={`Seller ${tab} pages`} className="flex flex-wrap gap-3 border-t border-[#E4D7C3] px-4 py-1">
              {page > 1 ? <Link href={hrefFor(tab, page - 1)} scroll={false} className={textLink}>Previous</Link> : null}
              {rows.length > recordPageSize ? <Link href={hrefFor(tab, page + 1)} scroll={false} className={textLink}>Next</Link> : null}
            </nav>
          ) : null}
        </section>
        <aside aria-label="Seller details" className="min-w-0 space-y-4">
          <MoneyPanel money={money} registered={registered} payoutsHref={payoutsHref} recoveryHref={recoveryHref} />
          <Panel title="Documents & bank">
            <ul className="divide-y divide-[#E4D7C3]/60">
              {sideDocuments.map(document => (
                <li key={document.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1">
                  <Link href="#seller-evidence" className="flex min-h-11 min-w-0 items-center text-sm hover:underline">{sellerDocumentLabel(document.kind)}</Link>
                  {document.status === 'verified' ? <span className="rounded-full bg-[#DDEBE1] px-2.5 py-1 text-xs font-semibold text-[#236548]">Checked</span> : <StatusBadge status={document.status} />}
                </li>
              ))}
              {bank ? <li className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1">
                <Link href={bank.href} className="flex min-h-11 min-w-0 items-center text-sm hover:underline">{bank.label}</Link><StatusBadge status={bank.status} />
              </li> : null}
              <li className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1 text-sm">
                <span>Seller agreement</span>
                {agreement ? <span className="rounded-full bg-[#DDEBE1] px-2.5 py-1 text-xs font-semibold text-[#236548]">Accepted {sellerRecordDate.format(agreement)}</span> : <StatusBadge status="pending" />}
              </li>
            </ul>
            {sideDocuments.length === 0 ? <p className="text-sm text-[#46536F]">No reviewable documents recorded.</p> : null}
          </Panel>
          {notes}
        </aside>
      </div>
    </article>
  );
}
