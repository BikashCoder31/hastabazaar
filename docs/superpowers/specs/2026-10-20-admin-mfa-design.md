# Admin MFA and shorter sessions — local design for review

Status: proposed design; no MFA or session behaviour has been changed.

## Intended result and limits

Add authenticator verification, single-use recovery codes and shorter sessions for the existing Super Admin and Admin accounts. Keep current accounts, permissions, passwords, agreements, orders and financial records. Current commission settings and historical terms are outside this change.

Hosting portability is a user requirement added on 20 October 2026. Moving to a supported new host must preserve durable application data and working MFA. Super Admin must eventually be able to prepare a complete encrypted transfer package and verify a destination before an explicitly authorized move. The existing Backup register is only a verification log, not an implemented export/restore tool. See [the portability requirements](2026-10-20-hosting-portability-requirements.md). No transfer, restore or deployment is authorized by this design update.

Work stays in `C:/Users/abinash/Desktop/HastaBazaar`. No migrations, database replacement, seeding, production/staging changes or deployment. Never activate an authenticator controlled by the developer on the user's account. The account owner completes enrollment in normal Chrome.

## Findings from the existing project

- The read-only local preflight passes: 89/89 forms and sign-in schema ready.
- The existing local database has 153 tables and exactly one D1 database file. It has no named MFA, TOTP, recovery or WebAuthn table.
- `user_sessions` already contains token hash, account ID, expiry, creation and last activity timestamps. Hosted sessions currently last 30 days and activity is updated at most hourly (`lib/auth/hosted-session.ts`).
- Both active local staff accounts currently have no row in `user_credentials`. Do not assume a saved staff password exists, reset anything, or generate a password for the user.
- Local test-role cookies bypass hosted sessions (`app/auth.ts`, `lib/auth/local-test-access.ts`). They cannot be treated as a successful MFA check.
- Legal procedures read hosted sessions directly (`lib/legal-procedures/access.ts`). Forms and private media can use the common identity helper without the staff API helper. An MFA check only in the Admin layout would leave gaps.
- Password sign-in, email-code sign-in, Google callback, registration and contact-email verification can create hosted sessions. All need the shared assurance rules.

## Storage choice under the no-migration limit

Recommended: use the existing generic `marketplace_settings` key/value table through a **dedicated security repository**, with reserved `auth-private:` keys. Current application business settings use `business_setting_versions`; no current application code exports or scans all `marketplace_settings` records. This is an additive storage use, not a schema migration.

Each security value is strict, versioned JSON encrypted with authenticated encryption (AES-256-GCM). Bind its table key, canonical account ID and schema version as authenticated data. Use random nonces. Keep the encryption key outside the database, source, browser bundle, logs and reports. Add deliberate server-only binding support; do not put the key in Vite public/config variables. Explicitly ignore any local secret file before creating it. Never replace a missing key automatically when encrypted records already exist.

Use stable application/account IDs and key IDs, not the hostname, hosting provider, filesystem path or machine identity, in cryptographic bindings. The server-only key must have an owner-controlled encrypted recovery/export path. A database copy alone cannot decrypt the MFA secrets if that key is lost. Preserve the same key material and IDs securely during a supported hosting move; key rewrapping/rotation must be explicit and verified, never an automatic response to a new host.

Store separately:

1. Per-account enrollment, encrypted authenticator secret, security generation, last accepted TOTP counter, recovery-code hashes and pending setup state.
2. Per-session assurance, bound to the existing server-side session hash, account and security generation.

Distinguish the untouched legacy rollout from an initialized security store explicitly. Trusted rollout initialization adds an encrypted security manifest and explicit pending records for existing staff in one transaction. It does not infer an enrolled account became pending when a record disappears. Once initialized, a missing expected manifest/account record is a security-state error, not an invitation to recreate an unenrolled record. Adding a newly promoted staff account requires the controlled enrollment path. A missing manifest while local security mode is configured is an error. The key/mode configuration must not automatically downgrade itself after an error.

