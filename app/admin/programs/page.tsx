import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';

import { ProgramManagement } from '@/components/admin/program-management';
import { requireStaffPage } from '@/lib/auth/staff';
import { managedMakerCapabilities } from '@/lib/configuration/capabilities';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting, listBusinessSettingHistory } from '@/lib/db/repositories/business-settings';
import { businessSettingDefinitions } from '@/lib/configuration/definitions';
import { BusinessSettingsManager, type BusinessSettingsAdminItem } from '@/components/admin/business-settings-manager';
import { getProgramManagementWorkspace } from '@/lib/managed-commerce/program-management';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';
import { ProgramReadinessChecklist } from '@/components/admin/program-readiness-checklist';
import { ManagedSettlementControls } from '@/components/admin/managed-settlement-controls';
import { getManagedFinanceWorkspace, type ManagedFinanceWorkspace } from '@/lib/managed-commerce/finance-workspace';

export const dynamic = 'force-dynamic';

export default async function ProgramsPage({searchParams = Promise.resolve({})}: {searchParams?:Promise<{financeAfter?:string}>} = {}) {
  const staff = await requireStaffPage('/admin/programs', 'business_settings.view');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const settingKeys = ['managed_maker_company_account', 'managed_maker_program_mode', 'managed_maker_active_model', 'managed_sale_linked_platform_retention_bps', 'managed_adjustment_reason_codes'];
  const bindings = env as unknown as Record<string, string | undefined>;
  const environment = resolveRuntimeEnvironment({ runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
    nodeEnvironment: bindings.NODE_ENV ?? process.env.NODE_ENV, appOrigin: bindings.APP_ORIGIN });
  const [programMode, activeModel, retention, initialSettings] = await Promise.all([
    getEffectiveBusinessSetting(database, 'managed_maker_program_mode', now),
    getEffectiveBusinessSetting(database, 'managed_maker_active_model', now),
    getEffectiveBusinessSetting(database, 'managed_sale_linked_platform_retention_bps', now),
    Promise.all(businessSettingDefinitions.filter((definition) => settingKeys.includes(definition.key)).map(async (definition) => ({
      key: definition.key, label: definition.label, description: definition.description,
      sensitivity: definition.sensitivity, changeControl: definition.changeControl,
      effectiveMode: definition.effectiveMode, snapshotOnTransaction: definition.snapshotOnTransaction,
      affectedSurfaces: definition.affectedSurfaces, requiredCapability: definition.requiredCapability,
      effective: await getEffectiveBusinessSetting(database, definition.key, now),
      history: await listBusinessSettingHistory(database, definition.key),
    }))),
  ]);
  const workspace = await getProgramManagementWorkspace(database, { actorId: staff.id,
    environment, programMode: programMode.value, activeModel: activeModel.value });
  const params = await searchParams;
  let finance: ManagedFinanceWorkspace;
  try { finance = await getManagedFinanceWorkspace(database,{actorId:staff.id,now,after:params.financeAfter}); }
  catch { finance = {makers:[],nextCursor:null,error:'Maker payment details are unavailable. Reload the page or review local readiness before taking action.'}; }
  const company = initialSettings.find(item=>item.key === 'managed_maker_company_account')?.effective.value as {entityReference?:string;storeName?:string} | undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Super Admin · Program controls</p>
        <h1 className="section-title">Program Management</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          See what applicants can do now, what each commercial model still
          requires, and whether program, maker, and product activation conditions
          are independently ready.
        </p>
      </div>
      <ProgramReadinessChecklist companyReady={Boolean(company?.entityReference && company.storeName)}
        simulation={Boolean(bindings.HASTABAZAAR_RUNTIME_ENV?.trim()) && environment.simulationAllowed}
        activation={programMode.value === 'activation_enabled' && Boolean(activeModel.value)} makers={workspace.totals.makers}
        approvedProducts={workspace.totals.approvedProducts} publishedProducts={workspace.totals.publishedProducts}
        payablePaisa={finance.error ? 0 : finance.makers.reduce((total,maker)=>total+maker.summary.payablePaisa,0)} />
      <ProgramManagement
        programMode={programMode.value}
        activeModel={activeModel.value}
        capabilities={managedMakerCapabilities}
        environment={environment}
        environmentVerified={Boolean(bindings.HASTABAZAAR_RUNTIME_ENV?.trim())}
        platformRetentionBps={retention.value}
        workspace={workspace}
      />
      <ManagedSettlementControls ownerId={staff.id} workspace={finance} asOf={now}
        simulationAllowed={Boolean(bindings.HASTABAZAAR_RUNTIME_ENV?.trim()) && environment.simulationAllowed} />
      <section id="program-settings" className="min-w-0 space-y-4 scroll-mt-6">
        <div><h2 className="font-heading text-2xl">Program settings</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Review current values, save or schedule a change, and inspect its history. Model and activation changes follow the environment’s existing readiness checks.</p></div>
        <BusinessSettingsManager initialSettings={initialSettings as readonly BusinessSettingsAdminItem[]} asOf={now} />
      </section>
    </div>
  );
}
