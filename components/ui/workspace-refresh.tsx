'use client';

import { RefreshCw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

export function WorkspaceRefresh({
  className,
  excludePaths,
}: {
  className?: string;
  excludePaths?: readonly string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (excludePaths?.includes(pathname)) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Refresh this page"
        aria-disabled={pending}
        className={cn('grid size-11 shrink-0 place-items-center rounded-lg hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-wait', className)}
        onClick={() => {
          if (!pending) startTransition(() => router.refresh());
        }}
      >
        <RefreshCw className={cn('size-5', pending && 'motion-safe:animate-spin')} aria-hidden="true" />
      </button>
      <output className="sr-only">{pending ? 'Refreshing this page…' : ''}</output>
    </>
  );
}
