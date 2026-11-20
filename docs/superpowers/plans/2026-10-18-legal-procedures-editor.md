# Legal procedures draft editor implementation plan

> **For agentic workers:** Use superpowers:executing-plans in this canonical local checkout. Preserve pre-existing work; do not create a stale launch target.

**Goal:** Refresh and edit the internal Legal procedures draft as Super Admin with preserved history.

**Architecture:** Dedicated draft model/content, append-only audit repository, direct current-identity authorization, bounded API and client workspace. Source baseline and public agreements remain unchanged.

**Tech Stack:** TypeScript, React, D1-compatible SQLite, existing audit_logs, Node tests and Chrome.

**Spec:** ../specs/2026-10-18-legal-procedures-editor-design.md

## Global constraints

- Canonical HastaBazaar, protected launcher, local_staging only; no deployment or migration.
- No UPDATE/DELETE to existing records, no agreement/public-policy/financial changes.
- Draft-only snapshots with current shared company details and retained originals.
- Main agent controls server/database; two independent reviewers are read-only.

## Review focus

- Competing saves and exact retry binding must preserve immutable attributed history.
- Revoked/disabled/forged Super Admin must fail at API and commit boundaries.
- Oversized, malformed, cross-site and unknown-control-field requests must not write.
- History must validate fingerprints and fail closed; editable text must remain inert.
- Save failures and history navigation must retain unsaved text; small screens must remain usable.

## Tasks

- [x] Model/storage: write failing isolated tests, implement validated snapshots + conditional append and history, rerun tests.
- [x] Access/API: write failing real-auth-boundary tests, implement strict current Super Admin checks and draft-only GET/POST, rerun tests.
- [x] Workspace: write failing mounted interaction tests, implement readable sections, plain-text preview, save/error/history UI and updated page, rerun tests.
- [x] Verify related regressions, lint/typecheck/build/preflight; independently review; verify Chrome and one approved save; compare retained data/schema/uploads and source fingerprints.

## Execution ledger

- Before checkpoint: 3,017 existing source files hashed; 153 local tables and schema fingerprinted read-only; 12 upload blobs hashed. Existing uncommitted Accounting and launch-protection work preserved.
- Ruling: reuse audit_logs with deterministic revision IDs rather than introduce a schema or overload published business settings. Each append is its own audit record; original rows remain intact.
- Ruling: user approval covers this local implementation and Super Admin editor. Continue inline with independent read-only reviews; no extra approval or commits are needed for routine reversible implementation.
- Ruling: do not change the global admin authentication layout for this local document feature. The new API/leaf lookup is read-only; existing hosted page session maintenance remains a disclosed limitation. Verify actual local records with before/after fingerprints.
- Independent code review found exact-retry races, insufficient Nepali text request budget, metadata outside the fingerprint, and hosted identity lookup side effects. Regression tests reproduced them; the implementation now resolves retries at both race points, supports 192 KiB JSON, hashes the whole snapshot, and reads existing session/identity state without account linking or session touches in the new helper/API.
- Independent test review prompted populated order/accepted-term/settlement sentinels, commit-time authority revocation, second-actor retry ownership, absent Origin, real hosted cookies and valid browser snapshot hashes. All tests stay in isolated fixtures.
- Combined related run: 52 passed, zero failed/skipped. Final stylesheet-backed editor test additionally reproduced and fixed low hover contrast, and passed after the final class change. Full project suite was not rerun; this scope uses related legal, agreement, form-policy, repository, route and browser coverage.
- Normal Chrome displayed the new page and editor; one approved Save draft created internal-legal-draft:1 for Nisha Super Admin. Windows capture later failed with “window crop is outside captured monitor”; no more native input was attempted after failed recovery. Separate read-only Chrome verification confirmed persistence, history, original source, editor controls, 1440px/375px layout, full section scrolling, no page errors and API guest 401/Admin 403/Super Admin 200.
- Preservation checkpoint: only audit_logs (one new draft) and _cf_METADATA changed. Existing audit rows, all other 151 tables, schema and 12 upload blobs match the before snapshot. Only the intended legal page changed among the 3,017 pre-existing source files; launch protections, Accounting work and public/legal agreement sources remain untouched.
- Final checks: lint, typecheck, native build and local:check all exited 0. Final health returned ok. Canonical root and approved baseline settings are unchanged. Final independent code recheck found no further material issue in scope; test recheck found no further important coverage gap. Evidence is in the task visualization directory under legal-procedure-update/verification-summary.json with logs, preservation fingerprints and screenshots. No deployment, migration or full-suite run was performed.
