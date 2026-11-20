const labels: Record<string, string> = {
  entityReference: 'Company reference',
  storeName: 'Store name',
  contactEmail: 'Contact email',
  contactPhone: 'Contact phone',
  returnAddress: 'Return address',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  enabled: 'Status',
  amountPaisa: 'Amount per order',
  retentionDays: 'Retention days',
  excludedEmailDomains: 'Excluded email domains',
  excludedPathPrefixes: 'Excluded path prefixes',
  maxItems: 'Maximum products',
  sizePercent: 'Width percentage',
  opacityPercent: 'Opacity percentage',
  position: 'Position',
  cashExposureLimitPaisa: 'Cash exposure limit',
  operatingWeekdays: 'Operating weekdays',
  holidayDates: 'Non-operating dates',
  remittanceCutoffLocalTime: 'Remittance cutoff',
  completedTripPaisa: 'Completed trip',
  failedTripPaisa: 'Failed trip',
  returnTripPaisa: 'Return trip',
  receivingAccountLabel: 'Receiving account label',
};
function valueText(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Not configured';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'number' && key.endsWith('Paisa'))
    return 'NPR ' + (value / 100).toFixed(2);
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value.trim() ? value : 'Not configured';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return 'Not configured';
}
export function SettingValuePreview({
  value,
  summary,
}: {
  value: unknown;
  summary: string;
}) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return <p className="text-sm break-words">{summary}</p>;
  return (
    <dl className="space-y-2 text-sm">
      {Object.entries(value).map(([key, field]) => (
        <div key={key}>
          <dt className="text-xs text-muted-foreground">
            {key === 'amountPaisa' && 'enabled' in value && value.enabled === false ? 'Saved amount for later' : labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')}
          </dt>
          <dd className="mt-0.5 break-words">{valueText(key, field)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SettingPreviewPanel({
  caption,
  summary,
  value,
  detail,
  after,
}: {
  caption: string;
  summary: string;
  value: unknown;
  detail: string | null;
  after: boolean;
}) {
  return (
    <div className={'min-w-0 space-y-1 rounded-xl border-2 p-3 md:p-4 ' + (after ? 'border-[#14213D] bg-white' : 'border-transparent bg-[#EDE4D3]')}>
      <p className={'text-[13px] font-semibold ' + (after ? 'text-[#A8232E]' : 'text-[#675B4E]')}>{caption}</p>
      <p className={'break-words font-heading font-semibold leading-tight ' + (summary.length <= 20 ? 'text-2xl md:text-[1.875rem]' : 'text-base md:text-xl')}>{summary}</p>
      {detail ? <p className="break-words text-[13px] leading-5 text-[#46536F]">{detail}</p> : null}
      {value && typeof value === 'object' && !Array.isArray(value) ? (
        <details className="text-[#46536F]">
          <summary className="min-h-11 w-fit cursor-pointer py-3 text-[13px] font-semibold">Details</summary>
          <SettingValuePreview value={value} summary={summary} />
        </details>
      ) : null}
    </div>
  );
}
