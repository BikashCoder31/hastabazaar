import Link from 'next/link';
import { Check, Clock3, FileText, Landmark, Package } from 'lucide-react';
import type { ReactNode } from 'react';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { SellerPayoutFixFirst } from './seller-payout-fixes';
import type { OnboardingStep, SellerOnboardingChecklistModel } from '@/lib/sellers/onboarding-checklist';
import type { SellerPayoutFix } from '@/lib/sellers/payout-fixes';
import type { SellerReadiness } from '@/lib/sellers/readiness';
import { sellerSupportHref } from '@/lib/sellers/workspace-navigation';

type BankStatus = SellerReadiness['bankStatus'] | null;
type SetupStep = Omit<OnboardingStep, 'id'> & { id: OnboardingStep['id'] | 'bank' | 'verify-bank' };
type State = 'Done' | 'Your turn' | 'With Hastabazaar' | 'Later' | 'On hold' | 'Couldn’t check';
type SetupStage = { title: string; rowTitle?: string; steps: SetupStep[]; state?: State; summary?: string };

const surface = 'min-w-0 rounded-[1.125rem] border border-[#E2D6C2] bg-white shadow-sm';
const bankDetailsHref = '/seller/finance#bank-details';
const dot: Record<State, string> = {
  Done: 'bg-[#DFECE4] text-[#236548]',
  'Your turn': 'bg-[#14213D] text-white',
  'With Hastabazaar': 'bg-[#E3E9F4] text-[#264880]',
  Later: 'bg-[#EBE2D0] text-[#465573]',
  'On hold': 'bg-amber-100 text-amber-900',
  'Couldn’t check': 'bg-[#F0EBE1] text-[#465573]',
};
const rowTitles: Partial<Record<SetupStep['id'], string>> = {
  registration: 'Registration sent',
  application: 'Application approved',
  send: 'Send your first product',
  approve: 'Hastabazaar checks it',
  publish: 'Hastabazaar publishes it',
};
const afterSubmission = [
  ['Hastabazaar checks it', 'We review the details and photos. If something is missing, we’ll send it back with a note.'],
  ['We publish it', 'Your shop goes live with its first published product.'],
  ['Your Today page opens', 'Orders, money and stock appear here, along with whose turn it is.'],
] as const;

function setupState(step: SetupStep): State {
  if (step.status === 'Done' || step.status === 'On hold') return step.status;
  if (step.status === 'Unavailable') return 'Couldn’t check';
  if (step.action?.actor === 'seller') return 'Your turn';
  if (step.action) return 'With Hastabazaar';
  return 'Later';
}

function bankSteps(status: BankStatus, fix?: SellerPayoutFix): SetupStep[] {
  const add: SetupStep = { id: 'bank', title: 'Add your bank account', status: 'Done', detail: 'Bank details are on file.' };
  const verify: SetupStep = { id: 'verify-bank', title: 'Hastabazaar verifies it', status: 'Pending', detail: 'Verification starts after you add your bank account.' };
  if (fix) return [add, {
    ...verify,
    title: fix.waitingFor === 'seller' ? 'Fix your bank document' : 'Hastabazaar checks the new bank document',
    detail: fix.note,
    action: fix.waitingFor === 'seller'
      ? { actor: 'seller', href: fix.sellerHref, label: 'Upload new file' }
      : { actor: 'admin', href: fix.sellerHref, label: 'View bank details' },
  }];
  if (status === 'missing') return [{
    ...add, status: 'Pending', detail: 'A verified account is needed before your first payout. You can add it now.',
    action: { actor: 'seller', href: bankDetailsHref, label: 'Add bank details' },
  }, verify];
  if (status === null) return [
    { ...add, status: 'Unavailable', detail: 'Saved bank details could not be checked.' },
    { ...verify, status: 'Unavailable', detail: 'Bank verification could not be checked.', action: { actor: 'admin', href: bankDetailsHref, label: 'View bank details' } },
  ];
  if (status === 'verified') return [add, { ...verify, status: 'Done', detail: 'Your bank account is verified.' }];
  return [add, {
    ...verify, status: status === 'pending' ? 'Pending' : 'On hold',
    detail: status === 'pending' ? 'Hastabazaar is checking your bank details.' : 'Your bank details need to be checked again before payouts.',
    action: { actor: 'admin', href: bankDetailsHref, label: 'View bank details' },
  }];
}

