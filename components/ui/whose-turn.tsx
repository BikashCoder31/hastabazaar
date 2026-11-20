import { cn } from '@/lib/utils';

const turns = {
  'your-turn': { label: 'Your turn', style: 'bg-[#14213D] text-white' },
  'with-hastabazaar': { label: 'With Hastabazaar', style: 'bg-[#E3E9F4] text-[#264880]' },
  late: { label: 'Late', style: 'bg-[#A8232E] text-white' },
  done: { label: 'Done', style: 'bg-[#DFECE4] text-[#236548]' },
} as const;

export type WhoseTurnStatus = keyof typeof turns;

export function WhoseTurn({ status, label, className }: {
  status: WhoseTurnStatus;
  label?: string;
  className?: string;
}) {
  const turn = turns[status];
  return <span className={cn('inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-tight', turn.style, className)}>
    {label ?? turn.label}
  </span>;
}
