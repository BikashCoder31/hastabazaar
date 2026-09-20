'use client';
import Link from 'next/link';
import { notificationDestination, type NotificationAudience } from '@/lib/operations/notification-links';
import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendJson } from '@/lib/http/client-request';
import type { NotificationRow } from '@/lib/db/repositories/operations';

export function NotificationList({
  initial,
  workspace,
}: {
  initial: readonly NotificationRow[];
  workspace: NotificationAudience;
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function markRead(id: string) {
    if (busy) return;
    setError('');
    setBusy(id);
    try {
      await sendJson(
        (workspace === 'staff' ? '/api/admin/notifications/' : '/api/notifications/') + id + '/read',
        'POST',
        undefined,
        'Notification could not be updated.',
      );
      setReadIds((current) => new Set([...current, id]));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Notification could not be updated.',
      );
    } finally {
      setBusy(null);
    }
  }
  if (initial.length === 0)
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
        <Bell className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 font-heading text-2xl">You’re all caught up.</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Your updates will appear here when there’s something new.
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {initial.filter(item => item.channel === 'in_app' && item.audienceRole === workspace).map((item) => {
        const href = notificationDestination(workspace, item.audienceRole, item.relatedType, item.relatedId, {orderNumber:item.orderNumber,productStatus:item.productStatus});
        const read = Boolean(item.readAt) || readIds.has(item.id);
        return (
          <article
            key={item.id}
            className={
              'rounded-2xl border bg-card p-5 sm:p-6 ' +
              (read ? '' : 'border-primary/35')
            }
          >
            <div className="flex items-start gap-3">
              <span
                className={
                  'flex size-10 shrink-0 items-center justify-center rounded-xl ' +
                  (read
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-secondary text-primary')
                }
              >
                <Bell className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{item.subjectEn}</h2>
                  {href ? <Link className="mt-3 inline-block underline underline-offset-4" href={href}>Open related {item.relatedType === 'order' && workspace === 'customer' ? 'orders' : 'record'}</Link> : null}
                {!read && item.channel === 'in_app' ? (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
                      Unread
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-muted-foreground">
                  {item.bodyEn}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString('en-NP')}
                  {item.channel !== 'in_app'
                    ? ' · ' + item.channel.toUpperCase() + ' · ' + item.status
                    : ''}
                </p>
                {!read && item.channel === 'in_app' ? (
                  <Button
                    variant="outline"
                    className="mt-4 min-h-10 rounded-full"
                    disabled={busy !== null}
                    onClick={() => void markRead(item.id)}
                  >
                    <Check />
                    {busy === item.id ? 'Updating…' : 'Mark as read'}
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
