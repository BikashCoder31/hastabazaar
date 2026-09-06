'use client';

import { useState } from 'react';

import type { NotificationRow } from '@/lib/db/repositories/operations';

export function NotificationList({
  initial,
}: {
  initial: readonly NotificationRow[];
}) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState('');
  async function markRead(id: string) {
    setError('');
    const response = await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      return setError(body.error ?? 'Notification could not be updated.');
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: 'read', readAt: Date.now() } : item,
      ),
    );
  }
  if (items.length === 0)
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        No notifications yet.
      </div>
    );
  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((item) => (
        <article
          key={item.id}
          className={`rounded-2xl border bg-card p-5 ${item.readAt ? 'opacity-70' : ''}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{item.subjectEn}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.bodyEn}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                {item.channel} · {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            {!item.readAt && item.channel === 'in_app' ? (
              <button
                className="rounded-lg border px-3 py-2 text-sm font-semibold"
                onClick={() => markRead(item.id)}
              >
                Mark read
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
