import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { AdminPageTitle } from '@/components/admin/page-help';
import { SendWaitingEmails } from '@/components/admin/email-delivery-controls';
import { emailHistoryHref, emailLink, emailPanel, emailTime, MessageActions, MessageStatus } from '@/components/admin/email-delivery-view';
import { EmailDeliveryHealth } from '@/components/admin/email-delivery-health';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { emailSenderStatus, messageViews, readAdminMessages, type MessageScope, type MessageView } from '@/lib/operations/admin-message-history';
import { readEmailDeliveryOverview, readEmailHealthRuntimeConfig } from '@/lib/operations/email-delivery-overview';
import { messageEventsForAudience } from '@/lib/operations/message-event-catalog';

export const dynamic = 'force-dynamic';

const tabs: Record<MessageView, string> = {
  'needs-you': 'Needs you', waiting: 'Waiting', delivered: 'Delivered', all: 'All',
};
const audiences = [
  { key: 'customer', label: 'Customers' },
  { key: 'seller', label: 'Sellers' },
  { key: 'super_admin', label: 'You (Super Admin)' },
] as const;
const pageLink = 'inline-flex min-h-11 items-center rounded-full border border-[#DACAB1] px-3 text-sm font-semibold outline-offset-2 focus-visible:outline-2';
const observedAt = () => Date.now();

function messageScope(params: Record<string, string | string[] | undefined>): MessageScope | undefined {
  for (const kind of ['seller', 'customer', 'order'] as const) {
    const id = params[kind];
    if (typeof id === 'string' && /^[A-Za-z0-9:_-]{1,160}$/.test(id)) return { kind, id };
  }
}

