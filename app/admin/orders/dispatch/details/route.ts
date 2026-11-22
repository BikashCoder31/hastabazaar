import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { courierBookingCsv, type CourierParcelSelection } from '../courier-details';
import { CourierSelectionChanged, readCourierBookingDetails } from '../read-courier-details';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const reject = (error: string, status: number) => Response.json({ error }, { status, headers });
const validId = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 191;

class ExportPermissionError extends StaffAuthorizationError {
  constructor(message: string) { super(message, 403); }
}

function validSelection(value: unknown): value is CourierParcelSelection {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return validId(row.orderId) && validId(row.sellerId) &&
    ((row.jobId === null && row.version === null) ||
      (validId(row.jobId) && typeof row.version === 'number' && Number.isSafeInteger(row.version) && row.version >= 0));
}

export async function POST(request: Request) {
  const intendedActorId = request.headers.get(ACTOR_INTENT_HEADER);
  if (!request.headers.has('Origin') || !isTrustedMutationRequest(request))
    return reject('Cross-site request rejected.', 403);
  if (!intendedActorId) return reject('Refresh the current Dispatch page.', 403);
  try {
    const staff = await requireStaffApi('order.manage', { intendedActorId });
    const { mode, parcels } = await readBoundedJsonObject(request);
    if ((mode !== 'details' && mode !== 'sheet') || !Array.isArray(parcels) || !parcels.length ||
      !parcels.every(validSelection) || new Set(parcels.map(parcel => JSON.stringify([parcel.orderId, parcel.sellerId]))).size !== parcels.length)
      return reject('Select the parcels in Dispatch and try again.', 400);
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const details = await readCourierBookingDetails(db, parcels);
    if (mode === 'details') return Response.json({ parcels: details }, { headers });
    const authority = await staffMutationGuard(db, staff.id, 'order.manage', ExportPermissionError, staff.role);
    await db.batch([
      ...authority.statements,
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
        VALUES(?,?,'dispatch.courier_sheet.downloaded','dispatch',?,'Downloaded selected parcels for an external courier booking.',?,?)`)
        .bind(crypto.randomUUID(), staff.id, parcels[0].orderId,
          JSON.stringify({ parcels: details.map((parcel, index) => ({
            order: parcel.orderNumber, sellerId: parcels[index].sellerId,
          })) }), Date.now()),
    ]);
    return new Response(courierBookingCsv(details), { headers: {
      ...headers, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hastabazaar-courier-sheet.csv"',
    } });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return reject(error.message, error.status);
    if (error instanceof CourierSelectionChanged) return reject(error.message, 409);
    if (error instanceof BodyTooLargeError) return reject(error.message, 413);
    if (error instanceof SyntaxError) return reject(error.message, 400);
    return reject('Could not load the courier details. Try again.', 500);
  }
}
