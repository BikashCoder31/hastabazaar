import {
  localTestIdentity,
  type LocalTestRole,
} from '@/lib/auth/local-test-access';

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
      .bind(
        userId,
        identity.userId,
        identity.email,
        identity.displayName,
        now,
        now,
      ),
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
            'SIMULATED — NOT VALID FOR PRODUCTION', 'Janakpur Craft Studio',
            'SIMULATED — NOT A LEGAL AUTHORITY', 'SIMULATED-REGISTRATION',
            'PAN', '990000001', 'Sita Artisan',
            'SIMULATED seller used only for local interface testing.',
            'Traditional textiles, gifts and home decor', '+9779800000000', ?,
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
      database
        .prepare(
          `INSERT OR IGNORE INTO seller_participation_profiles (
            seller_id, participation_route, application_stage, tax_status,
            public_name, public_city, craft_experience_json, social_links_json,
            commercial_model, legal_seller_reference, invoice_issuer_reference,
            payout_beneficiary_reference, return_destination_type, version,
            created_at, updated_at
          ) VALUES (
            'local-test-seller-profile', 'registered_seller', 'active',
            'business_pan_only', 'Janakpur Craft Studio', 'Janakpurdham',
            '[{"craft":"Traditional textiles","band":"one_to_three_years"}]',
            '{}', NULL, 'local-test-seller-profile', 'local-test-seller-profile',
            'local-test-seller-profile', 'maker_address', 1, ?, ?
          )`,
        )
        .bind(now, now),
      database
        .prepare(
          `INSERT OR IGNORE INTO seller_operational_addresses (
            id, seller_id, purpose, same_as_address_id, province, district,
            municipality, ward, locality, is_public, created_at, updated_at
          ) VALUES (
            'local-test-seller-verification-address', 'local-test-seller-profile',
            'verification', NULL, 'Madhesh', 'Dhanusha', 'Janakpurdham', '4',
            'SIMULATED private workshop address', 0, ?, ?
          )`,
        )
        .bind(now, now),
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
