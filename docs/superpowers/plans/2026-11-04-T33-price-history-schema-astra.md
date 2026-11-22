# T18 / T33 platform-price history schema integration

Status: **source-only handoff**. Source integration is verified; actual MariaDB execution remains pending the root-coordinated serialized window. Root will run the queued driver and use a fresh agent for any difficult native correction. This is not deployment, canonical-data migration, schema readiness, staging readiness, or native runtime proof.

## Bounded source change

`db/schema.ts` now exposes all fourteen `product_orderable_price_observations` columns, seven source foreign keys, the chronological index, positive-price/NPR/nonnegative-time checks, and review `history_basis` / `platform_orderable` metadata. Existing0091 and the original Maria private-price fragment remain unchanged.

`deployment/babal/mariadb-product-orderable-price-history.sql` is the new0155 counterpart. The generator appends it after the complete0154 tail, where every publication parent exists. The old review table stays in place: one metadata-checked ALTER adds nullable `history_basis`, replaces only the exactly identified legacy evidence-kind CHECK, and installs the substantive-basis CHECK. Its existing rows, incoming child references, indexes and immutable/retained triggers are retained. No SQLite parent rebuild is copied into MariaDB.

The routine discovers the legacy CHECK by exact normalized clause, never a guessed engine-assigned constraint name. Zero/multiple matches or partial/unrecognized metadata are hard stops. A completed ALTER is acknowledged again only when the new nullable LONGTEXT descriptor, exact default/charset/collation and both exact CHECK clauses match. HEX comparisons preserve the source's exact evidence-kind and NPR case. Invalid legacy values stop the ALTER; there is no normalization, backfill, observation inference or approval.

## DDL and recovery boundaries

MariaDB DDL auto-commits. This source does **not** promise transaction rollback, and the whole suffix is **not** blanket-idempotent. Its seven statements are procedure installation, guarded review ALTER call, procedure removal, observation table, chronological index, immutable trigger and retained trigger.

A future authorized, quiesced upgrade must inventory the selected exact source and installed objects before execution. On interruption, compare the installed columns, checks, keys, indexes, trigger definitions and retained rows with the exact expected completed prefix, then execute only its unapplied remainder. Unknown metadata stops recovery. Never rerun all one-shot statements, drop populated tables, disable foreign keys, or execute a reset. The native rehearsal explicitly exercises every prefix0..7, including completed no-work recovery and guarded ALTER replay, before any native success claim.

The new owned generated reset **source** adds the new observation child before existing parents. It is not executed. The inherited reset inventory omits `product_publication_candidates` and `product_publication_decisions`; this work does not correct or certify that older reset inventory. Public reset/schema files and all V8 artifacts remain historical and unchanged.

## Exact release assets

`scripts/generate-release-manifest.mjs` discovers the new companion after0154. ADD COLUMN parsing now covers actual statements both with and without IF NOT EXISTS, so the dynamic single ALTER's `history_basis` is truthfully included. The observation table columns, both trigger shapes/messages, all seven explicitly named observation FKs, three exact observation CHECKs and two exact review CHECKs are required. The real bundle test compares the chosen full schema's exact bytes and SHA, the companion's SHA, required inventory and reset exclusion. Root retains ownership of the final CI reviewed hash and final release selection.

The existing `tests/native-public-feedback-combined-schema.test.mjs` was updated with root approval to retain its exact153/154 assertions while permitting only the exact new155 tail and sole new observation drop in a newly generated reset source. Its output now stays under this task's T35 directory.

## Verification and artifacts

Owned directory: `.test-artifacts/t35/price-history-schema-astra-20261104`.

- `schema-red.tap`: missing typed observation and missing new paired155 source failed before implementation. The release pipeline test separately failed on the absent forward companion before its manifest entry.
- `schema-green.tap`: schema/prefix/release suite4/4 passed, zero skips, with actual generator and manifest/bundle tools; no database opened.
- `candidate-v1` is the initial source checkpoint. `candidate-v2` additionally requires the exact completed-column implicit NULL default and tests wrong completed metadata as a stop. `candidate-v3` uses VARCHAR(191) plus exact NPR CHECK to avoid a three-character type truncating an invalid trailing space. Current `candidate-v4` explicitly names the new observation CHECKs/FKs and carries their exact release requirements. These are owned source candidates, not approved release hashes.
- `scripts/test-t33-price-history-schema-mariadb.mjs` is the inspected native rehearsal driver. It requires the approved offline portable fixture and an owned exact candidate path, creates only fresh synthetic namespaces, imports the exact V8 prefix, retains original populated review/cycle/advisory/link data, rehearses every DDL interruption, verifies all seven physical FKs and new checks/immutability, tests unknown/ambiguous/completed-mismatch stops, and separately imports the complete generated source. It records source hashes and authenticated PID-specific shutdown. Its existence/syntax check is not engine proof.

No canonical D1 data, local launch setting, baseline, Git state, seller approval, external message/payment, remote service, deployment or reset execution is authorized or performed by this integration.

## Current exact source-only handoff

Base directory: `C:/Users/abinash/Desktop/HastaBazaar/.test-artifacts/t35/price-history-schema-astra-20261104/candidate-v4`.

- `mariadb-schema.sql`: **1772 statements**, SHA256 `db78507e14e7f4e3f2436c238211c52fd8ff99a5450dc01c91e095337247b7aa`.
- Paired source `deployment/babal/mariadb-product-orderable-price-history.sql`: seven statements, SHA256 `972759c14d6c75c9ce9317e79b6cfec5a631056717b31b663c8647dd7129972d`.
- `bundle/deployment/babal/release-manifest.json`: **358 tables, 468 triggers, 135 migrations**, SHA256 `c9571d78ee5be1f1faf3f6a734742f51a2928d8580415b18a155b7a96c7b6302`. Release label is the honest `local-unversioned-candidate`; no source commit or CI identity is invented.
- Owned reset **source only**: SHA256 `aa252cdf4cdb8c5601ed23dc4319beb5443de73699fc31e844878b69b3487a54`.
- `freeze.json` records exact source/test/driver/document hashes, all selected bundle file hashes, and retained old0091/private-price/public/V8 artifacts. V8 schema remains SHA256 `7827e2ab78c852a53d9fffa76aa7e91ca4530b88a0ea82378d9a3153a255be6e`.

Queued command, **only after root grants the serialized native window**:

```powershell
node scripts/test-t33-price-history-schema-mariadb.mjs fixture-20261104032534-815db40e .test-artifacts/t35/price-history-schema-astra-20261104/candidate-v4
```

The driver checks canonical CWD, exact offline fixture provenance/version/archive SHA and fresh namespace labels. It does not prepare/download/install a server, read application environment files, inspect canonical D1, or accept an arbitrary server target. The selected full schema must be exactly unchanged V8 bytes followed by the current paired155 suffix, and its copied bundle manifest must hash those same full bytes. It uses the existing verified fixture helper, copied owned SQL and authenticated PID-specific cleanup.

Still pending: actual engine parsing/import; actual legacy CHECK rendering/name discovery; completed ALTER replay including implicit NULL metadata; populated preservation; original FK/index/trigger retention; all eight interruption prefixes; unknown/ambiguous/wrong-default/wrong-check stop states; seven physical new FKs; exact new CHECK clauses against release readiness; invalid currency case/trailing-space and basis rejection; observation retention; fresh full import; source freeze comparison and shutdown evidence. Domain/API/publication readiness and current-role runtime proof remain root-owned. Scoped lint/global type/build were not run in this slice while root held the heavy slot.
