# Promo fixtures and dependency security implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user authorized implementation in this chat; the main agent implements and controls the server/database, with separate read-only code and test reviewers.

**Goal:** Restore meaningful promo security coverage and remove dependency warnings through verified compatible fixes.

**Architecture:** Test prerequisites live in isolated fixtures, using the current schema, saved rate records, seller acceptance and reviewed checkout quotes. Application permission, financial and quote guards remain unchanged. Dependency changes must retain supported APIs or include a narrow, tested security patch when no compatible upstream fix exists.

**Tech stack:** TypeScript, Node test runner, Miniflare/D1 fixtures, npm lockfile, React/Vinext/Vite.

**Spec:** The user's latest request and the findings in the local security report from 19 October 2026.

## Global constraints

- Preserve existing working-tree changes, application records, agreements and saved commission terms.
- No application database migrations, seeds, resets or restores; test-only schemas and fictional data remain isolated and nonpersistent.
- No weakened security checks, forced framework downgrade, deployment or push.
- Keep the canonical project and approved launcher/baseline settings unchanged.

## Review focus

- A negative test must reach the intended guard, rather than fail earlier because terms or a reviewed quote are missing.
- Promo usage/budget races must have exactly one legitimate winner and no partial financial writes.
- Exact replay must retain the original quote; changed input or revoked authority must fail.
- Package updates must preserve local startup, image sanitization, hosted-build exclusion of local test access and current application behavior.
- Every dependency finding must be resolved or documented with version-specific evidence; do not suppress advisories to produce a green report.

## Task 1: Repair isolated promo fixtures

Files: `tests/promo-checkout.test.ts`, `tests/promo-checkout-routes.test.ts`, narrowly scoped `tests/helpers/` additions if useful.

- [x] Reproduce existing failures against fictional, nonpersistent databases and inspect current guard prerequisites.
- [x] Add explicit historical rate/acceptance data in test fixtures; retain current-schema triggers.
- [x] Supply reviewed quotes derived from fixture cart, saved delivery configuration, wallet/promo values and current policy context before each attempted order.
- [x] Assert forced failures reach the real financial batch, and concurrency/replay tests retain their original checks.
- [x] Run the promo route/repository/aftercare security suite and request read-only test review.

## Task 2: Resolve remaining dependency findings

Files: `package.json`, `package-lock.json`; a narrow dependency patch/test only if required after inspecting upstream releases.

- [x] Record current audit and package versions; inspect official metadata/advisories and compatibility.
- [x] Apply compatible security releases without install scripts; avoid unrelated major framework changes.
- [x] If a vulnerable unpatched transitive dependency remains, inspect a safe bounded fix or supported replacement and verify its actual behavior.
- [x] Verify full and production-only audit results, lockfile consistency, lint, type checks and build; request read-only code review.

## Task 3: Verify preservation and checked preview

- [x] Compare application-table hashes before/after using read-only database access.
- [x] Run local:check; restart only the verified canonical server through npm run dev if packages changed.
- [x] Check health and anonymous Accounting denial, then report exact pass/fail/unverified results with evidence.

No commit is required; leave all work reviewable in the current working tree.

## Execution record

Completed locally on 20 October 2026 Nepal time. Promo/aftercare126 tests and security88 tests passed; lint, type checks, build, full clean install and dependency-tree verification passed. Both npm audits report zero known advisories. All153 tables compared; application records, saved settings and agreement history unchanged (emulator metadata only).

Ruling: Preserve the existing dirty canonical checkout and implement in place, as explicitly requested.

Ruling: Use a transparent private brace-parser derivative because no upstream fixed release exists. Its nesting, parent-chain and AST guards were reviewed and tested, including a demonstrated range-argument failure before the fix.

Ruling: Resolve only the generated stale npm link metadata after proving the same manifest works in a clean fixture. A full clean install with the final lockfile then passed; no npm security checks were disabled.

Broader MFA, CSP, hosting review and native MariaDB concurrency remain outside this authorized phase. No migration, deployment or push performed.
