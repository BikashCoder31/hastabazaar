import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import type { FormAudience } from '@/lib/forms/types';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const missing = () => json({ error: 'Form not found.' }, 404);

async function audienceAllowed(db: D1Database, audience: FormAudience): Promise<boolean> {
  if (audience === 'public') return true;
  const identity = await getAuthenticatedUser();
  if (!identity) return false;
  const rows = await db.prepare(`SELECT r.role FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.auth_subject = ? AND u.status = 'active'`).bind(identity.userId).all<{ role: string }>();
  const roles = new Set(rows.results.map((row) => row.role));
  if (audience === 'super_admin') return roles.has('super_admin');
  if (audience === 'staff') return roles.has('admin') || roles.has('super_admin');
  if (audience === 'seller') return roles.has('seller');
  if (audience === 'rider') return roles.has('rider');
  return roles.has('customer');
}

export async function GET(_request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  const { formId } = await context.params;
  const definition = Object.hasOwn(FORM_REGISTRY, formId) ? FORM_REGISTRY[formId] : null;
  if (!definition) return missing();
  try {
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    if (!await audienceAllowed(db, definition.audience)) return missing();
    const row = await db.prepare(`SELECT 1 AS found FROM form_config_versions
      WHERE form_id = ? AND status = 'published' LIMIT 1`).bind(formId).first<{ found: number }>();
    if (!row) return missing();
    const config = await resolvePublishedForm(db, formId);
    return json({ config }, 200);
  } catch { return json({ error: 'Form configuration is unavailable.' }, 503); }
}