function SetupRow({ step, number }: { step: SetupStep; number: number }) {
  const state = setupState(step);
  const action = step.action;
  return <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-t border-[#EBE2D0] px-4 py-3.5 sm:px-5">
    <span aria-hidden="true" className={`mt-1 grid size-[1.625rem] place-items-center rounded-full text-xs font-bold ${dot[state]}`}>
      {state === 'Done' ? <Check className="size-3.5" /> : number}
    </span>
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className={`min-w-0 flex-1 basis-48 wrap-anywhere text-sm ${state === 'Done' ? 'text-[#465573]' : ''}`}>
        <h4 className="font-semibold">{rowTitles[step.id] ?? step.title}{state === 'Done' ? <span className="sr-only">, done</span> : null}</h4>
        <p className="mt-1 text-[#465573]">{step.detail}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {state === 'Your turn' ? <WhoseTurn status="your-turn" /> :
          state === 'With Hastabazaar' ? <WhoseTurn status="with-hastabazaar" /> :
          state !== 'Done' ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dot[state]}`}>{state}</span> : null}
        {state !== 'Done' && action?.href && action.label ? <Link href={action.href}
          className={action.actor === 'seller'
            ? 'inline-flex min-h-11 max-w-full items-center rounded-lg border border-[#D7C4A9] px-3 py-2 text-sm font-semibold hover:bg-[#F7F3EC]'
            : 'section-link min-h-11 text-sm'}>
          {action.label}
        </Link> : null}
      </div>
    </div>
  </li>;
}

function FirstSetupTask({ first, waiting }: { first?: SetupStep; waiting: boolean }) {
  const action = first?.action;
  if (!first || !action?.href || !action.label) return <section className="flex items-start gap-4 rounded-[1.125rem] bg-[#E3E9F4] p-5 text-[#264880] sm:p-6">
    <Clock3 aria-hidden="true" className="mt-1 size-6 shrink-0" />
    <div className="min-w-0">
      <span className="text-sm font-semibold">{waiting ? 'With Hastabazaar' : 'Setup progress'}</span>
      <h2 className="mt-1 text-lg font-bold">{waiting ? 'Nothing needs you right now' : 'See what’s left to set up'}</h2>
      <p className="mt-1 text-sm">{waiting ? 'See the steps below for what we’re checking.' : 'See the steps below for the latest information.'}</p>
    </div>
  </section>;

  const Icon = first.id === 'send' || first.id === 'approve' || first.id === 'publish' ? Package :
    first.id === 'bank' ? Landmark : FileText;
  const productHelpHref = action.href.startsWith('/seller/products/new') || action.href.startsWith('/seller/products/intakes/')
    ? `${action.href}#product-help` : '/help#seller-product-help';
  return <section className="flex min-w-0 flex-wrap items-center gap-4 rounded-[1.125rem] bg-[#14213D] p-6 text-white">
    <div className="flex min-w-0 flex-1 basis-[26rem] flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/10">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
          <WhoseTurn status="your-turn" className="bg-white text-[#14213D]" /> Do this first
        </div>
        <h2 className="mt-1 wrap-anywhere text-xl font-bold">{first.id === 'send' && action.label === 'Add your first product' ? action.label : rowTitles[first.id] ?? first.title}</h2>
        <p className="mt-1.5 wrap-anywhere text-sm leading-relaxed text-white/85">{first.detail}</p>
      </div>
    </div>
    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
      <Link href={action.href} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#A8232E] px-5 py-2 text-center text-sm font-semibold hover:bg-[#922029]">{action.label}</Link>
      {first.id === 'send' ? <Link href={productHelpHref} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/35 px-5 py-2 text-center text-sm font-semibold hover:bg-white/10">Get help with a product</Link> : null}
    </div>
  </section>;
}

export function SellerGettingStarted({ model, bankStatus, tradingName, date, agreement, payoutFixes = [] }: {
  model: SellerOnboardingChecklistModel;
  bankStatus: BankStatus;
  tradingName: string;
  date: string;
  agreement: ReactNode;
  payoutFixes?: readonly SellerPayoutFix[];
}) {
  const openFix = payoutFixes.find(fix => fix.waitingFor === 'seller') ?? payoutFixes[0];
  const bankFix = payoutFixes.find(fix => fix.kind === 'bank_verification');
  const payoutStage: SetupStage = {
    title: openFix ? 'Before first payout' : 'Getting paid',
    steps: bankSteps(bankStatus, bankFix),
    state: openFix && (openFix.waitingFor === 'seller' ? 'Your turn' : 'With Hastabazaar'),
    summary: openFix && (openFix.waitingFor === 'staff' ? 'Checking your new file'
      : `${payoutFixes.length} ${payoutFixes.length === 1 ? 'fix' : 'fixes'} needed`),
  };
  const stages: SetupStage[] = [
    { title: 'Registration', steps: model.steps.filter(step => step.id === 'registration' || step.id === 'application') },
    { title: 'First product', rowTitle: 'Your first product', steps: model.steps.filter(step => ['send', 'approve', 'publish'].includes(step.id)) },
    payoutStage,
    { title: 'Taking orders', steps: model.steps.filter(step => step.id === 'orders') },
  ];
  const steps = stages.flatMap(stage => stage.steps);
  const done = steps.filter(step => step.status === 'Done').length;
  const first = steps.find(step => step.status !== 'Done' && step.action?.actor === 'seller' && step.action.href && step.action.label);
  const waiting = steps.some(step => setupState(step) === 'With Hastabazaar');
  const progress = `${done} of ${steps.length} steps done`;

  return <div className="min-w-0 space-y-6 text-[#14213D]">
    <header>
      <h1 className="wrap-anywhere font-heading text-[1.75rem] leading-none font-semibold md:text-4xl">Welcome, {tradingName}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#465573] sm:text-base">{date} · <strong className="text-[#14213D]">Your shop isn&apos;t live yet</strong> · {progress}</p>
    </header>

    <section className={`${surface} p-5 sm:p-6`} aria-labelledby="shop-live-stages">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="shop-live-stages" className="font-bold">Getting your shop live</h2>
        <p className="text-xs text-[#465573] sm:hidden">{done} of {steps.length} done</p>
      </div>
      <ol className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:gap-x-0">
        {stages.map((stage, index) => {
          const states = stage.steps.map(setupState);
          const state = stage.state ?? states.find(value => value !== 'Done') ?? (states.length ? 'Done' : 'Later');
          const summary = stage.summary ?? (state === 'Later' && stage.title === 'Taking orders' ? 'After publishing' : state);
          return <li key={stage.title} className="min-w-0">
            <div className="flex items-center sm:pr-1">
              <span className={`relative grid size-[1.875rem] shrink-0 place-items-center rounded-full text-xs font-bold ${state === 'Done' ? 'bg-[#236548] text-white' : dot[state]} ${state === 'Your turn' ? 'ring-4 ring-[#E3E9F4]' : ''}`} aria-hidden="true">
                {state === 'Done' ? <Check className="size-4" /> : index + 1}
              </span>
              {index < stages.length - 1 ? <span className={`hidden h-0.5 flex-1 sm:block ${state === 'Done' ? 'bg-[#236548]' : 'bg-[#E2D6C2]'}`} aria-hidden="true" /> : null}
            </div>
            <p className="mt-2 break-words text-sm font-bold sm:pr-3">{stage.title}</p>
            <p className="mt-1 text-xs text-[#465573]">{summary}</p>
          </li>;
        })}
      </ol>
    </section>

    {openFix ? <SellerPayoutFixFirst fix={openFix} /> : <FirstSetupTask first={first} waiting={waiting} />}

    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section id="seller-onboarding" className={`${surface} scroll-mt-28`} aria-labelledby="seller-onboarding-title">
        <div className="px-4 pt-5 pb-2 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="seller-onboarding-title" className="font-bold">All steps</h2>
            <p className="text-xs text-[#465573]">Some can happen at the same time</p>
          </div>
          <progress value={done} max={steps.length} aria-label={progress}
            className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-[#EBE2D0] [&::-webkit-progress-bar]:bg-[#EBE2D0] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#236548] [&::-moz-progress-bar]:bg-[#236548]" />
        </div>
        {stages.map((stage, index) => {
          const firstNumber = stages.slice(0, index).reduce((count, previous) => count + previous.steps.length, 1);
          return <div key={stage.title}>
            <h3 className="px-4 pt-5 pb-2 text-xs font-semibold text-[#665B4C] sm:px-5">{stage.rowTitle ?? stage.title}</h3>
            <ol start={firstNumber}>
              {stage.steps.map((step, position) => <SetupRow key={step.id} step={step} number={firstNumber + position} />)}
            </ol>
          </div>;
        })}
      </section>

      <aside className="min-w-0 space-y-6">
        <section className={`${surface} p-5 sm:p-6`}>
          <h2 className="font-bold">After you send a product</h2>
          <ol className="mt-6 space-y-4">
            {afterSubmission.map(([title, detail], index) => <li key={title} className="flex min-w-0 items-start gap-3 text-sm">
              <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#EBE2D0] text-xs font-bold text-[#465573]">{index + 1}</span>
              <div className="min-w-0"><h3 className="font-bold">{title}</h3><p className="mt-0.5 leading-relaxed text-[#465573]">{detail}</p></div>
            </li>)}
          </ol>
        </section>
        <section id="selling-fee-terms" className={`${surface} scroll-mt-28 space-y-2 p-5 sm:p-6 [&_[data-slot=button]]:min-h-11`}>
          <h2 className="font-bold">Your agreement</h2>
          {agreement}
        </section>
        <section className={`${surface} p-5 sm:p-6`}>
          <h2 className="font-bold">Need help?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#465573]">Ask the seller team. You can read replies in Requests &amp; help.</p>
          <Link href={sellerSupportHref} className="section-link min-h-11 text-sm text-[#A8232E] underline">Ask a question</Link>
        </section>
      </aside>
    </div>
  </div>;
}
