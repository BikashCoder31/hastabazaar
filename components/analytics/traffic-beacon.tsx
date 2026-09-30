'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isPrivateTrafficPath, normalizeTrafficPath } from '@/lib/analytics/first-party';

export function TrafficBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    let path: string;
    try { path = normalizeTrafficPath(pathname); } catch { return; }
    if (isPrivateTrafficPath(path)) return;
    const product = /^\/products\/([A-Za-z0-9_-]+)$/.exec(path);
    const eventType = product
      ? 'product_view'
      : path === '/checkout'
        ? 'checkout_started'
        : 'page_view';
    const body = JSON.stringify({
      eventType,
      path,
      entityKey: product?.[1] ?? null,
    });
    void fetch('/api/analytics/event', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
