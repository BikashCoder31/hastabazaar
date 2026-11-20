# T30 / T35 native form-health schema integration — 2026-11-04

Status: **source-only; native MariaDB acceptance queued**. Canonical checkout `C:/Users/abinash/Desktop/HastaBazaar` only. No canonical database, reset execution, preview bypass, Git mutation, deployment, real mail/money, or external side effect. Root retains the heavy execution slot, release selection, CI reviewed SHA and final workflow acceptance.

## Source integration

The bridge-owned `drizzle/0156_native_form_health.sql` keeps observation/link rows and their four retention guards through an FK-on SQLite rebuild. This worker did not edit that migration or its native-command runtime. The corresponding two `db/schema.ts` CHECKs now permit genuine `native_command` evidence only in the existing saved-evidence arm; no columns were added. The existing Maria `form_version` is nullable **BIGINT**, sufficient for the bridge's positive 48-bit source-version values without truncation. Native exact roundtrip remains queued.

New `deployment/babal/mariadb-native-form-health.sql` preserves both original Maria health tables in place. One ALTER replaces only the exact identified evidence-kind and load/save-shape constraints. It discovers the installed names from CHECK metadata, requires exactly seven checks and five distinct recognized unchanged definitions, and rejects unknown, ambiguous, partial or changed completed states. It does not guess engine-assigned CHECK names. The finite recognized old expression forms differ only in redundant AND-arm parentheses. The completed expressions use HEX comparisons so CI/pad-space string behavior cannot admit differently cased or trailing-space native evidence/phase/outcome values.

The metadata normalizer preserves quoted string literals, including their case, spaces and backticks; its PCRE SKIP/F branch removes only formatting and identifier backticks outside literals. Native Maria parsing/rendering of these exact expressions is deliberately still pending. A failed match stops rather than relaxing the recognized metadata.

New `native_form_command_provenance_retained` forbids changing an existing command receipt's `id` or `next_json`, including historical NULL-to-current-scope promotion. HEX plus null-safe equality compares exact bytes rather than the inherited case-insensitive audit column collation. Existing command action/digest/result/source/time guards and noncommand behavior remain. No observation, answer, receipt or historical scope is fabricated by this schema source.

## DDL and interruption boundaries

MariaDB DDL auto-commits. The four statements are procedure installation, guarded ALTER call, procedure removal and audit trigger creation. This is **not** a transactionally reversible migration or a blanket-idempotent script. A future authorized/quiesced upgrade must compare all installed descriptors and retained rows with the exact expected prefix and execute only its unapplied remainder. Unknown metadata or changed rows stop recovery; do not rerun all statements, disable FKs or drop populated tables.

The new isolated driver `scripts/test-t35-native-health-schema-mariadb.mjs` is source only. It verifies the exact offline portable fixture identity and archive provenance, canonical CWD and owned candidate path before creating fresh synthetic namespaces. It imports the exact155 candidate-v4 prefix, retains old runtime/answer/core observations, incident links and scoped/unscoped audit rows, and records every prefix0..4. It rejects deliberately drifted prefix metadata, unknown/duplicate/partial CHECKs and altered quoted literals. It checks original descriptors/rows/indexes/triggers, both physical incident-link FKs, all four retained guards, audit byte immutability, historical NULL protection, native save shape/deduplication and a `281474976710655` version roundtrip. It also compares exact CHECK/trigger definitions to the manifest, exercises completed guarded ALTER replay, imports the fresh full schema, rechecks source hashes and records authenticated PID-specific shutdown. These are queued assertions, **not executed engine evidence**.

## Generator, release and empty-target reset source

The generator appends only the new Maria156 suffix after the complete155 source. It never parses SQLite156 temporary rebuild tables as final tables. Release discovery includes the new forward companion and requires both exact native CHECKs plus the exact audit trigger body and shape. Counts are **358 final tables, 469 triggers, 136 migration assets**. All old153/154/155 prefix bytes are preserved. Existing155 native driver/candidate-v4, historical V8 and public schema/reset assets are byte-verified unchanged. The CI reviewed SHA was not changed.

Source inspection found **16 inherited reset DROP omissions**, not just the initially reported publication candidate/decision pair:

