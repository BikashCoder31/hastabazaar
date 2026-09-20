# Role-aware sign-in — 11 September 2026

Normal sign-in previously sent everyone to `/account`. Password, email-code and Google sign-in now use the authenticated `/auth/continue` destination for a missing return path or a generic `/account` return. The destination resolves existing active staff access first (Admin and Super Admin to `/admin`), then approved seller access (`/seller`), then customer access (`/account`). Staff invitations/configured bootstrap and seller approval checks use the existing authorization resolvers. No role is granted by a redirect parameter, and destination pages retain their own authorization checks.

Specific safe local return paths such as checkout, a customer wallet, seller products or Admin orders remain intact. This lets sellers and staff shop without being forced back to their workspaces. Signed-in visits to Login, Register and the email-code page follow the same default. External destinations and authentication-loop destinations are rejected. Pending/unapproved sellers use the customer account until they qualify for seller access.

## Local verification

- 67 automated tests passed; TypeScript and Babal standalone build passed.
- Actual password and email-code verification against disposable MariaDB 11.4.9, followed through Chrome at mobile width, passed for customer, approved seller and Super Admin. Additional checks passed for Admin, unapproved seller fallback, revisiting Login while signed in, an explicit customer wallet destination and anonymous protection.
- Existing login/Google entry-point and trusted HTTPS hosting-proxy tests passed. Live Google OAuth and SMTP delivery were not exercised; Google callback uses the same tested return-path normalizer and authenticated destination. OTP verification used locally inserted, hashed one-time challenges; no email was sent.
- Existing authentication, referral/wallet and return-policy records are unchanged. No new database migration is required for this fix. Local Node.js was 24.19.0; exact hosting Node.js 22.23.2 verification is still pending.

## Cumulative release

Use `outputs/hastabazaar-role-sign-in-2026-09-11.zip`, which supersedes the previous referral ZIP and contains all its features plus this fix. It contains standalone runtime dependencies, prior public pages/product details/order updates/reviews and the pending additive migrations. The sibling manifest verifies archive file hashes against the built output.

**Not deployed.** When the owner requests deployment, follow `referrals-customer-experience.md` for backups, ordered migrations, media/environment preservation and Babal.Host application replacement in `/home2/hastabaz/hastabazaar-app`, with Node.js 22.23.2 and startup `app.cjs`. Use this newer ZIP instead of the filename in that earlier document. No additional SQL is needed beyond those pending cumulative migrations.

After deployment, sign in normally using each available method for customer, approved seller, Admin and Super Admin. Confirm the corresponding landing pages. Also sign in from checkout or a specific order, and confirm the original destination is retained and permissions still apply. Preserve Super Admin credentials, Google/OTP settings, uploaded media, COD and promotional credit; deposits and withdrawals remain disabled.
