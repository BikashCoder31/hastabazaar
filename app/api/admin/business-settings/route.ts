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
  getBusinessSettingForManagement,
  saveBusinessSettingChange,
  validateBusinessSettingForm,
} from '@/lib/db/repositories/business-settings';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  // 128 KiB answer snapshots plus the original domain budget and JSON overhead.
  const bytes = await readBoundedBody(request, 256 * 1024);
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.');
  }
  // Custom answers have their own validator/storage bound; domain data retains
  // the pre-catalog request budget.
  const { customAnswers: _customAnswers, ...domain } = value as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(domain)).length > 32 * 1024) throw new BodyTooLargeError();
  return value as Record<string, unknown>;
}

export async function GET(): Promise<Response> {
  try {
    const staff = await requireStaffApi('business_settings.view');
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const now = Date.now();
    const settings = await Promise.all(
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
        effective: await getBusinessSettingForManagement(
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
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const form = await validateBusinessSettingForm(database, key, body, requestId);
    if (body.action === 'save') {
      if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0)
        throw new RangeError('Expected setting version must be a non-negative integer.');
      if (body.effectiveFrom !== null && (!Number.isSafeInteger(body.effectiveFrom) || Number(body.effectiveFrom) < 0))
        throw new RangeError('Select a valid effective date.');
      const bindings = env as unknown as Record<string, string | undefined>;
      const runtime = resolveRuntimeEnvironment({ runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
        nodeEnvironment: bindings.NODE_ENV, appOrigin: bindings.APP_ORIGIN });
      const version = await saveBusinessSettingChange(database, { key, value: body.value,
        actorId: actor.id, reason: typeof body.reason === 'string' ? body.reason : '', requestId,
        now: Date.now(), effectiveFrom: body.effectiveFrom === null ? null : Number(body.effectiveFrom),
        expectedVersion: Number(body.expectedVersion), simulationAllowed: runtime.simulationAllowed, form });
      return json({ ok: true, action: 'save', version }, 201);
    }
    if (body.action !== undefined && body.action !== 'draft')
      throw new RangeError('Select a valid business-setting action.');
    const draft = await createBusinessSettingDraft(
      database,
      {
        key,
        value: body.value,
        actorId: actor.id,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestId,
        now: Date.now(),
        form,
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
    if (error instanceof FormRuntimeError) {
      return json({ error: error.message, code: error.code }, error.retryable ? 503 : 409);
    }
    if (error instanceof FormValidationError) {
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return json({ error: error.message }, 400);
    }
    return json({ error: 'Business setting draft could not be created.' }, 400);
  }
}
