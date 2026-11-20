export interface SellerCenterAccess {
  userId: string;
  authSubject: string;
  email: string;
  displayName: string;
  sellerId: string | null;
  tradingName: string;
  status: string | null;
  sellerAgreementVersion: string | null;
  sellerAgreementAcceptedAt: number | null;
  approvedSeller: boolean;
}

/** Read-only ownership lookup. Workspace access is never a commercial permission. */
export async function getSellerCenterAccess(db: D1Database, authSubject: string): Promise<SellerCenterAccess | null> {
  const row = await db.prepare(`SELECT u.id AS userId,u.auth_subject AS authSubject,u.email,u.display_name AS displayName,
    s.id AS sellerId,COALESCE(NULLIF(s.trading_name,''),u.display_name) AS tradingName,s.status,
    s.seller_agreement_version AS sellerAgreementVersion,s.seller_agreement_accepted_at AS sellerAgreementAcceptedAt,
    CASE WHEN s.status='approved' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='seller') THEN 1 ELSE 0 END AS approvedSeller
    FROM users u LEFT JOIN seller_profiles s ON s.user_id=u.id
    WHERE u.auth_subject=? AND u.status='active'
      AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))
      AND (s.id IS NOT NULL OR EXISTS(SELECT 1 FROM audit_logs WHERE actor_id=u.id AND subject_type='user'
        AND subject_id=u.id AND action='seller.registration.started')) LIMIT 1`)
    .bind(authSubject).first<Omit<SellerCenterAccess, 'approvedSeller'> & { approvedSeller: number }>();
  return row ? { ...row, approvedSeller: Number(row.approvedSeller) === 1 } : null;
}
