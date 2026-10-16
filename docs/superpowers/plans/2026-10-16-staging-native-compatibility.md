# Staging Native Compatibility Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Main implements and owns all server/database/deployment work; separate GPT-6.1 Sol extra-high code and test reviews remain read-only.

**Goal:** Deploy the approved cumulative Desktop update to isolated hosted staging without losing records or weakening its business guards.

**Architecture:** Port the existing SQLite 0071/0072 storage contracts to additive MariaDB companions, translate the three newly used SQLite query forms, and require complete release readiness. Verify actual MariaDB behavior in a new loopback Docker fixture before any hosted upgrade or code activation. Use the existing GitHub/Linux package and restricted staging gateway.

**Tech Stack:** Node 22, TypeScript, MariaDB 10.11, existing mysql2/Docker tools, GitHub Actions, Babal/Passenger.

**Spec:** Approved company-store and loyalty requirements in `2026-10-15-company-store-maker-readiness-design.md`, existing 0071/0072 migrations, and `docs/github-delivery.md`; latest user request authorizes staging only.

## Global Constraints

- Canonical checkout remains `C:/Users/abinash/Desktop/Hatskala`; no historical launch targets.
- Preserve Desktop data, existing offers, staging records/media, Git history and backups.
- Do not deploy production or import base/reset/seed SQL into an existing database.
- Main alone controls servers, fixture/hosted databases, Git integration and deployment.
- Native tests use a newly owned loopback-only MariaDB fixture; no arbitrary remote credentials or database target overrides.
- Hosted schema inventory and a verified recovery set precede any separately reviewed additive upgrade. The deployment gateway never runs migrations.
- No acceptance backfill, automatic publication, changed commercial rules, enabled earning, or weakened permission/financial guards.
- Scope includes all approved Desktop work ahead of remote main `6204ae4`; pending PRs 14 and 15 are ancestors and must not be reimplemented.

## Review Focus

- Null versus non-null scheduled state must compare identically through real MariaDB, including stale retries and due promotion.
- Private-document ownership prefixes must remain exact; concatenation must never become MariaDB logical OR.
- JSON history authorization must reject absent/non-string catalog digests rather than fail open.
- Released allocations may be followed by another reservation; two simultaneous reservations for one entitlement must fail.
- Repeated upgrades preserve old-column values and immutable evidence; readiness rejects any missing new field or guard.

### Task 1: Native query compatibility

**Files:** `lib/runtime/node-bindings.ts`, new `tests/staging-native-compatibility.test.ts`.

- [ ] Add failing literal-output tests for nullable `IS ?`/`IS NOT ?`, the actual maker private-path concatenation, and the new history JSON string predicate. Existing unrelated SQL/literals stay unchanged.
- [ ] Implement narrow native translations preserving SQLite null/string semantics; run these regressions and existing adapter tests.

### Task 2: Additive native storage and complete readiness

**Files:** new `deployment/babal/mariadb-company-store-maker-readiness.sql`, new `deployment/babal/mariadb-loyalty-scheduled-changes.sql`; generators, generated bootstrap/reset/manifest, `lib/operations/readiness.ts`, and focused tests.

- [ ] Exercise the real manifest/schema generators with explicit expected maker/weekly/scheduled fields and all new guards; observe missing-storage failures first.
- [ ] Port all 0071 columns/FKs without backfilling acceptance. Port allocation/payout immutability and use a nullable generated reserved-entitlement key with a unique index.
- [ ] Port scheduling defaults NULL/NULL/0, matching revision/start validation and due-claim guard without replacing weekly history or changing current rules.
- [ ] Register ordered additive companions and bootstrap generation. Ensure readiness discovers every column in multi-column ALTERs and verifies the reserved-allocation uniqueness safeguard.
- [ ] Run generation and focused readiness/schema regressions. Never execute generated reset SQL on saved data.

### Task 3: Actual native-engine verification

**Files:** new guarded `scripts/verify-staging-native.mjs`, `tests/helpers/staging-native-fixture.ts`, `tests/staging-native-runtime.test.ts`; existing CI workflow.

- [ ] Create a uniquely named, labeled MariaDB 10.11 container bound only to 127.0.0.1:13329, with generated fixture-only credentials stored outside tracked source. Never attach saved project data.
- [ ] Verify fresh bootstrap, repeated additive companions and populated old-column preservation. Do not reset/delete existing databases or records.
- [ ] Through real `env.DB`, test referral SELECT-only totals/statuses; scheduled draft/publication/old claim/due promotion/replay/pause/cancel; accepted maker evidence/prefix checks and allocation history/one-reservation constraints.
- [ ] Require this isolated native check in CI before packaging. Keep no hosting credentials in test/build jobs.
- [ ] Run relevant tests, lint/typecheck/build and independent final reviews; fix only reported compatibility issues.

### Task 4: Staging release

- [ ] Obtain an authenticated cPanel session from the user; inventory staging schema/forms and current release read-only. No secrets in chat/logs.
- [ ] Prepare and verify staging-only database/application/media recovery evidence and the exact missing additive upgrade. Preserve existing columns/rows/offers and initialize only verified missing required form definitions.
- [ ] Push the reviewed branch and create/attach one cumulative PR; use existing checks and preserve the ancestor pending PR history. Integrate only when schema/readiness gates are satisfied.
- [ ] Wait for the exact Linux artifact and restricted staging deployment; confirm health/source identity, permissions, new sections and preserved data in Chrome.
- [ ] Leave the correct Desktop preview running and staging open for user verification. Report any incomplete gate plainly; no production deployment.
