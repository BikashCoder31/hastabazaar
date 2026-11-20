# Security and portable transfer implementation plan

> **For agentic workers:** Use superpowers:executing-plans for integration and superpowers:dispatching-parallel-agents for independent implementation units. Steps use checkboxes for tracking.

**Goal:** Working local Admin MFA, recovery and short sessions, plus a Super Admin encrypted Backup & Transfer workspace that can export and inspect complete portable data without restoring into this installation.

**Architecture:** Existing `marketplace_settings` stores encrypted auth-private state with transactional CAS. Central identity/session verification enforces enrolled staff assurance. Versioned encrypted transfer packages include all database tables, upload bytes/metadata and protected key recovery; source exports are read-only, destination restoration is an explicit operation against an empty compatible destination only.

**Tech stack:** TypeScript, Node crypto, existing D1/SQLite and R2 interfaces, Next/Vinext, React, existing qrcode library. No new remote service or schema migration.

**Specs:** `docs/superpowers/specs/2026-10-20-admin-mfa-design.md` and `docs/superpowers/specs/2026-10-20-hosting-portability-requirements.md`.

## Global constraints

- Canonical Desktop/HastaBazaar checkout only; preserve dirty work and approved baseline/launcher.
- No migration, seed, reset, production/staging access, deployment or live-backup import.
- All account/data-writing tests use isolated fixtures; main agent runs database/server operations.
- Preserve users, roles, permissions, financial records, agreement history and saved commission terms.
- Owner confirms their authenticator and privately saves recovery codes; no automatic enrollment.
- Security key is server-only, durable, explicitly ignored and exportable only through protected recovery.
- Existing setup-pending access remains available; enrolled accounts cannot use local fixture cookies to bypass MFA.
- Session limits: 8 hours absolute, 30 minutes idle. Recovery codes: 10, minimum128 random bits each. TOTP: 6 digits/30seconds, bounded +/-1step and replay protection.
- No commits/pushes or new checkout: user explicitly requires this canonical checkout and preservation of all prior uncommitted work.

## Review focus

1. Concurrent stale recovery/enrollment claims must roll back all related statements, not commit half a sign-in.
2. Missing/corrupt key or security record after initialization cannot downgrade protected staff to unenrolled.
3. Legal/raw-session, private media, form answers, invitation promotion and contact-session rotation cannot skip assurance.
4. Complete transfer includes private media and encrypted security state/key recovery; no session/reset/job replay on a new host.
5. A forged/stale local role cookie is never a verified second factor; UI must distinguish local setup simulation and active protection.

## Tasks and interfaces

### 1. Encrypted security state and MFA engine

Owner: dedicated independent implementer. Files `lib/security/{crypto,store,mfa}.ts`, security tests. Produce encrypt/decrypt, strict versioned account/proof state, TOTP, recovery hashes and transaction-guarded account/proof updates. Existing table only, quoted identifiers and byte-exact CAS. Public interfaces are exported TypeScript functions consumed by integration after review. No real DB access.

- [x] Write and run failing pure crypto/TOTP tests; write isolated DB tests for main-agent execution.
- [x] Implement authenticated encryption, base32/TOTP vectors, strict validation and single-use transactional claims.
- [x] Prove concurrent/replay/corruption/rollback behaviour with isolated fixtures.

### 2. Portable encrypted transfer core

Owner: dedicated independent implementer. Files `lib/portability/*.ts`, portability tests. Produce versioned typed `PortableSnapshot`/manifest, encrypted package/passphrase/key-recovery support, source inventory and validation, destination-plan/empty-compatible-target restoration via injected adapters. No extraction of executable archives and no arbitrary SQL from uploaded input. No live DB/filesystem operations.

- [x] Write failing serialization/encryption/integrity/incomplete-package tests.
- [x] Implement bounded records/chunks, typed values, upload hashes/metadata, every-table classification and strict validation.
- [x] Implement injected source/target adapters and verify restore into disposable fixtures only. Active operational grants are excluded from reactivation, jobs paused.

