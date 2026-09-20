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
    const raw = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 16 * 1024))) as Record<string, unknown>;
    if (!raw || Array.isArray(raw)) return reply({ error: 'Invalid profile request.' }, 400);
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
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof SellerParticipationConflictError) return reply({ error: error.message }, 409);
    return reply({ error: error instanceof Error ? error.message : 'The maker profile could not be saved.' }, 400);
  }
}

