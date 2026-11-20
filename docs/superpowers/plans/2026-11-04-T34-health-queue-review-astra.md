# T34 independent form-health queue correction review — 4 November 2026

**Changes requested: one confirmed catch-up incident defect.** The two original permanent starvation paths are addressed by the reviewed source, but their replacement receipt sweep can still cause an obsolete outage episode while genuine later saves wait behind rejected receipts. This is a fresh independent review of the queue correction, not release acceptance.

## Finding

**P2 — defer historical outage evaluation until the relevant receipt sweep has caught up.** At `lib/operations/form-health.ts:70–76`, the latest-event guard queries only `form_health_observations`. It does not account for committed receipt outcomes that `sweepCommittedFormSaves` has not reached. The receipt sweep now correctly spends its bounded work on rejected originals (`lib/operations/form-save-sweep.ts:54–63`), while the delivery queue independently advances through blocked observations. Thus two rejected receipts followed by later genuine saves can allow two older blocked loads to be delivered and evaluated before either save becomes a health observation. A new detected incident is opened even though later successful outcomes were committed before monitoring began.

The inspected memory-only reproduction uses actual `buildFormAnswerInsert`, `recordFormLoadObservation`, and `evaluateFormHealth` functions. It adds two invalid generic core receipts at timestamps 1700000/1710000, blocked inventory loads at 1800000/1860000, and genuine scoped core save receipts at 1920000/1980000. Every call uses `now:1980000, limit:1`:

| Scan | Ingested saves, cumulative | Incident |
| --- | ---: | --- |
| 1 | 0 | none |
| 2 | 0 | detected, first seen 1980000 |
| 3 | 1 | monitoring |
| 4 | 2 | monitoring |

The obsolete episode persists after catch-up and can invoke the production outage transition callback; the reproduction intentionally supplies a callback returning no statements, so no notices or external effects occur. Its new first-seen clock also postdates the first successful outcome and equals the second, so those outcomes cannot satisfy the existing post-incident recovery evidence predicate. The existing `tests/form-health-records.test.ts` catch-up case passes because it has no rejected receipt prefix.

Repair should coordinate incident evaluation with relevant receipt progress, while preserving eventual evaluation of genuine blocked forms even when invalid/no-op originals are retained forever. Simply waiting for the raw candidate set to become empty would reintroduce starvation. Cover both the rejected-prefix/later-save case and a permanently invalid prefix with a genuine ongoing outage. The same independent-queue issue should be checked when another worker holds the sweep lease. Root/fresh implementer owns production remediation.

## Reviewed behavior and limitations

- All eight files in the supplied correction manifest matched their expected SHA256 at review. The exact comparisons are saved in `reviewed-source-hashes.json`. The native validator was unchanged.
- The total key `(observedAt, kind, id)` and fixed upper key allow bounded progress through rejected originals. Per-row checkpointing, the one-row lookahead, initial-empty case, exact-full-page case, and empty remaining window are internally consistent. Completed sweeps clear progress and revisit backdated/recovered originals. Source-hash changes allocate a separate scoped family and cannot reinterpret an old cursor as current-source progress.
- The `form-saves:` family is 75 characters, hashes environment/release/optional form/current hashes, and is separate from the inspected reminder/ownership families. Normal generated UUID and core receipt keys fit the 191-character cursor identity bound. The reused 0147 table provides the required cursor, revision and lease fields without a new migration.
- Lease claims and checkpoint predicates use database clock SQL, rather than caller `now`. A token/revision/expiry guarded cursor update and failing guard share the observation insertion batch. Source inspection supports rollback, stolen-worker fencing and unique original-evidence retry behavior; no new false native save path was found. The Maria adapter maps `changes()` to `ROW_COUNT()` and runs batches in a transaction. Actual engine execution and lock-wait clock behavior remain unverified here.
- Native version eligibility is applied before the monitor and read bounds, and before retained-latest recovery selection. Legacy NULL/old native versions remain retained and excluded from current proof. Original environment/release/time predicates remain. Generic receipts share bounded progress and still cannot substitute for a native contract. No new authority/privacy defect was established: no business answers enter the cursor/observations, read authorization remains fenced, and the original validator still requires original provenance and domain outcome.
- Deadline checks stop candidate/delivery iteration and report exhaustion. Candidate lookahead reports remaining work within the finite sweep; lease contention reports busy. This does not assert that an individual database operation is preemptible or that completion of one finite sweep means every later/backdated original is permanently drained.
- The final correction run's reported 29/29 results were read, not rerun. The only executed diagnostic here is the small reproduction below. It confirms a defect; its exit0 is not application acceptance.

## Evidence and remaining acceptance

Artifacts: `.test-artifacts/t34/health-queue-review-astra-20261104/`.

- `catchup-reproduction.ts`, `.log`, `.exit.txt`: final reproduction, exit0. The initial artifact-only invocation failed to resolve an import; the corrected relative imports produced the recorded result. No production file changed.
- `reviewed-source-hashes.json`: all eight supplied manifest comparisons, all matching.
- `source-review.json`: machine-readable finding and review boundaries.

The inspected `serviceHealthFixture` opens only `node:sqlite :memory:` and applies the real 0147 cursor/0148/0150 health schema. This diagnostic adds the same minimal generic-source tables used by existing form-health tests plus the real 0151 observation schema. TEMP and TMP were pinned under the assigned artifact directory. Root was notified before execution and immediately after confirmation. This narrow generic-path reproduction does not claim full-domain/native foreign-key coverage.

Remaining native acceptance includes serialized D1 integration of the actual 0155/0156 chain and queue SQL, Maria155/156 generator/import/replay and full runtime SQL, real adapter CHECK/ROW_COUNT rollback semantics, database execution clock expiry and concurrent lease fencing, and root-owned integrated checks after remediation. No native D1/MariaDB, browser, compiler/build/lint, global suite, canonical database, Git state, network/provider, real email/payment or deployment operation ran. AGENTS.md and LOCAL-START.md were read and respected. Canonical STOP4/107 and deployment hold remain; video remains deferred.
