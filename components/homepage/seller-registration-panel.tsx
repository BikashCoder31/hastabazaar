const steps = [
  { label: 'Your details', badgeClass: 'bg-[#b81925] text-white' },
  { label: 'Admin review', badgeClass: 'bg-[#f4c46b] text-[#172746]' },
  { label: 'Seller access', badgeClass: 'bg-white text-[#2457b9]' },
] as const;

/** Native interface content; this panel does not portray a maker or artwork. */
export function SellerRegistrationPanel() {
  return (
    <div
      data-seller-registration-panel
      className="absolute inset-0 flex flex-col justify-center gap-[clamp(0.375rem,1.5cqw,1.5rem)] bg-gradient-to-br from-[#0d3154] to-[#172746] p-[clamp(0.625rem,3cqw,3rem)] text-white"
    >
      <p className="font-heading text-[clamp(1rem,3cqw,2.25rem)] leading-tight text-[#f4c46b]">
        How to apply
      </p>
      <ol className="flex flex-col gap-[clamp(0.25rem,1cqw,1rem)]">
        {steps.map(({ label, badgeClass }, index) => (
          <li
            key={label}
            className="flex items-center gap-[clamp(0.375rem,1.5cqw,1.5rem)] rounded-[clamp(0.375rem,1.5cqw,1rem)] bg-white/10 px-[clamp(0.125rem,0.65cqw,0.625rem)] py-[clamp(0.0625rem,0.25cqw,0.625rem)] ring-1 ring-inset ring-white/10"
          >
            <span
              aria-hidden="true"
              className={`grid size-[clamp(1.25rem,4cqw,3rem)] shrink-0 place-items-center rounded-full text-[clamp(0.625rem,1.5cqw,1.125rem)] font-semibold ${badgeClass}`}
            >
              {index + 1}
            </span>
            <span className="text-[clamp(0.75rem,2cqw,1.25rem)] font-semibold leading-tight">
              {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[clamp(0.75rem,1.5cqw,1rem)] leading-tight text-white/85">
        Approval required
      </p>
    </div>
  );
}
