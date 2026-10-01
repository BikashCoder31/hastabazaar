# Approved seller identity-link fix — 11 September 2026

## Reproduced defect

`createSellerApplication` creates a user with a NULL `auth_subject`. Admin approval sets the profile to approved and assigns the seller role, but leaves the identity link unset. Previous approval tests used prelinked users and missed this registration path.

A fresh application followed by the actual Admin start-review/approve actions and email-code sign-in reproduced HTTP 307 from `/seller` to `/seller-access-denied`. Password credentials added to an application-created account (for example through verified password reset) also required support for the missing link. The live account's exact database record has not been inspected; the reproduction establishes this code defect, not every possible cause of seller denial.

## Fix

Password login creates its session using the internal account ID returned by the verified credential lookup. It no longer depends on an already populated external authentication subject.

When reading a valid, unexpired session for an active account with a NULL authentication subject, the server conditionally assigns a stable `local:<account-id>` subject to that exact session-owned account and re-reads the stored value. Existing password/Google identity links are preserved, including concurrent updates. The fix does not accept an email as authority to link another account, grant roles, approve applications, or change staff access. Existing sessions with missing links recover on their next authenticated request.

The previous local staff-denial recovery links and explanation are included.

## Verification

- Production standalone build and TypeScript passed.
- Existing 71 tests and four new session-link regression tests passed (75 total).
- Fresh application created by the real repository, actual Admin review/approval, email-code login and password login all reach `/seller` after the fix. This regression failed before the fix with `/seller-access-denied`.
- Local MariaDB/browser role checks cover customer/Admin/approved seller, pending seller denial, password/OTP, storefront navigation, staff-denial recovery and desktop/mobile layout.
- Tests use disposable localhost accounts/data; no real approval records or credentials were changed. Current verification runtime Node.js 22.23.1, local MariaDB 11.4.9; Babal target remains Node.js 22.23.2.

## Deployment

Cumulative archive: `outputs/hastabazaar-approved-seller-link-fix-2026-09-11.zip`. Local only; not deployed. No new SQL migration or manual relinking is required for this defect. Do not weaken approval checks or grant staff roles as a workaround.

On the next owner-authorized deployment, back up the current Babal application/database/media, install the cumulative release into the existing app root while preserving environment/media/dependency setup, and restart `app.cjs`. Previously applied migrations are recorded in `docs/deployment-2026-09-11.md`; do not import a base schema.

Live verification must then repeat sign-in for the affected approved seller and confirm `/seller` loads. If denied, inspect that account's profile status, seller role and linked user ID; this patch intentionally does not override missing approval or conflicting existing links. Keep password/Google/OTP and Super Admin checks in the verification. No SMTP inbox delivery was tested in this local run.

Deployment update: this release is now installed on Babal.Host. See docs/deployment-seller-link-fix-2026-09-11.md for the fresh backup and live verification. The earlier local-only statement describes the release preparation stage.
