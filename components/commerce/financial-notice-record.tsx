import Link from 'next/link';
import type { ReactNode } from 'react';
import type { FinancialNoticeDestination } from '@/lib/operations/financial-notice-destination';
export function FinancialNoticeRecord({
  record,
  heading,
}: {
  record: FinancialNoticeDestination;
  heading?: ReactNode;
}) {
  const money = (value: number) =>
    new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
    }).format(value / 100);
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
      {heading ?? <h1 className="font-heading text-3xl">{record.title}</h1>}
      <p className="leading-7">{record.explanation}</p>
      <dl className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">Original reference</dt>
          <dd className="break-words font-medium">{record.reference}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Recorded state</dt>
          <dd>{record.status.replaceAll('_', ' ')}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            Recorded time (Nepal)
          </dt>
          <dd>
            {new Date(record.recordedAt).toLocaleString('en-NP', {
              timeZone: 'Asia/Kathmandu',
            })}
          </dd>
        </div>
        {record.amountPaisa !== null ? (
          <div>
            <dt className="text-sm text-muted-foreground">
              Original record amount
            </dt>
            <dd>{money(record.amountPaisa)}</dd>
          </div>
        ) : null}
      </dl>
      <Link
        className="inline-flex min-h-11 items-center underline underline-offset-4"
        href={record.actionHref}
      >
        {record.actionLabel}
      </Link>
      <p className="text-sm leading-6 text-muted-foreground">
        Open the linked workspace to review the current details and available
        next action.
      </p>
    </main>
  );
}
