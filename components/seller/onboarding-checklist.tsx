import Link from 'next/link';
import type { OnboardingStep, SellerOnboardingChecklistModel } from '@/lib/sellers/onboarding-checklist';

const badges: Record<OnboardingStep['status'], string> = {
  Done: 'border-emerald-600/30 bg-emerald-50 text-emerald-800',
  Pending: 'border-primary/25 bg-primary/5 text-primary',
  'On hold': 'border-amber-600/30 bg-amber-50 text-amber-800',
  Unavailable: 'border-border text-muted-foreground',
};

export function SellerOnboardingChecklist({ model }: { model: SellerOnboardingChecklistModel }) {
  const sellerView = model.audience === 'seller';
  const actors = {
    seller: sellerView ? 'You' : 'Seller',
    admin: sellerView ? 'Hastabazaar' : 'Super Admin',
    reviewer: sellerView ? 'Hastabazaar product reviewer' : 'Product reviewer',
    publisher: sellerView ? 'Hastabazaar product publisher' : 'Product publisher',
  };
  const next = model.steps.find(step => step.action);
  return (
    <section id="seller-onboarding" aria-labelledby="seller-onboarding-title" className="scroll-mt-28 rounded-2xl border bg-card p-5 sm:p-6">
      <h2 id="seller-onboarding-title" className="font-heading text-2xl">Seller onboarding checklist</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {sellerView ? 'See your progress from registration to your first sale.' : 'See this seller’s progress from registration to taking orders.'} Some checks can happen in parallel.
      </p>
      {next?.action ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div>
            <p className="font-semibold">Next step: {next.title}</p>
            <p className="mt-1 text-sm">Who acts: <strong>{actors[next.action.actor]}</strong></p>
          </div>
          {next.action.href && next.action.label ? (
            <Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={next.action.href}>{next.action.label}</Link>
          ) : null}
        </div>
      ) : model.steps.every(step => step.status === 'Done') ? (
        <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">All onboarding steps are complete.</p>
      ) : null}
      <ol className="mt-3 divide-y">
        {model.steps.map(step => (
          <li key={step.id} className="flex flex-wrap items-start justify-between gap-2 py-3 sm:flex-nowrap sm:gap-4">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
              {step.action && step.id !== next?.id ? (
                <p className="text-sm">
                  Who acts: <strong>{actors[step.action.actor]}</strong>
                  {step.action.href && step.action.label ? <> · <Link className="section-link" href={step.action.href}>{step.action.label}</Link></> : null}
                </p>
              ) : null}
            </div>
            <span className={'whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ' + badges[step.status]}>{step.status}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground">Payouts have separate requirements.</p>
    </section>
  );
}
