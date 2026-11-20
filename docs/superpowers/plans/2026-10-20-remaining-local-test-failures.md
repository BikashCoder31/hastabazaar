# Remaining local test failures

> Execution: main agent coordinates isolated tests; independent agents have disjoint file scopes. No commits or deployment are part of this task.

**Goal:** Correct the remaining tests and any demonstrated bugs while preserving retained records, agreements, financial snapshots and security protections.

**Spec:** The user's request on 20 October 2026 and the canonical checkout instructions in `AGENTS.md` and `LOCAL-START.md`.

**Approach:** Reproduce failures by subsystem, correct incomplete disposable fixtures and stale assertions, then run the complete suite. Financial prerequisites must be explicit in fixtures; missing published terms must continue to fail in application code. Sensitive security forms remain protected fixed controls and never collect generic form answers.

## Constraints

- Use only the canonical HastaBazaar checkout. Preserve dirty work and Git baseline settings.
- No retained database migrations, seeds, reset, restore or imports; no account, agreement or saved-rate edits.
- Main agent alone controls servers and database operations. Existing port 3018 server remains the launch target.
- Disable native/retained database and browser-origin opt-in flags for test execution. Writes use only in-memory or disposable fixtures.
- Do not remove negative assertions, skip failures or weaken authentication, origin, permission or financial transaction guards.

## Review focus

- Historical terms and zero-fee scenarios remain explicit and unchanged; current 12%/88% terms stay independent.
- New checkout quotes must reflect the cart, saved policy and credits being tested, including retries and races.
- Security forms must not expose configurable secret fields or store MFA/password/passphrase answers.
- Authentication fixtures exercise actual current role/session validation and revocation.
- File tests use the actual media adapter's paths and preserve range/privacy behavior.

## Tasks

- [x] Reproduce and correct commission-dependent fixtures in seller-data, commerce, programmatic settings, native maker terms and item-history tests.
- [x] Register and explicitly inventory eight protected security forms, preserving their handlers and database publication baseline.
- [x] Correct auth, launch, navigation, footer and media fixture expectations after reproducing each failure.
- [x] Correct loyalty and returns checkout fixtures with explicit historical terms and current reviewed quotes.
- [x] Run targeted tests for every changed subsystem; independently review financial and security corrections.
- [x] Run the full suite with isolated test flags, followed by lint, type checking, build and read-only local preflight.
- [x] Record final evidence, remaining skips/limitations and preservation checks in the task's local report.

Verification uses existing tests first. Any genuine code defect needs a failing regression test before its minimal correction. The full suite may use two independent file workers after fixture safety review to reduce runtime; stateful external-service tests remain opt-in and disabled.

The discovery rerun also found five cash-reader failures in two minimal test schemas. Those schemas now include explicit saved fees and cancellation history, with a regression covering fee totals and cancellation waivers. All 47 tests across the four associated reader/query/privacy files passed before restarting the complete suite from stable source.

Read-only preservation fingerprints cover all 153 retained database tables (including provider metadata), 15 R2 storage files and two pre-existing synthetic video-test files in the separate native media folder. The discovery run left all fingerprints unchanged. The video fixture now constructs its storage bucket directly inside its unique temporary folder; existing residue is left untouched.

Final verification: 3,113 tests, 3,092 passed, zero failed, 21 guarded external-service tests skipped. Lint, types, build and canonical read-only preflight passed. The staff-form permission inventory required one further explicit classification in its route test; the fixed security controls also pass catalog mutation rejection checks.

The final health check exposed stale state in the long-running Cloudflare dev worker. Only the verified canonical preview tree was restarted, through `npm run dev`; both health endpoints then passed. All 152 application table hashes and all upload hashes still match. Provider-owned `_cf_METADATA` changed after the restart and is recorded explicitly in the evidence rather than reset. The correct port 3018 preview remains running.
