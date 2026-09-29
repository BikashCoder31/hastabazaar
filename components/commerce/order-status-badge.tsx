import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  awaiting_cod_confirmation: 'bg-amber-50 text-amber-900',
  confirmed: 'bg-blue-50 text-blue-800',
  packing: 'bg-violet-50 text-violet-800',
  ready_for_pickup: 'bg-amber-50 text-amber-800',
  dispatched: 'bg-cyan-50 text-cyan-800',
  delivered: 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-red-50 text-red-800',
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-sm font-semibold capitalize',
        styles[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {status === 'awaiting_cod_confirmation'
        ? 'Awaiting COD confirmation'
        : status.replaceAll('_', ' ')}
    </span>
  );
}
