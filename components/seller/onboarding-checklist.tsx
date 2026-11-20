import Link from 'next/link';
import { WhoseTurn } from '@/components/ui/whose-turn';
import type { OnboardingStep, SellerOnboardingChecklistModel } from '@/lib/sellers/onboarding-checklist';
import type { SellerReadiness } from '@/lib/sellers/readiness';

const badges: Record<OnboardingStep['status'], string> = {
  Done: 'border-emerald-600/30 bg-emerald-50 text-emerald-800',
  Pending: 'border-primary/25 bg-primary/5 text-primary',
  'On hold': 'border-amber-600/30 bg-amber-50 text-amber-800',
  Unavailable: 'border-border text-muted-foreground',
};

export function SellerOnboardingChecklist({ model, bankStatus }: {
  model: SellerOnboardingChecklistModel;
  bankStatus?: SellerReadiness['bankStatus'] | null;
}) {
  const sellerView = model.audience === 'seller';
  const actors = {
    seller: sellerView ? 'You' : 'Seller',
    admin: sellerView ? 'Hastabazaar' : 'Super Admin',
    reviewer: sellerView ? 'Hastabazaar' : 'Product reviewer',
    publisher: sellerView ? 'Hastabazaar' : 'Product publisher',
  };
  const next = model.steps.find(step => step.action);
  const bank = bankStatus ?? (model.steps[0]?.status === 'Pending' ? 'missing' : null);
  const showBankSteps = sellerView && (bankStatus !== undefined || bank === 'missing');
  const stepActor = { registration: 'seller', application: 'admin', send: 'seller', approve: 'reviewer', publish: 'publisher', orders: 'admin' } as const;
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
      ) : model.steps.every(step => step.status === 'Done') && (!showBankSteps || bank === 'verified') ? (
        <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">All onboarding steps are complete.</p>
      ) : null}
      <ol className="mt-3 divide-y">
        {model.steps.map(step => {
          const actor = step.action?.actor ?? stepActor[step.id];
          return (
          <li key={step.id} className="flex flex-wrap items-start justify-between gap-2 py-3 sm:flex-nowrap sm:gap-4">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>Who acts</span>
                {sellerView ? <WhoseTurn status={actor === 'seller' ? 'your-turn' : 'with-hastabazaar'} label={actors[actor]} /> : <strong>{actors[actor]}</strong>}
                {step.id !== next?.id && step.action?.href && step.action.label ? <Link className="section-link min-h-11" href={step.action.href}>{step.action.label}</Link> : null}
              </div>
            </div>
            <span className={'whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ' + badges[step.status]}>{step.status}</span>
          </li>
        ); })}
        {showBankSteps ? <>
          <BankStep title="Add your bank account" actor="You" status={bank ? bank === 'missing' ? 'Pending' : 'Done' : 'Unavailable'}>
            {bank === 'missing' && model.steps[0]?.status === 'Done' ? <Link className="section-link min-h-11" href="/seller/finance">Add bank details</Link> : null}
          </BankStep>
          <BankStep title="Verify the bank account" actor="Hastabazaar" status={bank ? bank === 'verified' ? 'Done' : bank === 'needs_recheck' || bank === 'legacy_review_required' ? 'On hold' : 'Pending' : 'Unavailable'} />
        </> : null}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground">Payouts need a verified bank account.</p>
    </section>
  );
}

function BankStep({ title, actor, status, children }: {
  title: string;
  actor: 'You' | 'Hastabazaar';
  status: OnboardingStep['status'];
  children?: React.ReactNode;
}) {
  return <li className="flex flex-wrap items-start justify-between gap-2 py-3 sm:flex-nowrap sm:gap-4">
    <div className="min-w-0 space-y-1">
      <h3 className="font-semibold">{title}</h3>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>Who acts</span>
        <WhoseTurn status={actor === 'You' ? 'your-turn' : 'with-hastabazaar'} label={actor} />
        {children}
      </div>
    </div>
    <span className={'whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ' + badges[status]}>{status}</span>
  </li>;
}
