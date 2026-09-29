# Babal release preparation plan

> For agentic workers: use superpowers:subagent-driven-development for independently scoped implementation and review; keep heavy build/test jobs serialized.

**Goal:** Preserve and package the current HastaBazaar work for the existing Babal.Host site, with an honest release gate and a reviewed maintenance procedure.

**Architecture:** Freeze the current commit plus the explicitly enumerated 38 responsive/header changes. Audit the native Node/MariaDB target separately from local D1. Correct demonstrated release-inventory omissions, build the native candidate, and record blockers before any upload or production mutation.

**Tech Stack:** Vinext/React, Node 22, MariaDB 10.11 target, Sharp, Passenger/cPanel, PowerShell packaging.

**Spec:** User request to prepare all completed work for existing Babal.Host hastabazaar.com; docs/testing/checkout-contact-watermark-self-test.md and the existing promo/MariaDB compatibility report define verified boundaries.

## Global constraints

- No production access, deployment, live migrations, live messages, payments, database resets, or secret collection in this preparation.
- Preserve all 38 existing dirty paths byte-for-byte, including untracked files. No blanket staging.
- Keep localhost:4173 and its persistent stores available.
- Phone verification remains required; no provider is selected. Do not silently disable the checkout gate.
- Production readiness requires real target-runtime evidence; a local D1 pass or successful build cannot replace it.

## Review focus

- Additive upgrade inventory must include new contact/COD and form-catalog prerequisites, with checksums; never prescribe base/reset SQL for the existing database.
- Windows native modules must not be mistaken for Linux host dependencies.
- Exclude environment files, credentials, local sessions, uploads, local databases and fixtures from any deployment artifact.
- Preserve currently uncommitted customer-facing changes in the candidate's source manifest.
- Rollback must account for irreversible MariaDB DDL and new writes; do not replay destructive down migrations.

## Tasks

- [x] Capture source hashes, commit, working diff, existing deployment instructions and known compatibility evidence.
- [x] Confirm Babal.Host target and SMS provider status with owner.
- [x] Independently audit runtime blockers and responsive/release scope.
- [x] Reproduce release-manifest omissions with a meaningful failing test, make the smallest correction, and obtain specification then quality review.
- [x] Build the Babal target locally; inventory architecture-specific native dependencies and verify source preservation.
- [x] Prepare an immutable source handoff, exact migration/checksum inventory, environment template, go/no-go checks, smoke checks and backup/rollback instructions.
- [x] Verify artifact contents/checksums and report ready items separately from launch blockers. No upload-ready claim until all launch gates pass.
