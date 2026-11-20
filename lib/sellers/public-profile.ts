export const publicProfileCooldownMs = 7 * 24 * 60 * 60_000;
export {getPublicProfileWorkspace,savePublicProfileDraft,submitPublicProfileRevision,reviewPublicProfileRevision,withdrawPublicProfileRevision,reconcilePublicProfileLegacyClock} from './public-profile-workflow';
export {requestPublicProfileCorrection,requestStaffPublicProfileCorrection,respondPublicProfileCorrection,reviewPublicProfileCorrection} from './public-profile-corrections';
export async function publicProfileEditableAt(db: D1Database, sellerId: string): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(last_normal_publication_at,CASE WHEN legacy_clock_reviewed_at IS NOT NULL THEN legacy_clock_value ELSE legacy_saved_at END) AS editedAt
    FROM seller_public_profile_states WHERE seller_id=?`).bind(sellerId).first<{ editedAt: number | null }>();
  return row?.editedAt == null ? 0 : Number(row.editedAt) + publicProfileCooldownMs;
}
