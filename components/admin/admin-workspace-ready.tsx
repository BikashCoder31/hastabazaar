'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Private form controls mount after hydration so autofill tools can decorate
 * them without changing the DOM React is still trying to hydrate. The stable
 * server snapshot is also the first browser snapshot. Authentication and page
 * permissions are still checked by the server layout and pages.
 */
export function AdminWorkspaceReady({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  return ready ? children : (
    <output className="col-span-full block min-h-64 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
      Loading workspace…
    </output>
  );
}
