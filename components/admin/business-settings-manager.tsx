'use client';
import Link from 'next/link';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import { FormGuide } from '@/components/forms/form-guide';
import {useCommercialScope,CommercialRecovery} from '@/components/admin/commercial-recovery';
import {FinanceAccessNotice} from '@/components/admin/finance-access-notice';
import { companyDetails, companyPanDisplay } from '@/lib/content/company-details';

import type { ProductWatermarkPolicy } from '@/lib/products/watermark-policy';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { SettingValuePreview } from '@/components/admin/setting-value-preview';
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
import { Field, FieldLabel } from '@/components/ui/field';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredMultipartAnswers } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { validateBusinessSettingValue } from '@/lib/configuration/definitions';
import { businessSettingPublicationLimitation,assertBusinessSettingPublicationReady } from '@/lib/configuration/capabilities';
import type {
  EffectiveBusinessSetting,
  BusinessSettingVersion,
} from '@/lib/db/repositories/business-settings';
import type {
  BusinessSettingChangeControl,
  BusinessSettingEffectiveMode,
  BusinessSettingKey,
  BusinessSettingSensitivity,
  ManagedMakerCompanyAccount,
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
type SettingsResponse = { error?: string; code?: string; ok?: unknown; action?: unknown; draft?: Partial<BusinessSettingVersion>; version?: Partial<BusinessSettingVersion> };

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
  if (key === 'platform_service_fee_policy' && value && typeof value === 'object') {
    const policy = value as { enabled: boolean; amountPaisa: number };
    return `${policy.enabled ? 'Enabled' : 'Disabled'} · NPR ${(policy.amountPaisa / 100).toFixed(2)} per order`;
  }
  if ((key === 'independent_seller_commission_bps' || key === 'managed_sale_linked_platform_retention_bps') && value === null) return 'Not configured — no current rate is assumed';
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
  if (key === 'product_photo_watermark' && value && typeof value === 'object') {
    const policy = value as ProductWatermarkPolicy;
    return (policy.enabled ? 'Enabled' : 'Disabled') + ' · ' + policy.sizePercent + '% width · ' + policy.opacityPercent + '% opacity · ' + policy.position.replaceAll('-', ' ');
  }
  if (key === 'managed_maker_company_account' && value && typeof value === 'object') return `${(value as ManagedMakerCompanyAccount).storeName} · ${(value as ManagedMakerCompanyAccount).contactEmail}`;
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
  if (numericKeys.has(key)) {
    if (value === null || value === undefined || typeof value === 'string' && value.trim() === '') throw new RangeError('Enter an explicit numeric value.');
    return Number(value);
  }
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

const settingGroups = ['Company & programs','Seller fees','Payouts','Delivery','Products','Customer experience'];
function settingGroup(key:BusinessSettingKey) {
 if (key === 'managed_maker_company_account' || key.startsWith('managed_') && key !== 'managed_sale_linked_platform_retention_bps') return 'Company & programs';
 if (key.includes('commission') || key.includes('retention_bps') || key === 'new_seller_reserve_bps') return 'Seller fees';
 if (key.startsWith('payout_') || key.includes('payout_minimum') || key === 'seller_delivery_hold_days') return 'Payouts';
 if (key.startsWith('rider_') || key.startsWith('open_box_')) return 'Delivery';
 if (key.startsWith('product_')) return 'Products';
 return 'Customer experience';
}
const affectedAreaLabels:Record<string,string> = { maker_onboarding:'Maker registration',admin_review:'Seller review',managed_makers:'Managed Makers',seller:'Sellers',maker:'Makers',orders:'Orders',settlements:'Payouts and settlements',product_photos:'Product photos',seller_preview:'Seller product previews',catalogue:'Product catalogue',products:'Products',checkout:'Checkout',rider:'Private rider operations',finance:'Finance records',assignments:'Delivery assignments',remittance:'Remittance records',returns:'Returns',homepage:'Homepage',shop:'Shop',analytics:'Analytics',account:'Customer accounts' };

type BusinessSettingsManagerProps={actorId:string;initialKey?:BusinessSettingKey;initialSettings:readonly BusinessSettingsAdminItem[];asOf:number;simulationAllowed?:boolean};
export function BusinessSettingsManager(props:BusinessSettingsManagerProps){return <BusinessSettingsManagerScope key={JSON.stringify([props.actorId,props.initialKey??null])} {...props}/>;}
function BusinessSettingsManagerScope({
  actorId,
  simulationAllowed=false,
  initialSettings,
  asOf,
  initialKey,
}:BusinessSettingsManagerProps) {
  const commercial=useCommercialScope(actorId);
  const [settings] = useState(() => initialSettings.filter((item) =>
    item.key !== 'homepage_hero_slides' && item.key !== 'homepage_occasion_slides'));
  const [selectedKey, setSelectedKey] = useState<BusinessSettingKey>(
    settings.some(item => item.key === initialKey) ? initialKey! : settings[0]?.key ?? 'official_social_links',
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
  const [query, setQuery] = useState('');
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const latestAttemptKey = useRef<string | null>(null);
  const [failedInMemory, setFailedAttemptKey] = useState<string | null>(null);
  const catalog = usePublishedFormConfig('staff.business-settings-manager');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem('admin-setting-feedback:'+actorId);
        if (!raw) return;
        const saved = JSON.parse(raw) as {key?:unknown;message?:unknown};
        window.sessionStorage.removeItem('admin-setting-feedback:'+actorId);
        if (saved.key === selectedKey && typeof saved.message === 'string') setMessage(saved.message);
      } catch { /* The authoritative history still confirms the result. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedKey,actorId]);
  const pendingPointer='admin-setting-pending:'+actorId+':'+selectedKey;
  const storedPointer=useSessionReference(pendingPointer);
  const validPointer=storedPointer&&storedPointer.startsWith(sessionAttemptKey('staff.business-settings-manager',actorId+':'))&&storedPointer.length<500?storedPointer:null;
  const storedAttempt=useSessionReference(validPointer??'');
  const failedAttemptKey=failedInMemory??(storedAttempt?validPointer:null);

  if (!selected) {
    return (
      <p className="rounded-xl border p-6">
        No business settings are registered.
      </p>
    );
  }

  let valueError = '';
  let publicationLimitation: string | null = null;
  try { validateBusinessSettingValue(selected.key, parseEditorValue(selected.key, editorValue)); }
  catch (cause) { valueError = cause instanceof Error ? cause.message : 'Review the proposed value.'; }
  if (!valueError){const value=parseEditorValue(selected.key,editorValue);publicationLimitation=businessSettingPublicationLimitation(selected.key,value);if(['managed_maker_active_model','managed_maker_program_mode'].includes(selected.key))try{assertBusinessSettingPublicationReady(selected.key,value as never,{simulationAllowed});}catch(error){publicationLimitation=(error as Error).message;}}
  const visibleSettings = settings.filter(item => query.trim().toLowerCase().split(/\s+/).filter(Boolean).every(term => (item.label+' '+item.description+' '+settingGroup(item.key)).toLowerCase().includes(term)));
  const drafts = selected.history.filter((item) => item.status === 'draft');
  const scheduled = selected.history.filter(
    (item) => item.status === 'published' && (item.effectiveFrom ?? 0) > asOf,
  );

  function selectKey(key: BusinessSettingKey) {
    if (busy || key === selected.key) return;
    const dirty = JSON.stringify(editorValue) !== JSON.stringify(editorValueFor(selected.effective.value)) || reason.trim() !== '' || effectiveFrom !== '';
    if (dirty && !window.confirm('You have unsaved setting changes. Discard them and open another setting?')) return;
    const destination=new URL(window.location.href);destination.searchParams.set('setting',key);if(destination.pathname==='/admin/programs')destination.hash='program-settings';window.history.replaceState(null,'',destination.pathname+destination.search+destination.hash);
    setEffectiveFrom('');
    setHasError(false);
    const next = settings.find((item) => item.key === key);
    setSelectedKey(key);
    setEditorValue(editorValueFor(next?.effective.value));
    setReason('');
    setMessage('');
    setHasError(false);
    setFailedAttemptKey(null);
  }

  function catalogPayload(action: string, subjectId: string) {
    if (!catalog.canSubmit || !catalog.config || !formRef.current)
      throw new Error('Form configuration is unavailable. Please try again.');
    const data = new FormData(formRef.current);
    const attemptKey = sessionAttemptKey('staff.business-settings-manager', `${actorId}:${action}:${subjectId}`);
    latestAttemptKey.current = attemptKey;
    sessionStorage.setItem(pendingPointer,attemptKey);
    data.set('requestId', getOrCreateSessionAttempt(attemptKey));
    const { version, ...answers } = configuredMultipartAnswers(data, catalog.config);
    return { sourceFormId: 'staff.business-settings-manager',
      formVersion: version, ...answers };
  }

  function verifyResponse(response: Response, result: SettingsResponse | null, action: 'save' | 'draft' | 'publish' | 'approve' | 'reject' | 'reverse', fallback: string) {
    if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
    if (!response.ok) throw new Error(result?.error || fallback);
    const draft = result?.draft;
    let validValue = false;
    if (draft) { try { validateBusinessSettingValue(selected.key, draft.value); validValue = true; } catch { /* Unverified response retains the attempt. */ } }
    const published = result?.version;
    let validPublishedValue = false;
    if (published) { try { validateBusinessSettingValue(selected.key, published.value); validPublishedValue = true; } catch { /* Retain the attempt. */ } }
    const confirmed = action === 'save'
      ? result?.ok === true && result.action === 'save' && validPublishedValue && published?.key === selected.key
        && published.status === 'published' && typeof published.id === 'string' && published.id.trim().length > 0
        && Number.isSafeInteger(published.version) && Number(published.version) > 0
        && Number.isSafeInteger(published.revision) && Number(published.revision) > 0
        && Number.isSafeInteger(published.effectiveFrom) && Number(published.effectiveFrom) >= 0
      : action === 'draft' || action === 'reverse'
      ? validValue && draft && typeof draft.id === 'string' && draft.id.trim().length > 0 && draft.key === selected.key
        && draft.status === 'draft' && Number.isSafeInteger(draft.version) && Number(draft.version) > 0
        && Number.isSafeInteger(draft.revision) && Number(draft.revision) > 0 && (action === 'draft' || result?.action === action)
      : result?.ok === true && result.action === action;
    if (!confirmed || result?.error) throw new Error('The response could not be verified. Retry with the same request.');
  }

  async function saveSetting(action: 'save' | 'draft') {
    setBusy(true);
    setMessage('');
    setHasError(false);
    setFailedAttemptKey(null);
    latestAttemptKey.current = null;
    try {
      const response = await fetch('/api/admin/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',...commercial.headers },
        body: JSON.stringify({
          action,
          key: selected.key,
          value: parseEditorValue(selected.key, editorValue),
          reason,
          ...(action === 'save' ? { expectedVersion: Math.max(0, ...selected.history.map((item) => item.version)),
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom).getTime() : null } : {}),
          ...catalogPayload(action, selected.key),
        }),
      });
      const result = (await response.json().catch(() => null)) as SettingsResponse | null;
      if(!commercial.current())return;commercial.observe(response);
      verifyResponse(response, result, action, 'Setting could not be saved.');
      if (latestAttemptKey.current) clearSessionAttempt(latestAttemptKey.current);
      sessionStorage.removeItem(pendingPointer);notifySessionReference(pendingPointer);
      const savedMessage = action === 'draft' ? 'Draft saved. It has not changed the active setting.' : (typeof result?.version?.effectiveFrom === 'number' && typeof result.version.publishedAt === 'number' && result.version.effectiveFrom > result.version.publishedAt ? 'Change scheduled. The current value stays active until its effective date.' : 'Changes saved and published. Review the current value and history below.');
      setMessage(savedMessage);
      try { window.sessionStorage.setItem('admin-setting-feedback:'+actorId, JSON.stringify({key:selected.key,message:savedMessage})); } catch { /* Reload the authoritative record even when storage is unavailable. */ }
      window.location.reload();
    } catch (error) {
      setHasError(true);
      setFailedAttemptKey(latestAttemptKey.current);
      setMessage(
        error instanceof Error ? error.message : 'Setting could not be saved.',
      );
    } finally {
      if(commercial.current())setBusy(false);
    }
  }

  async function changeVersion(
    version: BusinessSettingVersion,
    action: 'publish' | 'approve' | 'reject' | 'reverse',
  ) {
    setBusy(true);
    setMessage('');
    setHasError(false);
    setFailedAttemptKey(null);
    latestAttemptKey.current = null;
    try {
      const response = await fetch(
        `/api/admin/business-settings/changes/${encodeURIComponent(version.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',...commercial.headers },
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
      if(!commercial.current())return;commercial.observe(response);
      verifyResponse(response, result, action, 'Change could not be completed.');
      if (latestAttemptKey.current) clearSessionAttempt(latestAttemptKey.current);
      sessionStorage.removeItem(pendingPointer);notifySessionReference(pendingPointer);
      setMessage('Change recorded. Refreshing the authoritative history…');
      window.location.reload();
    } catch (error) {
      setHasError(true);
      setFailedAttemptKey(latestAttemptKey.current);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Change could not be completed.',
      );
    } finally {
      if(commercial.current())setBusy(false);
    }
  }

  const recovery=failedAttemptKey?<CommercialRecovery actorId={actorId} kind="business-setting" attemptKey={failedAttemptKey} onDenied={commercial.deny} onReauthorized={commercial.reauthorize} onRecovered={()=>{if(!commercial.current())return;clearSessionAttempt(failedAttemptKey);sessionStorage.removeItem(pendingPointer);notifySessionReference(pendingPointer);setFailedAttemptKey(null);window.location.reload();}}/>:null;
  if(commercial.accessDenied)return <div className="space-y-3"><FinanceAccessNotice message={message}/>{recovery}</div>;
  return (
    <form ref={formRef} data-form-id="staff.business-settings-manager"
      className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]"
      onSubmit={(event) => event.preventDefault()}>
      {recovery}
      {simulationAllowed&&selected.key==='managed_maker_active_model'&&editorValue==='managed_fixed_supplier_price_v1'?<p className="col-span-full rounded border p-3">Simulation only: fixed supplier-price configuration does not authorize live activation or real settlement. Each maker, agreement and product keeps its independent native checks.</p>:null}
      <FormGuide formId="staff.business-settings-manager" />

      <fieldset disabled={busy} className="contents">
      <Card className="h-fit">
        <CardHeader>
<CardTitle>Find a setting</CardTitle>
          <CardDescription>
            Search by task, then review the current value before making a change.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field><FieldLabel htmlFor="setting-search">Search settings</FieldLabel><Input id="setting-search" type="search" value={query} maxLength={120} placeholder="Commission, company, payouts…" onChange={event=>setQuery(event.target.value)} /></Field>
          <output aria-live="polite" className="text-xs text-muted-foreground">{visibleSettings.length} settings found</output>
          <section aria-label="Available settings" className="max-h-80 space-y-4 overflow-y-auto xl:max-h-none xl:overflow-visible">
          {settingGroups.map(group => {
            const items=visibleSettings.filter(item => settingGroup(item.key)===group);
            return items.length ? <section key={group} className="flex flex-col gap-1"><h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>{items.map(setting => <Button key={setting.key} type="button" aria-pressed={setting.key===selected.key} variant={setting.key===selected.key?'secondary':'ghost'} className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2 text-left" onClick={()=>selectKey(setting.key)}>{setting.label}</Button>)}</section> : null;
          })}
          </section>
          {!visibleSettings.length ? <p className="text-sm text-muted-foreground">No settings match. Try another word or clear the search.</p> : null}
          {query ? <Button type="button" variant="outline" onClick={()=>setQuery('')}>Clear search</Button> : null}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {selected.sensitivity.replaceAll('_', ' ')}
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

        {(selected.key === 'independent_seller_commission_bps' || selected.key === 'managed_sale_linked_platform_retention_bps') ? <Card><CardHeader><CardTitle>Selling fee policy</CardTitle></CardHeader><CardContent><p>Registered Seller and sale-linked Managed Maker rates share one publication and common start.</p><Link href="/admin/commission#rate-management" className="section-link">Review the common fee schedule</Link></CardContent></Card> : (
        <Card>
          <CardHeader>
            <CardTitle>Edit configuration</CardTitle>
            <CardDescription>
              Save valid changes directly or schedule when they take effect.
              You can also keep a draft for later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {publicationLimitation ? <output className="block rounded-xl border p-3 text-sm">{publicationLimitation} You may retain a draft for review.</output> : null}
            {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={['setting']} /> : null}
            {!catalog.canSubmit ? <output aria-live="polite" className="block text-sm">{catalog.message || 'Loading form configuration…'}</output> : null}
            <SettingValueEditor
              settingKey={selected.key}
              value={editorValue}
              onChange={setEditorValue}
            />
            <div className="space-y-2">
              <Label htmlFor="setting-reason">Reason and expected impact *</Label>
              <Textarea
                id="setting-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the business reason, affected users, and reversal plan."
                maxLength={1000}
                minLength={8}
                required
                aria-describedby="setting-reason-help"
              />
              <p id="setting-reason-help" className="text-xs text-muted-foreground">Use at least 8 characters to explain why this change is needed.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="setting-effective-from">
                Effective date for publication (your local time)
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
                {' '}Leave the date blank to apply changes now. Independent seller commission changes require at least 15 calendar days notice and renewed acceptance.
              </p>
            </div>
            <section aria-label="Setting change preview" className="rounded-xl border bg-muted/40 p-4">
              <h3 className="text-sm font-semibold">Change preview</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="min-w-0"><h4 className="mb-2 text-sm font-semibold">Current value</h4><SettingValuePreview value={selected.effective.value} summary={displayValue(selected.key, selected.effective.value)} /></div>
                <div className="min-w-0"><h4 className="mb-2 text-sm font-semibold">Proposed value</h4>{valueError
                  ? <p className="text-sm text-muted-foreground">Enter a valid value to preview this change.</p>
                  : <SettingValuePreview value={parseEditorValue(selected.key, editorValue)} summary={displayValue(selected.key, parseEditorValue(selected.key, editorValue))} />}</div>
              </div>
              <p className="mt-3 text-sm font-semibold">Affected areas</p>
              <p className="mt-1 text-sm text-muted-foreground">{selected.affectedSurfaces.map(area=>affectedAreaLabels[area]??area.replaceAll('_',' ')).join(', ')}</p>
            </section>
            {valueError ? <p role="alert" className="text-sm text-destructive">{valueError}</p> : null}
            {catalog.canSubmit && reason.trim().length < 8 ? <p className="text-sm text-muted-foreground">Add a reason to enable saving.</p> : null}
            {message || busy ? (
              <output aria-live="polite" role={hasError ? 'alert' : 'status'} className="block text-sm font-medium">{busy ? 'Saving setting…' : message}</output>
            ) : null}
            {failedAttemptKey ? <Button type="button" variant="outline" disabled={busy}
              onClick={() => {
                if (!window.confirm('This attempt may already have succeeded. Check the latest history before starting a new attempt, which could duplicate the action. Continue?')) return;
              clearSessionAttempt(failedAttemptKey);
              if (catalog.status === 'stale') catalog.refresh();
                setFailedAttemptKey(null);
                setMessage('New attempt ready. Review the latest history before submitting again.');
              }}>Start a new attempt</Button> : null}
            <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !catalog.canSubmit || reason.trim().length < 8 || Boolean(valueError) || Boolean(publicationLimitation)}
              onClick={() => saveSetting('save')}
            >
              {busy ? 'Saving…' : effectiveFrom ? 'Save and schedule' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !catalog.canSubmit || reason.trim().length < 8 || Boolean(valueError)}
              onClick={() => saveSetting('draft')}
            >
              Save draft
            </Button>
            </div>
          </CardContent>
        </Card>
        )}

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
                <div key={version.id} id={'setting-version-'+version.id} className="scroll-mt-6 rounded-xl border p-4">
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
                      {!['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'].includes(selected.key) && version.status === 'draft' ? (
                        <Button
                          size="sm"
                          type="button"
                          disabled={busy || !catalog.canSubmit || reason.trim().length < 8 || Boolean(valueError) || Boolean(businessSettingPublicationLimitation(selected.key, version.value))}
                          onClick={() =>
                            changeVersion(
                              version,
                              'publish',
                            )
                          }
                        >
                          Publish / schedule
                        </Button>
                      ) : null}
                      {!['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'].includes(selected.key) && version.status === 'pending_approval' ? (
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
                      {!['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'].includes(selected.key) && version.status === 'published' ? (
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
      </fieldset>
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
  if (settingKey === 'platform_service_fee_policy') {
    const policy = value as { enabled: boolean; amountPaisa: number };
    return <div className="space-y-4">
      <label className="flex min-h-11 items-center gap-3"><input className="size-4 accent-primary" type="checkbox" checked={policy.enabled} onChange={event => onChange({ ...policy, enabled: event.target.checked })} />Enable Platform service fee</label>
      <div className="space-y-2"><Label htmlFor="service-fee-amount">Amount per order (NPR)</Label>
        <Input id="service-fee-amount" type="number" min={0} max={1000} step="0.01" value={Number.isFinite(policy.amountPaisa) ? policy.amountPaisa / 100 : ''}
          onChange={event => onChange({ ...policy, amountPaisa: event.target.value === '' ? NaN : Math.round(Number(event.target.value) * 100) })} /></div>
      <p className="text-sm text-muted-foreground">When disabled, new orders pay no Platform service fee. The amount is kept for re-enabling. Changes apply to newly reviewed orders only. Existing orders keep their saved charge and refund terms. Non-refundable except where required by law.</p>
    </div>;
  }
  if (numericKeys.has(settingKey)) {
    return (
      <div className="space-y-2">
        <Label htmlFor="setting-value">
          {settingKey.endsWith('_bps')
            ? 'Basis points (100 = 1%)'
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
  if (settingKey === 'managed_maker_company_account') {
    const account = value as ManagedMakerCompanyAccount;
    return <div className="space-y-4">
      <p className="text-sm">{companyDetails.legalName} · Registration {companyDetails.registrationNumber} · Company PAN: {companyPanDisplay}</p>
      <p className="text-xs text-muted-foreground">Stable entity: {companyDetails.entityReference}. Legal identity and PAN are read-only. Super Admin operates this account; makers retain their individual accounts.</p>
      {(['storeName','contactEmail','contactPhone','returnAddress'] as const).map(key=><div key={key} className="space-y-2">
        <Label htmlFor={`company-${key}`}>{({storeName:'Store name',contactEmail:'Contact email',contactPhone:'Contact phone (optional)',returnAddress:'Return address'})[key]}</Label>
        <Input id={`company-${key}`} type={key==='contactEmail'?'email':'text'} value={account[key]} maxLength={key==='returnAddress'?500:key==='storeName'?160:key==='contactPhone'?20:254}
          onChange={event=>onChange({...account,[key]:event.target.value})}/>
      </div>)}
    </div>;
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
  if (settingKey === 'product_photo_watermark') {
    const policy = value as ProductWatermarkPolicy;
    const update = (next: Partial<ProductWatermarkPolicy>) => onChange({ ...policy, ...next });
    return <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="watermark-enabled">Watermark</Label><NativeSelect id="watermark-enabled" className="w-full" value={policy.enabled ? 'enabled' : 'disabled'} onChange={event => update({ enabled: event.target.value === 'enabled' })}><NativeSelectOption value="enabled">Enabled</NativeSelectOption><NativeSelectOption value="disabled">Disabled</NativeSelectOption></NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="watermark-position">Position</Label><NativeSelect id="watermark-position" className="w-full" value={policy.position} onChange={event => update({ position: event.target.value as ProductWatermarkPolicy['position'] })}>{(['bottom-right','bottom-left','top-right','top-left'] as const).map(position => <NativeSelectOption key={position} value={position}>{position.replaceAll('-', ' ')}</NativeSelectOption>)}</NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="watermark-size">Width (% of photo, 8–35)</Label><Input id="watermark-size" type="number" min={8} max={35} step={1} value={policy.sizePercent} onChange={event => update({ sizePercent: Number(event.target.value) })}/></div>
      <div className="space-y-2"><Label htmlFor="watermark-opacity">Opacity (%, 10–80)</Label><Input id="watermark-opacity" type="number" min={10} max={80} step={1} value={policy.opacityPercent} onChange={event => update({ opacityPercent: Number(event.target.value) })}/></div>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Customer copies carry the Hastabazaar wordmark. Originals stay private. Saving updates existing uploaded product photos as well as new uploads; videos, category images, homepage media, and customer reviews are unaffected. Sellers see the current customer photo before submitting.</p>
    </div>;
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
