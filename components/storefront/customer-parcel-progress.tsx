const stages = [
  ['placed', 'Placed'],
  ['preparing', 'Preparing'],
  ['packed', 'Packed'],
  ['with-courier', 'With courier'],
  ['delivered', 'Delivered'],
] as const;

export type CustomerParcelStage = (typeof stages)[number][0];
export type CustomerParcelCondition = 'normal' | 'waiting' | 'problem';

const currentStyles = {
  normal: { bar: 'bg-[#14213D]', text: 'text-[#14213D]', description: '' },
  waiting: { bar: 'border-t-[5px] border-dashed border-[#9C6518]', text: 'text-[#704D15]', description: 'Paused' },
  problem: { bar: 'bg-[#A8232E]', text: 'text-[#A8232E]', description: 'Needs attention' },
} satisfies Record<CustomerParcelCondition, { bar: string; text: string; description: string }>;

export function CustomerParcelProgress({ stage, condition = 'normal', dates }: {
  stage: CustomerParcelStage;
  condition?: CustomerParcelCondition;
  dates?: Partial<Record<CustomerParcelStage, string>>;
}) {
  const current = stages.findIndex(([key]) => key === stage);
  return (
    <ol aria-label="Parcel progress" className="grid min-w-0 grid-cols-5 gap-1.5 sm:gap-2">
      {stages.map(([key, label], index) => {
        const active = index === current;
        const completed = index < current || (stage === 'delivered' && condition === 'normal');
        const appearance = currentStyles[condition];
        const bar = completed ? 'bg-[#286649]' : active ? appearance.bar : 'bg-[#E2D5C1]';
        const text = active ? appearance.text : completed ? 'text-[#14213D]' : 'text-[#655848]';
        return (
          <li key={key} aria-current={active ? 'step' : undefined} className={`min-w-0 wrap-anywhere text-[11px] leading-tight sm:text-sm ${text}`}>
            <span aria-hidden="true" className={`mb-2 block h-[5px] rounded-full ${bar}`} />
            <span className="block font-semibold">{label}</span>
            {dates?.[key] ? <span className="mt-1 block">{dates[key]}</span> : null}
            {active && appearance.description ? <span className="mt-1 block">{appearance.description}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
