import { env } from 'cloudflare:workers';

import {
  BusinessSettingsManager,
  type BusinessSettingsAdminItem,
} from '@/components/admin/business-settings-manager';
import { requireStaffPage } from '@/lib/auth/staff';
import { businessSettingDefinitions } from '@/lib/configuration/definitions';
import { requireDatabase } from '@/lib/db/d1';
import {
  getEffectiveBusinessSetting,
  listBusinessSettingHistory,
} from '@/lib/db/repositories/business-settings';

export const dynamic = 'force-dynamic';

export default async function BusinessSettingsPage() {
  await requireStaffPage('/admin/business-settings', 'business_settings.view');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const initialSettings = await Promise.all(
    businessSettingDefinitions.map(async (definition) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      sensitivity: definition.sensitivity,
      changeControl: definition.changeControl,
      effectiveMode: definition.effectiveMode,
      snapshotOnTransaction: definition.snapshotOnTransaction,
      affectedSurfaces: definition.affectedSurfaces,
      requiredCapability: definition.requiredCapability,
      effective: await getEffectiveBusinessSetting(database, definition.key, now),
      history: await listBusinessSettingHistory(database, definition.key),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Super Admin · Business configuration</p>
        <h1 className="section-title">Business Settings</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Review, preview, schedule, and audit routine business configuration
          without editing code. Financial, contractual, and sensitive changes
          require a different Super Admin to approve them.
        </p>
      </div>
      <BusinessSettingsManager
        initialSettings={initialSettings as readonly BusinessSettingsAdminItem[]}
        asOf={now}
      />
    </div>
  );
}
