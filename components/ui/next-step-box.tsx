import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NextStepBox({ title = 'What happens next', children, action, className }: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={cn('flex min-w-0 items-start gap-2.5 rounded-xl bg-[#E3E9F4] p-3.5 text-sm leading-relaxed text-[#1E3566]', className)}>
    <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <div className="min-w-0">
      <p className="font-semibold text-[#14213D]">{title}</p>
      <div className="mt-0.5">{children}</div>
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  </div>;
}
