export const publicProfileCooldownMs = 7 * 24 * 60 * 60_000;
export async function publicProfileEditableAt(db: D1Database, sellerId: string): Promise<number> {
  const row = await db.prepare(`SELECT MAX(created_at) AS editedAt FROM audit_logs WHERE subject_type='seller_profile'
    AND subject_id=? AND action='seller.public_profile.saved'`).bind(sellerId).first<{ editedAt: number | null }>();
  return row?.editedAt == null ? 0 : Number(row.editedAt) + publicProfileCooldownMs;
}
