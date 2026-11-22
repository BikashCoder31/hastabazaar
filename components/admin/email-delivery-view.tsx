import Link from 'next/link';
import { Mail } from 'lucide-react';
import { ResendEmail } from './email-delivery-controls';
import type { AdminMessage, emailDeliveryWarning, MessageScope, MessageView } from '@/lib/operations/admin-message-history';

export const emailDeliveryPath = '/admin/business-emails';
export const emailPanel = 'min-w-0 rounded-xl border border-[#E2D6C2] bg-white text-[#14213D]';
export const emailLink = 'inline-flex min-h-11 items-center rounded-md px-2 font-semibold text-[#A8232E] underline underline-offset-4 hover:bg-[#F7F3EC] focus-visible:outline-2 focus-visible:outline-offset-2';

export function emailHistoryHref(input: { scope?: MessageScope; view?: MessageView; page?: number }) {
  const query = new URLSearchParams();
  if (input.scope) query.set(input.scope.kind, input.scope.id);
  if (input.view) query.set('view', input.view);
  if (input.page && input.page > 1) query.set('page', String(input.page));
  return emailDeliveryPath + (query.size ? '?' + query.toString() : '');
}

export function emailTime(value: number) {
  return new Intl.DateTimeFormat('en-NP', {
    timeZone: 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short',
  }).format(value);
}

export function EmailWarning({ warning }: { warning: NonNullable<ReturnType<typeof emailDeliveryWarning>> }) {
  return <section aria-labelledby="email-warning-heading" className={'flex min-w-0 flex-wrap items-start gap-3 rounded-xl px-4 py-3 ' +
    (warning.tone === 'red' ? 'bg-[#F7DFDF] text-[#811B24]' : 'bg-[#F5E8C9] text-[#653F06]')}>
    <span className="rounded-lg bg-white p-2"><Mail aria-hidden="true" className="size-4" /></span>
    <div className="min-w-0 flex-[1_1_12rem]">
      <h2 id="email-warning-heading" className="font-bold">{warning.title}</h2>
      <p className="text-sm wrap-anywhere">{warning.message}</p>
    </div>
    <Link href={emailHistoryHref({ view: warning.tone === 'amber' ? 'needs-you' : 'waiting' })}
      className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#14213D] outline-offset-2 focus-visible:outline-2">Open Emails</Link>
  </section>;
}

const statusLabels: Record<AdminMessage['state'], string> = {
  delivered: 'Delivered',
  captured: 'Captured locally',
  sent_record: 'Sent record',
  waiting: 'Waiting',
  failed: 'Failed',
  expired: 'Expired',
};

export function MessageStatus({ message, now, compact = false }: { message: AdminMessage; now: number; compact?: boolean }) {
  const tone = message.state === 'failed' ? 'bg-[#A8232E] text-white'
    : message.state === 'waiting' ? 'bg-[#F5E8C9] text-[#653F06]'
    : message.state === 'delivered' ? 'bg-[#DBECE1] text-[#205B40]'
    : 'bg-[#F3ECDF] text-[#465573]';
  const waiting = message.state === 'waiting' && message.createdAt <= now
    ? ' ' + Math.floor((now - message.createdAt) / 60_000) + ' min' : '';
  const status = statusLabels[message.state] + waiting;
  return <div className={compact ? 'inline-flex flex-wrap items-baseline gap-1' : 'space-y-1'}>
    <span className={'inline-block rounded-full px-2 py-0.5 text-xs font-semibold ' + tone}>{status}</span>
    {message.reason && <p className="text-xs text-[#465573]">{message.reason}</p>}
    {message.permanentAddressFailure && <p className="text-xs text-[#465573]">Check the address with them by phone.</p>}
  </div>;
}

export function MessageActions({ message }: { message: AdminMessage }) {
  return <div className="flex min-w-0 flex-wrap items-start gap-1">
    {message.resendAllowed && <ResendEmail id={message.id} kind={message.kind} />}
    {message.href && <Link href={message.href} className={emailLink}>
      {message.href.startsWith('/admin/orders/') ? 'Open order' : message.audience === 'Seller' ? 'Open seller' : message.audience === 'Customer' ? 'Open customer' : 'Open record'}
    </Link>}
  </div>;
}
