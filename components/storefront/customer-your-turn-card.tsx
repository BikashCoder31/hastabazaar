import type { ReactNode } from 'react';
import { CustomerActingChip } from './customer-acting-chip';

export function CustomerYourTurnCard({ title, description, icon, action, showChip = false }: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  showChip?: boolean;
}) {
  return (
    <article className="account-surface grid min-w-0 gap-3.5 rounded-[15px] border border-[#E3D6C3] bg-white p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
      <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
        {icon ? <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#F1E4C5] text-[#704D15]">{icon}</span> : null}
        <div className="min-w-0 wrap-anywhere">
          {showChip ? <div className="mb-1"><CustomerActingChip actor="you" yourTurn /></div> : null}
          <h3 className="font-semibold leading-snug text-[#14213D]">{title}</h3>
          {description ? <p className="mt-0.5 text-sm leading-relaxed text-[#465573]">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>a]:min-h-11 [&>button]:min-h-11">{action}</div> : null}
    </article>
  );
}
