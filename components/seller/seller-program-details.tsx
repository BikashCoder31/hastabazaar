'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

/** Keep draft inputs mounted, and make loading explicit before the disclosure can respond. */
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function SellerProgramDetails({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  return (
    <Collapsible className="rounded-2xl border bg-card p-5 sm:p-6">
      <CollapsibleTrigger
        id="program-details-title"
        disabled={!ready}
        aria-busy={!ready}
        className="group flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:cursor-wait aria-disabled:opacity-60"
      >
        <span>Program, agreements and answer history</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 group-aria-expanded:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted className="mt-4 flex flex-col gap-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
