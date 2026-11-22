# Seller MFA and assisted recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline tasks and superpowers:subagent-driven-development for the separate recovery task. Track verified results below.

**Goal:** Optional seller MFA and Super Admin-authorized registered-email recovery for seller and Admin accounts.
**Architecture:** Extend the existing encrypted account-security state and common authentication gate. Keep assisted recovery in a separate service with private one-use invitations, role and ownership checks, transactional state changes and audit records. A recovery-required account cannot regain normal access before replacement enrollment.
**Tech stack:** TypeScript, React, existing D1-compatible transactions, encrypted SecurityStore, existing email adapter.
**Spec:** `docs/superpowers/specs/2026-10-28-seller-mfa-assisted-recovery-design.md` (approved by user).

## Global constraints
- Canonical checkout only; preserve unrelated work and existing local data.
- No production actions, real email, account resets, migrations or database seeding.
- Registered email stays unchanged. Never disclose or assign an owner's password in Admin UI.
- Super Admin cannot use assistance for another Super Admin or themselves.
- All enrolled login methods enforce MFA; password recovery never disables MFA.
- Missing registered security records fail closed. Recovery grants are excluded from exports.

## Review focus
- Seller-only, dual-role and suspended/demoted accounts: enforce current role and stricter applicable policy.
- Email-only sign-in and local fixture identities: neither bypasses enrolled seller MFA.
- Concurrent approval, revocation, password/contact changes and repeated links: atomic, single-use completion.
- Interrupted enrollment and recovered accounts: no password-only downgrade.
- Notification failures, mobile forms and private links: actionable UI without exposing secrets.

## Task 1: Seller MFA and sign-in enforcement (primary)
Files: `lib/security/{model,session,request,controller,hosted-policy}.ts`, `lib/auth/hosted-session.ts`, `app/auth.ts`, login route, security workspace, seller navigation and focused tests.
- [x] Add failing seller-only enrollment, optional access, enrolled email/password denial, disable and recovery-required tests.
- [x] Generalize security-ceremony authorization to seller accounts. Retain staff-only bootstrap and privileges.
- [x] Add `AccountSecurity.status = 'recovery'` for replacement-required accounts; it has no factor or recovery codes and never grants normal sessions. Setup/confirm/activation reuse existing ceremonies.
- [x] Enforce registered seller security in common identity resolution and sign-in continuation. Keep password-login five-minute proof.
- [x] Add seller security entry and role-appropriate UI/destinations; self-disable remains verified.
- [x] Run seller and existing staff authentication tests.

## Task 2: Assisted recovery (delegated implementation, separate files)
Files: new `lib/security/assisted-recovery.ts`, recovery API handlers, email message helper, Admin assistance component and public recovery component/page, tests. Integrate the component into team/seller detail pages.
Interfaces: consume existing SecurityStore and securityActor; recovery-required state uses `AccountSecurity.status='recovery'`. Expose Admin component with target user ID, display name and registered email. Public completion verifies invitation mailbox possession plus current password for MFA recovery, or chooses new password for password recovery.
- [x] Write failing tests for role restrictions, expiry, replay, changed contact/password/generation, revoked approval sessions, failure rollback and no factor downgrade.
- [x] Issue short-lived invitations after fresh Super Admin MFA and documented support verification. Deliver only to existing registered email and audit without secrets.
- [x] Complete password assistance in recipient browser and revoke old sessions/challenges; preserve MFA.
- [x] Complete approved MFA recovery with current-password proof; revoke old factors/codes/sessions and force replacement enrollment.
- [x] Add restricted Admin controls and accessible private completion UI with actionable failure states.
- [x] Verify delivery failure handling, audit secrecy and existing portability handling.

## Task 3: Integration and review (primary)
- [x] Confirm both seller and Admin entry points and real authentication guards.
- [x] Run focused suites, typecheck and scoped lint, then isolated browser checks.
- [x] Obtain fresh security review and resolve material findings.
- [x] Record results and present local preview behavior and any limits.

## Execution ledger
- Ruling: Work in the canonical dirty checkout without commits or worktree changes; preserve the ongoing user work.
- Ruling: The approved scope authorizes implementation and fixture-only verification, not actual recovery of an existing account.
- Implemented: optional seller enrollment and common password/email/Google sign-in enforcement; foreground activity renewal uses the seller session policy. Mandatory recovery state permits replacement enrollment but never normal account access.
- Implemented: Super Admin controls in seller detail and team pages; 15-minute one-use registered-email invitations; separate password and authenticator recovery; live role/session/generation checks and atomic revocation. Password assistance preserves MFA. Super Admin/self targets and email replacement are excluded.
- Review: independent read-only reviews found missing seller activity renewal and missing HTML email content. Both were fixed and regression-tested; final integration review found no further actionable issues.
- Verification: final combined security, identity, portability, email, browser and form coverage suite passed 115/115 tests. Additional form policy/readiness/coverage suite passed 24/24 after updating the explicit role-specific inventory. Typecheck and scoped lint passed. Browser fixture checks cover desktop/mobile; rendered local mobile screens were also inspected with all API mutations mocked.
- Preflight: source inventory initially classified the browser-only FAQ widget as catalog-editable. Corrected its fixed-control classification; kept all 89 existing publication requirements intact. `npm run local:check` passed with 89/89 forms, canonical baseline, local staging and sign-in schema ready. No retained data was seeded, migrated, reset or modified.
- Privacy: recovery fragments are removed from the address bar and kept only in memory; the recovery page excludes analytics/help widgets. Existing transient-setting portability policy excludes the `auth-private:challenge:assisted:` namespace from backups.
- Remaining operational limits: production email delivery and real account recovery were intentionally not exercised; lost registered-email access and Super Admin account recovery require a separately agreed process. No deployment or commit was performed.
