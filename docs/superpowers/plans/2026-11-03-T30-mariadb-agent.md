# T30 native MariaDB schema verification — 3 November 2026

Canonical checkout only: `C:/Users/abinash/Desktop/HastaBazaar`. Root granted the serialized heavy fixture slot. No canonical database, remote connection, real email/payment, download, reset execution or deployment was used. The existing verified official MariaDB10.11.19 portable archive/binaries were reused through `scripts/portable-mariadb-fixture.mjs`; archive SHA256 remains `398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490`. The fixture verifies owned paths/hashes, loopback binding, disabled event scheduler/log-bin/local-infile and authenticated shutdown. Credentials were not printed.

## Narrow repairs and source proof

1. Combined reset source omitted the19new governance tables. After a failing source test, `scripts/generate-mariadb-schema.mjs` now derives a reverse table inventory from the three paired sources. Only source artifacts were generated; reset SQL was never executed.
2. Preliminary native import confirmed a conversion defect: changing retained procedure title `Original title` to `ORIGINAL TITLE` succeeded under Maria's default case-insensitive collation. SQLite rejects that change. `lib/operations/governance-schema.mjs` now converts original NEW/OLD comparisons to binary comparisons, including null-safe identity checks. This preserves original opaque/body/hash bytes and trailing spaces without changing FK-compatible table collations or SQLite source. Two failing source assertions and the actual native failure preceded this fix. Final native checks reject both case-only and trailing-space mutation, and retained native hash case/NULL changes.
3. Team source owner confirmed final0149SHA256 `36b262faaf3e152504c058cbbf5fd74330b958b9fd6496c6520c41808055c340`: native legal reference triple and immutable provenance; `team_governance_tasks.source_reference_json` with valid JSON/default/original target retention; current handoff/task indexes. Paired0149/0150/0151 sources were regenerated from that final source before the final run. Root owns ORM generation.

`node --test tests/governance-mariadb-schema-source.test.mjs`: final7/7PASS253.49ms. Paired files reproduce exactly, CRLF normalization remains deterministic, unsupported trigger/partial index conversion fails closed, binary original comparisons and reset inventory integration are covered. Scoped `git diff --check` passed; only the existing working-copy line-ending advisory was printed.

## Frozen final candidate and native result

Candidate directory: `.test-artifacts/t30/maria-candidate`; `freeze.json` pins SQLite/paired/converter sources, exact combined hashes and all44new FK column/parent tuples. Runner: `scripts/test-portable-mariadb-through0151.mjs fixture-20261103032129-d7804952`. It copies only the pinned schema into the owned fixture directory and creates a new uniquely named database before import. It never runs reset SQL or reuses an existing fixture database.

- Final schema SHA256: `f7f6bafc9d767c817b119b2ee10f9c9a2db35edf4240ef81515cd30163fb5f0f`.
- Final reset source SHA256: `0f14fdf32691bd7a27a8fcf8cb594f2d0a902ed5230f2b6a52f53d761c363d4c`.
- Verified through0148 prefix remains byte-identical:923596bytes, excluding only its final foreign-key footer. Retained complete0148 schema hash remains `3edc00ea8003f9b88b5016c2ea0c865b4963dff6ff50324725a23207b91c4b98`.
- MariaDB10.11.19:1736statements imported;357tables/views;19new tables and44exact actual native foreign keys matching all source tuples.
- All38T30negative assertions passed: declared grant/event/task JSON checks, real FK enforcement, self-backup insert rejection, immutable Team/access-review/procedure/acknowledgment/original-task facts, legal native reference shape/source/no copied body, governed incident closure revision, independent owner/backup, recovery evidence FK, incident/event/link retention and immutable form/file observations and diagnostic incident holds. Cleanup remains disabled.
- Positive round trips retain a20,000byte procedure body and160character release/evidence scope exactly. Complete authorized native procedure reference and governed closure revision are accepted.
- All15retainedT29negative checks also passed, including accepted delivery receipt preservation and immutable episode/observation/reminder facts; independent environment and resolved successor positives remain accepted.

Owned native evidence: `test-artifacts/mariadb/fixture-20261103032129-d7804952/import-through0151-mw0jdbiu_65dd46.json`. Fresh database: `fixture_d7804952_t30_mw0jdbiu_65dd46`.

## Shutdown and artifact publication

Owned PID13896: authenticatedShutdown=true, forcedStop=false, stopped=true at `2026-11-03T10:21:29.888Z`. A separate read-only process probe independently confirmed that exact PID absent. Heavy slot released to root immediately afterward.

Only after native PASS and shutdown, the exact pinned schema/reset source artifacts were copied to `deployment/babal/mariadb-schema.sql` and `deployment/babal/mariadb-reset-empty-import.sql`; both destination hashes were rechecked against the freeze. Reset was never executed. Paired source files and converter remain reproducible.

The initial sandbox launch could not read Windows PowerShell registry policy and never produced a native PID; no Maria process existed afterward. The approved isolated runner used escalation without weakening launcher, identity, hash or shutdown checks. Preliminary native PID15860 then shut down authenticated, unforced and absent after exposing the case-comparison defect. Its earlier candidate was not published and was superseded by the final frozen pass.

This is native schema/constraint evidence with fictional local rows. It does not claim full T33 application-runtime parity, real transport/scheduler evidence, broader T24 regression closure or authorization to merge/deploy.
