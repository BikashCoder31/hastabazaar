import Link from 'next/link';
import { AlertTriangle, Check, Clock3 } from 'lucide-react';
import { SellerChecklistRequest } from '@/components/admin/seller-checklist-request';
import { checklistDate } from '@/lib/sellers/shop-checklist-evidence';
import type { ChecklistItem, SellerChecklist, SellerChecklistItemView, SellerChecklistView } from '@/lib/sellers/shop-checklist';

const groupTitles = {
  sell: { staff: 'Needed to sell', seller: 'To sell' },
  payouts: { staff: 'Needed before payouts', seller: 'Before your payouts' },
  shop: { staff: 'Shop details', seller: 'Shop details' },
};
const statusLabels = { ok: 'OK', waiting: 'Waiting for Hastabazaar’s check', missing: 'Missing', wrong: 'Wrong · fix asked', expiring: 'Expiring' };
const fine = 'bg-[#DFECE4] text-[#21553E]';
const attention = 'bg-[#F7E9C5] text-[#69430A]';
const problem = 'bg-[#F8E0DE] text-[#791B21]';
const statusTone = { ok: fine, waiting: 'bg-[#E3E9F4] text-[#264880]', missing: problem, wrong: problem, expiring: attention };
const panel = 'min-w-0 overflow-hidden rounded-[1.125rem] border border-[#E2D6C2] bg-white';
const outline = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#D7C4A9] px-3 text-center text-sm font-semibold hover:bg-[#F4EFE5] focus-visible:outline-2 focus-visible:outline-offset-2';
const primary = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-[#14213D] px-3 text-center text-sm font-semibold text-white hover:bg-[#253557] focus-visible:outline-2 focus-visible:outline-offset-2';

function StatusIcon({ status }: { status: SellerChecklistItemView['status'] }) {
  const Icon = status === 'ok' ? Check : status === 'waiting' || status === 'expiring' ? Clock3 : AlertTriangle;
  return <span className={'mt-1 grid size-6 shrink-0 place-items-center rounded-full ' + statusTone[status]}>
    <Icon className="size-3.5" aria-hidden="true" />
  </span>;
}

function DoneItems({ items, audience }: {
  items: { id: string; label: string }[]; audience: 'staff' | 'seller';
}) {
  if (!items.length) return null;
  return <details className="mx-4 my-4 sm:mx-5">
    <summary className={outline + ' w-fit cursor-pointer list-none rounded-full'}>
      Show the {items.length} that are {audience === 'staff' ? 'fine' : 'done'}
    </summary>
    <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
      {items.map(item => <li key={item.id} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#236548]" aria-hidden="true" />{item.label}</li>)}
    </ul>
  </details>;
}

function Turn({ turn, audience }: { turn: NonNullable<ChecklistItem['turn']>; audience: 'seller' | 'staff' }) {
  const own = turn === audience;
  return <span className={'inline-block w-fit whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ' +
    (own ? 'bg-[#14213D] text-white' : 'bg-[#E3E9F4] text-[#264880]')}>
    {own ? 'Your turn' : audience === 'staff' ? 'Seller’s turn' : 'With Hastabazaar'}
  </span>;
}

function sellerRow(item: SellerChecklistItemView) {
  return <li key={item.id} id={'seller-checklist-' + item.id} className="flex scroll-mt-24 items-start gap-3 px-4 py-4 sm:px-5">
    <StatusIcon status={item.status} />
    <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0 space-y-1">
        <h4 className="break-words text-sm font-bold">{item.label}</h4>
        <p className="break-words text-sm text-[#465573]">{item.detail}</p>
        {item.note ? <p className="whitespace-pre-wrap break-words rounded-xl bg-[#F4EFE5] px-3 py-2 text-sm leading-5 text-[#293B5D]">
          <strong>Hastabazaar{item.noteAt ? ', ' + checklistDate(item.noteAt) : ''}</strong> <q>{item.note}</q>
        </p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Turn turn="seller" audience="seller" />
        {item.action ? <Link href={item.action.href} prefetch={false} className={primary}>{item.action.label}</Link> : null}
      </div>
    </div>
  </li>;
}

export function SellerShopChecklist({ checklist }: { checklist: SellerChecklistView }) {
  const date = checklist.payoutsUntil ? checklistDate(checklist.payoutsUntil) : null;
  const hasPayoutItems = checklist.groups.find(group => group.id === 'payouts')?.items.some(item => item.status !== 'ok');
  const done = checklist.groups.flatMap(group => group.items.filter(item => item.status === 'ok'));
  const shopWaiting = checklist.groups.find(group => group.id === 'shop')?.items.some(item => item.status === 'waiting');
  const shopSummary = checklist.missingShop ? checklist.missingShop + ' missing' : shopWaiting ? 'being checked' : 'complete';
  const summaries = [
    { title: checklist.canSell ? 'You can sell' : checklist.canSell === false ? 'You can’t sell yet' : 'Selling: check unavailable',
      detail: checklist.shopLive ? 'Your shop is live and taking orders.' : checklist.canSell ? 'Your shop can take orders once a product is live.' : 'Check the selling steps below.',
      tone: checklist.canSell ? fine : attention },
    { title: date ? 'Payouts: fine until ' + date : checklist.canPay ? 'Payouts: ready' : hasPayoutItems ? 'Payouts: check needed' : 'Payouts: no payout ready',
      detail: date ? 'Send your renewed document before then.' : checklist.canPay ? 'Your payout details are ready.' :
        hasPayoutItems ? 'Review the items before your next payout.' : 'Open Earnings to see your balance.',
      tone: date || !checklist.canPay ? attention : fine },
    { title: 'Shop details: ' + shopSummary,
      detail: checklist.missingShop ? 'Complete the missing shop details below.' : shopWaiting ? 'Hastabazaar has your submitted shop details.' : 'Your shop details are complete.',
      tone: checklist.missingShop ? problem : shopWaiting ? attention : fine },
  ];
  return <section aria-labelledby="shop-checklist-title" className="space-y-5 text-[#14213D]">
    <header>
      <h2 id="shop-checklist-title" className="font-heading text-3xl font-semibold leading-tight">Your shop checklist</h2>
      <p className="mt-1 text-sm leading-relaxed text-[#465573] sm:text-base">See what Hastabazaar needs to set up your shop and payouts.</p>
    </header>
    <div className="grid gap-3 xl:grid-cols-3">
      {summaries.map(summary => <div key={summary.title} className={'rounded-[14px] px-4 py-3 sm:p-4 ' + summary.tone}>
        <p className="font-bold">{summary.title}</p>
        <p className="mt-1 text-sm">{summary.detail}</p>
      </div>)}
    </div>
    <div className={panel + ' shadow-sm'}>
      {checklist.groups.map(group => {
        const needs = group.items.filter(item => item.status !== 'ok' && item.turn === 'seller');
        const waiting = group.items.some(item => item.status !== 'ok' && item.turn === 'staff');
        return <section key={group.id} id={group.id === 'payouts' ? 'seller-payout-fixes' : undefined} className="scroll-mt-28">
          <h3 className="flex justify-between gap-4 px-4 py-2.5 text-xs font-semibold text-[#665B4C] sm:px-5">
            {groupTitles[group.id].seller}<span>{needs.length ? needs.length + ' for you' : waiting ? 'With Hastabazaar' : 'All fine'}</span>
          </h3>
          {needs.length ? <ul className="divide-y divide-[#E2D6C2] border-t border-[#E2D6C2]">{needs.map(sellerRow)}</ul> : null}
        </section>;
      })}
      <DoneItems items={done} audience="seller" />
    </div>
  </section>;
}

const emailStatuses: Record<string, string> = {
  delivered: 'email delivered', captured: 'email captured', sent_record: 'email delivery unconfirmed',
  waiting: 'email waiting', failed: 'email failed', expired: 'email expired',
};

export function AdminShopChecklist({ checklist, sellerId, actorId, now }: {
  checklist: SellerChecklist; sellerId: string; actorId: string; now: number;
}) {
  const result = (value: boolean | null) => value === null ? 'check unavailable' : value ? 'yes' : 'no';
  const date = checklist.payoutsUntil ? checklistDate(checklist.payoutsUntil) : null;
  const done = checklist.groups.flatMap(group => group.items.filter(item => item.status === 'ok'));
  return <section id="seller-checklist" aria-labelledby="seller-checklist-title" className={panel}>
    <header className="flex flex-col justify-between gap-2 px-4 py-4 xl:flex-row xl:items-center sm:px-5">
      <h2 id="seller-checklist-title" className="font-bold">Seller checklist</h2>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <span className={'rounded-full px-2.5 py-1 ' + (checklist.canSell ? fine : attention)}>Can sell: {result(checklist.canSell)}</span>
        <span className={'rounded-full px-2.5 py-1 ' + (checklist.canPay && !date ? fine : attention)}>Can be paid: {result(checklist.canPay)}{date ? ' until ' + date : ''}</span>
        <span className={'rounded-full px-2.5 py-1 ' + (checklist.missingShop ? attention : fine)}>Shop details: {checklist.missingShop ? checklist.missingShop + ' missing' : 'complete'}</span>
      </div>
    </header>
    <div className="border-t border-[#E2D6C2]">
      {checklist.groups.map(group => {
        const needs = group.items.filter(item => item.status !== 'ok');
        return <section key={group.id}>
          <h3 className="flex justify-between gap-4 px-4 py-2.5 text-xs font-semibold text-[#665B4C] sm:px-5">
            {groupTitles[group.id].staff}<span>{needs.length ? needs.length + ' to sort out' : 'All fine'}</span>
          </h3>
          {needs.length ? <ul className="divide-y divide-[#E2D6C2] border-t border-[#E2D6C2]">
            {needs.map(item => <li key={item.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <StatusIcon status={item.status} />
              <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_minmax(9rem,auto)] xl:items-start">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-bold">{item.label}</h4>
                  <p className={'mt-1 break-words text-sm font-semibold ' + (item.status === 'missing' || item.status === 'wrong' ? 'text-[#A8232E]' : 'text-[#665B4C]')}>
                    {item.expiry && item.status === 'expiring' ? 'Expires ' + checklistDate(item.expiry) : statusLabels[item.status]}
                  </p>
                </div>
                <div className="min-w-0 space-y-1">
                  {item.turn ? <Turn turn={item.requestAction && !item.requestAction.remind ? 'staff' : item.turn} audience="staff" /> : null}
                  <p className="break-words text-xs text-[#465573]">{item.message ? [
                    item.message.subject, checklistDate(item.message.at), item.message.emailStatus ? emailStatuses[item.message.emailStatus] : null,
                    item.message.inAppSeen ? 'seen in app' : null,
                  ].filter(Boolean).join(' · ') : 'No message yet'}</p>
                </div>
                {item.requestAction ? item.requestAction.availableAt <= now ?
                  <SellerChecklistRequest sellerId={sellerId} actorId={actorId} itemId={item.id}
                    label={item.requestAction.label} note={item.requestAction.note} remind={item.requestAction.remind} />
                  : <button type="button" disabled className={outline + ' w-full opacity-75'}>Remind after {checklistDate(item.requestAction.availableAt)}</button>
                  : item.staffAction ? <Link className={outline} href={item.staffAction.href} prefetch={false}>{item.staffAction.label}</Link> : null}
              </div>
            </li>)}
          </ul> : null}
        </section>;
      })}
    </div>
    <DoneItems items={done} audience="staff" />
  </section>;
}
