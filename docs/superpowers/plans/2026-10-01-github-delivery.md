# GitHub Delivery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with focused tests before implementation.

**Goal:** Verify updates in GitHub, produce Linux-compatible Babal release packages, and prepare explicitly triggered, data-preserving deployment.

**Architecture:** Use the user-selected audit candidate `5e3f6a2` as the source baseline. Run tests and builds without hosting credentials. Keep production unchanged during setup; deployment requires a verified artifact, an isolated target, current recovery evidence and explicit operator action.

**Tech Stack:** Node 22, npm lockfile, GitHub Actions, Linux tar, cPanel/Passenger, MariaDB.

**Spec:** User requests from 1 October 2026: set up GitHub/build/staging/deployment; copy only the latest backup set; use the newer audit candidate. Preserve sellers, published products and all production data. Cleanup is a later task.

## Global Constraints

- No production release, schema migration, database restore or test-data deletion during setup.
- No production build or dependency installation on the 1 GB host.
- No backups, private uploads, credentials or development seed files in releases or GitHub.
- Use separate staging database/media and no live outbound providers.
- Copy only the newest verified backup set when recovery transfer is needed; retain older originals.
- Fail closed for unsupported host access or incomplete staging isolation.

## Review Focus

- Archive traversal, symlinks, missing or extra files must reject an artifact.
- Staging must never share production database, media, origin or SMTP.
- A newer build must not automatically replace the active production release.
- Rollback must restore application code only, preserving newer business data.
- Historical backup directories must not be uploaded or pruned by automation.

### Task 1: Reproducible CI Release

**Files:** `.github/workflows/verify-release.yml`, `scripts/package-babal-ci.mjs`, `scripts/release-files.mjs`, `tests/github-delivery.test.ts`, `package.json`, `.gitignore`.

**Interfaces:** `inventoryRelease(root)` returns sorted `{path,bytes,sha256}` records; `verifyRelease(root,manifest)` rejects unexpected files, unsafe paths, secrets and hash differences. CLI packaging takes a versioned release ID and emits one archive plus checksum/inventory under ignored `outputs/`.

- [x] Add tests for forbidden files, symlinks, tampering and exact required-file verification; observe RED.
- [x] Implement deterministic inventory and Linux archive verification; observe GREEN.
- [x] Add push/PR/manual CI with read-only token, locked installation, lint/type/test/build, packaged Linux artifact and bounded retention.
- [ ] Verify the full candidate suite and actual GitHub run. Publish only audited source, not historical backups or preparation folders.

### Task 2: Hosting Integration

**Files:** `docs/github-delivery.md`, deployment scripts only after actual SSH/Passenger inventory confirms a supported safe switch.

**Interfaces:** Deployment consumes the exact CI artifact and its checksum, not a rebuild. Production is manual and separately gated. Database migrations remain separately reviewed additive maintenance.

- [x] Inventory the current release, host resources, latest recovery set and SSH capabilities read-only.
- [x] With exact access approval, configure least-privilege deploy access and isolated staging. No production data import.
- [x] Test a staging deployment and record actual checks. Keep production disabled if any prerequisite remains unverified.
- [x] Record configured settings, usage, limits, backup policy and outstanding acceptance evidence in the operations guide.

## Progress

- Native managed worktree created; branch `codex/github-delivery`.
- Live health confirms `hastabazaar-release-2026-10-01-112000`; production remains unchanged.
- Host inventory: 1 GB RAM, 398.63 MB used; 1 of 3 databases; SSH and Terminal enabled, no existing SSH keys.
- Latest observed separate recovery set: `deployment-backups/pre-migration-20260930T105316Z-0f199f4a/`. This predates later writes and is not certified as a current deployment backup.
- Candidate full serial regression: 2,263 passed, 14 skips, zero failures.
- First actual GitHub Linux CI and extracted native/runtime smoke passed in run 36882980032.
- Separate staging database initialized from 48 verified files, with zero users, sellers, products and orders.
- User-approved restricted staging key rejects arbitrary commands and completed its first HTTPS-ready deployment; production stayed unchanged.
- Review regressions cover timeout-before/after-switch rollback, bounded payloads, parser link/path/file rejection and exact checksums; temporary incoming data is removed without pruning installed releases or backups.
- Final main integration/automatic staging run and temporary setup-key removal remain to be verified.
