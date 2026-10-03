const steps = ['Your details', 'Admin review', 'Seller access'] as const;

/** Native interface content; this panel does not portray a maker or artwork. */
export function SellerRegistrationPanel() {
  return (
    <div
      data-seller-registration-panel
      className="absolute inset-0 flex flex-col justify-center gap-[clamp(0.375rem,1.5cqw,1.5rem)] bg-background p-[clamp(0.625rem,3cqw,3rem)] text-foreground"
    >
      <p className="font-heading text-[clamp(1rem,3cqw,2.25rem)] leading-tight text-primary">
        How to apply
      </p>
      <ol className="flex flex-col gap-[clamp(0.25rem,1cqw,1rem)]">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-[clamp(0.375rem,1.5cqw,1.5rem)]">
            <span aria-hidden="true" className="grid size-[clamp(1.25rem,4cqw,3rem)] shrink-0 place-items-center rounded-full bg-secondary text-[clamp(0.625rem,1.5cqw,1.125rem)] font-semibold text-primary">
              {index + 1}
            </span>
            <span className="text-[clamp(0.75rem,2cqw,1.25rem)] font-semibold leading-tight">
              {step}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[clamp(0.75rem,1.5cqw,1rem)] leading-tight text-muted-foreground">
        Approval required
      </p>
    </div>
  );
}