export default async function BusinessEmails({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireStaffPage('/admin/business-emails', 'email.delivery.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const now = observedAt();
  const params = await searchParams ?? {};
  const scope = messageScope(params);
  const view = messageViews.find(value => value === params.view) ?? (scope ? 'all' : 'needs-you');
  const requested = typeof params.page === 'string' ? Number(params.page) : 1;
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const runtime = readEmailHealthRuntimeConfig({ ...env, NODE_ENV: process.env.NODE_ENV }, now);
  const overview = runtime.environment ? await readEmailDeliveryOverview(db, {
    actorId: actor.id, environment: runtime.environment, expectedSince: runtime.expectedSince, now,
  }) : null;
  const history = await readAdminMessages(db, actor.id, { scope, view, page, now });
  const { summary, messages } = history;
  const status = emailSenderStatus(overview, now);
  const age = status.lastRan == null ? null : Math.floor((now - status.lastRan) / 60_000);
  const lastRan = age === null ? 'Hasn’t run yet' : age < 1 ? 'Last ran under a minute ago' : 'Last ran ' + age + ' min ago';
  const metrics = [
    { label: 'Waiting to send', value: summary.waiting },
    { label: 'Failed, needs you', value: summary.failures },
    { label: 'Delivered today', value: summary.deliveredToday, caption: summary.capturedToday ? summary.capturedToday + ' captured locally' : undefined },
  ];
  const counts = { 'needs-you': summary.failures, waiting: summary.waiting, delivered: summary.sent, all: summary.total };

  return <div className="min-w-0 space-y-5 text-[#14213D]">
    <div className="flex min-w-0 flex-wrap items-start gap-3">
      <AdminPageTitle><h1 className="font-heading text-3xl">Email delivery</h1></AdminPageTitle>
      <SendWaitingEmails />
    </div>
    <section aria-label="Sender status" className={emailPanel + ' grid gap-3 p-4 xl:grid-cols-[minmax(10rem,0.9fr)_minmax(0,2.1fr)] xl:items-center'}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={'size-3 shrink-0 rounded-full ' + (status.stopped ? 'bg-[#A8232E]' : status.healthy ? 'bg-[#29664D]' : 'bg-[#A47829]')} />
        <div>
          <h2 className="font-bold">{status.stopped ? 'Sender stopped' : status.healthy ? 'Sending normally' : age === null ? 'Sender hasn’t run yet' : 'Check sender status'}</h2>
          {(age !== null || status.stopped) && <p className="text-sm text-[#465573]">{status.healthy ? 'Runs every minute · ' : ''}{lastRan}</p>}
        </div>
      </div>
      <dl className="grid gap-3 xl:grid-cols-3">
        {metrics.map((metric, index) => <div key={metric.label} className="rounded-xl border border-[#E2D6C2] p-3">
          <dt className="text-sm text-[#465573]">{metric.label}</dt>
          <dd className={'font-heading text-2xl ' + (index === 1 && metric.value ? 'text-[#A8232E]' : '')}>{metric.value}</dd>
          {metric.caption && <dd className="text-xs text-[#465573]">{metric.caption}</dd>}
        </div>)}
      </dl>
    </section>
    <section aria-labelledby="email-messages-heading" className={emailPanel}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2D6C2] p-4">
        <h2 id="email-messages-heading" className="font-bold">{scope ? 'Messages for this ' + scope.kind : 'Messages'}</h2>
        <nav aria-label="Filter email messages" className="flex flex-wrap items-center gap-2">
          {messageViews.map(key => <Link key={key} href={emailHistoryHref({ scope, view: key })}
            aria-current={key === view ? 'page' : undefined}
            className={pageLink + (key === view ? ' border-[#14213D] bg-[#14213D] text-white' : ' hover:bg-[#F3ECDF]')}>
            {tabs[key]} <span className="ms-1 opacity-80">{counts[key]}</span>
          </Link>)}
        </nav>
      </div>
      {scope && <div className="px-2"><Link className={emailLink} href={emailHistoryHref({ view })}>Clear record filter</Link></div>}
      {messages.length ? <>
        <div aria-hidden="true" className="hidden gap-3 border-b border-[#E2D6C2] px-4 py-2 text-xs font-semibold xl:grid xl:grid-cols-[1fr_1.5fr_0.9fr_1fr]">
          <span>To</span><span>Message</span><span>Email status</span>
        </div>
        <ul className="divide-y divide-[#E2D6C2]">
          {messages.map(message => <li key={message.kind + ':' + message.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 text-sm xl:grid-cols-[1fr_1.5fr_0.9fr_1fr] xl:items-center">
            <div className="min-w-0 wrap-anywhere">
              <p className="font-semibold">{message.name}</p>
              <p className="text-xs text-[#465573]">{message.audience}{message.address ? ' · ' + message.address : ''}</p>
            </div>
            <div className="col-span-2 row-start-2 min-w-0 wrap-anywhere xl:col-span-1 xl:row-start-1">
              <p>{message.subject}</p>
              <p className="text-xs text-[#465573]">{emailTime(message.sentAt ?? message.createdAt)}{message.inApp ? ' · also in app' : ''}</p>
            </div>
            <div className="max-w-32 justify-self-end xl:col-start-3 xl:row-start-1 xl:max-w-none xl:justify-self-start">
              <MessageStatus message={message} now={now} />
            </div>
            <div className="col-span-2 xl:col-span-1 xl:col-start-4 xl:row-start-1">
              <MessageActions message={message} />
            </div>
          </li>)}
        </ul>
      </> : <p className="p-4 text-sm text-[#465573]">{view === 'needs-you' ? 'No emails need your attention.'
        : view === 'waiting' ? 'No emails are waiting to send.' : view === 'delivered' ? 'No sent emails to show yet.' : 'There are no messages to show yet.'}</p>}
      {history.pages > 1 && <nav aria-label="Message pages" className="flex flex-wrap items-center gap-2 border-t border-[#E2D6C2] p-3 text-sm">
        {history.page > 1 && <Link className={pageLink} href={emailHistoryHref({ scope, view, page: history.page - 1 })}>Previous</Link>}
        <span>Page {history.page} of {history.pages}</span>
        {history.page < history.pages && <Link className={pageLink} href={emailHistoryHref({ scope, view, page: history.page + 1 })}>Next</Link>}
      </nav>}
    </section>
    <section className={emailPanel + ' space-y-2 p-4'} aria-labelledby="which-emails-heading">
      <h2 id="which-emails-heading" className="font-bold">Which messages go out</h2>
      <p className="text-sm text-[#465573]">Important updates go by email and in the app. Sign-in codes go straight away. The sender checks the queue each minute when it’s running.</p>
      <dl className="grid gap-3 xl:grid-cols-3">
        {audiences.map(({ key, label }) => <div key={key}>
          <dt className="text-sm font-bold">{label}</dt>
          <dd className="mt-1 text-sm">{messageEventsForAudience(key).map(event => event.label).join(' · ')}</dd>
        </div>)}
      </dl>
    </section>
    <details className={emailPanel + ' p-4'}>
      <summary className="min-h-11 content-center cursor-pointer font-semibold">Delivery details and recovery</summary>
      <p className="text-sm text-[#465573]">Delivered means the mail service accepted the message. Capture records confirm a local test. Temporary failures continue at their scheduled time. Check provider evidence when a delivery outcome is uncertain.</p>
      <div className="flex flex-wrap gap-2">
        <Link className={emailLink} href="/admin/order-emails">Order email history</Link>
        <Link className={emailLink} href="/admin/business-emails/preview">Preview email templates</Link>
      </div>
      <EmailDeliveryHealth overview={overview} />
    </details>
  </div>;
}