Use byte-exact compare-and-swap and a checked affected-row count in a single database batch. Recovery consumption, TOTP replay prevention and issuance of a verified session must succeed or roll back together. Use a comparison valid under both SQLite and MariaDB collations, such as `HEX(value)=HEX(?)`. Do not assume a process mutex protects multiple workers.

Quote the SQL column `key`, which is reserved by MariaDB. Test the SQLite/Worker implementation locally; do not claim native MariaDB concurrency verification without a separately isolated MariaDB fixture.

Never put authenticator secrets, QR data, recovery codes or usable bearer tokens into audit logs, form answers, ordinary settings screens, analytics or evidence files. Existing non-security key/value records stay untouched. Ordinary settings exports must exclude the reserved security namespace. A complete hosting-transfer backup must instead include these encrypted records through the dedicated privileged export path, together with a separately protected key-recovery bundle. Do not silently omit them from a full backup.

Alternatives considered: dedicated authentication tables would be clearer but need a separately authorized migration; an external identity provider would need additional service configuration. A loose JSON file or in-memory map is rejected because durable atomic recovery consumption and Worker runtime support would be harder to guarantee.

## Enrollment and access continuity

Introduce a clearly labelled setup state. Existing accounts retain access during initial setup; do not silently switch on a deadline that locks out an account that has not enrolled. Display “MFA setup pending” until enrollment is completed. This transitional state is not a claim that every Admin account is MFA protected.

An unsigned local test-role cookie is not enough to bind or replace an authenticator. Enrollment requires fresh server-verified account proof. Where a staff account has no password, provide a user-controlled first-password setup after fresh mailbox verification, with an atomic check that no credential already exists. The owner enters the password privately in Chrome. This adds a credential to the same account; it does not create an account or reset/overwrite a password. If that ceremony cannot be completed safely in the guarded local mail-capture environment, leave enrollment pending and report the limitation.

For genuine password-plus-authenticator MFA, require the password proof as well as the authenticator code. Email-code plus authenticator-code sign-in alone must not be labelled as two distinct factor types. Google sign-in must not silently assert that its provider performed MFA. Email/Google-only flows can establish a restricted sign-in/setup flow, but cannot skip the staff second-factor requirement or password proof once this policy is active.

Setup flow:

1. Confirm fresh account proof.
2. Generate a pending authenticator secret with a 10-minute setup expiry. Show the setup QR and manual key only in a private, uncached page.
3. The owner scans it with their own authenticator and enters a valid code.
4. Generate 10 cryptographically random recovery codes, each with at least 128 bits of entropy. Show them once and ask the owner to confirm they saved them privately. Store only account-bound hashes.
5. Activate MFA only after both confirmation steps. Rotate the current session, bind its assurance and revoke prior privileged sessions atomically.

An abandoned/expired setup cannot activate MFA or replace an active secret. Replacing an authenticator and regenerating recovery codes require fresh password plus current authenticator or a valid recovery code. Regeneration invalidates the old set atomically. No unauthenticated disable/reset endpoint and no automatic email-only MFA removal.

## Sign-in and recovery

Use a short-lived restricted challenge after the first factor. Do not expose a fully authenticated staff identity until the second factor is verified. Validate live account status and roles again when completing the challenge. Rotate the bearer session after verification.

Accept a standard six-digit, 30-second TOTP with a bounded clock tolerance of one step in either direction. A counter accepted for an account cannot be accepted again. Apply account-level and network attempt budgets using existing atomic rate-limit storage; a new challenge cannot reset the account budget.

A recovery code substitutes for the authenticator after valid first-factor proof. Consume it atomically so concurrent submissions produce only one success. Show the remaining count, not the codes. Recovery does not remove MFA. Provide a path to replace a lost authenticator after recovery and fresh proof. If the owner loses both the authenticator and all recovery codes, stop and require a separately reviewed identity-recovery procedure; do not add a hidden bypass.

Missing key, malformed ciphertext, unknown schema or corrupted existing security state must fail closed for protected staff access and show a useful error. They must never be interpreted as “not enrolled.” Do not weaken public health or ordinary customer sign-in because a staff security record is unavailable.

