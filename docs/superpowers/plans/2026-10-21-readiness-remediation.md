# Readiness remediation implementation plan

**Goal:** Fix the nine findings in the approved readiness audit, preserving existing local data and existing uncommitted work.

**Design basis:** `output/audit-2026-10-21/readiness-audit.md`, its executable financial reproductions, and the user's explicit instruction to implement all nine corrections.

**Execution:** Financial lifecycle and hosted MFA corrections first. Independent regression and deployment work uses separate file ownership. No local migration, seed, restore, security initialization, deployment, or commit is part of this task.

## Implementation and verification

- [x] Financial refund ordering: exercise real checkout/delivery/refund/remittance repositories in disposable fixtures; establish original sale and deferred commission reversal exactly once, including partial/full refunds and retries.
- [x] Financial cancellation: reproduce settled remaining parcels after a partial cancellation; reconcile payment, receipts, and seller/managed accrual with transaction/replay protection.
- [x] Hosted MFA: explicit private policy provisioning, durable monotonic initialization, key/origin binding, restart and missing-state protection; test with temporary policy directories and in-memory databases.
- [x] Hosted recovery: implement a supported host-native database/media/release/key recovery procedure with guarded disposable rehearsal; keep web restoration disabled for live installations.
- [x] Cold product images: bounded waiting and shared concurrent derivative work; test an entire 18-image cold catalog, duplicates, errors, and queue recovery while retaining authorization before cache access.
- [x] Unicode evidence: safe ASCII fallback and UTF-8 extended download filename; test Nepali names, punctuation, controls, and long filenames through response construction.
- [x] Discovery: canonical shared public route inventory and explicit nonproduction indexing protection; verify routes, filtered listings, sitemap entries, and private paths.
- [x] Release acceptance: execute required native accounting/billing/financial/security/recovery journeys; fail on required skips; add hosted security readiness without exposing private details.
- [x] Dependency: deliberately update Vite to a compatible patched release and lockfile; rerun the approved npm vulnerability lookup.
- [x] Integrated verification: canonical read-only preflight, lint, typecheck, full test suite, Babal build, targeted browser smoke, database integrity, retained-data hashes, and final change review. Required hosted/Linux checks that cannot run here remain explicit staging gates.

Each behavior change starts with an observed failing regression, followed by the smallest correction and relevant neighboring tests. Final verification runs after all implementation changes are integrated. Tests use in-memory data or newly created temporary fixtures only.
