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
            {labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')}
          </dt>
          <dd className="mt-0.5 break-words">{valueText(key, field)}</dd>
        </div>
      ))}
    </dl>
  );
}
