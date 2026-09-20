import Link from 'next/link';
import { AlertTriangle, ExternalLink, LockKeyhole } from 'lucide-react';

import { LegalDocumentContent } from '@/components/layout/legal-policy-page';
import {
  getLegalPolicyDocument,
  publicLegalPolicyNavigation,
} from '@/lib/content/legal-policies';

export const metadata = {
  title: 'Legal procedures',
  robots: { index: false, follow: false },
};

export default function AdminLegalPoliciesPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Controls · staff only</p>
        <h1 className="mt-2 font-heading text-4xl">
          Legal compliance & incident procedure
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Internal operating instructions for complaints, evidence preservation,
          regulator contact, incidents and policy-version control.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>
          Registration-pending review version. This is operational guidance, not
          a substitute for advice from a Nepal-licensed advocate on a live legal
          matter. Escalate legal notices and regulator contact immediately.
        </p>
      </div>

      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
        <div className="mb-7 flex items-center gap-2 border-b pb-5 text-sm font-semibold">
          <LockKeyhole className="size-4" aria-hidden="true" />
          Restricted internal document · do not publish
        </div>
        <LegalDocumentContent
          markdown={getLegalPolicyDocument('internal-compliance')}
        />
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-2xl">Public policy set</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {publicLegalPolicyNavigation.map((policy) => (
            <Link
              key={policy.key}
              href={policy.href}
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-secondary"
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
