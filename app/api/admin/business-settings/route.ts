import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import {
  businessSettingDefinitions,
  parseBusinessSettingKey,
} from '@/lib/configuration/definitions';
import { requireDatabase } from '@/lib/db/d1';
import {
  BusinessSettingConflictError,
  createBusinessSettingDraft,
  getEffectiveBusinessSetting,
} from '@/lib/db/repositories/business-settings';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBody(request, 32 * 1024);
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.');
  }
  return value as Record<string, unknown>;
}

export async function GET(): Promise<Response> {
  try {
    await requireStaffApi('business_settings.view');
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const now = Date.now();
    const settings = await Promise.all(
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
        effective: await getEffectiveBusinessSetting(
          database,
          definition.key,
          now,
        ),
      })),
    );
    return json({ settings, generatedAt: now }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Business settings could not be loaded.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }
  try {
    const actor = await requireStaffApi('business_settings.manage');
    const body = await requestBody(request);
    const key = parseBusinessSettingKey(body.key);
    const draft = await createBusinessSettingDraft(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        key,
        value: body.value,
        actorId: actor.id,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestId:
          typeof body.requestId === 'string'
            ? body.requestId
            : crypto.randomUUID(),
        now: Date.now(),
      },
    );
    return json({ draft }, 201);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof BodyTooLargeError) {
      return json({ error: error.message }, 413);
    }
    if (error instanceof BusinessSettingConflictError) {
      return json({ error: error.message }, 409);
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return json({ error: error.message }, 400);
    }
    return json({ error: 'Business setting draft could not be created.' }, 400);
  }
}
