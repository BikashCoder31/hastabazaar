import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

export type CheckoutStepNumber = 1 | 2 | 3 | 4;

export function CheckoutStep({ number, title, active, complete, summary, onChange, children }: {
  number: CheckoutStepNumber;
  title: string;
  active: boolean;
  complete: boolean;
  summary?: string;
  onChange: () => void;
  children: ReactNode;
}) {
  const id = 'checkout-step-' + number;
  return (
    <section aria-labelledby={id + '-title'} aria-current={active ? 'step' : undefined} className="min-w-0 rounded-2xl border border-[#e3d6c3] bg-[#fdfaf5] p-4 sm:p-6" data-checkout-step={number}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3">
        <h2 className="flex min-w-0 items-center gap-3 text-lg font-semibold text-[#14213d]" id={id + '-title'} tabIndex={-1}>
          <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-sm ${active ? 'bg-[#14213d] text-white' : complete ? 'bg-[#286649] text-white' : 'bg-[#ebe1cf] text-[#655848]'}`}>
            {!active && complete ? <Check className="size-4" /> : number}
          </span>
          {title}
          {complete && !active ? <span className="sr-only">Completed</span> : null}
        </h2>
        {complete && !active ? (
          <button type="button" aria-label={`Change: ${title}`} aria-controls={id + '-details'} aria-expanded={false} onClick={onChange}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[#14213d] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#14213d]">
            Change
          </button>
        ) : null}
      </div>
      {complete && !active && summary ? <p className="mt-1 wrap-anywhere text-sm leading-relaxed text-[#465573]">{summary}</p> : null}
      <div id={id + '-details'} hidden={!active} className="mt-4 min-w-0 space-y-4 sm:pl-11" data-checkout-fields={number}>
        {children}
      </div>
    </section>
  );
}
