import { env } from 'cloudflare:workers';
import type { CourierParcelSelection } from '@/app/admin/orders/dispatch/courier-details';
import { CourierSelectionChanged } from '@/app/admin/orders/dispatch/read-courier-details';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { bookWithNcm, getNcmBookingDraft, NcmBookingError, recoverNcmBooking } from '@/lib/delivery/ncm-booking';
import { getNcmLabel, sendNcmInstruction } from '@/lib/delivery/ncm-booked-actions';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormValidationError } from '@/lib/forms/validation';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { ParcelConflictError } from '@/lib/operations/parcels';
import { NcmApiError } from '@/lib/shipping/nepal-can-move';

const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers:{'Cache-Control':'private, no-store',Vary:'Cookie'} });
const id = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 191;
const formId = 'staff.parcel-control';

function selection(value: unknown): value is CourierParcelSelection {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string,unknown>;
  return id(row.orderId) && id(row.sellerId) && (row.jobId === null || id(row.jobId)) &&
    (row.version === null || (typeof row.version === 'number' && Number.isSafeInteger(row.version) && row.version >= 0 && id(row.jobId)));
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({error:'Cross-site request rejected.'},403);
  try {
    const staff = await requireExistingStaffIntentApi(request,'order.manage');
    const body = await readBoundedJsonObject(request);
    const {action, partnerId, destinationBranch, reviewKey, requestId, trackingNumber, note} = body;
    const target = body.selection;
    if (!selection(target) || !id(partnerId)) return reply({error:'Choose a parcel and courier in Dispatch.'},400);
    const db = requireDatabase(env as unknown as {DB?:D1Database});
    if (action === 'prepare') {
      if (destinationBranch !== undefined && typeof destinationBranch !== 'string') return reply({error:'Choose a destination branch.'},400);
      return reply({ok:true,draft:await getNcmBookingDraft(db,env,target,partnerId,destinationBranch)});
    }
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
      return reply({error:'Refresh Dispatch and check the details again.'},400);
    if (action === 'retry') {
      await recoverNcmBooking(db,env,staff.id,{selection:target,partnerId,requestId});
      return reply({ok:true});
    }
    if ((action === 'note' || action === 'return') && typeof note === 'string' && target.jobId) {
      await sendNcmInstruction(db,env,staff.id,{...target,jobId:target.jobId,partnerId,requestId,note,action});
      return reply({ok:true});
    }
    if (action !== 'book' && action !== 'found') return reply({error:'Choose an NCM action.'},400);
    const validated = await validateSellerFormSubmission(db,formId,body.formVersion,body.customAnswers,requestId);
    const form = {requestId,versionId:validated.versionId,answers:validated.answers};
    let tracking: string | null;
    if (action === 'book') {
      if (typeof destinationBranch !== 'string' || !destinationBranch || typeof reviewKey !== 'string')
        return reply({error:'Check the NCM delivery details before booking.'},400);
      tracking = await bookWithNcm(db,env,staff.id,{selection:target,partnerId,destinationBranch,reviewKey,requestId,form});
    } else {
      if (typeof trackingNumber !== 'string') return reply({error:'Enter the NCM order number.'},400);
      tracking = await recoverNcmBooking(db,env,staff.id,{selection:target,partnerId,requestId,trackingNumber,form});
    }
    const job = await db.prepare("SELECT id FROM shipping_jobs WHERE order_id=? AND seller_id=? AND direction='outbound'")
      .bind(target.orderId,target.sellerId).first<{id:string}>();
    await Promise.all([
      job ? getNcmLabel(db,env,job.id).catch(() => null) : null,
      sendPendingOrderUpdates({orderId:target.orderId}).catch(() => null),
    ]);
    return reply({ok:true,trackingNumber:tracking});
  } catch (error) {
    if (error instanceof NcmBookingError) return reply({error:error.message,state:error.state,fields:error.fields},error.status);
    if (error instanceof StaffAuthorizationError) return reply({error:error.message},error.status);
    if (error instanceof CourierSelectionChanged || error instanceof ParcelConflictError) return reply({error:error.message},409);
    if (error instanceof NcmApiError) return reply({error:error.message,fields:error.fields},502);
    if (error instanceof BodyTooLargeError) return reply({error:'The request is too large.'},413);
    if (error instanceof SyntaxError) return reply({error:'Check the NCM details and try again.'},400);
    if (error instanceof FormValidationError) return reply({error:error.message,fieldId:error.fieldId},400);
    if (error instanceof FormRuntimeError) return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
    return reply({error:'The NCM request could not be confirmed. Refresh Dispatch before trying again.',code:'outcome_unconfirmed'},409);
  }
}
