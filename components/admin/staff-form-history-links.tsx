import {withAdminReturnTo} from '@/lib/admin/return-context';
import Link from 'next/link';
import type { StaffHistoryKind } from '@/lib/forms/staff-history';

/** A navigation entry only: the destination rechecks the current reader and exact record. */
export function StaffFormHistoryLinks({ entries,returnTo }: {
  returnTo?:string;
  entries: readonly { kind: StaffHistoryKind['kind']; subjectId?: string; label: string }[];
}) {
  return <nav aria-label="Recorded form context" className="my-4 flex flex-wrap gap-3 text-sm">
    {entries.map((entry) => {
      const params = new URLSearchParams({ kind: entry.kind });
      if (entry.subjectId) params.set('id', entry.subjectId);
      return <Link key={`${entry.kind}:${entry.subjectId ?? ''}`}
        href={returnTo?withAdminReturnTo(`/admin/staff-form-history?${params.toString()}`,returnTo):`/admin/staff-form-history?${params.toString()}`}
        className="section-link inline-flex min-h-11 items-center text-[#A8232E] underline focus-visible:outline-2 focus-visible:outline-primary">
        {entry.label}
      </Link>;
    })}
  </nav>;
}
