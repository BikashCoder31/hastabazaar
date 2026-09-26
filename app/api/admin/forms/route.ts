import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { FormCatalogConflictError, FormCatalogStoredConfigError } from '@/lib/db/repositories/form-catalog';

export class CatalogClientInputError extends Error {
  constructor(message = 'Invalid request.') { super(message); this.name = 'CatalogClientInputError'; }
}

export const dynamic = 'force-dynamic';
export const catalogJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function catalogAdmin(): Promise<{ actorId: string; db: D1Database }> {
  const staff = await requireStaffApi('business_settings.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const active = await db.prepare(`SELECT 1 AS allowed FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = ? AND u.status = 'active' AND r.role = 'super_admin' LIMIT 1`)
    .bind(staff.id).first<{ allowed: number }>();
  if (staff.role !== 'super_admin' || !active) throw new StaffAuthorizationError('Staff access is not permitted.', 403);
  return { actorId: staff.id, db };
}

export async function catalogBody(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBody(request, 70 * 1024);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new CatalogClientInputError(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new CatalogClientInputError();
  return parsed as Record<string, unknown>;
}

export function catalogMutationInput(body: Record<string, unknown>): {
  requestId: string; reason: string; expectedPublishedVersion: number
} {
  const { requestId, reason, expectedPublishedVersion } = body;
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 191 ||
      typeof reason !== 'string' || !reason.trim() || reason.length > 2000 ||
      !Number.isSafeInteger(expectedPublishedVersion) || (expectedPublishedVersion as number) < 0) {
    throw new CatalogClientInputError('Request ID, reason, and current published version are required.');
  }
  return { requestId: requestId.trim(), reason: reason.trim(), expectedPublishedVersion: expectedPublishedVersion as number };
}

export function catalogFormId(formId: string): boolean { return Object.hasOwn(FORM_REGISTRY, formId); }
export function catalogNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new CatalogClientInputError('A positive version is required.');
  return value as number;
}
export function catalogText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 191) throw new CatalogClientInputError('A valid draft ID is required.');
  return value.trim();
}

export function catalogError(error: unknown): Response {
  if (error instanceof StaffAuthorizationError) return catalogJson({ error: error.message }, error.status);
  if (error instanceof BodyTooLargeError) return catalogJson({ error: error.message }, 413);
  if (error instanceof CatalogClientInputError) return catalogJson({ error: error.message }, 400);
  if (error instanceof FormCatalogStoredConfigError) {
    return catalogJson({ error: 'Stored form configuration is unavailable.' }, 503);
  }
  if (error instanceof FormCatalogConflictError) return catalogJson({ error: error.message }, 409);
  return catalogJson({ error: 'Form catalog is unavailable.' }, 503);
}

export function catalogMutationAllowed(request: Request): Response | null {
  return isTrustedMutationRequest(request) ? null : catalogJson({ error: 'Cross-site requests are not allowed.' }, 403);
}

export async function GET(): Promise<Response> {
  try {
    const { db } = await catalogAdmin();
    const rows = await db.prepare(`SELECT form_id AS formId,
      MAX(CASE WHEN status = 'published' THEN version ELSE 0 END) AS publishedVersion,
      MAX(CASE WHEN status = 'draft' THEN version ELSE 0 END) AS draftVersion,
      MAX(updated_at) AS lastChangedAt
      FROM form_config_versions GROUP BY form_id`).all<{
        formId: string; publishedVersion: number; draftVersion: number; lastChangedAt: number
      }>();
    const byId = new Map(rows.results.map((row) => [row.formId, row]));
    return catalogJson({ forms: Object.values(FORM_REGISTRY).map((definition) => ({
      definition,
      publishedVersion: byId.get(definition.id)?.publishedVersion ?? 0,
      draftVersion: byId.get(definition.id)?.draftVersion ?? 0,
      lastChangedAt: byId.get(definition.id)?.lastChangedAt ?? null,
    })) });
  } catch (error) { return catalogError(error); }
}
