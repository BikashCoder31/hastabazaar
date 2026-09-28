'use client';

import { useMemo, useRef, useState } from 'react';

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
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredMultipartAnswers } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { validateBusinessSettingValue } from '@/lib/configuration/definitions';
import type {
  EffectiveBusinessSetting,
  BusinessSettingVersion,
} from '@/lib/db/repositories/business-settings';
import type {
  BusinessSettingChangeControl,
  BusinessSettingEffectiveMode,
  BusinessSettingKey,
  BusinessSettingSensitivity,
  OfficialSocialLinks,
  FirstPartyAnalyticsPolicy,
  RiderFinancePolicy,
  RecentlyViewedPolicy,
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
type SettingsResponse = { error?: string; code?: string; ok?: unknown; action?: unknown; draft?: Partial<BusinessSettingVersion> };

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
  'product_material_suggestions',
]);

function editorValueFor(value: unknown): unknown {
  return Array.isArray(value) ? value.join(', ') : value;
}

function scalarString(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  return '';
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
    return value === 0
      ? 'No platform minimum'
      : `NPR ${(value / 100).toFixed(2)}`;
  }
  if (Array.isArray(value))
    return value.length ? value.join(', ') : 'None configured';
  if (value === null) return 'Not selected';
  if (key === 'official_social_links' && typeof value === 'object')
    return 'Six validated official links';
  if (
    key === 'first_party_analytics_policy' &&
    value &&
    typeof value === 'object'
  ) {
    const policy = value as FirstPartyAnalyticsPolicy;
    return `${policy.enabled ? 'Enabled' : 'Disabled'} · ${policy.retentionDays} day retention`;
  }
  if (key === 'recently_viewed_policy' && value && typeof value === 'object') {
    const policy = value as RecentlyViewedPolicy;
    return `${policy.maxItems} products · ${policy.retentionDays} day per-entry retention`;
  }
  if (key === 'rider_finance_policy' && value && typeof value === 'object') {
    const policy = value as RiderFinancePolicy;
    return policy.cashExposureLimitPaisa === null
      ? 'Not configured — own-rider COD assignment remains unavailable'
      : `NPR ${(policy.cashExposureLimitPaisa / 100).toFixed(2)} exposure limit · ${policy.operatingWeekdays.length} operating days · simulated trip rates configured`;
  }
  return scalarString(value).replaceAll('_', ' ');
}

