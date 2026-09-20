import { env } from 'cloudflare:workers';

import { ProgramManagement } from '@/components/admin/program-management';
import { requireStaffPage } from '@/lib/auth/staff';
import { managedMakerCapabilities } from '@/lib/configuration/capabilities';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';

export const dynamic = 'force-dynamic';

export default async function ProgramsPage() {
  await requireStaffPage('/admin/programs', 'business_settings.view');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const [programMode, activeModel] = await Promise.all([
    getEffectiveBusinessSetting(database, 'managed_maker_program_mode', now),
    getEffectiveBusinessSetting(database, 'managed_maker_active_model', now),
  ]);

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
      <ProgramManagement
        programMode={programMode.value}
        activeModel={activeModel.value}
        capabilities={managedMakerCapabilities}
      />
    </div>
  );
}
