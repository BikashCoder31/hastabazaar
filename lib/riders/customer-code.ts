import { issueRiderOtp, RiderError } from './repository';
export interface RiderCodeOwner {
  orderNumber: string;
  customerId: string | null;
  receiptTokenHash: string | null;
}
/** A protected receipt is required even for eligibility discovery; a parcel ID cannot cross order boundaries. */
export async function customerRiderCodeJobs(db: D1Database, o: RiderCodeOwner) {
  return (
    await db
      .prepare(
        "SELECT j.id,p.version FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id JOIN rider_profiles rp ON rp.user_id=p.rider_user_id JOIN users ru ON ru.id=rp.user_id WHERE o.order_number=? AND ((o.customer_id=? AND EXISTS(SELECT 1 FROM users cu WHERE cu.id=o.customer_id AND cu.status='active')) OR (? IS NOT NULL AND o.receipt_token_hash=?)) AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched') AND o.payment_mode<>'cod' AND j.status='dispatched' AND p.method='own_rider' AND rp.status='approved' AND ru.status='active' AND EXISTS(SELECT 1 FROM rider_policy WHERE id='current' AND otp_scope='prepaid_only') ORDER BY j.id",
      )
      .bind(o.orderNumber, o.customerId, o.receiptTokenHash, o.receiptTokenHash)
      .all<{ id: string; version: number }>()
  ).results;
}
export async function requestCustomerRiderCode(
  db: D1Database,
  o: RiderCodeOwner & { jobId: string; now: number },
) {
  if (!(await customerRiderCodeJobs(db, o)).some((job) => job.id === o.jobId))
    throw new RiderError(
      'No eligible parcel was found for this protected order.',
    );
  return issueRiderOtp(db, {
    jobId: o.jobId,
    customerId: o.customerId,
    receiptTokenHash: o.receiptTokenHash,
    now: o.now,
  });
}
export function parseRiderCodeRequest(
  value: unknown,
  verify = false,
): { jobId: string; version: number; code: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RiderError('Invalid code request.');
  const v = value as Record<string, unknown>;
  if (typeof v.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(v.jobId))
    throw new RiderError('Choose a valid parcel.');
  if (
    verify &&
    (!Number.isSafeInteger(v.version) ||
      Number(v.version) < 0 ||
      typeof v.code !== 'string' ||
      !/^\d{6}$/.test(v.code))
  )
    throw new RiderError(
      'Enter the six-digit code for this current assignment.',
    );
  return {
    jobId: v.jobId,
    version: verify ? Number(v.version) : 0,
    code: verify ? String(v.code) : '',
  };
}
