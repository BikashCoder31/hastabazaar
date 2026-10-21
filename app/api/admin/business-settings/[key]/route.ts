import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import {
  getBusinessSettingDefinition,
  parseBusinessSettingKey,
} from '@/lib/configuration/definitions';
import { requireDatabase } from '@/lib/db/d1';
import {
  getBusinessSettingForManagement,
  listBusinessSettingHistory,
} from '@/lib/db/repositories/business-settings';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  try {
    const staff = await requireStaffApi('business_settings.view');
    const key = parseBusinessSettingKey((await context.params).key);
    const definition = getBusinessSettingDefinition(key);
    if (staff.role !== 'super_admin' && definition.affectedSurfaces.includes('rider')) return json({ error: 'Business setting not found.' }, 404);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const now = Date.now();
    const [effective, history] = await Promise.all([
      getBusinessSettingForManagement(database, key, now),
      listBusinessSettingHistory(database, key),
    ]);
    return json(
      {
        definition: {
          key: definition.key,
          label: definition.label,
          description: definition.description,
          sensitivity: definition.sensitivity,
          changeControl: definition.changeControl,
          effectiveMode: definition.effectiveMode,
          snapshotOnTransaction: definition.snapshotOnTransaction,
          affectedSurfaces: definition.affectedSurfaces,
          requiredCapability: definition.requiredCapability,
        },
        effective,
        history,
        generatedAt: now,
      },
      200,
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof Error && /unknown business setting/i.test(error.message)) {
      return json({ error: error.message }, 404);
    }
    return json({ error: 'Business setting history could not be loaded.' }, 500);
  }
}