- `seller_document_change_requests`, `seller_document_replacement_permissions`.
- `product_publication_candidates`, `product_publication_links`, `product_publication_decisions`, `product_publication_heads`, `product_publication_media`.
- `product_availability_events`, `product_availability_states`, `product_legacy_observations`, `product_legacy_media_copies`.
- `product_priority_events`, `product_priority_cases`, `product_priority_report_media`.
- `order_cancellation_events`, `order_cancellation_reviews`.

With root authorization, only newly generated reset **source** now adds these missing tables once and moves existing cart command/line drops ahead of their publication parent. Publication heads precede decisions, decisions and other publication children precede candidates; priority reports/cases precede events; availability states precede events. Existing protected-change cases and legacy-transition children precede document requests; replacement permissions precede requests. Delivery-adjustment/refund children precede cancellation events. The priority event `case_id` is not a physical FK, so there is no claimed event/case FK cycle. Self-references remain possible in the existing source. Unrelated reset inventory/order is preserved.

The generator and focused test now compare all final CREATE-table names against DROP coverage. This is only source inventory and bounded ordering proof. Existing FK-off behavior and explicit **otherwise-empty failed-import target only** semantics remain; no operational reset/recovery safety is certified and no reset was executed. Reset artifacts remain excluded from the release migration manifest.

## Source verification and exact candidate

Owned directory: `.test-artifacts/t35/native-health-schema-astra-20261104`.

- Before implementation, the new two-test source check failed2/2 for missing typed native evidence and absent Maria156 companion.
- Focused schema/prefix/release suite passed **6/6**, zero skips, exit0, 19.802s. Command: `node --import tsx --test --test-concurrency=1 tests/native-form-health-schema.test.mjs tests/product-price-history-schema.test.ts tests/native-public-feedback-combined-schema.test.mjs`. This preceded the final reset inventory expansion.
- Final156 source, exact old-prefix and expanded reset inventory checks passed **3/3**, zero skips, exit0, 10.482s. Command: `node --test tests/native-form-health-schema.test.mjs tests/native-public-feedback-combined-schema.test.mjs`. These commands run real source generation and manifest/bundle comparison; they open no database.
- The new native driver passed `node --check`; syntax is not native execution. `source-verification.json` distinguishes the two source checkpoints. No browser/D1/Maria/compiler/lint/build/global suite ran in this slice.

Current candidate: `.test-artifacts/t35/native-health-schema-astra-20261104/candidate-v1`.

| Artifact | SHA256 |
|---|---|
| Full schema,1776 statements | `dd667fd1bfb1dc9705c7ea29b29ddfa1f34af8c01b9058f78fb5032030e2f28e` |
| New Maria156 suffix,four statements | `ac489c39bcaceee42e386df2d08813c85f48ce95b57950c9b35e90220c1b04a2` |
| Bundled release manifest | `c578347fb72996676991105eff5dd22ee6624b2d530241119b6be00a6d9c19e6` |
| Owned reset source,never executed | `9a9bc4b0bee2acd20d16f85304ccc02364a40e2c66bea2b56647f4bf2b321913` |
| Retained155 candidate-v4 schema | `db78507e14e7f4e3f2436c238211c52fd8ff99a5450dc01c91e095337247b7aa` |
| Retained155 native driver | `601432c8a81290afa002867340534d0583733fbf7093c5335612d2ae460054d7` |

`candidate-v1/freeze.json` records selected source, migration, test, driver, note and all bundled asset hashes. Release identity remains the honest `local-unversioned-candidate`; no source commit or CI identity is invented.

Queued command, only after root grants the serialized native window and155 prefix acceptance is resolved:

```powershell
node scripts/test-t35-native-health-schema-mariadb.mjs fixture-20261104032534-815db40e .test-artifacts/t35/native-health-schema-astra-20261104/candidate-v1
```

Outstanding: actual155/156 Maria parsing/import, observed CHECK rendering and PCRE normalization, completed ALTER replay, all5 real interruption checkpoints, populated retention/physical FK and index/trigger proof, exact release introspection, invalid-literal rejection, native audit/save guards, large version roundtrip, fresh full import and authenticated shutdown. Runtime authorization/replay/load/save compatibility and final release/global verification remain with the bridge/root. Passing this source slice is not deployment, canonical-data migration, schema readiness or end-to-end native acceptance.
