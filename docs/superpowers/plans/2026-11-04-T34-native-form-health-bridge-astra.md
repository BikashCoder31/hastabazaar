# T34 native form health bridge — 4 November 2026

This bounded local implementation closes the missing native command/load bridge identified in `2026-11-04-T34-form-catalog-coverage-astra.md`. It implements the approved System health specification §3–4 and implementation6 T30 step6: actual essential-form readiness and persisted business-workflow outcomes are distinct evidence. Inventory alone remains Unknown. Root owns overall ledgers, compiler/build/full-suite and native engine/release integration; this note is not deployed-health or complete-release certification.

Only `C:/Users/abinash/Desktop/HastaBazaar` was used. AGENTS.md and LOCAL-START.md were read. No canonical database was opened, seeded, migrated, restored or repaired; no launcher/preview bypass, Git mutation, browser, native D1, MariaDB, build/compiler/lint, provider/network, real mail/payment or deployment operation ran in this worker. The inherited canonical STOP4/107 remains unchanged. All database tests use inspected `node:sqlite` disposable `:memory:` fixtures, with full application migrations and foreign keys enabled where applicable. The profile photo test uses fictional bytes and an in-memory bucket; video remains deferred.

## Implemented boundary

- `lib/operations/native-form-health.ts` explicitly maps all 21 save IDs and every listed action in the prior source note. The five query IDs do not receive save contracts or receipts. Both order report audiences are passed by their existing authorized server path; follow-up is staff only. Original audience is never reconstructed from subsequently changed user roles.
- A native contract fingerprint includes the reviewed native source declaration (ID, audience, route, mode, fields, owner, record behavior), explicit action mapping, and protocol `native-form-command-v1`. `form_version` is a positive safe 48-bit number derived from that fingerprint; it is not a fabricated editorial publication. The full SHA-256 fingerprint remains in the receipt.
- The existing `commandReceipt` accepts optional server-created provenance. Its original command key, digest, payload canonicalization, result, replay identity and unscoped INSERT path remain unchanged. Scoped native commands store reserved `next_json.nativeFormHealth` in their original receipt INSERT, in the same existing guarded domain batch. This contains original form/version/hash/audience, the originally bound environment/release, a configuration hash of that native contract and bound scope, and a hash of the original expected revision. It contains no reason, identity value, address, contact, object key, media path or command result. Domain-specific dynamic evidence/revisions remain in the existing domain records and unchanged command digest/result.
- The four native command wrappers and direct protected `evidence_only` path supply provenance. Retry never promotes an old receipt to a newer scope or current source version. Unbound databases and unrelated actions preserve the former absent metadata behavior.
- Ingestion accepts only the originally recorded scope and current source contract, validates mapped action/subject/audience and the actual persisted native outcome, and emits honest `native_command` evidence. Validation reads retained document request/review/upload records, protected case events and outcome references, public-profile history/media outcomes, and exact order case/item report/follow-up event keys. Private source data is not copied to diagnostics. Current source-hash filtering prevents stale contracts from filling a bounded ingestion window. A no-op contact/location acknowledgement is not presented as a newly saved change.
- Actual document, protected-case, public-profile, contact/location and order-preparation loaders execute their existing authorized native reads inside the new readiness boundary. Successful reads emit compatible load evidence; technical read failures emit scoped `read_unavailable` evidence without error text. Domain validation, denial, absence or stale-state responses do not create an infrastructure outage. Diagnostic write failure does not replace the authoritative domain result. Customer order views do not attest seller/staff forms.
- Native health is green only with fresh compatible loading and matching current-version committed save evidence. Old source-version observations are retained but stay Unknown in the current view. A blocked load cannot be hidden by a later saved receipt. Original event clocks remain unchanged; scan time does not renew old save evidence.

## Source-only migration 0156

`drizzle/0156_native_form_health.sql` adds `native_command` to the observation evidence-kind/save-phase constraints. It rebuilds the observations and dependent incident links with FK enforcement enabled, copies retained rows, and restores the original index and four update/delete guards. The added `native_form_command_provenance_retained` trigger retains command receipt ID and `next_json`, including historical NULL; retrospective scope promotion is forbidden. Existing 0155 remains a separate source owned by the migration worker. No migration was applied to canonical data.

The schema worker received the stable SQLite contract for typed schema, MariaDB and release-source integration. Existing MariaDB `form_version BIGINT` accommodates the native numeric version. Native engine parity, generated release candidates and deployment remain root-owned follow-up verification.

## Evidence

Artifacts: `.test-artifacts/t34/native-form-health-bridge-astra-20261104/`.

| Artifact | Result and meaning |
|---|---|
| `red.tap` | 0/2 pass: real document review committed successfully but native health ingestion returned 0 rather than 1. Correct missing-bridge failure, not fixture setup. |
| `first-green.tap` | 2/2 pass: real document load/save, atomic rollback and original-scope retry. |
| `expanded.tap` | 8/8 pass, 28.548s: mapping/version/source/privacy, contact/location and protected identity chains, retained linked-row migration. |
| `health-integration.tap` | 23/23 pass, 65.398s: bridge, existing form-health and monitor regression coverage, original order audiences and committed lost response. |
| `remaining-native-actions.tap` | 2/2 pass, 22.584s: actual document correction→review→request→permission→replacement and profile history→review→withdrawal→correction→answer→staff request→photo outcomes. |
| `final-memory.tap` | 30/30 pass, zero skipped, 135.530s: all 12 bridge tests plus existing form health, monitor and shared command-contract regressions. |
| `stale-version-final.tap` / `.exit.txt` | 1/1 pass, exit0, 7.612s: final test-only strengthening proves retained stale-version load/save observations read Unknown, in addition to stale receipt/source rejection. No runtime code changed after the 30-case run. |
| `source-sha256.json` | Final hashes for 14 owned source/test/migration files and two inspected source/scope dependencies. |

Final broad command:

```powershell
node --import tsx --test --test-concurrency=1 tests/native-form-health-bridge.test.ts tests/form-health-records.test.ts tests/system-health-monitor.test.ts tests/complete-version-contracts.test.ts
```

Final test-only strengthening command:

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern='native receipts reject stale' tests/native-form-health-bridge.test.ts
```

Every native ID has an actual domain mutation/outcome ingestion in the bridge suite: five document IDs, six protected-change IDs, eight profile/contact/location/media IDs, and seller/staff order preparation. These cases also execute the corresponding actual authorized load boundaries. Additional mapped subactions use their original domain event readers; this bounded bridge suite is not an exhaustive repeat of every business disposition policy test.

Negative evidence includes rollback before receipt commit, committed lost response and exact deduplication, foreign/current-release exclusion, immutable original provenance, original seller audience after role change, current revoked seller/staff rejection, missing/wrong native outcome references, private-value exclusion, stale source hash/version, retained old-version Unknown, unscoped historic retry Unknown, query exclusion and FK/retention preservation. Shared command-contract tests preserve canonical digest and competing-writer rollback semantics.

No business decisions were changed or newly deferred. Remaining verification is explicitly the root-owned integrated compiler/build/full-suite and disposable native-engine parity, not an omitted bridge implementation or a static inventory being counted as save proof.
