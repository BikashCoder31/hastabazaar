import { UserRound } from 'lucide-react';

export type CustomerActor = 'you' | 'seller' | 'courier' | 'hastabazaar' | 'done';

const actors = {
  you: { label: 'You', color: 'bg-[#14213D] text-white' },
  seller: { label: 'Seller', color: 'bg-[#F1E4C5] text-[#704D15]' },
  courier: { label: 'Courier', color: 'bg-[#E0E7F3] text-[#2A4E89]' },
  hastabazaar: { label: 'Hastabazaar', color: 'bg-[#ECE2D4] text-[#59482E]' },
  done: { label: 'Done', color: 'bg-[#DDECE3] text-[#205D42]' },
} satisfies Record<CustomerActor, { label: string; color: string }>;

export function CustomerActingChip({ actor, yourTurn = false }: { actor: CustomerActor; yourTurn?: boolean }) {
  const appearance = actors[actor];
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${appearance.color}`}>
      {actor === 'you' && yourTurn ? <UserRound className="size-3.5" aria-hidden="true" /> : null}
      <span className="sr-only">Who is acting now: </span>
      {actor === 'you' && yourTurn ? 'Your turn' : appearance.label}
    </span>
  );
}
