# Production inventory implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this bounded read-only task with review before host execution. Steps use checkbox syntax for tracking.

**Goal:** Establish the exact current production source, schema/security delta, media and recovery capacity before designing any production mutation.

**Architecture:** A candidate-bound operational Node inventory reads the production selector privately, opens one read-only database connection and writes only new private diagnostic files. It reuses the existing inventory/readiness primitives where their assumptions apply, with an explicit keyless-legacy security branch. A native wrapper verifies the operator and creates exclusive diagnostic outputs; it does not run application code or select the candidate.

**Tech Stack:** Existing Node22.23.3, MariaDB10.11.19, mysql2, esbuild, Python standard library, cPanel read-only UAPI.

**Spec:** `output/hosted-staging-preparation-2026-10-21/final-host-recovery/PRODUCTION-READINESS-BLOCKERS.md`, steps2–3, and the user's 2026-10-23 instruction to proceed, preserve existing data, verify backup/recovery and pause for personal production MFA before deployment. This plan covers inventory only; backup, upgrade and security actions require a concrete subsequent plan based on these observations.

## Global Constraints

- Canonical local root `C:/Users/abinash/Desktop/HastaBazaar`; preserve local retained SQLite data, HEAD/index, launcher and localProjectRoot/baseline settings. No Git publication, install, seed, restore or migration.
- Host account `/home2/hastabaz`, source application `hastabazaar-app`, source database `hastabaz_marketplace`, origin `https://hastabazaar.com`, current release `hastabazaar-release-ci-38358135513-1` under `hastabazaar-production-releases`.
- Candidate `27b0d15100123783da8fe0a59589a1aaef31e06a`, release `hastabazaar-release-ci-39684716989-1`, archive SHA256 `944338c2d1a280cccfbc11fcec58b983df1374a15854a1bb6c683eacb986e6bf`, release-manifest SHA256 `0f9e900a30f3f461bd80d1032db6dde13783368d8720a4e43a7494ce000e237d`.
- Host diagnostic root `/home2/hastabaz/.hastabazaar-deployment/production-readiness-20261023-39684716989-1`; all new directories0700/files0600, canonical owned non-symlink/single-link files. Never overwrite an earlier result.
- No DDL/DML, key/policy provision, application import/bootstrap, selector mutation/restart, cron/dispatch/lock change, artifact activation, deletion, grant, campaign/MFA action or staging mutation. No secret/body/raw child-error logging or credentials in argv/files/output. Selector secrets remain memory-only.
- This is an observation of a live source, not a coordinated backup, source conservation proof or deployment acceptance. Unknown security/schema/source state is reported or stops without repair. No staging security state is copied.

## Review Focus

- Wrong release/origin/database or changed selector/current/access boundaries must stop without active action.
- Absent key, policy and zero private records must be reported as legacy-uninitialized; no fabricated key/provenance/readiness.
- Candidate readiness must use the pinned candidate manifest and unchanged candidate product sources; absent schema is evidence, not permission to migrate.
- Unknown tables/views/routines/events, source changes during a live observation and incomplete media must not be silently certified as full recovery.
- Connection/process failures must emit sanitized phase/type data without credentials or raw stderr; result provenance must distinguish filesystem free space from account/database quota.

### Task 1: Reviewed production inventory operator

**Files:** Create under `output/production-readiness-2026-10-23/`: `production-inventory.mjs`, `production-inventory-checks.mjs`, `production-inventory-checks.test.mjs`, `build-production-inventory.mjs`, `run-production-inventory.py`, `production-inventory-review.md`, generated `production-inventory-bundled.mjs`, `production-inventory-build.json` and `production-inventory-freeze.json`. Create no product source changes.

**Interfaces:** Consume the controller's sanitized `initial-metadata.json` and exact current/candidate identities. Produce private host `inventory-20261023/receipt.json` plus detailed schema/media inventories; final receipt contains only sanitized identity/control hashes, snapshot counts/hashes, security branch, exact candidate readiness missing list, ledger metadata, quotas, media completeness and limitations. Builder records every input hash and pins product sources to candidate Git blobs or the exact packaged generated manifest. Entry functions are inert on import for pure tests.

- [ ] Write failing pure tests for wrong-target refusal, keyless legacy classification, conflicting/partial protected state refusal, one-statement SELECT/SHOW enforcement, sanitized failure and truthful live-inventory limitations.
- [ ] Implement the bounded inventory using one connection and explicit read-only transaction; no production SQL can originate outside the reviewed read-only adapter except the fixed session/transaction controls. Include complete table names/engines, migration ledger, candidate schema diagnostics, defaults/allocation/trigger owners, roles/private-record aggregates and media inventory. A failure of the exact native collector reports incomplete status rather than certifying unknown tables.
- [ ] Record selector/runtime/current/bootstrap/access/gateway hashes without dumping secrets, existing source artifact identity and integrity if found, production-owned worker/cron/event boundaries, current-account clients/grants and read-only UAPI capacity/quota. Do not discover other users' processes or use broad recursive file searches.
- [ ] Run focused tests and package verification, including bundle parse, all input hashes, candidate-source binding, wrapper private stdout/error identity and unreachable mutation paths. Freeze exact upload files with size/SHA256. No tests against the retained local database.
- [ ] Review spec compliance and task quality independently using the brief, report and saved source diff. Root verifies final pins, uploads only approved inputs, verifies native ownership/mode/hash and executes once. Authenticate downloaded actual proof against native digest and independently review before using it to plan backup or maintenance.

## Execution and authorization

The user already selected subagents with review and has explicitly authorized this production inventory through the linked blocker document and follow-up instruction. Continue the read-only task without another generic permission request. Permanent deletion, security access expansion, personal MFA entry and final deployment remain distinct action boundaries. No production mutation is approved by this inventory plan.
