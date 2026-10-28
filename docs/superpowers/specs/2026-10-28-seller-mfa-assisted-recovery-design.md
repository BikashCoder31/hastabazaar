# Optional seller MFA and assisted account recovery

Status: approved by the user and implemented locally on 2026-10-28. Verified with isolated fixtures and captured/mock delivery; no retained account was reset and no production deployment was performed.

## Intended behavior

Sellers can choose to enable authenticator-based two-step verification. Admins retain their existing optional enrollment. Once either account enables MFA, every new sign-in must complete it, including email-based sign-in. Password login retains the recent password proof so the MFA screen asks only for the code. Recovery codes remain single-use.

Password recovery is available to both sellers and Admins. They may use the existing registered-email reset themselves, or ask Super Admin to initiate recovery after checking ownership. The account holder chooses the new password privately; Super Admin does not see or assign it.

The user has specified registered-email recovery. Recovery that replaces an inaccessible email address is outside this version and requires a separately agreed verification procedure.

## Approaches

1. Let Super Admin assign a replacement password. Simple to operate, but it exposes a credential to support staff and requires a safe delivery mechanism. Not recommended.
2. Let Super Admin authorize a private, expiring recovery flow delivered to the registered email. The owner chooses the password, and the action has an audit record. Recommended; this follows the user's registered-email recovery direction.
3. Use a third-party authentication service. Adds migration and provider dependencies. Unnecessary for the existing authenticator and email infrastructure.

## Seller account security

- Add Account security to the seller dashboard, with Enable two-step verification, authenticator enrollment, recovery-code acknowledgement, recovery-code replacement, and verified self-service disable.
- Enabling MFA requires the seller's current password and a valid code from the new authenticator. Activation revokes older sessions.
- Disabling requires a fresh password, an authenticator or unused recovery code, and explicit confirmation. Revoke sessions and notify the owner.
- Keep Admin and Super Admin permissions unchanged. A seller who also has a staff role receives the stricter applicable account policy.
- Reuse the existing encrypted MFA state, rate limits, replay protection, and five-minute password proof. Generalize account access without extending staff privileges to sellers.
- Update all authentication entry points and protected seller APIs, not just the settings page. Email sign-in, contact changes and password recovery must not bypass enrolled MFA.

## Password assistance for sellers and Admins

Super Admin opens the selected seller or team account and chooses Send password reset. Require recent Super Admin MFA, a support-request reference, a reason, and a recorded ownership-verification method. Confirm the intended account and its existing registered email.

Send an expiring, one-use recovery invitation directly to that email. The recipient opens their own reset page, proves mailbox control and chooses a new password. The invitation must work in the recipient's browser: the existing self-service reset binds its challenge to a browser cookie, so simply initiating that request in Super Admin's browser is insufficient.

The invitation alone does not change the password, log out the target or alter MFA. On successful completion, atomically consume the invitation, replace the password, revoke target sessions and outstanding login/recovery challenges, and record the event. Send a completion notification. MFA stays enabled, and the next login still requires the second factor.

Ordinary Admins cannot initiate resets for other accounts. Super Admin assistance targets seller and Admin accounts only; it cannot reset a Super Admin or use a secondary seller role to bypass this restriction. Preserve account status, roles, permissions, store records and financial history.

## Lost-authenticator assistance

Try an unused recovery code first. If none are available, offer a separate MFA recovery request for sellers and Admins. This must not be a side effect of resetting a password.

Proposed approval requirements: proof of access to the existing registered email, a verified current password (or completed password reset), and Super Admin review of ownership against existing seller onboarding records or staff records. Record the request reference and verification outcome without copying identity documents, passwords, codes or secrets into audit text. A checkbox alone is not identity verification.

After approval and completion by the owner, invalidate the old authenticator, recovery codes and sessions atomically; notify the registered email and direct the owner to enroll a replacement authenticator. Preserve the account's requirement to complete replacement MFA before restoring normal access. Do not silently downgrade an enrolled account to password-only access as part of support recovery.

Super Admin's own loss of access remains outside this assisted flow; no self-approval or ordinary-Admin override is introduced.

## Delivery and verification

Use the current email adapter and existing local captured-mail rules. Do not send real email, change existing accounts, seed/migrate the retained local database, or deploy while developing this feature. Temporary recovery grants use the existing private transient namespace and remain excluded from backups and ordinary settings exports.

Build in two reviewable parts: optional seller MFA and password-reset assistance first; then the separately approved lost-authenticator recovery workflow. Both parts must retain the no-repeat-password login behavior already fixed.

Tests use disposable identities and databases. Cover seller enrollment and disable, all sign-in routes, missing/incorrect/expired/replayed factors, Admin compatibility, target-role checks, CSRF and rate limits, mailbox and password changes during recovery, concurrent requests, atomic session revocation, notification failure, audit secrecy, backup exclusion, and desktop/mobile recovery forms.
