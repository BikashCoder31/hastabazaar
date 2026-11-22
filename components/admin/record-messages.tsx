import Link from 'next/link';
import { can } from '@/lib/marketplace/permissions';
import { EmailDeliveryOverviewError } from '@/lib/operations/email-delivery-overview';
import { readAdminMessages, type MessageScope } from '@/lib/operations/admin-message-history';
import { ResendEmail } from './email-delivery-controls';
import { emailHistoryHref, emailLink, emailPanel, emailTime, MessageStatus } from './email-delivery-view';

const observedAt = () => Date.now();
const titles = {
  seller: 'Messages to this seller',
  customer: 'Messages to this customer',
  order: 'Messages for this order',
};

export async function readRecordMessages({ db, actor, scope }: {
  db: D1Database;
  actor: Parameters<typeof can>[0] & { id: string; role: 'super_admin' | 'admin' };
  scope: MessageScope;
}) {
  if (actor.role !== 'super_admin' || !can(actor, 'email.delivery.manage')) return null;
  const now = observedAt();
  const history = await readAdminMessages(db, actor.id, { now, scope, view: 'all', limit: 5 }).catch(error => {
    if (error instanceof EmailDeliveryOverviewError) return null;
    throw error;
  });
  return history ? { scope, now, messages: history.messages } : null;
}

export function RecordMessages({ record }: { record: Awaited<ReturnType<typeof readRecordMessages>> }) {
  if (!record) return null;
  const { scope, now, messages } = record;
  return <section id="record-messages" aria-labelledby="record-messages-heading" className={emailPanel + ' px-4 py-2'}>
    <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#E2D6C2]">
      <h3 id="record-messages-heading" className="py-2.5 text-base font-bold">{titles[scope.kind]}</h3>
      <Link className={emailLink + ' text-sm'} href={emailHistoryHref({ scope, view: 'all' })}>All messages</Link>
    </div>
    {messages.length ? <ul className="divide-y divide-[#E2D6C2]">
      {messages.map(message => <li key={message.kind + ':' + message.id} className="space-y-1 py-3 text-sm">
        <p className="wrap-anywhere font-semibold">{message.subject}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#465573]">
          <time dateTime={new Date(message.sentAt ?? message.createdAt).toISOString()}>{emailTime(message.sentAt ?? message.createdAt)}</time>
          <MessageStatus message={message} now={now} compact />
          {message.readAt != null ? <span>Seen in app</span> : message.inApp ? <span>In app</span> : null}
        </div>
        {message.resendAllowed && <ResendEmail id={message.id} kind={message.kind} />}
      </li>)}
    </ul> : <p className="py-3 text-sm text-[#465573]">No messages recorded yet.</p>}
  </section>;
}
