import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getReferralCampaign } from '@/lib/db/repositories/wallet';

export async function PUT(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('admin.invite');
    if (staff.role !== 'super_admin')
      return Response.json(
        { error: 'Only the Super Admin can change this offer.' },
        { status: 403 },
      );
    const b = (await request.json()) as Record<string, unknown>;
    const {
      friendDiscountPaisa: d,
      rewardPaisa: r,
      minimumSubtotalPaisa: m,
      returnWindowDays: w,
    } = b;
    if (
      typeof b.enabled !== 'boolean' ||
      typeof b.reason !== 'string' ||
      b.reason.trim().length < 10 ||
      b.reason.length > 300 ||
      ![d, r, m, w].every(
        (n) => typeof n === 'number' && Number.isSafeInteger(n),
      ) ||
      Number(d) < 100 ||
      Number(d) > 1000000 ||
      Number(r) < 100 ||
      Number(r) > 1000000 ||
      Number(m) <= Number(d) ||
      Number(m) > 100000000 ||
      Number(w) < 7 ||
      Number(w) > 90
    )
      return Response.json(
        {
          error:
            'Enter valid amounts, a minimum greater than the discount, a 7–90 day wait, and a reason.',
        },
        { status: 400 },
      );
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const previous = await getReferralCampaign(db);
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `UPDATE referral_campaign SET enabled=?,friend_discount_paisa=?,reward_paisa=?,minimum_subtotal_paisa=?,return_window_days=?,updated_at=? WHERE id='default'`,
        )
        .bind(b.enabled ? 1 : 0, d, r, m, w, now),
      db
        .prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
     VALUES (?,?,'referral.offer.updated','referral_campaign','default',?,?,?,?,NULL,?)`)
        .bind(
          crypto.randomUUID(),
          staff.id,
          b.reason.trim(),
          JSON.stringify(previous),
          JSON.stringify({
            enabled: b.enabled,
            friendDiscountPaisa: d,
            rewardPaisa: r,
            minimumSubtotalPaisa: m,
            returnWindowDays: w,
          }),
          crypto.randomUUID(),
          now,
        ),
    ]);
    return Response.json(
      { saved: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: 'The offer could not be saved.' },
      { status: 500 },
    );
  }
}
