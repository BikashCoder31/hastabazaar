import { env } from 'cloudflare:workers';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function context() {
  const actor = await requireExistingCustomerApi(); const db = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = await db.prepare(`SELECT s.id,s.business_description AS businessDescription,s.product_categories AS productCategories,p.version
    FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id
    WHERE s.user_id=? AND s.status NOT IN ('rejected','suspended') AND p.application_stage NOT IN ('rejected','suspended')`).bind(actor.userId)
    .first<{ id: string; businessDescription: string; productCategories: string; version: number }>();
  return { actor, db, profile };
}
export async function GET() {
  try { const { profile } = await context(); return profile ? reply({ businessDescription: profile.businessDescription ?? '', productCategories: profile.productCategories ?? '', version: profile.version }) : reply({ error: 'Seller application not found.' }, 404); }
  catch (error) { return reply({ error: error instanceof CustomerAuthorizationError ? error.message : 'Product details are unavailable.' }, error instanceof CustomerAuthorizationError ? error.status : 503); }
}
export async function PATCH(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const { actor, db, profile } = await context(); if (!profile) return reply({ error: 'Seller application not found.' }, 404);
    const body = await readBoundedJsonObject(request);
    if (Object.keys(body).some(key => !['businessDescription', 'productCategories', 'version'].includes(key)) || typeof body.businessDescription !== 'string' || body.businessDescription.length > 1500 ||
      typeof body.productCategories !== 'string' || body.productCategories.length > 500 || !Number.isSafeInteger(body.version)) return reply({ error: 'Invalid product description.' }, 400);
    if (profile.version !== body.version) return reply({ error: 'Your dashboard details changed. Reload and review them before saving.' }, 409);
    const guard = crypto.randomUUID();
    await db.batch([
      db.prepare(`UPDATE seller_participation_profiles SET version=version+1,updated_at=? WHERE seller_id=? AND version=?`).bind(Date.now(), profile.id, body.version),
      db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
        WHERE s.id=? AND s.user_id=? AND s.status NOT IN ('rejected','suspended') AND u.status='active') THEN 1 ELSE 0 END`).bind(guard, profile.id, actor.userId),
      db.prepare('UPDATE seller_profiles SET business_description=?,product_categories=?,updated_at=? WHERE id=? AND user_id=?')
        .bind(body.businessDescription.trim(), body.productCategories.trim(), Date.now(), profile.id, actor.userId),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
    ]);
    return reply({ ok: true, version: profile.version + 1 });
  } catch (error) { return reply({ error: error instanceof CustomerAuthorizationError ? error.message : 'Save could not be confirmed. Reload and check before retrying.' }, error instanceof CustomerAuthorizationError ? error.status : 503); }
}
