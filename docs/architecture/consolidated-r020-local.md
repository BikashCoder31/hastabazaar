# R020 local implementation — 13 September 2026

Status: implemented for cumulative local review. Not a deployment-readiness claim. No deployment, live database, messages, invitation delivery, role grant, or original release ZIP change was performed for this work.

## Source decision and retained boundaries

Read consolidated-scope-2026-09-13.md, chronological R020 in change-register-2026-09-13.md, staff-operations.md, actual staff/auth/repository/navigation code. The pre-existing dualApprovalRequiredFor explicitly names admin.permissions.manage, but there was no executable permission-editor or permission-approval implementation. This was flagged to the coordinating task before dependent mutation work. The agreed source-preserving interpretation is a proposal by one active Super Admin and approval by a different active Super Admin. No self-approval fallback is provided when only one Super Admin exists. Existing invitation management was not changed and is not offered as an approval workaround.

Only permissions already held by the original Admin role can be configured. Customer/account permissions survive. Ordinary Admins cannot modify their own settings, other staff settings, or any role. Super Admin targets are excluded even when they also have an Admin role. Reserved Super Admin capabilities and existing payout/refund/seller/product maker-checker policies remain unchanged. In particular, payout.approve, admin.invite and admin.permissions.manage are never delegable.

## Implementation

- lib/marketplace/permissions.ts: explicit effective subject permissions, legacy-compatible defaults, bounded Admin allowlist, unknown/reserved input rejection. Explicit empty operational permissions differs from no stored profile.
- lib/db/repositories/staff-permissions.ts: live role/profile lookup, immutable approved preset snapshots, proposed settings with expected version, independent approve/reject decisions, transaction guards, unique decision claims, versioned application and audit in the same database batch. Invalid stored permission JSON fails closed. Named presets are saved on approval and copied when reused; they never silently alter existing people.
- lib/auth/staff.ts: hydrates effective Admin permissions afresh for each protected request. Both page and API guards use the hydrated subject. Existing Super Admin access avoids overrides. Missing migration is an operational readiness failure, never a fallback that restores revoked access.
- app/admin/team/page.tsx and components/admin/staff-permission-manager.tsx: show current effective access/version, saved actor/time, proposed selection, approved presets, reason, request history, and separate approval controls. SA-only API is app/api/admin/staff-permissions/route.ts with trusted-origin check and no-store responses.
- lib/admin/navigation.ts, components/admin/admin-navigation.tsx, app/admin/layout.tsx, app/admin/page.tsx: match visible destinations to effective access; /admin redirects an Admin without overview access to an allowed destination before retrieving overview counts. Added SA-only delivery rates and action audit destinations coordinated with their owners.
- app/admin/products/[id]/page.tsx, components/admin/product-review-actions.tsx: match publish and catalogue classification affordances to permissions.
- app/admin/payouts/[id]/page.tsx: effective subject checks retain reserved approval/processing rules.
- app/admin/cases/returns/[id]/page.tsx, components/admin/return-case-actions.tsx: standard return/refund controls require refund.approve.standard; high-value Super Admin authority remains separate.
- app/api/review-photos/[id]/route.ts and app/api/return-evidence/[id]/route.ts: remove raw Admin-role bypass and recheck product.review or support.manage for staff, retaining existing customer/receipt/seller ownership access. Product-media route owner received the same hasStaffPermissionBySubject patch and reported applying it.
- drizzle/0031_staff_permissions.sql and deployment/babal/mariadb-staff-permissions.sql: additive repeatable tables only. No role rewrite or legacy access backfill that changes authority. Required tables: staff_permission_profiles, staff_permission_requests, staff_permission_presets, staff_permission_guards. Migration/readiness/release inventory integration is owned by the coordinating task.

## Actual verification

- Initial focused permission tests failed before implementation because new effective-permission exports were absent.
- npx --no-install tsx --test tests/staff-permissions.test.ts: 6/6 passed on fresh in-memory SQLite. The additive migration is applied twice to each fresh fixture. Covers legacy access, explicit empty scope, nondelegable actions, distinct profiles, fresh lookup after approval, self/ordinary-Admin approval denial, stale-version transaction rollback including audit/preset/claim, suspended proposer, invalid persisted JSON, unchanged roles, and another Admin retaining access.
- npx --no-install tsx --test tests/staff-permissions.test.ts tests/admin-presentation.test.ts: 9/9 passed after replacing brittle navigation counts with semantic SA-only and effective-permission checks.
- Focused oxlint of permission/auth/team/navigation/private evidence/product/refund files passed after replacing a status paragraph with semantic output.
- Whole-workspace TypeScript checks were attempted repeatedly. They were blocked at those snapshots by concurrent in-progress product-video or business-activity modules/types outside this feature; no remaining R020 errors were reported in the latest attempt. Cumulative TypeScript remains for the coordinator after concurrent changes settle.

## Remaining cumulative acceptance

Fresh synthetic MariaDB must apply the additive file twice and verify CHECK constraints, foreign keys, transactional rollback and simultaneous decision/version races using the hosted adapter. Browser acceptance must exercise two Admin profiles, both Super Admin approvers, active-session revocation, direct APIs/private-media, keyboard interaction and responsive layouts. Full suite, cumulative build, readiness/manifest and deployment-specific acceptance remain coordinated work. SQLite sequential transaction tests are not represented as proof of MariaDB concurrency or production parity.

## Subsequent R004/R014 integration

The permission proposal/approval transactions now also enqueue explicit business notifications in the existing notification_messages outbox (requires migration0033). Different Super Admins receive proposal action notifications; the effective-change subject receives a notification even with empty operational scope. Safe active-staff denied/failed security outcomes are recorded separately, without weakening rollback. New permission API bodies are bounded16KiB. Current cumulative TypeScript passed; additional audit failure/storage regressions were added. See consolidated-r004-local.md and final coordinator checks for updated verification; initial six-test report above records its actual earlier snapshot.
