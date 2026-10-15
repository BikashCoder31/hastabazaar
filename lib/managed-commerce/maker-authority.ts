import type { ParticipationApplicationStage } from '../sellers/participation';

export class ManagedMakerAuthorizationError extends Error {
  constructor(message = 'An active, unrestricted maker owner is required.', readonly status: 401 | 403 = 403) { super(message); }
}
export const makerOwnerPredicate = `EXISTS(SELECT 1 FROM seller_profiles maker
  JOIN users owner ON owner.id=maker.user_id JOIN seller_participation_profiles participation ON participation.seller_id=maker.id
  WHERE maker.id=? AND owner.id=? AND owner.status='active' AND participation.participation_route='managed_maker'
    AND participation.application_stage IN ('draft','submitted','under_review','changes_requested','approved_for_activation','active')
    AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=owner.id AND role='customer')
    AND NOT EXISTS(SELECT 1 FROM seller_restrictions restriction WHERE restriction.seller_id=maker.id
      AND (restriction.mode='disabled' OR (restriction.mode='suspended' AND restriction.suspended_until>?))))`;

export async function getManagedMakerAuthority(db: D1Database, actorId: string, now: number) {
  const profile = await db.prepare(`SELECT s.id AS sellerId,p.application_stage AS stage FROM seller_profiles s
    JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.user_id=?`).bind(actorId)
    .first<{ sellerId: string; stage: ParticipationApplicationStage }>();
  if (!profile || !await db.prepare(`SELECT 1 WHERE ${makerOwnerPredicate}`).bind(profile.sellerId, actorId, now).first())
    throw new ManagedMakerAuthorizationError();
  return { userId: actorId, sellerId: profile.sellerId, stage: profile.stage };
}

export function makerMutationGuards(db: D1Database, input: { sellerId: string; actorId: string; now: number }) {
  const id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${makerOwnerPredicate} THEN 1 ELSE 0 END`)
    .bind(id, input.sellerId, input.actorId, input.now), db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