function parseEditorValue(key: BusinessSettingKey, value: unknown): unknown {
  if (numericKeys.has(key)) return Number(value);
  if (listKeys.has(key)) {
    return scalarString(value)
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
  asOf,
}: {
  initialSettings: readonly BusinessSettingsAdminItem[];
  asOf: number;
}) {
  const [settings] = useState(() => initialSettings.filter((item) =>
    item.key !== 'homepage_hero_slides' && item.key !== 'homepage_occasion_slides'));
  const [selectedKey, setSelectedKey] = useState<BusinessSettingKey>(
    settings[0]?.key ?? 'official_social_links',
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
  const formRef = useRef<HTMLFormElement>(null);
  const latestAttemptKey = useRef<string | null>(null);
  const [failedAttemptKey, setFailedAttemptKey] = useState<string | null>(null);
  const catalog = usePublishedFormConfig('staff.business-settings-manager');

  if (!selected) {
    return (
      <p className="rounded-xl border p-6">
        No business settings are registered.
      </p>
    );
  }

  const drafts = selected.history.filter((item) => item.status === 'draft');
  const scheduled = selected.history.filter(
    (item) => item.status === 'published' && (item.effectiveFrom ?? 0) > asOf,
  );

  function selectKey(key: BusinessSettingKey) {
    const next = settings.find((item) => item.key === key);
    setSelectedKey(key);
    setEditorValue(editorValueFor(next?.effective.value));
    setReason('');
    setMessage('');
    setFailedAttemptKey(null);
  }

  function catalogPayload(action: string, subjectId: string) {
    if (!catalog.canSubmit || !catalog.config || !formRef.current)
      throw new Error('Form configuration is unavailable. Please try again.');
    const data = new FormData(formRef.current);
    const attemptKey = sessionAttemptKey('staff.business-settings-manager', `${action}:${subjectId}`);
    latestAttemptKey.current = attemptKey;
    data.set('requestId', getOrCreateSessionAttempt(attemptKey));
    const { version, ...answers } = configuredMultipartAnswers(data, catalog.config);
    return { sourceFormId: 'staff.business-settings-manager',
      formVersion: version, ...answers };
  }

  function verifyResponse(response: Response, result: SettingsResponse | null, action: 'save' | 'submit' | 'publish' | 'approve' | 'reject' | 'reverse', fallback: string) {
    if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
    if (!response.ok) throw new Error(result?.error || fallback);
    const draft = result?.draft;
    let validValue = false;
    if (draft) { try { validateBusinessSettingValue(selected.key, draft.value); validValue = true; } catch { /* Unverified response retains the attempt. */ } }
    const confirmed = action === 'save' || action === 'reverse'
      ? validValue && draft && typeof draft.id === 'string' && draft.id.trim().length > 0 && draft.key === selected.key
        && draft.status === 'draft' && Number.isSafeInteger(draft.version) && Number(draft.version) > 0
        && Number.isSafeInteger(draft.revision) && Number(draft.revision) > 0 && (action === 'save' || result?.action === action)
      : result?.ok === true && result.action === action;
    if (!confirmed || result?.error) throw new Error('The response could not be verified. Retry with the same request.');
  }

  async function saveDraft() {
    setBusy(true);
    setMessage('');
    setFailedAttemptKey(null);
    latestAttemptKey.current = null;
    try {
      const response = await fetch('/api/admin/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selected.key,
          value: parseEditorValue(selected.key, editorValue),
          reason,
          ...catalogPayload('save', selected.key),
        }),
      });
      const result = (await response.json().catch(() => null)) as SettingsResponse | null;
      verifyResponse(response, result, 'save', 'Draft could not be saved.');
      if (latestAttemptKey.current) clearSessionAttempt(latestAttemptKey.current);
      setMessage('Draft saved. Refreshing the authoritative history…');
      window.location.reload();
    } catch (error) {
      setFailedAttemptKey(latestAttemptKey.current);
      setMessage(
        error instanceof Error ? error.message : 'Draft could not be saved.',
      );
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
    setFailedAttemptKey(null);
    latestAttemptKey.current = null;
    try {
      const response = await fetch(
        `/api/admin/business-settings/changes/${encodeURIComponent(version.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            expectedRevision: version.revision,
            effectiveFrom: effectiveFrom
              ? new Date(effectiveFrom).getTime()
              : undefined,
            reason,
            ...catalogPayload(action, version.id),
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as SettingsResponse | null;
      verifyResponse(response, result, action, 'Change could not be completed.');
      if (latestAttemptKey.current) clearSessionAttempt(latestAttemptKey.current);
      setMessage('Change recorded. Refreshing the authoritative history…');
      window.location.reload();
    } catch (error) {
      setFailedAttemptKey(latestAttemptKey.current);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Change could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} data-form-id="staff.business-settings-manager"
      className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]"
      onSubmit={(event) => event.preventDefault()}>
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
              <Badge variant="outline">
                {selected.sensitivity.replaceAll('_', ' ')}
              </Badge>
              <Badge
                variant={
                  selected.changeControl === 'controlled'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {selected.changeControl === 'controlled'
                  ? 'Super Admin approval required'
                  : 'Simple publication'}
              </Badge>
            </div>
            <CardTitle>{selected.label}</CardTitle>
            <CardDescription>{selected.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Summary
              title="Current value"
              value={displayValue(selected.key, selected.effective.value)}
            />
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
            {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={['setting']} /> : null}
            {!catalog.canSubmit ? <output className="block text-sm">{catalog.message || 'Loading form configuration…'}</output> : null}
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
              <Label htmlFor="setting-effective-from">
                Effective date for publication
              </Label>
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
                {displayValue(
                  selected.key,
                  parseEditorValue(selected.key, editorValue),
                )}
              </p>
              <p className="mt-3 text-sm font-semibold">Affected areas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.affectedSurfaces.join(', ')}
              </p>
            </div>
            {message ? (
              <output className="block text-sm font-medium">{message}</output>
            ) : null}
            {failedAttemptKey ? <Button type="button" variant="outline" disabled={busy}
              onClick={() => {
                if (!window.confirm('This attempt may already have succeeded. Check the latest history before starting a new attempt, which could duplicate the action. Continue?')) return;
              clearSessionAttempt(failedAttemptKey);
              if (catalog.status === 'stale') catalog.refresh();
                setFailedAttemptKey(null);
                setMessage('New attempt ready. Review the latest history before submitting again.');
              }}>Start a new attempt</Button> : null}
            <Button
              type="button"
              disabled={busy || !catalog.canSubmit || reason.trim().length < 8}
              onClick={saveDraft}
            >
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
                        Version {version.version} ·{' '}
                        {versionPresentation(version, asOf)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {displayValue(selected.key, version.value)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {version.reason}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {version.status === 'draft' ? (
                        <Button
                          size="sm"
                          type="button"
                          disabled={busy || !catalog.canSubmit || reason.trim().length < 8}
                          onClick={() =>
                            changeVersion(
                              version,
                              version.changeControl === 'controlled'
                                ? 'submit'
                                : 'publish',
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
                          <Button
                            size="sm"
                            type="button"
                            disabled={busy || !catalog.canSubmit}
                            onClick={() => changeVersion(version, 'approve')}
                          >
                            Approve / schedule
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            disabled={busy || !catalog.canSubmit}
                            onClick={() => changeVersion(version, 'reject')}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {version.status === 'published' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled={busy || !catalog.canSubmit}
                          onClick={() => changeVersion(version, 'reverse')}
                        >
                          Create reversal draft
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No saved versions. The displayed current value is the tested
                code default.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
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
          {settingKey.endsWith('_bps')
            ? 'Basis points (900 = 9%)'
            : 'Numeric value'}
        </Label>
        <Input
          id="setting-value"
          type="number"
          min={0}
          step={1}
          value={
            typeof value === 'number' || typeof value === 'string' ? value : ''
          }
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  if (settingKey === 'managed_maker_program_mode') {
    return (
      <SelectEditor
        value={scalarString(value)}
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
        value={value === null ? '' : scalarString(value)}
        onChange={onChange}
        options={[
          ['', 'No active model'],
          [
            'managed_sale_linked_percentage_v1',
            'Sale-linked percentage settlement',
          ],
          [
            'managed_fixed_supplier_price_v1',
            'Fixed supplier-price purchasing',
          ],
        ]}
      />
    );
  }
  if (settingKey === 'payout_processing_weekday') {
    return (
      <SelectEditor
        value={scalarString(value)}
        onChange={onChange}
        options={[
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ].map((day) => [day, day] as const)}
      />
    );
  }
  if (settingKey === 'official_social_links') {
    const links = value as OfficialSocialLinks;
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            'linkedin',
            'x',
            'tiktok',
            'instagram',
            'facebook',
            'youtube',
          ] as const
        ).map((platform) => (
          <div key={platform} className="space-y-2">
            <Label htmlFor={`social-${platform}`}>{platform}</Label>
            <Input
              id={`social-${platform}`}
              type="url"
              value={links?.[platform] ?? ''}
              onChange={(event) =>
                onChange({ ...links, [platform]: event.target.value })
              }
            />
          </div>
        ))}
      </div>
    );
  }
  if (settingKey === 'first_party_analytics_policy') {
    const policy = value as FirstPartyAnalyticsPolicy;
    const update = (next: Partial<FirstPartyAnalyticsPolicy>) =>
      onChange({ ...policy, ...next });
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="analytics-enabled">Collection state</Label>
          <NativeSelect
            id="analytics-enabled"
            className="w-full"
            value={policy?.enabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              update({ enabled: event.target.value === 'enabled' })
            }
          >
            <NativeSelectOption value="disabled">Disabled</NativeSelectOption>
            <NativeSelectOption value="enabled">Enabled</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="analytics-retention">Retention days (1–365)</Label>
          <Input
            id="analytics-retention"
            type="number"
            min={1}
            max={365}
            step={1}
            value={policy?.retentionDays ?? 90}
            onChange={(event) =>
              update({ retentionDays: Number(event.target.value) })
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="analytics-email-domains">
            Excluded test email domains
          </Label>
          <Input
            id="analytics-email-domains"
            value={policy?.excludedEmailDomains?.join(', ') ?? ''}
            onChange={(event) =>
              update({
                excludedEmailDomains: event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="analytics-path-prefixes">
            Excluded path prefixes
          </Label>
          <Input
            id="analytics-path-prefixes"
            value={policy?.excludedPathPrefixes?.join(', ') ?? ''}
            onChange={(event) =>
              update({
                excludedPathPrefixes: event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Events store only an opaque first-party browser-session hash, an
            allowlisted event, a path without query parameters, and time. No IP
            address, user agent, checkout fields, advertising ID, replay, or
            cross-site identifier is stored.
          </p>
        </div>
      </div>
    );
  }
  if (settingKey === 'recently_viewed_policy') {
    const policy = value as RecentlyViewedPolicy;
    const update = (next: Partial<RecentlyViewedPolicy>) => onChange({ ...policy, ...next });
    return <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="recent-limit">Maximum products (1–24)</Label><Input id="recent-limit" type="number" min={1} max={24} step={1} value={policy?.maxItems ?? 12} onChange={(event) => update({ maxItems: Number(event.target.value) })} /></div>
      <div className="space-y-2"><Label htmlFor="recent-retention">Per-entry retention days (1–365)</Label><Input id="recent-retention" type="number" min={1} max={365} step={1} value={policy?.retentionDays ?? 90} onChange={(event) => update({ retentionDays: Number(event.target.value) })} /></div>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Guest history remains only in that browser. Signed-in history is account-scoped. The two are never automatically merged, and customers can clear either list.</p>
    </div>;
  }
  if (settingKey === 'rider_finance_policy') {
    const policy = value as RiderFinancePolicy;
    const update = (next: Partial<RiderFinancePolicy>) =>
      onChange({ ...policy, ...next });
    const moneyInput = (
      id: string,
      label: string,
      key:
        | 'cashExposureLimitPaisa'
        | 'completedTripPaisa'
        | 'failedTripPaisa'
        | 'returnTripPaisa',
      optional = false,
    ) => (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          min={optional ? 0.01 : 0}
          step="0.01"
          value={
            policy?.[key] === null || policy?.[key] === undefined
              ? ''
              : Number(policy[key]) / 100
          }
          placeholder={
            optional ? 'Required before own-rider COD assignment' : undefined
          }
          onChange={(event) =>
            update({
              [key]:
                event.target.value === '' && optional
                  ? null
                  : Math.round(Number(event.target.value) * 100),
            })
          }
        />
      </div>
    );
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {moneyInput(
          'rider-cash-limit',
          'Cash exposure limit (NPR)',
          'cashExposureLimitPaisa',
          true,
        )}
        <div className="space-y-2">
          <Label htmlFor="rider-remittance-cutoff">
            Remittance cutoff (Kathmandu time)
          </Label>
          <Input
            id="rider-remittance-cutoff"
            type="time"
            value={policy?.remittanceCutoffLocalTime ?? '17:00'}
            onChange={(event) =>
              update({ remittanceCutoffLocalTime: event.target.value })
            }
          />
        </div>
        {moneyInput(
          'rider-completed-rate',
          'Simulated completed-trip rate (NPR)',
          'completedTripPaisa',
        )}
        {moneyInput(
          'rider-failed-rate',
          'Simulated failed-trip rate (NPR)',
          'failedTripPaisa',
        )}
        {moneyInput(
          'rider-return-rate',
          'Simulated return-trip rate (NPR)',
          'returnTripPaisa',
        )}
        <div className="space-y-2">
          <Label htmlFor="rider-receiving-label">
            Simulated receiving account / desk label
          </Label>
          <Input
            id="rider-receiving-label"
            value={policy?.receivingAccountLabel ?? ''}
            onChange={(event) =>
              update({ receivingAccountLabel: event.target.value })
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="rider-operating-days">
            Operating weekdays (comma-separated)
          </Label>
          <Input
            id="rider-operating-days"
            value={policy?.operatingWeekdays?.join(', ') ?? ''}
            onChange={(event) =>
              update({
                operatingWeekdays: event.target.value
                  .split(',')
                  .map((entry) => entry.trim().toLowerCase())
                  .filter(Boolean) as RiderFinancePolicy['operatingWeekdays'],
              })
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="rider-holidays">
            Non-operating dates (YYYY-MM-DD, comma-separated)
          </Label>
          <Input
            id="rider-holidays"
            value={policy?.holidayDates?.join(', ') ?? ''}
            onChange={(event) =>
              update({
                holidayDates: event.target.value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="text-xs leading-5 text-muted-foreground">
            These amounts are a staging simulation. Rider trip compensation
            remains separate from customer cash, delivery charges, seller
            balances, and maker entitlements. A published cash limit is required
            before assigning a COD parcel to an own rider.
          </p>
        </div>
      </div>
    );
  }
  if (settingKey === 'payout_cutoff_local_time') {
    return (
      <Input
        aria-label="Payout cutoff"
        type="time"
        value={scalarString(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (settingKey === 'payout_timezone') {
    return (
      <Input aria-label="Payout timezone" value="Asia/Kathmandu" readOnly />
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="setting-value">Comma-separated approved values</Label>
      <Input
        id="setting-value"
        value={scalarString(value)}
        onChange={(event) => onChange(event.target.value)}
      />
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
      <NativeSelect
        className="w-full"
        id="setting-value"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, label]) => (
          <NativeSelectOption key={optionValue || 'none'} value={optionValue}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
