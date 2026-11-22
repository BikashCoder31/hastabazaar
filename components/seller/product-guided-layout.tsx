import { Check } from 'lucide-react';
import { productSteps } from '@/lib/products/guided-product-steps';

const card = 'min-w-0 rounded-2xl border border-[#E4DACA] bg-white p-4 shadow-sm sm:p-5';
const secondary = 'min-h-11 shrink-0 rounded-lg border border-[#D7C4A9] px-3.5 text-sm font-semibold hover:border-[#14213D] disabled:opacity-50';

export function GuidedStepBar({ step, furthest, summaries, onChange }: {
  step: number;
  furthest: number;
  summaries: readonly string[];
  onChange: (step: number) => void;
}) {
  return <nav aria-label="Add a product steps" className="grid grid-cols-5 gap-1.5 sm:gap-2">
    {productSteps.map((label, index) => {
      const current = index === step;
      const complete = index < furthest;
      return <button key={label} type="button" aria-current={current ? 'step' : undefined}
        aria-label={`Step ${index + 1}: ${label}${complete ? ', completed' : ''}`}
        disabled={index > furthest} onClick={() => onChange(index)}
        className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border bg-white px-1.5 py-2 text-left disabled:opacity-70 sm:min-h-[60px] sm:justify-start sm:px-2 lg:px-3 ${current ? 'border-[#14213D] ring-1 ring-[#14213D]' : 'border-[#E4DACA]'}`}>
        <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${current ? 'bg-[#14213D] text-white' : complete ? 'bg-[#236548] text-white' : 'bg-[#EBE2D0] text-[#46536F]'}`}>
          {complete && !current ? <><span className="sm:hidden">{index + 1}</span><Check className="hidden size-4 sm:block" /></> : index + 1}
        </span>
        <span className="hidden min-w-0 text-xs font-bold sm:block">
          {label}
          {current || complete ? <span className="mt-0.5 block truncate font-normal text-[#46536F]">{current ? 'You are here' : summaries[index]}</span> : null}
        </span>
      </button>;
    })}
  </nav>;
}

export function GuidedCheck({ summaries, incomplete, onChange }: {
  summaries: readonly string[];
  incomplete: readonly boolean[];
  onChange: (step: number) => void;
}) {
  return <section className={card} aria-labelledby="product-check-title">
    <h2 id="product-check-title" tabIndex={-1} className="text-lg font-bold">Check &amp; send</h2>
    <p className="mt-1 text-sm text-[#46536F]">Everything Hastabazaar will check. Tap Change to fix anything.</p>
    <ul className="mt-4 divide-y divide-[#E4DACA] border-t border-[#E4DACA]">
      {productSteps.slice(0, -1).map((label, index) => <li key={label} className="flex items-start justify-between gap-2 py-3.5 sm:gap-4">
        <div className="flex min-w-0 gap-2.5">
          {incomplete[index] ? <span aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-center font-bold text-[#A8232E]">!</span> :
            <Check className="mt-0.5 size-4 shrink-0 text-[#236548]" aria-hidden="true" />}
          <div className="min-w-0 text-sm">
            <h3 className="font-semibold">{label}</h3>
            <p className="mt-0.5 wrap-anywhere text-[#46536F]">{summaries[index]}</p>
          </div>
        </div>
        <button type="button" aria-label={`Change ${label}`} className="min-h-11 shrink-0 rounded-lg px-2.5 text-sm font-semibold hover:bg-[#F7F3EC]" onClick={() => onChange(index)}>Change</button>
      </li>)}
    </ul>
    <div className="mt-2 space-y-1.5 rounded-xl bg-[#F4EFE6] p-3.5 text-sm">
      <h3 className="font-bold">After you send</h3>
      <p className="leading-relaxed text-[#46536F]">Hastabazaar checks the photos, details and price. Your product goes live if approved, or we send you a note about what to change.</p>
    </div>
  </section>;
}

export function GuidedReadiness({ complete }: { complete: number }) {
  return <section className={card + ' space-y-2 text-sm'} aria-labelledby="guided-readiness">
    <div className="flex items-center justify-between gap-3">
      <h2 id="guided-readiness" className="font-bold">Ready to send</h2>
      <span className="font-bold tabular-nums">{complete} / 4</span>
    </div>
    <progress aria-labelledby="guided-readiness" value={complete} max={4}
      className="block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#EBE2D0] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#236548] [&::-moz-progress-bar]:bg-[#236548]" />
    <p className="text-[#46536F]">{complete === 4 ? 'All 4 parts are done.' : `${4 - complete} ${complete === 3 ? 'part' : 'parts'} left.`}</p>
  </section>;
}

export function GuidedBottomBar({ step, busy, sent, saved, status, error, onBack, onNext }: {
  step: number;
  busy: boolean;
  sent: boolean;
  saved: boolean;
  status: string;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const final = step === productSteps.length - 1;
  return <div className="sticky z-20 space-y-2 rounded-xl border border-[#E4DACA] bg-white p-3 shadow-sm max-lg:bottom-[calc(var(--workspace-bottom-bar,4.25rem)+env(safe-area-inset-bottom))] lg:bottom-3">
    {error ? <p role="alert" className="text-sm font-medium text-[#A8232E]">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-2.5">
      {step > 0 ? <button className={secondary} type="button" onClick={onBack} disabled={busy}>Back</button> : null}
      <output className="order-last basis-full text-xs leading-relaxed text-[#46536F] lg:order-none lg:flex-1 lg:basis-auto">
        {saved ? 'Saved. You can leave and finish later from Products › Drafts.' : status}
      </output>
      <button type="button" disabled={busy || sent} onClick={onNext}
        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3.5 text-center text-sm font-semibold text-white disabled:opacity-50 lg:flex-none ${final ? 'bg-[#A8232E] hover:bg-[#8D1D27]' : 'bg-[#14213D] hover:bg-[#293A5B]'}`}>
        {final ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
        {sent ? 'Sent for review' : busy && final ? 'Sending…' : final ? 'Send for review' : `Next: ${productSteps[step + 1]}`}
      </button>
    </div>
  </div>;
}
