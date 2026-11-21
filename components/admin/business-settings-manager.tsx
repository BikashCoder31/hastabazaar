'use client';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, Clock3, LockKeyhole, Search, TriangleAlert } from 'lucide-react';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import { FormGuide } from '@/components/forms/form-guide';
import {useCommercialScope,CommercialRecovery} from '@/components/admin/commercial-recovery';
import {FinanceAccessNotice} from '@/components/admin/finance-access-notice';
import { companyDetails, companyPanDisplay } from '@/lib/content/company-details';

import type { ProductWatermarkPolicy } from '@/lib/products/watermark-policy';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { SettingPreviewPanel, SettingValuePreview } from '@/components/admin/setting-value-preview';
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
    return policy.enabled ? `Enabled · NPR ${(policy.amountPaisa / 100).toFixed(2)} per order` : 'Off';
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
  onBusinessPage = false,
): string {
  if (version.status === 'draft') return 'Draft';
  if (version.status === 'pending_approval') return onBusinessPage ? 'Unpublished' : 'Awaiting approval';
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

type BusinessPageOptions = {
  editable: boolean;
  canManageFees: boolean;
  parkedHref?: string;
  returnWindowDays: number;
};

type BusinessSettingsManagerProps = {
  actorId: string;
  initialKey?: BusinessSettingKey;
  initialSettings: readonly BusinessSettingsAdminItem[];
  asOf: number;
  simulationAllowed?: boolean;
  businessPage?: BusinessPageOptions;
  commissionEditor?: ReactNode;
};

const mainSettings = [
  'independent_seller_commission_bps',
  'platform_service_fee_policy',
  'payout_processing_weekday',
  'seller_delivery_hold_days',
  'platform_payout_minimum_paisa',
  'new_seller_reserve_bps',
  'open_box_service_area_codes',
  'product_photo_watermark',
] as const satisfies readonly BusinessSettingKey[];

const businessGroups = ['Money', 'Delivery', 'Storefront'] as const;
const businessLabels: Partial<Record<BusinessSettingKey, string>> = {
  independent_seller_commission_bps: 'Seller commission',
  platform_service_fee_policy: 'Customer marketplace fee',
  payout_processing_weekday: 'Payout day',
  seller_delivery_hold_days: 'Hold after delivery',
  platform_payout_minimum_paisa: 'Minimum payout',
  open_box_service_area_codes: 'Open-box districts',
  product_photo_watermark: 'Photo watermark',
};
const businessDescriptions: Partial<Record<BusinessSettingKey, string>> = {
  independent_seller_commission_bps: 'What Hastabazaar keeps from each sale by an independent seller. Sellers keep the rest.',
  platform_service_fee_policy: 'An extra charge once per order, on top of the items and delivery.',
  payout_processing_weekday: 'The weekday payouts are prepared.',
  seller_delivery_hold_days: 'How long a seller waits after delivery before that sale becomes eligible for payout.',
  platform_payout_minimum_paisa: 'Sellers with less than this wait until they have earned more.',
  new_seller_reserve_bps: 'A share of a new seller’s first payouts held back for returns.',
  open_box_service_area_codes: 'The saved districts for open-box delivery. This option is switched off.',
  product_photo_watermark: 'The Hastabazaar mark printed on product photos.',
};
const businessSurfaces: Partial<Record<BusinessSettingKey, readonly string[]>> = {
  independent_seller_commission_bps: ['Seller earnings', 'Payouts', 'Add product'],
  platform_service_fee_policy: ['Checkout', 'Order details', 'Finance records', 'Returns'],
  payout_processing_weekday: ['Seller earnings', 'Payouts'],
  seller_delivery_hold_days: ['Seller earnings', 'Payouts', 'Order details'],
  platform_payout_minimum_paisa: ['Seller earnings', 'Payouts'],
  new_seller_reserve_bps: ['Payouts', 'Seller earnings'],
  product_photo_watermark: ['Product pages', 'Shop', 'Seller product previews'],
};
const businessHistoryDate = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' });
const previewDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' });
const dayMs = 86_400_000;
const settingInput = 'min-h-11 w-full min-w-0 rounded-[10px] border border-[#D3C5AD] bg-white px-3.5 text-base text-[#14213D] md:text-sm focus-visible:outline-2 focus-visible:outline-primary';
const settingOption = 'flex min-h-11 w-full items-start justify-between gap-2 rounded-[10px] border border-transparent! px-2.5 py-2 text-left text-sm hover:bg-[#EDE4D3]/70 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:border-[#14213D]! aria-pressed:bg-white';

function businessGroup(key: BusinessSettingKey) {
  if (key.startsWith('open_box_')) return 'Delivery';
  if (key.startsWith('product_') || ['official_social_links', 'first_party_analytics_policy', 'recently_viewed_policy'].includes(key)) return 'Storefront';
  return 'Money';
}

function daysText(days: number) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function businessValue(key: BusinessSettingKey, value: unknown, compact = false) {
  if (key === 'seller_delivery_hold_days' && typeof value === 'number') return daysText(value);
  if (key === 'payout_processing_weekday' && typeof value === 'string') return value.charAt(0).toUpperCase() + value.slice(1);
  if (key === 'platform_payout_minimum_paisa' && typeof value === 'number') return `NPR ${(value / 100).toLocaleString('en-NP')}`;
  if (key === 'platform_service_fee_policy' && value && typeof value === 'object') {
    const policy = value as { enabled: boolean; amountPaisa: number };
    return policy.enabled ? `On · NPR ${(policy.amountPaisa / 100).toLocaleString('en-NP')} per order` : 'Off';
  }
  if (compact && key === 'open_box_service_area_codes' && Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'district' : 'districts'}`;
  if (compact && key === 'product_photo_watermark' && value && typeof value === 'object') {
    const policy = value as ProductWatermarkPolicy;
    return policy.enabled ? `${policy.opacityPercent}%` : 'Off';
  }
  return displayValue(key, value);
}

function exampleHold(days: unknown, asOf: number) {
  if (typeof days !== 'number') return null;
  return `Delivered ${previewDate.format(asOf)} → hold ends ${previewDate.format(asOf + days * dayMs)}`;
}

function payoutCutoff(value: unknown) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minutes] = value.split(':').map(Number);
  return `${hour % 12 || 12}${minutes ? ':' + String(minutes).padStart(2, '0') : ''} ${hour < 12 ? 'am' : 'pm'}`;
}
export function BusinessSettingsManager(props:BusinessSettingsManagerProps){return <BusinessSettingsManagerScope key={JSON.stringify([props.actorId,props.initialKey??null])} {...props}/>;}
function BusinessSettingsManagerScope({
  actorId,
  simulationAllowed=false,
  initialSettings,
  asOf,
  initialKey,
  businessPage,
  commissionEditor,
}:BusinessSettingsManagerProps) {
  const commercial=useCommercialScope(actorId);
  const settings = useMemo(() => initialSettings.filter(item =>
    item.key !== 'homepage_hero_slides' && item.key !== 'homepage_occasion_slides'), [initialSettings]);
  const [selectedKey, setSelectedKey] = useState<BusinessSettingKey>(
    settings.find(item => item.key === initialKey)?.key ??
      (businessPage ? settings.find(item => item.key === 'seller_delivery_hold_days')?.key : undefined) ??
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
  const [startLater, setStartLater] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const editorRef = useRef<HTMLHeadingElement>(null);
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
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleSettings = settings.filter(item => terms.every(term => {
    const searchable = businessPage
      ? [businessLabels[item.key], businessDescriptions[item.key], businessGroup(item.key), businessValue(item.key, item.effective.value)]
      : [settingGroup(item.key)];
    return [item.label, item.description, ...searchable].join(' ').toLowerCase().includes(term);
  }));
  const drafts = selected.history.filter((item) => item.status === 'draft');
  const scheduled = selected.history.filter(
    (item) => item.status === 'published' && (item.effectiveFrom ?? 0) > asOf,
  );

  function selectKey(key: BusinessSettingKey) {
    if (busy) return;
    const scrollToEditor = () => {
      if (!businessPage || window.matchMedia('(min-width: 1024px)').matches) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      editorRef.current?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    };
    if (key === selected.key) {
      scrollToEditor();
      return;
    }
    const customAnswersChanged = businessPage && formRef.current
      ? Array.from(new FormData(formRef.current)).some(([name, value]) => name.startsWith('custom.') && value !== '')
      : false;
    const dirty = JSON.stringify(editorValue) !== JSON.stringify(editorValueFor(selected.effective.value)) || reason.trim() !== '' || effectiveFrom !== '' || customAnswersChanged;
    if (dirty && !window.confirm('You have unsaved setting changes. Discard them and open another setting?')) return;
    const destination=new URL(window.location.href);destination.searchParams.set('setting',key);if(destination.pathname==='/admin/programs')destination.hash='program-settings';window.history.replaceState(null,'',destination.pathname+destination.search+destination.hash);
    setEffectiveFrom('');
    setStartLater(false);
    const next = settings.find((item) => item.key === key);
    setSelectedKey(key);
    setEditorValue(editorValueFor(next?.effective.value));
    setReason('');
    setMessage('');
    setHasError(false);
    setFailedAttemptKey(null);
    requestAnimationFrame(scrollToEditor);
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
  if (businessPage) {
    const { editable, parkedHref, canManageFees, returnWindowDays } = businessPage;
    const pairedFee = selected.key === 'independent_seller_commission_bps' || selected.key === 'managed_sale_linked_platform_retention_bps';
    const parked = selected.key === 'open_box_service_area_codes';
    const allowsEditing = editable && !pairedFee && !parked;
    const valueNow = selected.effective.value;
    const nextValue = valueError ? undefined : parseEditorValue(selected.key, editorValue);
    const changed = JSON.stringify(editorValue) !== JSON.stringify(editorValueFor(valueNow));
    const hasNewValue = nextValue !== undefined && JSON.stringify(nextValue) !== JSON.stringify(valueNow);
    const dateRequired = startLater && !effectiveFrom;
    const canSave = allowsEditing && !busy && catalog.canSubmit && reason.trim().length >= 8 &&
      !valueError && !publicationLimitation && !dateRequired && Boolean(hasNewValue || effectiveFrom || failedAttemptKey);
    const hold = selected.key === 'seller_delivery_hold_days';
    const holdDelta = hold && typeof nextValue === 'number' && typeof valueNow === 'number' ? nextValue - valueNow : 0;
    const cutoff = payoutCutoff(settings.find(item => item.key === 'payout_cutoff_local_time')?.effective.value);
    const scheduledValue = selected.effectiveMode === 'effective_dated';
    const label = businessLabels[selected.key] ?? selected.label;
    const showsOn = businessSurfaces[selected.key] ?? selected.affectedSurfaces.map(area => affectedAreaLabels[area] ?? area.replaceAll('_', ' '));
    const formattedStart = effectiveFrom ? new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium' }).format(new Date(effectiveFrom)) : null;
    const rankedSettings = mainSettings.flatMap(key => visibleSettings.filter(item => item.key === key));
    const extraSettings = visibleSettings.filter(item => !mainSettings.some(key => item.key === key));
    const groupedSettings = terms.length ? [...rankedSettings, ...extraSettings] : rankedSettings;
    const showExtra = !terms.length && extraSettings.length > 0;
    const currentIsExtra = !mainSettings.some(key => key === selected.key);

    function discardChange() {
      setEditorValue(editorValueFor(valueNow));
      setEffectiveFrom('');
      setStartLater(false);
      setReason('');
      setHasError(false);
      setMessage('');
      setResetCount(count => count + 1);
    }

    function menuGroups(items: readonly BusinessSettingsAdminItem[]) {
      return businessGroups.map(group => {
        const options = items.filter(item => businessGroup(item.key) === group);
        if (!options.length) return null;
        return <section key={group} className="space-y-0.5">
          <h2 className="px-3 pb-1 text-[13px] font-semibold text-[#675B4E]">{group}</h2>
          {options.map(item => {
            const active = item.key === selected.key;
            const draft = (active && changed) || item.history.some(version => version.status === 'draft');
            const hasSchedule = item.history.some(version => version.status === 'published' && (version.effectiveFrom ?? 0) > asOf);
            return <button key={item.key} type="button" aria-pressed={active} disabled={busy} className={settingOption} onClick={() => selectKey(item.key)}>
              <span className="min-w-0">
                <span className="block break-words font-semibold">{businessLabels[item.key] ?? item.label}</span>
                <span className="mt-0.5 block break-words text-[13px] text-[#46536F]">{businessValue(item.key, item.effective.value, true)}</span>
              </span>
              {draft || hasSchedule ? <span className="shrink-0 rounded-full bg-[#F6E7C3] px-2 text-xs font-semibold text-[#794D08]">{draft ? 'Draft' : 'Scheduled'}</span> : null}
            </button>;
          })}
        </section>;
      });
    }

    return (
      <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(13rem,0.35fr)_minmax(0,1fr)] lg:gap-0">
        <aside aria-label="Business settings" className="min-w-0 space-y-4 lg:border-r lg:border-[#E4DACA] lg:pr-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#675B4E]" aria-hidden="true" />
            <input aria-label="Find a setting" type="search" value={query} maxLength={120} placeholder="Find a setting" className={settingInput + ' pl-9'} onChange={event => setQuery(event.target.value)} />
          </div>
          <nav aria-label="Available settings" className="space-y-5">
            {menuGroups(groupedSettings)}
            {!visibleSettings.length ? <output className="block px-3 text-sm text-[#46536F]">No settings match your search.</output> : null}
          </nav>
          {parkedHref ? (
            <Link href={parkedHref} aria-label="Not in use yet" className="mx-1 flex min-h-11 gap-2 rounded-xl border border-dashed border-[#D3C5AD] p-3 text-[13px] text-[#46536F]">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span><strong className="block text-[#14213D]">Delivery features are switched off</strong>Cash hand-in and cash limit live in Not in use yet.</span>
            </Link>
          ) : null}
          {showExtra ? <details open={currentIsExtra} className="border-t border-[#E4DACA]">
            <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">More business settings</summary>
            <div className="space-y-5">{menuGroups(extraSettings)}</div>
          </details> : null}
        </aside>

        <section aria-labelledby="business-setting-title" className="min-w-0 space-y-6 lg:pl-6 xl:pl-10">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 flex-[1_1_19rem]">
              <h2 id="business-setting-title" ref={editorRef} tabIndex={-1} className="scroll-mt-20 break-words font-heading text-2xl font-semibold leading-tight focus:outline-none lg:text-[2rem]">{label}</h2>
              <p className="mt-1 max-w-[62ch] text-[15px] leading-6 text-[#46536F]">{businessDescriptions[selected.key] ?? selected.description}</p>
            </div>
            {!parked && (allowsEditing || pairedFee) ? <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ' + (scheduledValue ? 'bg-[#F6E7C3] text-[#794D08]' : 'bg-[#E4ECDE] text-[#2C6A4A]')}>
              {scheduledValue ? <CalendarDays aria-hidden="true" className="size-4" /> : <Check aria-hidden="true" className="size-4" />}
              {scheduledValue ? 'Starts on a date you pick' : 'Saves when you confirm'}
            </span> : null}
          </div>
          {pairedFee && canManageFees ? commissionEditor ?? (
            <Link href="/admin/commission#rate-management" className="section-link">Review the common fee schedule</Link>
          ) : null}
          {parked ? <p className="text-sm text-[#46536F]">{businessValue(selected.key, valueNow)}{parkedHref ? <> · <Link className="inline-flex min-h-11 items-center font-semibold underline" href={parkedHref}>Not in use yet</Link></> : null}</p> : null}
          <form ref={formRef} data-form-id="staff.business-settings-manager" className="space-y-6" onSubmit={event => {
            event.preventDefault();
            if (canSave) void saveSetting('save');
          }}>
            {recovery}
            {allowsEditing ? <fieldset disabled={busy} className="min-w-0 space-y-6">
              {simulationAllowed && selected.key === 'managed_maker_active_model' && editorValue === 'managed_fixed_supplier_price_v1' ? (
                <p className="rounded-lg border border-[#E4DACA] p-3 text-sm">Simulation only. Fixed supplier-price configuration does not authorize live activation or real settlement. Each maker, agreement and product keeps its independent native checks.</p>
              ) : null}
              <div className={hold ? 'grid gap-4 lg:grid-cols-[minmax(8rem,13.75rem)_minmax(0,1fr)]' : 'grid gap-4'}>
                <div className="min-w-0 space-y-2 [&_[data-slot=input]]:min-h-11 [&_[data-slot=input]]:bg-white [&_[data-slot=native-select]]:min-h-11 [&_[data-slot=native-select]]:bg-white">
                  {hold ? (
                    <div className="space-y-2">
                      <Label htmlFor="setting-value">New value</Label>
                      <div className="flex items-center rounded-[10px] border border-[#D3C5AD] bg-white focus-within:outline-2 focus-within:outline-primary">
                        <input id="setting-value" type="number" min={0} step={1} value={scalarString(editorValue)} onChange={event => setEditorValue(event.target.value)} className="min-h-11 w-full min-w-0 rounded-l-[10px] px-3.5 text-base font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        <span className="self-stretch content-center rounded-r-[10px] border-l border-[#E4DACA] bg-[#FFFCF7] px-4 text-sm text-[#675B4E]">days</span>
                      </div>
                    </div>
                  ) : <>
                    <p className="text-sm font-semibold">New value</p>
                    <SettingValueEditor settingKey={selected.key} value={editorValue} onChange={setEditorValue} businessPage />
                  </>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="setting-start">Starts</Label>
                  <select id="setting-start" value={startLater ? 'later' : 'now'} onChange={event => {
                    const later = event.target.value === 'later';
                    setStartLater(later);
                    if (!later) setEffectiveFrom('');
                  }} className={settingInput}>
                    <option value="now">As soon as you save</option>
                    <option value="later">{formattedStart ? `From ${formattedStart}` : 'Choose a date…'}</option>
                  </select>
                  {startLater ? <div className="space-y-2">
                    <Label htmlFor="setting-effective-from">Start date and time (your local time)</Label>
                    <input id="setting-effective-from" type="datetime-local" value={effectiveFrom} required className={settingInput} onChange={event => setEffectiveFrom(event.target.value)} />
                  </div> : null}
                </div>
              </div>

              <section className="space-y-3" aria-labelledby="setting-preview-title">
                <h3 id="setting-preview-title" className="text-[15px] font-semibold">What changes</h3>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1.5 md:gap-2">
                  <SettingPreviewPanel caption="Now" after={false}
                    summary={businessValue(selected.key, valueNow)} value={valueNow}
                    detail={hold ? exampleHold(valueNow, asOf) : selected.key === 'payout_processing_weekday' && cutoff ? `Saved cut-off: ${cutoff}, Nepal time` : null} />
                  <ArrowRight className="size-4 self-center text-[#A8232E]" aria-hidden="true" />
                  <SettingPreviewPanel caption={hasNewValue ? 'After the change' : 'Type a new value'} after
                    summary={hasNewValue ? businessValue(selected.key, nextValue) : '—'} value={hasNewValue ? nextValue : undefined}
                    detail={hasNewValue && hold ? exampleHold(nextValue, asOf) : !hasNewValue ? 'The preview fills in as you type.' : null} />
                </div>
                <ul className="space-y-2 text-sm">
                  {holdDelta ? <li className={'flex items-start gap-2 ' + (holdDelta < 0 ? 'text-[#2C6A4A]' : 'text-[#46536F]')}>
                    {holdDelta < 0 ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                    {holdDelta < 0 ? `The hold ends ${daysText(-holdDelta)} sooner.` : `The hold lasts ${daysText(holdDelta)} longer.`}
                  </li> : null}
                  {hold && hasNewValue && typeof nextValue === 'number' && nextValue < returnWindowDays ? <li className="flex items-start gap-2 text-[#A8232E]">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Shorter than the {returnWindowDays}-day general return period. You may pay for orders that are later returned and have to recover the money.
                  </li> : null}
                  {publicationLimitation ? <li className="flex items-start gap-2 text-[#8A5209]">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{publicationLimitation}
                  </li> : null}
                  {valueError ? <li className="flex items-start gap-2 text-[#A8232E]" role="alert">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{valueError}
                  </li> : null}
                </ul>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#46536F]">
                  <span>Shows on</span>
                  {showsOn.map(area => <span key={area} className="rounded-full bg-[#EDE4D3] px-2.5 py-0.5 text-xs font-semibold text-[#14213D]">{area}</span>)}
                </div>
              </section>

              <div className="space-y-2">
                <Label htmlFor="setting-reason">Why are you changing this?</Label>
                <input id="setting-reason" value={reason} required minLength={8} maxLength={1000} placeholder="Required. Saved in the setting’s history."
                  className={settingInput} onChange={event => setReason(event.target.value)} />
                {reason.length > 0 && reason.trim().length < 8 ? <p className="text-xs text-[#675B4E]">Enter at least 8 characters.</p> : null}
              </div>
              {catalog.config ? (
                <div className="hidden has-[[data-configured-field]]:block [&_[data-configured-field]>input:not([type=checkbox])]:min-h-11 [&_[data-configured-field]>select]:min-h-11">
                  <ConfiguredFields key={selected.key + ':' + resetCount} config={catalog.config} baseKeys={['setting']} />
                </div>
              ) : null}
              {!catalog.canSubmit ? <output aria-live="polite" className="block text-sm">{catalog.message || 'Loading form configuration…'}</output> : null}
              {message || busy ? <output aria-live="polite" role={hasError ? 'alert' : 'status'} className="block text-sm font-medium">{busy ? 'Saving setting…' : message}</output> : null}
              {failedAttemptKey ? <Button type="button" variant="outline" className="min-h-11"
                onClick={() => {
                  if (!window.confirm('This attempt may already have succeeded. Check the latest history before starting a new attempt, which could duplicate the action. Continue?')) return;
                  clearSessionAttempt(failedAttemptKey);
                  if (catalog.status === 'stale') catalog.refresh();
                  setFailedAttemptKey(null);
                  setMessage('New attempt ready. Review the latest history before submitting again.');
                }}>Start a new attempt</Button> : null}
              <div className="flex min-w-0 flex-wrap items-center gap-2.5 border-t border-[#E4DACA] pt-4">
                <Button type="submit" className="min-h-11 rounded-[10px] bg-[#A8232E] px-5 text-white hover:bg-[#8C1C27]" disabled={!canSave}>{busy ? 'Saving…' : startLater ? 'Schedule change' : 'Save change'}</Button>
                <Button type="button" variant="outline" className="min-h-11 rounded-[10px] border-[#D3C5AD] bg-transparent px-5" onClick={discardChange}>Discard</Button>
                {selected.snapshotOnTransaction ? <p className="ml-auto flex items-start gap-1.5 text-[13px] text-[#46536F]">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Orders already placed keep their saved values.
                </p> : null}
              </div>
            </fieldset> : !pairedFee && !parked ? (
              <SettingPreviewPanel caption="Now" after={false} summary={businessValue(selected.key, valueNow)} value={valueNow} detail={null} />
            ) : null}
            {!parked ? <section aria-label={pairedFee && commissionEditor ? 'Setting version history' : 'History'} className="min-w-0 space-y-2">
              <h3 className="text-[15px] font-semibold">{pairedFee && commissionEditor ? 'Setting version history' : 'History'}</h3>
              {selected.history.length ? selected.history.map(version => (
                <article key={version.id} id={'setting-version-' + version.id} className="min-w-0 scroll-mt-20 space-y-2 border-t border-[#E4DACA] py-2.5 text-sm">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 md:grid-cols-[minmax(6rem,1fr)_minmax(0,3fr)_auto]">
                    <strong className="min-w-0 break-words">{businessValue(selected.key, version.value)}</strong>
                    <p className="col-span-2 row-start-2 min-w-0 whitespace-pre-wrap break-words text-[#46536F] md:col-span-1 md:row-auto">{version.reason}</p>
                    <span className="col-start-2 row-start-1 text-right text-[#675B4E] md:col-start-auto md:row-start-auto">
                      {versionPresentation(version, asOf, true)}{version.effectiveFrom !== null ? <><br />{businessHistoryDate.format(version.effectiveFrom)}</> : null}
                    </span>
                  </div>
                  {allowsEditing && (version.status === 'draft' || version.status === 'pending_approval' || version.status === 'published') ? <details className="text-sm">
                    <summary className="min-h-11 w-fit cursor-pointer py-3 font-semibold">Version {version.version} actions</summary>
                    <div className="flex flex-wrap gap-2">
                      {version.status === 'draft' ? <Button type="button" variant="outline" className="min-h-11"
                        disabled={busy || !catalog.canSubmit || reason.trim().length < 8 || !effectiveFrom || Boolean(valueError) || Boolean(businessSettingPublicationLimitation(selected.key, version.value))}
                        onClick={() => changeVersion(version, 'publish')}>Schedule draft</Button> : null}
                      {version.status === 'pending_approval' ? <>
                        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !catalog.canSubmit || !effectiveFrom} onClick={() => changeVersion(version, 'approve')}>Schedule recorded change</Button>
                        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !catalog.canSubmit} onClick={() => changeVersion(version, 'reject')}>Reject change</Button>
                      </> : null}
                      {version.status === 'published' ? <Button type="button" variant="outline" className="min-h-11" disabled={busy || !catalog.canSubmit} onClick={() => changeVersion(version, 'reverse')}>Create reversal draft</Button> : null}
                    </div>
                  </details> : null}
                </article>
              )) : <p className="break-words border-t border-[#E4DACA] pt-2.5 text-sm text-[#46536F]">
                {selected.effective.source === 'default' ? 'The current value is the default. No versions have been saved.' : 'No saved versions.'}
              </p>}
              {allowsEditing ? <details className="border-t border-[#E4DACA]">
                <summary className="min-h-11 w-fit cursor-pointer py-3 text-sm font-semibold">More change actions</summary>
                <Button type="button" variant="outline" className="min-h-11" disabled={busy || !catalog.canSubmit || reason.trim().length < 8 || Boolean(valueError)} onClick={() => saveSetting('draft')}>Save draft</Button>
                <FormGuide formId="staff.business-settings-manager" />
              </details> : null}
            </section> : null}
          </form>
        </section>
      </div>
    );
  }

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
  businessPage = false,
}: {
  settingKey: BusinessSettingKey;
  value: unknown;
  onChange: (value: unknown) => void;
  businessPage?: boolean;
}) {
  if (settingKey === 'platform_service_fee_policy') {
    const policy = value as { enabled: boolean; amountPaisa: number };
    return <div className="space-y-4">
      <label className="flex min-h-11 items-center gap-3"><input className="size-4 accent-primary" type="checkbox" checked={policy.enabled} onChange={event => onChange({ ...policy, enabled: event.target.checked })} />{businessPage ? 'Turn on customer marketplace fee' : 'Enable Platform service fee'}</label>
      <div className="space-y-2"><Label htmlFor="service-fee-amount">{policy.enabled ? 'Amount per order (NPR)' : 'Saved amount for later (NPR)'}</Label>
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
