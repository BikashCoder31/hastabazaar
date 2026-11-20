'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main tabIndex={-1} id="main-content" className="shell flex min-h-[60vh] items-center justify-center py-12">
      <div
        role="alert"
        className="max-w-xl rounded-3xl border bg-card p-8 text-center"
      >
        <RefreshCw className="mx-auto size-9 text-primary" />
        <h1 className="mt-5 font-heading text-3xl">Let’s try that again.</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          This page couldn’t load. Try again, or head back to the homepage.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset} className="min-h-11 rounded-full px-6">
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
          >
            Back to Hastabazaar
          </Link>
        </div>
      </div>
    </main>
  );
}
