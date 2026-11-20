import type { CSSProperties, ReactNode } from 'react';
import { Check, Clock3, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const styles = {
  complete: { icon: Check, label: 'Completed', className: 'border-[#DFECE4] bg-[#DFECE4] text-[#236548]' },
  current: { icon: Clock3, label: 'Current step', className: 'border-[#14213D] bg-white text-[#14213D] ring-1 ring-[#14213D]' },
  upcoming: { icon: Minus, label: 'Upcoming', className: 'border-[#EEE5D5] bg-[#EEE5D5] text-[#46536F]' },
} as const;

export type StepLineStep = {
  id: string;
  label: string;
  state: keyof typeof styles;
  detail?: ReactNode;
};

export function StepLine({ steps, label = 'Progress', className }: {
  steps: readonly StepLineStep[];
  label?: string;
  className?: string;
}) {
  if (!steps.length) return null;
  return <ol aria-label={label} className={cn('grid min-w-0 gap-2 p-0 md:[grid-template-columns:repeat(var(--steps),minmax(0,1fr))]', className)}
    style={{ '--steps': steps.length } as CSSProperties}>
    {steps.map(step => {
      const { icon: Icon, label: status, className: style } = styles[step.state];
      return <li key={step.id} aria-current={step.state === 'current' ? 'step' : undefined}
        className={cn('min-w-0 rounded-xl border px-3 py-2.5 text-sm leading-snug', style)}>
        <div className="flex items-start gap-1.5">
          <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 font-semibold">{step.label}</span>
        </div>
        <span className="sr-only">{status}</span>
        {step.detail === undefined ? null : <div className="mt-1 break-words text-xs text-[#46536F]">{step.detail}</div>}
      </li>;
    })}
  </ol>;
}
