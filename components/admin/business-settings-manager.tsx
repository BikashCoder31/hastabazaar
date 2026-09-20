'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  EffectiveBusinessSetting,
  BusinessSettingVersion,
} from '@/lib/db/repositories/business-settings';
import type {
  BusinessSettingChangeControl,
  BusinessSettingEffectiveMode,
  BusinessSettingKey,
  BusinessSettingSensitivity,
  BusinessSettingValues,
  OfficialSocialLinks,
} from '@/lib/configuration/types';

export type BusinessSettingsAdminItem = Readonly<{
  key: BusinessSettingKey;
  label: string;
  description: string;
  sensitivity: BusinessSettingSensitivity;
  changeControl: BusinessSettingChangeControl;
  effectiveMode: BusinessSettingEffectiveMode;
  snapshotOnTransaction: boolean;
  affectedSurfaces: readonly string[];
  requiredCapability: string | null;
  effective: EffectiveBusinessSetting<BusinessSettingKey>;
  history: readonly BusinessSettingVersion[];
}>;

const numericKeys = new Set<BusinessSettingKey>([
  'independent_seller_commission_bps',
  'managed_sale_linked_platform_retention_bps',
  'seller_delivery_hold_days',
  'platform_payout_minimum_paisa',
  'new_seller_reserve_bps',
  'rider_remittance_business_days',
]);

const listKeys = new Set<BusinessSettingKey>([
  'open_box_category_codes',
  'open_box_service_area_codes',
  'managed_adjustment_reason_codes',
]);

function editorValueFor(value: unknown): unknown {
  return Array.isArray(value) ? value.join(', ') : value;
}

