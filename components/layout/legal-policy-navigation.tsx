import Link from 'next/link';

import {
  publicLegalPolicyNavigation,
  type PublicLegalPolicyKey,
} from '@/lib/content/legal-policies';

type PolicyHeading = { id: string; text: string };

function PolicyLinks({ policyKey }: { policyKey: PublicLegalPolicyKey }) {
  return (
    <nav aria-label="Legal policies" className="flex flex-col gap-2">
      <Link
        href="/legal"
        className="rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Legal & Policies
      </Link>
      {publicLegalPolicyNavigation.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === policyKey ? 'page' : undefined}
          className={[
            'rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            item.key === policyKey
              ? 'bg-primary text-primary-foreground'
              : 'border hover:bg-secondary',
          ].join(' ')}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
}

function PolicyContents({ headings }: { headings: readonly PolicyHeading[] }) {
  return (
    <nav aria-label="On this page">
      <ul className="mt-2 space-y-1">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={'#' + heading.id}
              className="inline-block py-2 text-sm leading-5 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LegalPolicyNavigation({
  policyKey,
  headings,
}: {
  policyKey: PublicLegalPolicyKey;
  headings: readonly PolicyHeading[];
}) {
  return (
    <>
      <div className="space-y-3 lg:hidden" data-policy-navigation="mobile">
        <details
          className="rounded-2xl border bg-card px-4"
          data-policy-disclosure="policies"
        >
          <summary className="cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Browse policies
          </summary>
          <div className="pb-4">
            <PolicyLinks policyKey={policyKey} />
          </div>
        </details>
        <details
          className="rounded-2xl border bg-card px-4"
          data-policy-disclosure="contents"
        >
          <summary className="cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            On this page
          </summary>
          <div className="pb-3">
            <PolicyContents headings={headings} />
          </div>
        </details>
      </div>
      <div className="hidden lg:block" data-policy-navigation="desktop">
        <PolicyLinks policyKey={policyKey} />
        <div className="mt-5 rounded-2xl border p-4">
          <p className="text-sm font-semibold">On this page</p>
          <PolicyContents headings={headings} />
        </div>
      </div>
    </>
  );
}
