import { AdminPageTitle } from '@/components/admin/page-help';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Layout only: callers supply authorized records and version-guarded domain controls. */
export function ReviewWorkspace({ record, summary, current, proposed, evidence, dependencies, decision, history, children }: {
  record: { name: string; reference: string; type: string; owner: string | null; version: string; status: string; backHref: string };
  summary: ReactNode; current: ReactNode; proposed: ReactNode; evidence: ReactNode;
  dependencies: ReactNode; decision: ReactNode; history: ReactNode; children?: ReactNode;
}) {
  return <div className="space-y-7">
    <header className="sticky top-0 z-20 space-y-2 rounded-xl border bg-card p-4 xl:top-24">
      <Link className="section-link" href={record.backHref}>← Back to results</Link>
      <AdminPageTitle><h1 className="section-title">{record.name}</h1></AdminPageTitle>
      <p className="mt-2 text-sm text-muted-foreground">{record.type} · {record.reference}</p>
      <p>{record.status} · Version {record.version} · {record.owner ? `Owner: ${record.owner}` : 'Unassigned'}</p>
      <nav className="flex flex-wrap gap-4 text-sm" aria-label="Review sections">{['summary','comparison','evidence','dependencies','decision','history'].map(id =>
        <a key={id} className="underline capitalize" href={`#review-${id}`}>{id}</a>)}</nav>
    </header>
    <section id="review-summary" className="scroll-mt-48"><h2 className="font-heading text-xl">Summary and next action</h2>{summary}</section>
    <section id="review-comparison" className="grid scroll-mt-48 grid-cols-1 gap-6 lg:grid-cols-2">
      <div><h2 className="font-heading text-xl">Current effective values</h2>{current}</div>
      <div><h2 className="font-heading text-xl">Proposed values</h2>{proposed}</div>
    </section>
    <section id="review-evidence" className="scroll-mt-48"><h2 className="font-heading text-xl">Evidence</h2>{evidence}</section>
    <section id="review-dependencies" className="scroll-mt-48"><h2 className="font-heading text-xl">Readiness and dependencies</h2>{dependencies}</section>
    <section id="review-decision" className="scroll-mt-48 rounded-xl border bg-card p-5"><h2 className="font-heading text-xl">Record a decision</h2>{decision}</section>
    <details id="review-history" className="scroll-mt-48"><summary className="cursor-pointer font-semibold">History</summary>{history}</details>
    {children}
  </div>;
}
