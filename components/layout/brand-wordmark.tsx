import { cn } from '@/lib/utils';

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span
      aria-label="Hastabazaar"
      className={cn('font-heading tracking-[-0.035em]', className)}
    >
      <span aria-hidden="true" className="text-[#0b2c4a]">
        Hasta
      </span>
      <span aria-hidden="true" className="text-[#0b2c4a]">
        bazaar
      </span>
    </span>
  );
}