## Shorter staff sessions

Proposed limits: **8 hours maximum and 30 minutes of inactivity**, whichever comes first. A successful fresh reauthentication resets both. Activity updates never extend the absolute maximum. Update activity more often than the current hourly interval and prevent an older concurrent request from moving activity backwards.

Enforce expiry on the server on every protected request, even if the browser still has its cookie. Background polling must not keep an unattended privileged session alive indefinitely. Show an expiry warning and a safe sign-in link. Do not submit or save pending forms automatically.

Apply these limits to privileged sessions when the rollout is activated for the enrolled account. Keep ordinary customer session duration unchanged. Role promotion, removal, disabled accounts, password resets and security-generation changes must not preserve stale privileged assurance.

## Integration boundaries

- Central shared session verifier: hosted identity, restricted challenges, staff roles, absolute/idle expiry and current MFA assurance.
- Staff page/API helpers: share the verifier and recheck after invitation/bootstrap resolution. Preserve all existing permissions and mailbox-proof requirements.
- Legal procedures: use the shared read-only verifier while retaining their current rule against invitation acceptance, staff bootstrap or account mutation during access checks.
- Forms, private media and financial reads: receive only a fully verified staff identity through the same central check.
- Contact verification/session rotation: preserve only justified, unexpired assurance and never reset the original privileged session deadline without fresh required factors.
- Local testing: fixture role cookies must not bypass an enrolled account's MFA or session expiry. Real MFA browser verification uses hosted sessions. Do not call the fixture-seeding route against the existing database as a test shortcut.

## Verification inventory before browser testing

Use fresh isolated fixtures, never the real database, for all tests that write authentication state.

- Enrollment confirmation, expiry, cancellation, stale requests, replacement attempts and recovery-code acknowledgement.
- Standard TOTP vectors, clock tolerance, replay and concurrent reuse across separate database adapters.
- Recovery-code hashing, single-use atomic claims, concurrent claims, regeneration, wrong-account use, stale generations and restart persistence.
- Wrong/missing encryption key, modified ciphertext/AAD, malformed schema, missing proof, missing enrollment state after activation and database failures.
- Password, email-code, Google, registration and contact-verification session creation paths; no bypass using an alternative return URL.
- Actual common identity/staff/session code in integration tests. Stubs of the identity helper alone do not prove MFA enforcement.
- Direct Accounting, legal management, form answers/configuration and private media requests before/after MFA; revoked roles and disabled accounts.
- Local test-cookie precedence, forged/old fixture cookies, hosted build stubs and runtime isolation.
- Eight-hour boundary, 30-minute idle boundary, steady activity, backwards activity races, cookie expiry, background polling and reauthentication.
- Unenrolled access continuity, no credential replacement, existing staff account IDs/roles unchanged and no automatic enrollment/lockout.
- Normal Chrome enrollment with the user's authenticator, recovery-code handoff, sign-out/re-entry, small screens and understandable errors. Never capture secrets in screenshots or reports. The user must complete private credential/authenticator steps.
- Relevant security/auth regression suites, lint, type checks and local production build. Re-run read-only local preflight and compare data digests, allowing only explicitly authorized authentication state changes from the owner's enrollment.
- Portability fixtures: export/restore unchanged encrypted MFA records and stable IDs with the separately recovered key; the same authenticator remains usable, consumed recovery codes remain consumed, and old sessions/challenges are not reactivated. Wrong/missing key and incomplete transfer block activation. Do not run a restore against this checkout's existing database.

## Implementation and activation gates

This written design needs review before product implementation. After it is accepted, prepare the implementation/test plan and complete code/test review using separate GPT-6.1 Sol reviewers with extra-high reasoning. Keep server and database control with the main agent.

Code can be implemented and tested without enrolling existing accounts. Report that distinction clearly. Account protection becomes active only after the owner completes and confirms enrollment; no developer-controlled authenticator or automatic lockout. Nothing is deployed.

Reference guidance: [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html) and [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html). These guide the design; this document does not claim a completed implementation or compliance certification.
