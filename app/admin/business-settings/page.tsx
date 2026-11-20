import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import {CompanyBankAccounts} from '@/components/admin/company-bank-accounts';
import {getCompanyAccountWorkspace} from '@/lib/payments/company-accounts';
import { env } from 'cloudflare:workers';
import Link from 'next/link';

import {
  BusinessSettingsManager,
  type BusinessSettingsAdminItem,
} from '@/components/admin/business-settings-manager';
import { requireStaffPage } from '@/lib/auth/staff';
import { businessSettingDefinitions } from '@/lib/configuration/definitions';
import { requireDatabase } from '@/lib/db/d1';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {
  getBusinessSettingForManagement,
  listBusinessSettingHistory,
} from '@/lib/db/repositories/business-settings';

export const dynamic = 'force-dynamic';

export default async function BusinessSettingsPage({searchParams}: {searchParams?: Promise<{setting?: string;returnTo?:string}>} = {}) {
  const staff = await requireStaffPage('/admin/business-settings', 'business_settings.view');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const bindings=env as unknown as Record<string,string|undefined>,environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:bindings.NODE_ENV??process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
  const companyAccounts=staff.role==='super_admin'?await getCompanyAccountWorkspace(database,staff.id,now).catch(()=>null):null;
  const initialSettings = await Promise.all(
    businessSettingDefinitions.filter(definition => staff.role === 'super_admin' || !definition.affectedSurfaces.some(surface => surface === 'rider')).map(async (definition) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      sensitivity: definition.sensitivity,
      changeControl: definition.changeControl,
      effectiveMode: definition.effectiveMode,
      snapshotOnTransaction: definition.snapshotOnTransaction,
      affectedSurfaces: definition.affectedSurfaces,
      requiredCapability: definition.requiredCapability,
      effective: await getBusinessSettingForManagement(database, definition.key, now),
      history: await listBusinessSettingHistory(database, definition.key),
    })),
  );

  const params=await searchParams;
  const backHref=params?.returnTo&&/^\/admin(?:\/|\?)/.test(params.returnTo)&&!params.returnTo.includes('\\')?params.returnTo:null;
  const requestedKey = params?.setting;
  const initialKey = initialSettings.find(item=>item.key===requestedKey)?.key;
  return (
    <div className="space-y-6">
      {backHref?<Link className="section-link" href={backHref}>Back to review queue</Link>:null}
      <div>
        <p className="eyebrow">Super Admin · Business configuration</p>
        <h1 className="section-title">Business Settings</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Review, preview, schedule, and audit routine business configuration
          without editing code. Save changes directly or schedule a future
          effective date. Financial and contractual notice periods still apply.
        </p>
      </div>
      <Link href="/admin/commission" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Manage commission rates and earnings</Link>
      {staff.role==='super_admin'?<CompanyBankAccounts workspace={companyAccounts}/>:null}
      <StaffFormHistoryLinks entries={[{kind:'business-settings',label:'Business setting answers'},
        {kind:'homepage-hero-settings',label:'Homepage hero answers'},{kind:'homepage-occasion-settings',label:'Homepage occasion answers'}]} />
      <BusinessSettingsManager
        actorId={staff.id}
        simulationAllowed={Boolean(bindings.HASTABAZAAR_RUNTIME_ENV?.trim())&&environment.simulationAllowed}
        initialSettings={initialSettings as readonly BusinessSettingsAdminItem[]}
        asOf={now}
        initialKey={initialKey}
      />
    </div>
  );
}
