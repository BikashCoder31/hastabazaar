'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gift } from 'lucide-react';
import {
  createRewardsShortcutReader,
  type RewardsShortcutState,
} from '@/lib/incentives/rewards-shortcut';
import styles from './rewards-shortcut.module.css';

type RewardsShortcutProps = { subjectId: string | null; href: string };

/** Remount on navigation or account changes so a prior account's dot cannot render. */
export function RewardsShortcut(props: RewardsShortcutProps) {
  const pathname = usePathname();
  return (
    <RewardsShortcutLink
      key={JSON.stringify([props.subjectId, pathname])}
      {...props}
    />
  );
}

function RewardsShortcutLink({ subjectId, href }: RewardsShortcutProps) {
  const [state, setState] = useState<RewardsShortcutState | null>(null);
  useEffect(() => {
    if (!subjectId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reader = createRewardsShortcutReader(subjectId, {
      fetcher: fetch,
      now: Date.now,
      onChange(next) {
        clearTimeout(timer);
        setState(next);
        if (next !== null) schedule(next.recheckAt ?? Date.now() + 60_000);
      },
    });
    function schedule(at: number) {
      // Revalidate live campaign changes within a minute, and earlier at a server boundary.
      timer = setTimeout(
        () => {
          if (document.visibilityState === 'visible') void reader.refresh();
          else {
            if (Date.now() >= at) setState(null);
            schedule(Math.max(at, Date.now() + 60_000));
          }
        },
        Math.max(1, Math.min(60_000, at - Date.now())),
      );
    }
    const refresh = () => {
      void reader.refresh();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('hastabazaar:rewards-updated', refresh);
    document.addEventListener('visibilitychange', visible);
    refresh();
    return () => {
      reader.stop();
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('hastabazaar:rewards-updated', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [subjectId]);
  const available = state?.available === true;
  return (
    <Link
      href={href}
      className={`header-action ${styles.shortcut}`}
      aria-label={
        available ? 'Daily rewards, reward available' : 'Daily rewards'
      }
    >
      <span className={styles.icon}>
        <Gift className="size-5" aria-hidden="true" />
        {available ? (
          <span
            className={styles.dot}
            data-reward-available="true"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className={styles.label} aria-hidden="true">
        Daily rewards
      </span>
    </Link>
  );
}
