import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedBody } from '@/lib/http/bounded-body';
import {
  cancellationPreview,
  cancelSelectedParcels,
  CancellationConflictError,
  rejectCancellationReview,
} from '@/lib/cancellation/repository';
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site request rejected.' }, 403);
  try {
    const staff = await requireStaffApi('order.manage'),
      db = requireDatabase(env as unknown as { DB?: D1Database }),
      body = JSON.parse(
        new TextDecoder().decode(await readBoundedBody(request, 4096)),
      ) as Record<string, unknown>;
    if (typeof body.reviewId !== 'string')
      return json({ error: 'Select a review.' }, 400);
    const row = await db
      .prepare(
        "SELECT r.seller_ids_json AS sellers,o.order_number AS number FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id WHERE r.id=? AND r.status='pending'",
      )
      .bind(body.reviewId)
      .first<{ sellers: string; number: string }>();
    if (!row)
      throw new CancellationConflictError('Review is no longer pending.');
    if (body.action === 'reject') {
      await rejectCancellationReview(db, {
        id: body.reviewId,
        actorId: staff.id,
        note: typeof body.note === 'string' ? body.note : '',
        now: Date.now(),
      });
      return json({ ok: true });
    }
    const access = { actorId: staff.id, orderNumber: row.number },
      sellerIds = JSON.parse(row.sellers) as string[];
    if (body.action === 'preview') {
      const p = await cancellationPreview(db, access, sellerIds);
      return json({
        fingerprint: p.fingerprint,
        total: p.next.total,
        walletRestored: p.walletRestored,
        delivery: p.next.delivery,
        deliveryPricingPolicy:p.deliveryPricingPolicy,
      });
    }
    if (
      body.action !== 'approve' ||
      typeof body.fingerprint !== 'string' ||
      typeof body.note !== 'string'
    )
      return json(
        { error: 'Review current amounts and add a decision reason.' },
        400,
      );
    return json(
      await cancelSelectedParcels(db, access, {
        sellerIds,
        fingerprint: body.fingerprint,
        requestId: 'review:' + body.reviewId,
        note: body.note,
        reviewId: body.reviewId,
        now: Date.now(),
      }),
    );
  } catch (e) {
    return json(
      {
        error:
          e instanceof CancellationConflictError ||
          e instanceof StaffAuthorizationError
            ? e.message
            : 'Review could not be saved.',
      },
      e instanceof StaffAuthorizationError ? e.status : 409,
    );
  }
}
