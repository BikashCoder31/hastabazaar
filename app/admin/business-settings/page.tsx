import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { BusinessSettingsManager } from '@/components/admin/business-settings-manager';
import { CommonFeePolicy } from '@/components/admin/common-fee-policy';
import { CompanyBankAccounts } from '@/components/admin/company-bank-accounts';
import { AdminPageTitle } from '@/components/admin/page-help';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { requireStaffPage } from '@/lib/auth/staff';
import { getCommonFeeState } from '@/lib/commission/coordinated-policy';
import { businessSettingDefinitions } from '@/lib/configuration/definitions';
import { requireDatabase } from '@/lib/db/d1';
import {
  getBusinessSettingForManagement,
  listBusinessSettingHistory,
} from '@/lib/db/repositories/business-settings';
import { can } from '@/lib/marketplace/permissions';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { getCompanyAccountWorkspace } from '@/lib/payments/company-accounts';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';

export const dynamic = 'force-dynamic';

export default async function BusinessSettingsPage({
  searchParams,
}: { searchParams?: Promise<{ setting?: string; returnTo?: string }> } = {}) {
  const staff = await requireStaffPage('/admin/business-settings', 'business_settings.view');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const bindings = env as unknown as Record<string, string | undefined>;
  const environment = resolveRuntimeEnvironment({
    runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
    nodeEnvironment: bindings.NODE_ENV ?? process.env.NODE_ENV,
    appOrigin: bindings.APP_ORIGIN,
  });
  const isSuperAdmin = staff.role === 'super_admin';
  const canManageFees = can(staff, 'commercial_policy.manage');
  const definitions = businessSettingDefinitions.filter(definition => {
    if (definition.key === 'open_box_service_area_codes') return isSuperAdmin;
    return !definition.affectedSurfaces.some(surface => surface === 'rider');
  });
  const [initialSettings, companyAccounts, commonFee, params] = await Promise.all([
    Promise.all(definitions.map(async (definition) => {
      const parked = definition.key === 'open_box_service_area_codes';
      const [effective, history] = await Promise.all([
        getBusinessSettingForManagement(database, definition.key, now),
        parked ? [] : listBusinessSettingHistory(database, definition.key),
      ]);
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        sensitivity: definition.sensitivity,
        changeControl: definition.changeControl,
        effectiveMode: definition.effectiveMode,
        snapshotOnTransaction: definition.snapshotOnTransaction,
        affectedSurfaces: definition.affectedSurfaces,
        requiredCapability: definition.requiredCapability,
        effective,
        history,
      };
    })),
    isSuperAdmin ? getCompanyAccountWorkspace(database, staff.id, now).catch(() => null) : null,
    canManageFees ? getCommonFeeState(database, now).catch(() => null) : null,
    searchParams,
  ]);
  const returnTo = params?.returnTo;
  const backHref = typeof returnTo === 'string' && /^\/admin(?:\/|\?)/.test(returnTo) && !returnTo.includes('\\') ? returnTo : null;
  return (
    <div className="min-w-0 space-y-5 text-[#14213D]">
      {backHref ? <Link className="section-link" href={backHref}>Back to review queue</Link> : null}
      <AdminPageTitle><h1 className="font-heading text-[1.75rem] font-semibold">Business settings</h1></AdminPageTitle>
      <BusinessSettingsManager
        actorId={staff.id}
        simulationAllowed={Boolean(bindings.HASTABAZAAR_RUNTIME_ENV?.trim()) && environment.simulationAllowed}
        initialSettings={initialSettings}
        asOf={now}
        initialKey={initialSettings.find(item => item.key === params?.setting)?.key}
        businessPage={{
          editable: can(staff, 'business_settings.manage'),
          canManageFees,
          parkedHref: isSuperAdmin ? '/admin/not-in-use' : undefined,
          returnWindowDays: phaseOneMarketplacePolicy.value.returns.generalRequestWindowDays,
        }}
        commissionEditor={commonFee ? (
          <CommonFeePolicy actorId={staff.id} state={commonFee} editable={isSuperAdmin} embedded />
        ) : null}
      />
      <details className="group border-y border-[#E4DACA]">
        <summary className="flex min-h-11 cursor-pointer items-center px-1 text-sm font-semibold">Related settings and records</summary>
        <nav aria-label="Related settings" className="flex flex-wrap gap-x-5 pb-2 text-sm font-semibold">
          {canManageFees ? <>
            <Link href="/admin/commission" className="inline-flex min-h-11 items-center underline">Manage commission rates and earnings</Link>
            <Link href="/admin/fees" className="inline-flex min-h-11 items-center underline">Fees and programs</Link>
          </> : null}
          {isSuperAdmin && canManageFees ? <Link href="/admin/fee-waivers" className="inline-flex min-h-11 items-center underline">Customer marketplace fee waivers</Link> : null}
          {isSuperAdmin ? <Link href="/admin/delivery-rates" className="inline-flex min-h-11 items-center underline">Delivery rates</Link> : null}
        </nav>
        {isSuperAdmin ? <StaffFormHistoryLinks entries={[
          { kind: 'business-settings', label: 'Business setting answers' },
          { kind: 'homepage-hero-settings', label: 'Homepage hero answers' },
          { kind: 'homepage-occasion-settings', label: 'Homepage occasion answers' },
        ]} /> : null}
      </details>
      {isSuperAdmin ? <CompanyBankAccounts workspace={companyAccounts} /> : null}
    </div>
  );
}
