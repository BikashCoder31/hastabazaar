import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  CatalogManagementConflictError,
  saveTaxonomy,
} from '@/lib/db/repositories/catalog-admin';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('catalog.manage');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (
      !body ||
      typeof body.kind !== 'string' ||
      !['category', 'occasion'].includes(body.kind) ||
      typeof body.idempotencyKey !== 'string'
    )
      return Response.json(
        { error: 'Valid taxonomy and idempotency key are required.' },
        { status: 400 },
      );
    const id = await saveTaxonomy(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        kind: body.kind as 'category' | 'occasion',
        id: typeof body.id === 'string' && body.id ? body.id : undefined,
        actorId: staff.id,
        input: {
          slug: typeof body.slug === 'string' ? body.slug : '',
          nameEn: typeof body.nameEn === 'string' ? body.nameEn : '',
          nameNe:
            typeof body.nameNe === 'string' && body.nameNe.trim()
              ? body.nameNe
              : typeof body.nameEn === 'string'
                ? body.nameEn
                : '',
          isActive: Boolean(body.isActive),
          sortOrder: Number(body.sortOrder),
        },
        requestId: body.idempotencyKey,
        now: Date.now(),
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CatalogManagementConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Catalogue taxonomy could not be saved.' },
      { status: 500 },
    );
  }
}
