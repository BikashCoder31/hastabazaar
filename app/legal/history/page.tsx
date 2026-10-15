import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LegalDocumentContent } from '@/components/layout/legal-policy-page';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { archivedLegalPolicies, getArchivedLegalPolicy, publicLegalPolicies } from '@/lib/content/legal-policies';
import { requireSellerTermsPage } from '@/lib/auth/seller-commercial-access';

export const metadata = { title: 'Policy history', robots: { index: false, follow: true } };

export default async function Page({ searchParams }: {
  searchParams: Promise<{ sha256?: string | string[]; policy?: string | string[] }>;
}) {
  const params = await searchParams;
  if (params.policy !== undefined && (typeof params.policy !== 'string' || !Object.hasOwn(publicLegalPolicies, params.policy)))
    notFound();
  const selected = typeof params.sha256 === 'string' ? getArchivedLegalPolicy(params.sha256) : null;
  if (params.sha256 !== undefined && !selected) notFound();
  const filter = typeof params.policy === 'string' ? params.policy : null;
  if (selected?.key === 'seller-agreement' || filter === 'seller-agreement')
    await requireSellerTermsPage('/legal/history?policy=seller-agreement');
  const previous = archivedLegalPolicies.filter((policy) => filter === null || policy.key === filter);
  return <div className="min-h-screen bg-background">
    <SiteHeader />
    <main id="main-content" className="shell max-w-4xl py-10 sm:py-14">
      <Link href="/legal" className="font-semibold text-primary underline underline-offset-4">Legal & Policies</Link>
      <h1 className="mt-4 font-heading text-4xl">{selected ? selected.title : 'Policy history'}</h1>
      <p className="mt-4 leading-7 text-muted-foreground">Previous wording, archived on 15 October 2026. Existing orders and recorded acceptances retain their applicable terms.</p>
      {selected ? <article className="mt-8 rounded-3xl border bg-card p-5 sm:p-8">
        <p className="mb-6 break-all border-b pb-5 text-sm text-muted-foreground">Document reference: {selected.sha256}</p>
        {selected.key === 'seller-agreement' ? <p className="mb-6 rounded-xl border p-4 text-sm">This archived wording uses the 9% launch rate. Your applicable commercial rate remains the one recorded with your acceptance and order.</p> : null}
        <LegalDocumentContent markdown={selected.body} />
        <Link href={publicLegalPolicies[selected.key as keyof typeof publicLegalPolicies].href} className="mt-8 inline-flex min-h-11 items-center font-semibold text-primary underline">Read current document</Link>
      </article> : previous.length ? <ul className="mt-8 space-y-4">
        {previous.map((policy) => <li key={policy.sha256} className="rounded-2xl border bg-card p-5">
          <Link href={`/legal/history?sha256=${policy.sha256}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">{policy.title}</Link>
          <p className="mt-2 break-all text-xs text-muted-foreground">Reference: {policy.sha256}</p>
        </li>)}
      </ul> : <p className="mt-8 rounded-2xl border p-5">This document was introduced on 15 October 2026 and has no earlier wording in this archive.</p>}
    </main>
    <SiteFooter compact />
  </div>;
}
