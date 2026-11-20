'use client';

import { Popover } from '@base-ui/react/popover';
import { createContext, useContext, type ReactNode } from 'react';
import type { AdminPageHelp } from './page-help-copy';

const PageHelpContext = createContext<AdminPageHelp | null>(null);

export function AdminPageHelpProvider({ help, children }: { help: AdminPageHelp; children: ReactNode }) {
  return <PageHelpContext.Provider value={help}>{children}</PageHelpContext.Provider>;
}

export function PageHelp() {
  const help = useContext(PageHelpContext);
  if (!help) return null;

  return (
    <Popover.Root key={help.pathname + ':' + help.title}>
      <Popover.Trigger type="button" aria-label={help.title} className="admin-page-help-trigger">
        <span aria-hidden="true">?</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} collisionPadding={12} className="admin-page-help-positioner">
          <Popover.Popup className="admin-page-help-popup">
            <Popover.Title className="admin-page-help-heading">{help.title}</Popover.Title>
            {help.sentences.map(sentence => <p key={sentence}>{sentence}</p>)}
            {help.procedureHref ? <a href={help.procedureHref} className="admin-page-help-link">Full staff procedure</a> : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function AdminPageTitle({ children }: { children: ReactNode }) {
  const help = useContext(PageHelpContext);
  if (!help) return children;

  return <div className="admin-page-title">{children}<PageHelp /></div>;
}
