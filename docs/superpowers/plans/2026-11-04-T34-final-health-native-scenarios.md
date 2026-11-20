# Final health native parity scenarios — 4 November 2026

Added `tests/helpers/form-health-native-scenarios.ts` and `tests/form-health-incident-links-native.test.ts`. These use a supplied real D1-shaped adapter; the test file selects either freshly migrated in-memory SQLite or nonpersistent Miniflare D1. No production source changed.

Three scenarios cover deferred catch-up followed by original evidence linkage, an actual atomic-batch CHECK rejection at the evidence statement, and repair of an existing historical incident after 105 newer observations displaced the opening evidence. All require exact retry without additional notices/links. Tests assert foreign keys remain enabled and foreign_key_check is empty. A callback-reached assertion and exact constraint-error match prevent the rollback test from passing on an earlier setup failure. The rejection replaces only the selected link statement with an actual invalid guard INSERT; all transaction execution remains on the real adapter.

Inspected fixtures: incentiveReportDatabase creates only `:memory:` with full migrations and foreign keys on. createIncentiveDb uses a random D1 binding, `d1Persist:false`, full migrations and explicit dispose. Neither accesses canonical data. Temporary state is pinned to the project's `.test-artifacts/t34/tmp` for root commands.

Executed calibration:

- `node --import tsx --test --test-concurrency=1 --test-name-pattern='^memory final form-health incident evidence:' tests/form-health-incident-links-native.test.ts`: 3/3, exit 0, zero skipped, 36.855 seconds (`health-native-scenario-memory.tap`).
- After strengthening the rejected-constraint assertion, the exact rollback target passed 1/1, exit 0, 17.757 seconds (`health-native-rollback-final.tap`).

Artifacts and source SHA256: `.test-artifacts/t34/remaining-memory-root-20261104/health-native-scenario-hashes.json` and the logs above. D1 execution is **queued**, not accepted. Once the shared heavy slot is released, run the same test file with positive pattern `^D1 final form-health incident evidence:`. The reusable scenario helper also supports a freshly attested native Maria adapter without turning memory evidence into a native claim. No Maria execution is claimed here. The prior 67 distinct memory checks and independent 11/11 review remain separate.
