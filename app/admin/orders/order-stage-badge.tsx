import { orderStage } from './order-queue-presentation';

const themes: Record<string, string> = {
  confirmed: 'bg-[#F4E7C5] text-[#80560D]',
  pending_payment: 'bg-[#F4E7C5] text-[#80560D]',
  awaiting_cod_confirmation: 'bg-[#F4E7C5] text-[#80560D]',
  packing: 'bg-[#F4E7C5] text-[#80560D]',
  ready_for_pickup: 'bg-[#E3E9F4] text-[#2C4E85]',
  dispatched: 'bg-[#E3E9F4] text-[#2C4E85]',
  delivered: 'bg-[#DFECE4] text-[#236548]',
  cancelled: 'bg-[#F7E0DE] text-[#A8232E]',
  delivery_failed: 'bg-[#F7E0DE] text-[#A8232E]',
};

export function OrderStageBadge({
  status,
  late,
}: {
  status: string;
  late?: string | null;
}) {
  return (
    <span
      className={
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-xs leading-snug font-semibold ' +
        (late
          ? 'bg-[#F7E0DE] text-[#A8232E]'
          : (themes[status] ?? 'bg-[#EEE5D5] text-[#46536F]'))
      }
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-current"
        aria-hidden="true"
      />
      <span>
        {orderStage(status)}
        {late ? ' · ' + late : ''}
      </span>
    </span>
  );
}
