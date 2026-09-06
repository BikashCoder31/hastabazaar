import { localTestIdentity, type LocalTestRole } from '@/lib/auth/local-test-access';

const now = 1788681600000;

export async function ensureLocalTestAccount(
  database: D1Database,
  role: LocalTestRole,
): Promise<void> {
  const identity = localTestIdentity(role);
  const userId = identity.userId;
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT OR IGNORE INTO users (
          id, auth_subject, email, phone, display_name, locale, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, 'en-NP', 'active', ?, ?)`,
      )
      .bind(userId, identity.userId, identity.email, identity.displayName, now, now),
    database
      .prepare(
        `UPDATE users
         SET email = ?, display_name = ?, updated_at = ?
         WHERE id = ? AND auth_subject = ?`,
      )
      .bind(identity.email, identity.displayName, now, userId, identity.userId),
    database
      .prepare(
        `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
         VALUES (?, 'customer', NULL, ?)`,
      )
      .bind(userId, now),
  ];

  if (role === 'seller') {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
           VALUES (?, 'seller', NULL, ?)`,
        )
        .bind(userId, now),
      database
        .prepare(
          `INSERT OR IGNORE INTO seller_profiles (
            id, application_reference, user_id, legal_name, trading_name,
            registration_authority, registration_number, tax_mode,
            tax_registration_number, representative_name,
            business_description, product_categories, support_phone,
            support_email, province, district, municipality, ward, locality,
            payout_account_reference, status, seller_agreement_version,
            seller_agreement_accepted_at, review_note, review_request_id,
            reviewed_by, approved_at, created_at, updated_at
          ) VALUES (
            'local-test-seller-profile', 'LOCAL-TEST-APPLICATION', ?,
            'Local test artisan only', 'Janakpur Craft Studio',
            'LOCAL TEST DATA - NOT A LEGAL AUTHORITY', 'LOCAL-TEST-REGISTRATION',
            'PAN', 'LOCAL-TEST-PAN', 'Sita Artisan',
            'Sample seller used only for local interface testing.',
            'Traditional textiles, gifts and home décor', '+9779800000000', ?,
            'Madhesh', 'Dhanusha', 'Janakpurdham', '4', 'Local test workshop',
            NULL, 'approved', 'local-test-v1', ?,
            'Approved local test fixture. Not a real seller.',
            'local-test-seller-approval', NULL, ?, ?, ?
          )`,
        )
        .bind(userId, identity.email, now, now, now, now),
      database
        .prepare(
          `UPDATE seller_profiles
           SET support_email = ?, updated_at = ?
           WHERE id = 'local-test-seller-profile' AND user_id = ?`,
        )
        .bind(identity.email, now, userId),
    );
  }

  if (role === 'admin' || role === 'super_admin') {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
           VALUES (?, ?, NULL, ?)`,
        )
        .bind(userId, role, now),
    );
  }

  await database.batch(statements);
}
