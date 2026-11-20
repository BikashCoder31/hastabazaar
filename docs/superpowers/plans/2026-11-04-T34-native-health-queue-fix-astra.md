# T34 native form-health queue progress — 4 November 2026

This bounded correction closes the two reproduced starvation defects in the late integration review. The controlling requirements remain System health and records §3–4 (bounded honest monitoring, real persisted outcomes, scoped evidence and retained history) and implementation6 T30 step6. It extends the native bridge source note; it does not certify deployment, host readiness or complete release acceptance.

## Cause and correction

The previous save scan repeatedly selected the same oldest current-hash no-op or invalid receipt, rejected it in application validation, and left it at the front of the next bounded scan. A genuine native support-contact no-op followed by a changed save therefore returned zero indefinitely at limit1; 100 such originals similarly blocked the default limit100. A separate monitor query selected old native-version observations before filtering their versions, indefinitely hiding current observations behind a stale prefix. The read projection also filtered native versions after its latest50 bound.

`lib/operations/form-save-sweep.ts` now uses the existing migration0147 `operational_reminder_cursors` table. No migration0157 or schema change is needed. Its private `form-saves:` family is a 75-character scoped hash of environment, original release, optional form restriction and current native source hashes, below MariaDB's 191-character family limit and distinct from reminder/ownership namespaces. A database execution-clock lease and revision compare-and-swap protect progress. Each bounded page uses the total key `(observedAt, kind, id)`, a fixed upper key for that sweep, and one unvalidated lookahead. Generic and native candidates share the same queue, so an invalid generic prefix cannot monopolize native work.

Every processed original advances the cursor, including no-ops and invalid outcomes; only an original passing the existing native validator produces a save observation. Cursor advancement and any observation INSERT commit in one guarded database batch. A failed batch advances neither. A committed lost response can safely retry because original evidence identity remains unique. A worker with a stolen or expired lease cannot checkpoint. Completed finite sweeps wrap, revisiting skipped originals and late/backdated arrivals even while later forward work arrives. Invalid originals are not permanently discarded or rewritten, and scan time never renews their original event clocks. The cursor holds only its original key and sweep bound, never private answers or command results.

`form-health.ts` preserves the public ingestion count and uses the detailed bounded scan result internally. Monitor size/deadline exhaustion is reported when a bounded sweep or delivery page has unprocessed work; a lease held by another worker is reported separately as busy. The bound applies to examined candidates, including rejected ones, not merely successful saves. An exhausted finite sweep can still contain retained invalid originals to reconsider on its next cycle; the result does not claim every historical source is valid or permanently drained.

Current native form/version eligibility now occurs inside SQL before the monitor bound, the read latest50 bound and the retained-latest recovery checks. Environment/release and original observed-time guards remain in force. Incident links include only observations actually delivered in the current page. The original native validator, source version/hash, audience mapping, outcome requirements, current source authority and immutable provenance behavior are unchanged. No no-op is promoted to saved, no generic answer substitutes for native proof, and no history is deleted.

## Verification and boundaries

Artifacts: `.test-artifacts/t34/native-health-queue-fix-astra-20261104/`.

- `red.tap`: three intended failures, including missing truthful queue-exhaustion signals at limit1/default100 and current evidence hidden by stale latest50 observations.
- `red-monitor.tap`: the explicitly ordered stale-first monitor case fails `0 !== 1` before the correction.
- `first-green.tap`: existing eight form-health cases and both no-op-prefix cases passed; the remaining test initially placed a genuine compatible load after its blocked event, correctly yielding Unknown. The test event ordering was corrected, preserving the runtime's truthful latest-event behavior.
- `expanded.tap`: 9/9 queue cases passed, 53.488s. The finite-sweep case was then strengthened with new forward work arriving alongside a backdated real save.
- `final-memory.tap` / `final-memory.exit.txt`: **29/29 passed, zero skipped, exit0, 124.999s**. This comprises all nine queue regressions, all twelve native bridge cases and all eight existing form-health cases.
- `pre-source-sha256.json` and `source-sha256.json`: before/after hashes for owned runtime/test source and inspected cursor/validator/regression dependencies.

Final command:

```powershell
$env:TEMP=(New-Item -ItemType Directory -Force .test-artifacts/t34/native-health-queue-fix-astra-20261104/tmp).FullName
$env:TMP=$env:TEMP
node --import tsx --test --test-concurrency=1 tests/native-form-health-queue.test.ts tests/native-form-health-bridge.test.ts tests/form-health-records.test.ts
```

Coverage includes genuine no-op/changed commands at limit1 and default100; arbitrary invalid native outcomes/provenance and invalid generic source prefixes; rollback; committed lost response; stolen-lease exclusion/expiry; expired deadline; unrelated reminder cursor preservation; original receipt immutability/privacy/FK checks; fixed sweep upper bound; recovered original evidence; late/backdated and forward arrivals; stale/current native versions and foreign environment/release exclusion. The full native bridge rerun preserves all mapped native save/load outcomes, original audience, stale source rejection, revoked authority, exact replay and original-scope retry behavior.

Only the authoritative checkout was used. AGENTS.md and LOCAL-START.md were read. All databases used inspected disposable `node:sqlite` `:memory:` fixtures; native queue/domain fixtures enable foreign keys and apply source migrations only inside those disposable fixtures. The final run pins TEMP/TMP inside the authorized artifact root. No canonical database, local preview, Git mutation, native D1/MariaDB engine, global suite, compiler/build/lint, network/provider, real email/payment or deployment operation was performed. The root-owned global suite and heavy native integration retain their separate evidence requirements. The existing canonical STOP4/107 and deployment hold remain unchanged; video remains deferred.
