import Link from 'next/link';
import { Check } from 'lucide-react';

export function CheckoutSteps({ current }: { current: 0 | 1 | 2 }) {
  const steps = [
    { label: 'Your cart', href: '/cart' },
    { label: 'Delivery & payment', href: '/checkout' },
    { label: 'Confirmation', href: '' },
  ];
  return (
    <ol
      aria-label="Checkout progress"
      className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-9"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={current === index ? 'step' : undefined}
          className={
            'flex items-center gap-2 text-sm ' +
            (index === current
              ? 'font-semibold text-primary'
              : 'text-muted-foreground')
          }
        >
          <span
            className={
              'flex size-7 items-center justify-center rounded-full text-xs font-semibold ' +
              (index <= current
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card')
            }
          >
            {index < current ? <Check className="size-3.5" /> : index + 1}
          </span>
          {index < current && current !== 2 ? (
            <Link href={step.href} className="rounded-md hover:text-primary">
              {step.label}
            </Link>
          ) : (
            <span>{step.label}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
