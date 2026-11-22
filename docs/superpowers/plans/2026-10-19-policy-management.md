# Usable local Legal procedures

Goal: extend the existing editable Legal procedures into a complete operating procedure with Super Admin approval, activation and immutable history, plus staff access to the active version.

User-approved scope: complete wording plus working Super Admin management locally. This implements the existing-flow design presented and accepted in chat. Keep all changes local, preserve records and previous source versions, no database migration or deployment. Do not mark a document approved on the user's behalf or submit real approvals during verification.

Design: retain the existing draft-revision storage and API for compatibility. Add append-only lifecycle events to existing audit_logs, with complete approved document snapshots, actor/time/reason/fingerprints, sequence fencing and identical-request replay. Saving, approving, activating and withdrawing are distinct. Only a saved current revision can be approved and only its exact approval can be activated. Subsequent edits do not change an active version. Future activation uses Nepal time and cannot be backdated; withdrawal supersedes active and scheduled releases. These are internal procedures, not an override for public contracts or financial settings.

The completed procedure covers company readiness, accountable roles, evidence, complaint/refund handling, no automatic penalties, incidents, legal requests, retention/legal holds, recalls, data incidents, providers, change management and a case checklist. Existing Super Admin is accountable until an existing authorized staff member takes a task; no fictitious appointments, phone numbers, listing numbers, legal approvals or retention periods. Existing customer commitments, recorded commercial terms, current 9%/91% model and fixed-price supplies remain intact.

Public agreements, policy bodies/hashes and existing acceptances remain authoritative and untouched. The manager explicitly identifies this boundary. It provides links to the existing public policies and existing staff case/payment workflows. It does not claim scheduled payouts, reserve activation, automatic deadline alerts or legal certification.

## Tasks

- [x] Inspect current Git state, instructions, editor/storage/access and tests; checkpoint all tables, uploads and source hashes.
- [x] Write failing isolated lifecycle tests: exact revision approval, active/scheduled selection, no backdating, immutable/retry history, stale writers, current/revoked authority and unchanged non-audit data.
- [x] Implement strict lifecycle model and append-only repository with transactional authority/parent fencing and corruption detection.
- [x] Add authenticated bounded same-origin management routes and read-only active procedure access for existing Admin/Super Admin accounts; no bootstrap writes.
- [x] Write finished procedure content, preserving historical templates; integrate load/save, approval/activation/withdrawal, state/history/error UI and staff read/download links.
- [x] Test real handlers and intercepted browser flows, including small screens, failures, stale tabs, no accidental submission and staff-versus-Super-Admin boundaries.
- [x] Separate GPT-6.1 Sol extra-high code and test reviews; fix material findings with regressions. Main agent controls all server/database operations.
- [x] Run safe related regressions, lint, typecheck, build, local:check and read-only normal Chrome verification. Compare schema, tables and uploads; leave server running.

Verification ruling: mutation tests use only in-memory SQLite or intercepted browser fixtures. Do not run unsafe recovery/external-database suites or create additional worktrees, accounts or databases. Leave prior uncommitted work and launch protections intact. No commits or pushes.

Review outcomes: corrected MariaDB quoted JSON scalar handling, replaced pending schedule behavior, approval clock rollback, exact saved-version/control/time confirmation, uncertain-response notices and stale notices after refresh. Added isolated regressions for append-time newer drafts, uncertain commits, concurrent retries, populated financial preservation, real route boundaries and browser A-to-B state changes. Both reviewers reported no remaining material findings.

Final checks: lint, npm typecheck, build, local:check and git diff --check passed. The broad related run passed46/47; its navigation-order failure was corrected and all5 affected navigation/expanded-browser checks passed on rerun. Focused lifecycle/legacy run21/21 and expanded lifecycle/route run15/15 passed. No unresolved test failure in the tested scope. Native MariaDB and staging remain untested.

Evidence folder: C:/Users/abinash/.codex/visualizations/2026/10/16/01a14556-3584-7d82-961e-ed79b6202897/policy-management. Actual local Chrome checks passed at1440/390/320 with fourteen completed sections, full scrolling, no overflow/errors/business-record submissions and correct Admin management403/active-read200. Normal Chrome remains on the Super Admin manager with completed wording loaded in unsaved preview. All152 application tables, schema and12 uploads match the starting checkpoint; only internal Cloudflare metadata changed. No actual save, approval, activation or withdrawal was submitted against retained data.
