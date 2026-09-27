import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  getSellerParticipationForUser,
  SellerParticipationConflictError,
  updateSellerParticipationPublicProfile,
} from '@/lib/db/repositories/seller-applications';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { parseCraftExperience, parseMakerSocialLinks } from '@/lib/sellers/participation';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const customer = await requireCustomerApi();
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const participation = await getSellerParticipationForUser(database, customer.userId);
    if (!participation) return reply({ error: 'Seller or maker application not found.' }, 404);
    const raw = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 131_072))) as Record<string, unknown>;
    if (!raw || Array.isArray(raw)) return reply({ error: 'Invalid profile request.' }, 400);
    const allowed = new Set(['publicName', 'publicCity', 'experienceCraft', 'experienceBand',
      'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl',
      'expectedVersion', 'requestId', 'formVersion', 'customAnswers']);
    if (Object.keys(raw).some((key) => !allowed.has(key)) ||
      typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.requestId) ||
      !Number.isSafeInteger(raw.formVersion) || !Array.isArray(raw.customAnswers))
      return reply({ error: 'Invalid maker profile form request.' }, 400);
    const form = await validateSellerFormSubmission(database, 'seller.maker-profile', raw.formVersion, raw.customAnswers, raw.requestId);
    const text = (key: string) => typeof raw[key] === 'string' ? raw[key] as string : '';
    const craftExperience = parseCraftExperience(text('experienceCraft'), text('experienceBand'));
    const socialLinks = parseMakerSocialLinks({
      facebook: text('facebookUrl'),
      instagram: text('instagramUrl'),
      linkedin: text('linkedinUrl'),
      tiktok: text('tiktokUrl'),
      x: text('xUrl'),
      youtube: text('youtubeUrl'),
    });
    await updateSellerParticipationPublicProfile(database, {
      sellerId: participation.sellerId,
      actorId: customer.userId,
      expectedVersion: Number(raw.expectedVersion),
      publicName: text('publicName'),
      publicCity: text('publicCity'),
      craftExperience,
      socialLinks,
      requestId: text('requestId'),
      now: Date.now(),
      form: { requestId: text('requestId'), versionId: form.versionId, answers: form.answers },
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof SellerParticipationConflictError) return reply({ error: error.message }, 409);
    if (error instanceof FormRequestConflictError) return reply({ error: error.message, code: 'request_id_conflict' }, 409);
    if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return reply({ error: error.message, fieldId: error.fieldId }, 400);
    return reply({ error: error instanceof Error ? error.message : 'The maker profile could not be saved.' }, 400);
  }
}
