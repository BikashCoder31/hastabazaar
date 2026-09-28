import Link from 'next/link';
import type { StaffHistoryKind } from '@/lib/forms/staff-history';

/** A navigation entry only: the destination rechecks the current reader and exact record. */
export function StaffFormHistoryLinks({ entries }: {
  entries: readonly { kind: StaffHistoryKind['kind']; subjectId?: string; label: string }[];
}) {
  return <nav aria-label="Recorded form context" className="my-4 flex flex-wrap gap-3 text-sm">
    {entries.map((entry) => {
      const params = new URLSearchParams({ kind: entry.kind });
      if (entry.subjectId) params.set('id', entry.subjectId);
      return <Link key={`${entry.kind}:${entry.subjectId ?? ''}`}
        href={`/admin/staff-form-history?${params.toString()}`}
        className="rounded border px-3 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
        {entry.label}
      </Link>;
    })}
  </nav>;
}
