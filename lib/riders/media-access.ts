/** Rider documents and proof are private to current active Super Admins. */
export async function canViewRiderEvidence(
  db: D1Database,
  subject: string,
  _ownerId: string,
  _id: string,
  _isIdentity: boolean,
): Promise<boolean> {
  return Boolean(
    await db
      .prepare(
        "SELECT 1 AS allowed FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND r.role='super_admin' LIMIT 1",
      )
      .bind(subject)
      .first(),
  );
}
