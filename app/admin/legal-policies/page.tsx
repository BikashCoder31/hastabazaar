import { AdminPageTitle } from '@/components/admin/page-help';
import Link from 'next/link';
import { ExternalLink, LockKeyhole } from 'lucide-react';

import { publicLegalPolicyNavigation } from '@/lib/content/legal-policies';
import { LegalProcedureWorkspace } from '@/components/admin/legal-procedure-workspace';
import { requireLegalDraftPage } from '@/lib/legal-procedures/access';
import { getLegalDraftWorkspace } from '@/lib/legal-procedures/repository';
import { getCurrentLegalProcedureControl } from '@/lib/legal-procedures/lifecycle';
import { LegalDraftStoreError } from '@/lib/legal-procedures/model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Legal procedures',
  robots: { index: false, follow: false },
};

export default async function AdminLegalPoliciesPage() {
  const { db } = await requireLegalDraftPage();
  let workspace, control;
  try { [workspace, control] = await Promise.all([getLegalDraftWorkspace(db), getCurrentLegalProcedureControl(db)]); }
  catch (error) {
    if (error instanceof LegalDraftStoreError) return <div role="alert" className="rounded-2xl border p-6"><AdminPageTitle><h1 className="font-heading text-3xl">Legal procedures unavailable</h1></AdminPageTitle><p className="mt-3">The saved draft or its history could not be verified. No content has been replaced. Please try again after the stored record is reviewed.</p></div>;
    throw error;
  }
  return (
    <div className="space-y-6">
      <header>
        <AdminPageTitle>
          <h1 className="font-heading text-4xl">
            Legal compliance & incident procedure
          </h1>
        </AdminPageTitle>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Internal operating instructions for complaints, evidence preservation,
          regulator contact, incidents and policy-version control.
        </p>
      </header>

      <div className="rounded-2xl border bg-card p-5 text-sm leading-7 text-muted-foreground">
        Manage the internal operating procedure through saved versions, approval and activation.
        Follow existing public agreements and escalate live legal notices and regulator contact promptly.
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="size-4" aria-hidden="true" />
          Restricted internal document · do not publish
      </div>
      <LegalProcedureWorkspace initial={workspace} initialControl={control} />

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-2xl">Public policy set</h2>
        <Link href="/legal/history" className="section-link underline mt-3">
          View archived policy wording (staff only)
        </Link>
        <div className="mt-4 flex flex-wrap gap-2">
          {publicLegalPolicyNavigation.map((policy) => (
            <Link
              key={policy.key}
              href={policy.href}
              target="_blank"
              className="section-link underline"
            >
              {policy.title}{' '}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
