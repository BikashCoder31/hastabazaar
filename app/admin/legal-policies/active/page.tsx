import Link from 'next/link';
import { requireLegalProcedureReaderPage } from '@/lib/legal-procedures/access';
import { getCurrentLegalProcedureControl } from '@/lib/legal-procedures/lifecycle';
import { LEGAL_SECTIONS, LegalDraftStoreError } from '@/lib/legal-procedures/model';
import { procedureTime } from '@/lib/legal-procedures/document';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Active staff procedure', robots: { index: false, follow: false } };
export default async function ActiveStaffProcedurePage() {
  const { db, actor } = await requireLegalProcedureReaderPage();
  let control;
  try { control = await getCurrentLegalProcedureControl(db); }
  catch (error) {
    if (error instanceof LegalDraftStoreError) return <div role="alert" className="rounded-2xl border p-6"><h1 className="font-heading text-3xl">Active procedure unavailable</h1><p className="mt-3">The recorded approval could not be verified. No working version has been substituted. Ask Super Admin to review its history.</p></div>;
    throw error;
  }
  const active = control.active;
  return <div className="flex min-w-0 flex-col gap-6">
    <header><p className="eyebrow">Internal · Authorized staff</p><h1 className="mt-2 font-heading text-4xl">Active operating procedure</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Use the active instructions with each order&apos;s recorded terms and existing public customer policies. This page does not change agreements, permissions or money.</p></header>
    <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary">
      <Link href="/admin/cases" className="min-h-11 py-2 underline">Returns and complaints</Link>
      <Link href="/legal" className="min-h-11 py-2 underline">Public policies</Link>
      {actor.role === 'super_admin' ? <Link href="/admin/legal-policies" className="min-h-11 py-2 underline">Manage procedure versions</Link> : null}
      {active ? <Link href="/api/admin/legal-procedures/active?download=1" prefetch={false} download className="min-h-11 py-2 underline">Download active procedure</Link> : null}
    </div>
    {active ? <>
      <section className="rounded-2xl border bg-card p-5 text-sm leading-7"><h2 className="font-semibold">Version {active.document.revision} · Active</h2>
        <p>Effective {procedureTime(active.effectiveAt!)} Nepal time · activated by {active.actorName}</p>
        <p>{active.document.company.legalName} · registration {active.document.company.registrationNumber}</p>
        <p>{active.document.company.registeredOffice} · {active.document.company.supportEmail}</p>
        <details><summary className="cursor-pointer py-2">Version evidence</summary><p>Approval action {active.approvalSequence}</p><p className="break-all">Document fingerprint: {active.document.sha256}</p></details>
      </section>
      <nav aria-label="Active procedure sections" className="grid gap-2 rounded-2xl border p-5 text-sm sm:grid-cols-2">{LEGAL_SECTIONS.map(([id, title], index) => <a key={id} href={`#active-${id}`} className="rounded-lg py-2 font-semibold text-primary">{index + 1}. {title}</a>)}</nav>
      {active.document.sections.map((section, index) => <section key={section.id} id={`active-${section.id}`} className="scroll-mt-32 rounded-2xl border bg-card p-5 sm:p-6"><h2 className="font-heading text-2xl">{index + 1}. {LEGAL_SECTIONS[index][1]}</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{section.body}</p></section>)}
    </> : <section className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">No internal procedure is active</h2><p className="mt-3 text-sm leading-7">Ask Super Admin to save, approve and activate the completed operating procedure. Existing public policies and recorded agreements remain authoritative. A working or scheduled version is not substituted here.</p></section>}
  </div>;
}