### 3. Local key/runtime and central authentication integration

Owner: main agent. Files `lib/auth/hosted-session.ts`, `app/auth.ts`, `lib/auth/staff.ts`, `lib/legal-procedures/access.ts`, local runtime/key setup helpers and relevant security routes/tests.

- [x] Capture read-only data digests and check existing server; keep original application data unchanged.
- [x] Add ignored server-only key provisioning and safe runtime binding; never overwrite a key or expose it in Vite public/config output.
- [x] Add security status/setup/confirmation/verify/recovery/rotation endpoints with trusted-origin, bounded-body and atomic rate budgets.
- [x] Share central assurance checking across hosted identities, direct/raw legal access, promotion and session rotation. Preserve mailbox/bootstrap and permission protections.
- [x] Add explicit first-password ceremony for existing no-password staff using fresh captured mailbox proof; user privately enters credentials. Do not perform ceremony on existing accounts automatically.
- [x] Implement server-side role-aware absolute/idle caps and restricted pre-MFA sessions, safe redirects/cookies and no local-test bypass for enrolled accounts.

### 4. Security and transfer workspace

Owner: independent UI implementer. Files `components/security/*.tsx`, `app/account/security/page.tsx`, `app/admin/backup-transfer/page.tsx`, navigation additions. Core API URLs: `/api/security/{status,setup,confirm,verify,recovery,bootstrap}`, `/api/admin/backup-transfer` and `/api/admin/backup-transfer/inspect`. Responses use `{error}` on failure and JSON data on success; export download is encrypted binary. Status includes setup/active, role/session limits and actionable safe errors. Main agent finalizes routes and contracts.

- [x] Write interaction/source tests before implementation; use no secrets in screenshots.
- [x] Provide authenticator QR/manual entry, two-step activation/recovery acknowledgement, recovery-code verification and clear pending/active state.
- [x] Provide encrypted export, separate key-recovery download, package inspection/inventory/validation and explicit current-installation restore prohibition. Require recent MFA for any complete backup/key export.
- [x] Mobile layout, labels, loading/error states and password/code inputs with no logging or URL secrets.

### 5. Data/storage adapters, route authorization and end-to-end verification

Owner: main agent. Read-only local source adapter inventories all SQLite tables and R2 objects, streams/chunks packages rather than unbounded rows. Add missing media list support to Node adapter. Future supported-engine adapters are explicit; unsupported destinations fail, no universal-hosting claim.

- [x] Run source/export and target fixture tests, before/after live data hashes and private-access checks.
- [x] Run targeted auth/security/financial regressions, lint, typecheck and build; fix failures without weakening guards.
- [x] Separate GPT-6.1 Sol extra-high code and test reviews; address actionable findings with regression checks.
- [x] Run checked local launcher/preflight, verify normal Chrome with existing sessions and isolated auth fixtures. Owner-only enrollment remains clearly pending until the owner completes it.
- [x] Report working features, passed/failed/not-tested evidence, supported portability boundaries and no migrations/deployment. Leave correct checked local server running.

## Execution ledger

2026-10-20: User explicitly requested implementation of both written designs. Ruling: proceed with implementation under that authorization without another generic approval loop; preserve owner-only activation and all destructive/external-operation boundaries. Independent units may be delegated under the parallel-agent skill; main agent alone controls the running server and database commands. Current canonical checkout is mandatory, so no worktree switch or Git cleanup.

2026-10-20: Implementation beginning. Existing source, records and secrets have not been changed by this plan creation.

2026-10-20: Implementation and verification completed locally. 100 security/transfer/UI/runtime checks, 79 existing regressions, and the separate disable/reactivate regression passed. Lint, TypeScript, build and protected preflight passed. All 152 application-table hashes unchanged; only Cloudflare metadata changed. GPT-6.1 Sol extra-high code and test reviews completed. Owner enrollment and actual full-data export remain pending; no live hosting transfer/MariaDB restore was claimed. See docs/admin-security-and-transfer.md and the external verification evidence folder. Checked local server remains running; no migration or deployment.
