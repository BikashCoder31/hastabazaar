# T34 form-health catch-up correction — 4 November 2026

The independently reproduced obsolete-incident defect is corrected in the local source. Incident and notice decisions now wait for the scoped receipt sweep to complete; delivery of original observations remains bounded and deduplicated. This is focused implementation evidence, not deployment acceptance.

## Behavior and design

- `sweepCommittedFormSaves` returns a nullable `completedThrough` observation horizon. Partial work, a held lease, expired work, or receipt arrivals that require another sweep do not authorize incident evaluation.
- A completed finite window is checked for unconsumed forward receipts through the invocation's horizon. New forward work defers decisions and reports remaining work.
- Existing cursor JSON additionally stores `sourceCount`, the count of scoped original receipt rows through the fixed upper key, including already ingested originals. Completion compares this count to detect new backdated arrivals behind the cursor. It never treats the count or a rejected receipt as successful-save evidence. Other scoped consumers copying valid receipts do not alter the original-source count.
- Legacy progress lacking this count finishes without authorizing a decision, clears normally, and obtains a fresh count on the next sweep. No schema migration or cursor namespace change is required.
- The observation horizon is certified at completion rather than frozen at sweep start. A strict old start timestamp was rejected after a regression demonstrated that continuously arriving blocked loads could otherwise suppress a real outage indefinitely.
- Form-specific evaluation is constrained to the same form as its receipt sweep. A different form's completion cannot authorize decisions while the intended form's recovery is still unexamined.
- Retained latest observations are revisited at completion even when delivered on earlier partial passes. Permanent invalid originals therefore defer evaluation for a finite sweep, without suppressing genuine outages forever. Original event timestamps, service-observation deduplication, current native-version eligibility, source validation, and incident recovery rules are preserved.

The original fixed upper key, one-row lookahead, per-row atomic observation/checkpoint batch, database-clock lease and revision guard, sweep wrap, and native receipt validator remain. The additional initial/final source-count reads are aggregate database work; the validation limit remains unchanged, but an individual database query is not preemptible by the JavaScript deadline.

## Evidence

Artifacts are in `.test-artifacts/t34/health-catchup-fix-astra-20261104/`:

- `red.log` / `red.exit.txt`: six genuine assertion failures against the original implementation (exit 1). `initial-fixture-error.log` separately preserves the preceding fixture-setup error; it is not RED proof.
- `red-continuing-outage.log`: catches starvation caused by a strict old sweep-start horizon.
- `red-scoped-evaluation.log`: catches using a different form's completed sweep to deliver/evaluate the pending form.
- `red-backdated-arrival.log`: catches a newly committed valid save inserted behind the active cursor.
- `green-initial.log`, `green-focused.log`, and `green-backdated-arrival.log`: intermediate focused checks, respectively 14/14, 27/27, and 19/19.
- `green-final.log` / `green-final.exit.txt`: final focused run of catch-up (12), form-health records (8), native queue (9), and native bridge (12): **41/41 passing, exit 0**, in 113.9 seconds.
- `final-source-hashes.json`: SHA256 freeze of the two changed runtime files, new regression file, and unchanged validator/schema/prior focused tests.

The new regression file covers rejected-prefix recovery, permanent invalid originals, continuing fresh failures, actual later outage and exact notice deduplication, lease contention, resumed horizons, forward and backdated arrivals, expired deadlines, rolled-back/lost checkpoints, scoped consumers, an emptied remaining window, and legacy cursor progress. Tests use real `buildFormAnswerInsert`, `recordFormLoadObservation`, `evaluateFormHealth`, and in-memory SQLite transactions. Notice effects are actual inserts into the test-only `transition_notices` table; no external messages are sent.

## Boundaries and handoff

Only the two runtime files, the new focused test, this report, and this worker's artifacts were changed. The native D1 test remains owned by the native worker. Existing native validator SHA256 remains `4f836cd3b853facb416902eb2d0342080081457054236e8643aae9c246048ef0`.

No native D1/MariaDB engine, browser, compiler, build, lint, global suite, canonical database mutation, Git mutation, network/provider, production email/payment, preview bypass, or deployment operation ran. All test databases are inspected `node:sqlite :memory:` fixtures; TEMP/TMP stayed under this artifact directory. Root owns integrated checks and native engine follow-up. Canonical STOP4/107 and deployment hold remain; video remains deferred. The account usage check during this work reported 69% used / 31% remaining, above the user's 8%-remaining stop threshold.

Receipt checks are finite-sweep snapshots, not a transaction locking every future submission. Backdated arrivals observed by the completion count cause another sweep; recovered underlying evidence is still revisited on normal sweep wrap. Future writes after the completion reads remain future monitoring work.