function displayValue(key: BusinessSettingKey, value: unknown): string {
  if (
    (key === 'independent_seller_commission_bps' ||
      key === 'new_seller_reserve_bps') &&
    typeof value === 'number'
  ) {
    return `${value / 100}%`;
  }
  if (
    key === 'managed_sale_linked_platform_retention_bps' &&
    typeof value === 'number'
  ) {
    return `${value / 100}% platform retention · ${(10_000 - value) / 100}% maker entitlement`;
  }
  if (key === 'platform_payout_minimum_paisa' && typeof value === 'number') {
    return value === 0 ? 'No platform minimum' : `NPR ${(value / 100).toFixed(2)}`;
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None configured';
  if (value === null) return 'Not selected';
  if (typeof value === 'object') return 'Six validated official links';
  return String(value).replaceAll('_', ' ');
}

function parseEditorValue(key: BusinessSettingKey, value: unknown): unknown {
  if (numericKeys.has(key)) return Number(value);
  if (listKeys.has(key)) {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (key === 'managed_maker_active_model' && value === '') return null;
  return value;
}

function versionPresentation(
  version: BusinessSettingVersion,
  now: number,
): string {
  if (version.status === 'draft') return 'Draft';
  if (version.status === 'pending_approval') return 'Awaiting approval';
  if (version.status === 'rejected') return 'Rejected';
  if (version.status === 'cancelled') return 'Cancelled';
  if ((version.effectiveFrom ?? 0) > now) return 'Scheduled';
  if (version.effectiveUntil !== null && version.effectiveUntil <= now) {
    return 'Superseded';
  }
  return 'Current';
}

export function BusinessSettingsManager({
  initialSettings,
}: {
  initialSettings: readonly BusinessSettingsAdminItem[];
}) {
  const [settings] = useState(initialSettings);
  const [selectedKey, setSelectedKey] = useState<BusinessSettingKey>(
    initialSettings[0]?.key ?? 'official_social_links',
  );
  const selected = useMemo(
    () => settings.find((item) => item.key === selectedKey) ?? settings[0],
    [selectedKey, settings],
  );
  const [editorValue, setEditorValue] = useState<unknown>(
    editorValueFor(selected?.effective.value),
  );
  const [reason, setReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  if (!selected) {
    return <p className="rounded-xl border p-6">No business settings are registered.</p>;
  }

  const drafts = selected.history.filter((item) => item.status === 'draft');
  const scheduled = selected.history.filter(
    (item) => item.status === 'published' && (item.effectiveFrom ?? 0) > now,
  );

  function selectKey(key: BusinessSettingKey) {
    const next = settings.find((item) => item.key === key);
    setSelectedKey(key);
    setEditorValue(editorValueFor(next?.effective.value));
    setReason('');
    setMessage('');
  }

  async function saveDraft() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selected.key,
          value: parseEditorValue(selected.key, editorValue),
          reason,
          requestId: crypto.randomUUID(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Draft could not be saved.');
      setMessage('Draft saved. Refreshing the authoritative history…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Draft could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function changeVersion(
    version: BusinessSettingVersion,
    action: 'submit' | 'publish' | 'approve' | 'reject' | 'reverse',
  ) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/business-settings/changes/${encodeURIComponent(version.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            expectedRevision: version.revision,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom).getTime() : Date.now(),
            reason,
            requestId: crypto.randomUUID(),
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Change could not be completed.');
      setMessage('Change recorded. Refreshing the authoritative history…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Change could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Configuration inventory</CardTitle>
          <CardDescription>
            One authoritative setting registry. Unknown keys and unsupported
            workflow models are rejected server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {settings.map((setting) => (
            <Button
              key={setting.key}
              type="button"
              variant={setting.key === selected.key ? 'secondary' : 'ghost'}
              className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
              onClick={() => selectKey(setting.key)}
            >
              {setting.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selected.sensitivity.replaceAll('_', ' ')}</Badge>
              <Badge variant={selected.changeControl === 'controlled' ? 'destructive' : 'secondary'}>
                {selected.changeControl === 'controlled'
                  ? 'Different Super Admin approval required'
                  : 'Simple publication'}
              </Badge>
            </div>
            <CardTitle>{selected.label}</CardTitle>
            <CardDescription>{selected.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Summary title="Current value" value={displayValue(selected.key, selected.effective.value)} />
            <Summary title="Draft" value={`${drafts.length} open`} />
            <Summary title="Scheduled" value={`${scheduled.length} future`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create a draft</CardTitle>
            <CardDescription>
              Drafts do not affect customers, sellers, makers, riders, invoices,
              or balances until the correct publication workflow completes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingValueEditor
              settingKey={selected.key}
              value={editorValue}
              onChange={setEditorValue}
            />
            <div className="space-y-2">
              <Label htmlFor="setting-reason">Reason and expected impact</Label>
              <Textarea
                id="setting-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the business reason, affected users, and reversal plan."
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setting-effective-from">Effective date for publication</Label>
              <Input
                id="setting-effective-from"
                type="datetime-local"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Financial and contractual values apply prospectively. Historical
                order and agreement snapshots are never rewritten.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm font-semibold">Preview</p>
              <p className="mt-1 text-lg font-medium">
                {displayValue(selected.key, parseEditorValue(selected.key, editorValue))}
              </p>
              <p className="mt-3 text-sm font-semibold">Affected areas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.affectedSurfaces.join(', ')}
              </p>
            </div>
            {message ? <p role="status" className="text-sm font-medium">{message}</p> : null}
            <Button type="button" disabled={busy || reason.trim().length < 8} onClick={saveDraft}>
              Save draft
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change history</CardTitle>
            <CardDescription>
              Published values remain auditable. A reversal creates another
              prospective version instead of editing history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected.history.length ? (
              selected.history.map((version) => (
                <div key={version.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        Version {version.version} · {versionPresentation(version, now)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {displayValue(selected.key, version.value)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{version.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {version.status === 'draft' ? (
                        <Button
                          size="sm"
                          type="button"
                          disabled={busy || reason.trim().length < 8}
                          onClick={() =>
                            changeVersion(
                              version,
                              version.changeControl === 'controlled' ? 'submit' : 'publish',
                            )
                          }
                        >
                          {version.changeControl === 'controlled'
                            ? 'Submit for review'
                            : 'Publish / schedule'}
                        </Button>
                      ) : null}
                      {version.status === 'pending_approval' ? (
                        <>
                          <Button size="sm" type="button" disabled={busy} onClick={() => changeVersion(version, 'approve')}>
                            Approve / schedule
                          </Button>
                          <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => changeVersion(version, 'reject')}>
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {version.status === 'published' ? (
                        <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => changeVersion(version, 'reverse')}>
                          Create reversal draft
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No saved versions. The displayed current value is the tested code default.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 font-heading text-lg">{value}</p>
    </div>
  );
}

function SettingValueEditor({
  settingKey,
  value,
  onChange,
}: {
  settingKey: BusinessSettingKey;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (numericKeys.has(settingKey)) {
    return (
      <div className="space-y-2">
        <Label htmlFor="setting-value">
          {settingKey.endsWith('_bps') ? 'Basis points (900 = 9%)' : 'Numeric value'}
        </Label>
        <Input
          id="setting-value"
          type="number"
          min={0}
          step={1}
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  if (settingKey === 'managed_maker_program_mode') {
    return (
      <SelectEditor
        value={String(value)}
        onChange={onChange}
        options={[
          ['applications_only', 'Applications Only'],
          ['activation_enabled', 'Activation enabled (readiness checked)'],
        ]}
      />
    );
  }
  if (settingKey === 'managed_maker_active_model') {
    return (
      <SelectEditor
        value={value === null ? '' : String(value)}
        onChange={onChange}
        options={[
          ['', 'No active model'],
          ['managed_sale_linked_percentage_v1', 'Sale-linked percentage settlement'],
          ['managed_fixed_supplier_price_v1', 'Fixed supplier-price purchasing'],
        ]}
      />
    );
  }
  if (settingKey === 'payout_processing_weekday') {
    return (
      <SelectEditor
        value={String(value)}
        onChange={onChange}
        options={['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [day, day] as const)}
      />
    );
  }
  if (settingKey === 'official_social_links') {
    const links = value as OfficialSocialLinks;
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {(['linkedin', 'x', 'tiktok', 'instagram', 'facebook', 'youtube'] as const).map((platform) => (
          <div key={platform} className="space-y-2">
            <Label htmlFor={`social-${platform}`}>{platform}</Label>
            <Input
              id={`social-${platform}`}
              type="url"
              value={links?.[platform] ?? ''}
              onChange={(event) => onChange({ ...links, [platform]: event.target.value })}
            />
          </div>
        ))}
      </div>
    );
  }
  if (settingKey === 'payout_cutoff_local_time') {
    return <Input aria-label="Payout cutoff" type="time" value={String(value)} onChange={(event) => onChange(event.target.value)} />;
  }
  if (settingKey === 'payout_timezone') {
    return <Input aria-label="Payout timezone" value="Asia/Kathmandu" readOnly />;
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="setting-value">Comma-separated approved codes</Label>
      <Input id="setting-value" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectEditor({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: unknown) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="setting-value">Configured value</Label>
      <NativeSelect className="w-full" id="setting-value" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, label]) => (
          <NativeSelectOption key={optionValue || 'none'} value={optionValue}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
