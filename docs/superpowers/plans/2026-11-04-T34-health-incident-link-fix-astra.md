# T34 deferred form-health incident evidence — 4 November 2026

The proven missing-association regression is corrected in local source. A deferred incident now retains the originating form observations even when they were delivered on earlier catch-up passes. New incident, evidence links, and transition notice statements commit atomically. Existing open incidents with missing links receive a guarded, idempotent repair on later evaluations.

## Scope and behavior

- `evaluateServiceHealth` accepts an optional internal evidence-statements callback. It receives the incident identity/episode, opening time, and the same bounded service-observation snapshot used for evaluation. The callback runs on every incident write, including unchanged open incidents, within the existing observation/revision-guarded transaction. Callers without this callback keep their previous behavior. Returning `null` defers the entire decision when the caller's deadline expires.
- `evaluateFormHealth` uses that callback instead of linking only the current delivery page. New incidents use the existing evaluation snapshot. An existing incident additionally reads at most 100 service observations through its opening time, so newer events cannot displace the original opening evidence during repair.
- The opening evidence is the failure suffix of that bounded snapshot, stopping at a successful observation or the previous resolved episode. The opening timestamp is an upper bound, not a lower bound: genuine failures that predate deferred creation remain eligible. Later evidence is restricted to the active episode and current bounded evaluation snapshot. This is bounded evidence retention, not a scan or attachment of all historical observations.
- Both snapshots are scoped to the environment and form service. Retention additionally requires evaluator provenance, the current release/form/version evidence hash, an event time no later than the invocation horizon, and an exact match against the immutable original form row's identity, environment, release, form, version, timestamp, and outcome. Current native contract eligibility remains unchanged.
- Link failure rolls back incident/notice writes. Missing links on an already committed incident retry without a new notice. A lost committed response also retries without duplicate links or notices. The existing primary key supplies link deduplication.
- Catch-up completion gating, delivery bounds/deduplication, native source validation, incident classification/recovery, authorization, schema, and cleanup guards were not changed. Cleanup remains disabled; the original defect was missing durable associations, not observed deletion.

## Verification

Artifacts are under `.test-artifacts/t34/health-incident-link-fix-astra-20261104/`.

- `red.log` and `red.exit.txt`: two genuine failures on the original implementation: no links after deferred creation and incident/notice remaining committed after a rejected link.
- `red-repair.log` and `red-repair.exit.txt`: three genuine failures after strengthening the preexisting-incident setup to deliver the opening observations before the repair invocation. The third failure proves that 105 newer observations displace opening evidence from the current snapshot and the old path never repairs it. Exit 1.
- `green-initial.log`: initial six focused regressions passed.
- `green-expanded.log`: eight passed and one fixture setup error (`form_config_versions` missing); this is preserved, not counted as regression RED evidence. The fixture was corrected before the final runs.
- `green-focused.log` and its exit file: **63/63 passed**, exit 0, 118.4 seconds. Includes nine linkage checks, 12 catch-up, eight form records, 12 native bridge, nine native queue, five service-health repository and eight classifier tests.
- `green-budget-notifications.log` and its exit file: **13/13 passed**, exit 0, 20.5 seconds. Includes the final 11 linkage checks and two existing service-health notification regressions. The two added linkage checks prove the 100-observation opening bound and whole-transaction deferral when the deadline expires during evidence preparation.
- Across the two final runs, **67 distinct tests passed** (76 executions, with nine linkage tests repeated). Runtime source did not change between them.
- `final-source-hashes.json`: SHA256 freeze of changed runtime/test files and relevant unchanged source, schema and test inputs. Native validator SHA256 remains `4f836cd3b853facb416902eb2d0342080081457054236e8643aae9c246048ef0`.

The linkage suite also covers exact retry, a preceding real successful submission, already-delivered records from other environments/releases/forms/native versions, future records, non-evaluator delivery, failed repair of a previously committed incident, lost committed response, separation from a resolved episode, and original no-delete/no-update retention guards.

## Boundaries and handoff

Only `lib/operations/form-health.ts`, `lib/operations/service-health-repository.ts`, the new `tests/form-health-incident-links.test.ts`, this note, and this worker's artifacts were changed. No schema migration was added. Every executed test used inspected `node:sqlite :memory:` fixtures with TEMP/TMP under this artifact directory. Notification tests use a capture transport and in-process route calls; no network or live message was sent.

No native D1/MariaDB engine, browser, compiler, build, lint, global suite, canonical database mutation, Git mutation, network/provider operation, preview bypass, or deployment ran. Root owns integrated verification and queued native-engine acceptance. Canonical STOP4/107 and deployment hold remain; video remains deferred. Usage checks reported 70% used / 30% remaining, above the user's 8%-remaining stop threshold.

The repair reads a bounded historical event snapshot from retained immutable delivery records; no new per-evaluation history ledger or schema is introduced. Individual database calls and atomic batches remain non-preemptible by a JavaScript deadline. This is focused local verification, not deployment or native-engine acceptance.
