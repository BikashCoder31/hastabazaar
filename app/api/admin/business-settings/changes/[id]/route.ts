import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  approveBusinessSettingChange,
  BusinessSettingConflictError,
  createBusinessSettingReversalDraft,
  getBusinessSettingVersionById,
  publishBusinessSettingDraft,
  rejectBusinessSettingChange,
  submitBusinessSettingDraft,
  validateBusinessSettingForm,
} from '@/lib/db/repositories/business-settings';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { assertHomepageHeroMediaReady } from '@/lib/db/repositories/homepage-hero';
import {
  assertHomepageHeroPublicationReady,
  type HomepageHeroSlides,
} from '@/lib/homepage/hero-slides';
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
  if (new TextEncoder().encode(JSON.stringify(domain)).length > 16 * 1024) throw new BodyTooLargeError();
  return value as Record<string, unknown>;
}

function requiredRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new RangeError('Expected revision must be a positive integer.');
  }
  return Number(value);
}

function requiredEffectiveFrom(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new RangeError('Select a valid effective date.');
  }
  return Number(value);
}

async function assertHomepageHeroVersionReady(
  database: D1Database,
  id: string,
): Promise<void> {
  const version = await getBusinessSettingVersionById(database, id);
  if (!version || version.key !== 'homepage_hero_slides') return;
  const slides = assertHomepageHeroPublicationReady(
    version.value as HomepageHeroSlides,
  );
  await assertHomepageHeroMediaReady(database, slides);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // A status/error alone cannot prove rollback once a domain mutation was invoked.
  let mutationInvoked = false;
  const errorJson = (body: Record<string, unknown>, status: number) =>
    json({ ...body, phase: mutationInvoked ? 'outcome_unconfirmed' : 'rejected_before_write' }, status);
  if (!isTrustedMutationRequest(request)) {
    return errorJson({ error: 'Cross-site requests are not allowed.' }, 403);
  }
  try {
    const intentActor=await requireStaffApi('business_settings.manage').catch(error=>{if(error instanceof StaffAuthorizationError&&error.status===403)return requireStaffApi('business_settings.approve');throw error;});
    if(hasActorIntentMismatch(request,intentActor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this settings view.',403);
    const body = await requestBody(request);
    const action = body.action;
    const { id } = await context.params;
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const now = Date.now();
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const runtimeBindings = env as unknown as Record<string, string | undefined>;
    const runtime = resolveRuntimeEnvironment({
      runtimeEnvironment: runtimeBindings.HASTABAZAAR_RUNTIME_ENV,
      nodeEnvironment: runtimeBindings.NODE_ENV,
      appOrigin: runtimeBindings.APP_ORIGIN,
    });
    const actor = action === 'approve' || action === 'reject'
      ? await requireStaffApi('business_settings.approve')
      : await requireStaffApi('business_settings.manage');
    if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this settings view.',403);
    const version = await getBusinessSettingVersionById(database, id);
    if (!version) throw new BusinessSettingConflictError('Business setting version was not found.');
    if (version.key === 'independent_seller_commission_bps' || version.key === 'managed_sale_linked_platform_retention_bps')
      return errorJson({ error: 'This fee source requires the paired Commission workflow. Preserve the recorded version for source review.', href: '/admin/commission#rate-management' }, 409);

    if (action === 'approve' || action === 'reject') {
      const form = await validateBusinessSettingForm(database, version.key, body, requestId);
      const expectedRevision = requiredRevision(body.expectedRevision);
      if (action === 'approve') {
        await assertHomepageHeroVersionReady(database, id);
        const effectiveFrom = requiredEffectiveFrom(body.effectiveFrom);
        mutationInvoked = true;
        await approveBusinessSettingChange(database, {
          id,
          actorId: actor.id,
          expectedRevision,
          effectiveFrom,
          reason,
          requestId,
          now,
          simulationAllowed: runtime.simulationAllowed,
          form,
        });
      } else {
        mutationInvoked = true;
        await rejectBusinessSettingChange(database, {
          id,
          actorId: actor.id,
          expectedRevision,
          reason,
          requestId,
          now,
          form,
        });
      }
      return json({ ok: true, action }, 200);
    }

    const form = await validateBusinessSettingForm(database, version.key, body, requestId);
    if (action === 'submit') {
      const expectedRevision = requiredRevision(body.expectedRevision);
      mutationInvoked = true;
      await submitBusinessSettingDraft(database, {
        id,
        actorId: actor.id,
        expectedRevision,
        reason,
        requestId,
        now,
        form,
      });
      return json({ ok: true, action }, 200);
    }
    if (action === 'publish') {
      await assertHomepageHeroVersionReady(database, id);
      const expectedRevision = requiredRevision(body.expectedRevision);
      const effectiveFrom = requiredEffectiveFrom(body.effectiveFrom);
      mutationInvoked = true;
      await publishBusinessSettingDraft(database, {
        id,
        actorId: actor.id,
        expectedRevision,
        effectiveFrom,
        reason,
        requestId,
        now,
        simulationAllowed: runtime.simulationAllowed,
        form,
      });
      return json({ ok: true, action }, 200);
    }
    if (action === 'reverse') {
      mutationInvoked = true;
      const draft = await createBusinessSettingReversalDraft(database, {
        sourceVersionId: id,
        actorId: actor.id,
        reason,
        requestId,
        now,
        form,
      });
      return json({ draft, action }, 201);
    }
    return errorJson({ error: 'Select a valid business-setting action.' }, 400);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return errorJson({ error: error.message,code:mutationInvoked?'outcome_unconfirmed':'access_denied_before_write' }, error.status);
    }
    if (error instanceof BodyTooLargeError) {
      return errorJson({ error: error.message }, 413);
    }
    if (error instanceof BusinessSettingConflictError) {
      return errorJson({ error: error.message }, 409);
    }
    if (error instanceof FormRuntimeError) {
      return errorJson({ error: error.message, code: error.code }, error.retryable ? 503 : 409);
    }
    if (error instanceof FormValidationError) {
      return errorJson({ error: error.message, fieldId: error.fieldId }, 400);
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return errorJson({ error: error.message }, 400);
    }
    return errorJson({ error: 'Business setting action could not be completed.' }, 400);
  }
}
