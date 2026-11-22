# T34 company-store regression correction — 2026-11-04

Scope: five assigned company-store tests plus the root-approved narrow correction in `components/admin/managed-settlement-controls.tsx`. Canonical checkout is `C:/Users/abinash/Desktop/HastaBazaar`; old paths in historical specifications are not launch targets. Read AGENTS.md, LOCAL-START.md, current implementation progress, company-store readiness, order fulfillment, Finance & payments, manual payment rules, single-Super-Admin amendment, and current document/forms evidence. Deployment and canonical-data holds remain unchanged.

## Causes and corrected behavior

- The shared economic fixture now explicitly creates a historical **placed** order with confirmed items. Preparation requires a confirmed/packing order. The local preparation fixtures now prove placed refusal with no persisted operation, then establish their explicit historical confirmed precondition. No shared fixture or production preparation guard changed. The COD commit-race test now starts confirmed and proves the identical operation succeeds in an independent same-time fixture without the injected hold. An intermediate attempted cleanup correctly failed on immutable COD history; it was replaced with the independent control rather than disabling the guard.
- The native private-document tests attempted to rewrite immutable document object keys and seller ownership. They now first prove those rewrites are rejected, append independent fictional historical document/detail versions with invalid boundaries fixed at INSERT, and reject the original unverified application document so it cannot supply positive evidence. Every foreign/prefix/suffix/embedded/case/wildcard-lookalike path and foreign owner remains rejected by accepted-terms, public-evidence and acceptance mutation checks. Failed acceptance leaves detail/form/audit counts unchanged. No trigger is removed or relaxed.
- The finance browser test waited for a button inside a collapsed `Retained simulation history` disclosure. It now opens the genuine disclosure on each mount. Original uncertain-result/reload/exact-payload/form-answer/recovery checks remain. Its former broad `/api/admin/` stub also treated the new live-finance GET as a simulation POST; the stub now separates the exact live read (explicitly unavailable in this retained-history fixture) and managed-program POST. No live-finance write is permitted by this fixture.
- The old `record_sale_linked_payment` API expectation is obsolete: production explicitly rejects reference-only completion with `Record the actual bank outcome through the original verified execution packet.` The API test now proves repeated409/no writes and foreign-maker404, then uses lawful unpaid cancellation to verify exact receipt replay, changed-content refusal and private actor/subject/request history. **This test does not prove a paid payout.** Existing `company-store-maker-settlements.test.ts` uses the protected prepare/approve/start/outcome packet lifecycle for fictional bank evidence; that separate proof is not replaced or counted by this test.
- Root approved correcting the offered UI mismatch. Approved retained simulation records no longer offer forbidden completion or promise it after a scheduled time. They show the limitation, history review and eligible unpaid cancellation. Old pending completion references remain visible and byte-preserved, with no unusable retry. Explicit local-reference clearing explains that it neither proves nor cancels payment. The actual live earnings/packet controls remain intact and separate; no simulation is relabeled as live money.

## Evidence

Directory: `.test-artifacts/t34/company-regression-astra-20261104/`.

- `before/` and `before-hashes.json`: original assigned test source; original component also captured before its authorized edit.
- `inherited-failures.tap`: excerpt of root's complete suite covering665,667,710,711,712; root owns the complete suite and its final reconciliation.
- `memory-before.tap`: actual6-test run,3 pass/3 fail,42.606s; includes the exact legacy completion409 body.
- `preparation-after.tap`: intermediate2/3, immutable COD cleanup failure retained.
- `memory-after.tap`: actual preparation/domain/API aggregate6/6,62.290s, before the final extra exact-history projection assertion.
- `retained-render-red.tap`: actual rendered forbidden completion form fails the new behavior assertion. `retained-render-green.tap`: corrected render1/1.
- `native-terms-memory-adapter.mjs`: explicit one-off adapter redirects only this test's native fixture to the inspected real-schema SQLite `:memory:` fixture. Its output still inherits the native test's title; **these adapter runs are memory evidence, not D1 execution**. Initial adapter import-path failure is retained in `native-terms-memory-check.tap`; initial foreign-document clone key collision in `native-terms-memory-after.tap`; final memory rehearsal7/7 in `native-terms-memory-final.tap`,6.733s.
- `scoped-lint-direct.txt`: six owned runtime/test paths, exit0.
- `memory-final.tap`: current three-file memory aggregate6/6, exit0,38.260s, including the added exact private history projection. `retained-render-final.tap`: current actual render1/1, exit0,2.406s.

Actual browser/nonpersistent D1 reruns are pending the coordinated slot. No native/browser pass is claimed by this checkpoint. Root owns global typecheck/lint/full npm suite/build/package and master ledgers.

No canonical D1/staging records, live bank/mail service, server launcher, Git state, deployment or recovery archive was modified. Memory fixtures contain fictional records only; native tests use their existing random, nonpersistent Miniflare database when authorized to run.
