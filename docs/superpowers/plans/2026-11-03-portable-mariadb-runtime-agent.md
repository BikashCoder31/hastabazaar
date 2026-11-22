# Portable MariaDB runtime and first frozen T27 schema probe — 2026-11-03

Authoritative checkout: C:/Users/abinash/Desktop/HastaBazaar. This was an explicitly authorized NEW isolated verification environment, not the canonical application database. No canonical D1, application launch, existing database/volume, real credentials, live service, deployment, Windows service or global installation was used.

## Verified portable runtime

Owned fixture: `test-artifacts/mariadb/fixture-20261103032129-d7804952/`, with runtime/data/tmp/logs entirely beneath that new uniquely named directory. Resolved path and link checks protect the directory and every executed binary. A fixture-local `.gitignore` containing `*` ignores binaries, generated disposable credentials and database artifacts; `git check-ignore` confirmed the runtime and private state are ignored.

Current official 10.11 series metadata lists **10.11.19** as stable (2026-08-22): [official release list](https://mariadb.org/mariadb/all-releases/). Direct HTTPS fetch succeeded even though the browsing tool could not open that archive directory.

- ZIP: [official MariaDB10.11.19 Windows archive](https://archive.mariadb.org/mariadb-10.11.19/winx64-packages/mariadb-10.11.19-winx64.zip)
- Checksum: [official SHA256 metadata](https://archive.mariadb.org/mariadb-10.11.19/winx64-packages/sha256sums.txt)
- Verified SHA256: `398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490`

Official checksum was fetched and matched the reviewed pinned value before extraction or execution. ZIP entries were checked against traversal/absolute/symlink extraction; bundled Python `zipfile` extracted only into owned runtime. The documented Windows initializer received only the newly empty owned datadir, generated disposable password and owned bootstrap template; `--service` and remote-root/default-user options were absent. Windows initializer internally uses only its owned generated my.ini; it does not advertise --no-defaults. Runtime server commands use --no-defaults FIRST.

Source: [Windows ZIP instructions](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-windows-zip-packages), [initializer options](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/installing-system-tables-mariadb-install-db/mariadb-install-db-exe), [official Windows initializer source](https://github.com/MariaDB/server/blob/10.11/sql/mysql_install_db.cc).

Reusable guarded launcher/import helper: `scripts/portable-mariadb-fixture.mjs`.

- `prepare`: creates a fresh unique fixture, downloads/pins/checksums/extracts, initializes only its empty datadir. No application schema import.
- `probe <owned-id>`: rechecks checksum/binary/path provenance; starts via PowerShell Start-Process -WindowStyle Hidden -PassThru with an owned PID-file handoff; uses explicit basedir/datadir/tmp/pid/logs and fresh127.0.0.1port, skip-name-resolution, binarylogOFF,event-schedulerOFF,local-infile0; proves server identity/settings before callback.
- `withPortableMariaFixture`: accepts only an exact known fixture ID and generated ignored private state, rejects an active previous owned server, verifies actual server datadir/PID/port/version before exposing its connection, and authenticates SHUTDOWN in finally. Failed startup/shutdown has a strict exact-owned-binary PID cleanup fallback; successful evidence requires no forced stop.
- `createFixtureDatabase`: creates a NEW uniquely prefixed test database only on a live verified fixture connection; never reuses an existing name.
- `importFixtureSql`: accepts only this helper's live connection/new test database and reviewed source or owned fixture SQL. It cannot switch/create/drop databases through the import file, honors MariaDB DELIMITER blocks, and records bounded exact SQL/index/line/normalized offset on error. No import occurs automatically through prepare/probe.

## Actual connectivity and shutdown evidence

`node scripts/portable-mariadb-fixture.mjs prepare` — exit0, official10.11.19 verified and initialized.

The initial PowerShell redirected-child close event delayed control until server exit. The exact owned instance was independently verified and authenticated-shutdown; the launcher was corrected to hand off PID through an owned file, preserving required Hidden/PassThru startup. No schema was loaded during diagnosis.

`node scripts/portable-mariadb-fixture.mjs probe fixture-20261103032129-d7804952` — **PASS**,exit0:

- Version `10.11.19-MariaDB`.
- Exact owned PID18120, fresh loopback port59248.
- Datadir exactly the owned `.../data/`.
- Only information_schema,mysql,performance_schema,sys,test existed; no application database.
- Authenticated shutdown=true, forcedStop=false, stopped=true; PID separately checked absent.

Owned non-secret artifacts: provenance.json,connectivity-evidence.json,last-shutdown.json. Generated private-state.json is intentionally ignored and must not be copied into reports or source control.

`node --test tests/portable-mariadb-fixture-guard.test.mjs` — **2/2 passed**, latest duration735.212ms. Covers path escape/root refusal, forged import/DB-creation connection refusal, malformed fixture ID refusal without touching data, trigger-delimiter parsing and unterminated SQL refusal.

## First authorized frozen through0143 native import

Root separately authorized ONLY `.test-artifacts/t27/mariadb-schema-through0143-20261103.sql`, SHA256 `2864fc58b6ed9795c5b4437fab584a179f714a54bee4906d43f5c6799439cb1b`. Runner `scripts/test-portable-mariadb-through0143.mjs` asserts that exact hash, makes an exclusive owned copy, creates a fresh unique database for each attempt and always authenticates shutdown. It does not read the changing combined schema or load0144.

`node scripts/test-portable-mariadb-through0143.mjs fixture-20261103032129-d7804952` — **FAIL**,exit1, first native schema compatibility defect:

- New owned database: `fixture_d7804952_t27_mw04tct3_e0c0ff`.
- Statement725, source line3733, normalized source offset265175.
- Error `ER_FK_FAIL_ADD_SYSTEM`,errno1823,SQLSTATEHY000.
- Verbatim error: `Failed to add the foreign key constraint 'fixture_d7804952_t27_mw04tct3_e0c0ff/seller_document_change_requests_ibfk_1' to system tables`.
- Exact SQL: `ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS replacement_document_id VARCHAR(191) REFERENCES seller_documents(id)`.
- Source artifact: `deployment/babal/mariadb-document-review-history.sql:11`, before T27 finance sources. Both involved id fields useVARCHAR191/utf8mb4_unicode_ci in frozen source; the existing table already has unnamedFKs. Implicit FK-name reuse is a hypothesis, not yet a proven repair.

Bounded evidence: owned `import-through0143-mw04tct3_e0c0ff.json`. No unowned/shared parity file was edited. Final owned server PID25448 authenticatedShutdown=true,forcedStop=false,stopped=true. The partial NEW test database is preserved as evidence and will never be reused by the guarded create helper.

The native-Maria runtime availability blocker is removed. Combined schema compatibility currently fails at this pre-existing non-T27 artifact; root owns authorization for the next repair/new frozen import. This is not T33 full rehearsal completion. Wait for root before any further import or money/schema tests.

## Authorized native foreign-key parity repair and second actual blocker

Root authorized diagnosing the first error and preserving its foreign key through an explicit unique name. A minimal default-session four-unnamed-FK reproduction did NOT fail, so no repair was made on that hypothesis alone. A second exact frozen import into another fresh owned DB captured the actual `SHOW ENGINE INNODB STATUS` error:

`A foreign key constraint of name ... seller_document_change_requests_ibfk_1 already exists.` The engine explicitly recommended unique explicit constraint names. Original frozen SQL/session was not substituted, skipped or altered to obtain this evidence.

Root-authorized authoritative source edit: `deployment/babal/mariadb-document-review-history.sql` now adds the same replacement_document_id VARCHAR191 column and named `fk_doc_change_replacement_document FOREIGN KEY(replacement_document_id) REFERENCES seller_documents(id)`. No parent/column/constraint was dropped or disabled. The main generator reads this artifact directly; no separate artifact-authoring generator was found. Shared generator was run once under root's exclusive authorization.

Fresh snapshot `.test-artifacts/t27/mariadb-schema-through0143-nativefkfix1-20261103.sql`, SHA256 `971b0820ceb2e012f4cd9c038c56ea628bc15bb5187420f4242e0dbda7207208`. A normalized comparison proved the ONLY change from the first frozen snapshot was this authorized FK naming repair; no source0144 was included.

Fresh owned native import advanced past statement725, proving the original failing ALTER now succeeds. It then stopped at the next independent baseline problem:

- Database `fixture_d7804952_t27_mw054gwl_6836c0`.
- Statement741, source line3805, normalized offset270832.
- `ER_BAD_FIELD_ERROR`,errno1054,SQLSTATE42S22: `Unknown column 'applicant_type' in 'NEW'`.
- Failing source: `deployment/babal/mariadb-protected-change-holds.sql:17`, CREATE TRIGGER seller_identity_revision_changed AFTER UPDATE ON seller_profiles; it references NEW.applicant_type.
- `deployment/babal/mariadb-seller-registration.sql:2` already defines the nullable legacy-safe applicant_type column, but the shared generator does not read/append that additive artifact. This appears to be missing prerequisite assembly, distinct from FK naming; no further edit was made without root coordination.

Owned evidence `import-through0143-mw051ds2_78e26c.json` contains engine FK-name-collision diagnostic; `import-through0143-mw054gwl_6836c0.json` contains next error and exact trigger SQL. Latest owned server PID22000 authenticatedShutdown=true,forcedStop=false,stopped=true. All attempts used new unique DBs; no partial fixture was reset/reused and no canonical database or app was accessed.

Wait for root's next parity authorization; this remains T27 compatibility verification, not T33 full rehearsal completion.

## Existing registration prerequisite assembly and subsequent native diagnostics

Root authorized integrating the already-authoritative `mariadb-seller-registration.sql` into shared generation. The generator now reads and appends its exact source after base tables and before dependent identity/registration triggers. Existing NULL legacy classification, generated registration keys and unique-index semantics are unchanged; no data classification/backfill was added.

New `tests/mariadb-prerequisite-order.test.ts` first failed for the omitted source, then passed after integration. It verifies exact authoritative source inclusion after base seller_profiles and before seller_identity_revision_changed, plus nullable applicant_type/no classification UPDATE.

Fresh through0143-nativeprereqfix2 snapshot SHA `6348ad6b6b92c9bb4aad714017734e61fa576f476557697a23faa08d72af9591` advanced to statement767,line3997/normalizedoffset281060. The engine again proved an identical implicit FK-name collision on seller_protected_change_cases_ibfk_1 while ALTER added active_permission_id REFERENCES seller_protected_change_permissions(id). Under root's preauthorization for this exact mechanism, `mariadb-protected-change-holds.sql` now preserves the same column/reference with explicit unique `fk_protected_case_active_permission`. No constraint was removed/disabled.

After root and0144 owner confirmed source stability/exclusive generation, through0144-nativefix3 snapshot SHA `866943ea1833d5c4d970b2fde817914d69f7edafff2e15262fcc27665370025b` included the exact stable funding-freshness parity source. Native import passed both FK fixes and registration prerequisites, then failed statement786,line4154/offset288023 with ER_CANT_CREATE_TABLE1005/errno150 on seller_public_profile_revisions. Source declared submitted_by/reviewed_by as TEXT REFERENCES users(id), incompatible with indexed VARCHAR191 parent storage.

Root authorized narrow identifier type parity: four actor FK fields in authoritative hand-source `mariadb-public-profile-revisions.sql` (submitted_by,reviewed_by in both tables,requested_by) now use VARCHAR191 with the same NOTNULL/nullable behavior and users(id) references. Business TEXT/JSON fields remain unchanged. Canonical0084 case_id self-FK was verified against application code (`public-profile-workflow.ts` initializes caseId to the first revision id) and preserved.

Fresh through0144-nativeidfix4 snapshot SHA `fc5e40bad74e9ca32d1b45a76c310065e3cf557b463885f8687dd3e725ca6d43`,848935bytes; prerequisite regression1/1passed. Native execution of this snapshot waits for root's global typecheck window. Previous owned Maria PID15068 authenticatedShutdown=true,forcedStop=false,stopped=true and separately checked absent. No direct remaining TEXT REFERENCES fields were found by the narrow additive-Maria source inventory; that is not a full engine verification claim.

## Nativeidfix4 one-import window: next reserved-identifier blocker

Root released ONE fresh import during an otherwise idle D1-diagnostic interval. `scripts/test-portable-mariadb-through0144.mjs` imported only pinned nativeidfix4 SHA `fc5e40bad74e9ca32d1b45a76c310065e3cf557b463885f8687dd3e725ca6d43` into new owned DB `fixture_d7804952_t27_mw05ulac_302900`. Public-profile FK identifier typing passed.

Next actual native error:

- Statement889,line4684,normalizedoffset330451.
- ER_PARSE_ERROR1064,SQLSTATE42000: syntax near `cursor VARCHAR(191) NOT NULL DEFAULT '',revision BIGINT NOT NULL DEFAULT 0)...`.
- Exact statement: `CREATE TABLE commission_terms_scan_state(id VARCHAR(191) PRIMARY KEY CHECK(id='default'),cursor VARCHAR(191) NOT NULL DEFAULT '',revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`.
- Authoritative hand-source: `deployment/babal/mariadb-common-fee-policies.sql:24`, read/appended directly by shared generator.
- Read-only mapping also found unquoted runtime cursor SELECT/UPDATE at `lib/commission/terms-followup.ts:172/175`; a DDL-only quote would not establish functional Maria parity for that scanner. No new identifier rename, runtime edit or unowned fix was made without root coordination.

Owned PID7596 authenticatedShutdown=true,forcedStop=false,stopped=true and independently checked absent. Native window released; no automatic further import started. Root global typecheck can proceed without this daemon. Bounded exact diagnostic: owned `import-through0144-mw05ulac_302900.json`.

### Reserved scanner identifier repair (root-authorized, no native restart)

The nativeidfix4 error was diagnosed as the existing MariaDB reserved identifier `cursor`. Quoted that same name in the authoritative common-fee-policy DDL and both scanner SELECT/UPDATE SQL strings; values, row name, revision CAS, pagination, permissions and scan timing remain unchanged. A focused source/runtime regression was red on the unquoted definition, then passed with real two-page/exhaustion scanner execution in an inspected SQLite `:memory:` fixture. All same-table references were checked; the INSERT uses only `id` and needs no cursor change.

Latest combined focused command `node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal.test.ts tests/customer-refund-reversal-api.test.ts tests/commission-terms-scan-portability.test.ts` passed8/8,exit0,40451.6057ms. Shared schema regeneration and another frozen native import remain coordinated with root; no new MariaDB process was started. This is a source/runtime quoting repair, not evidence that the subsequent native schema import or T33 rehearsal has passed.

### Through0144 cursor/current-account checkpoint: next native alias collision

After root final typecheck passed and root regenerated the shared schema through0144, froze the exact current bytes to `.test-artifacts/t27/mariadb-schema-through0144-cursor-accountfix-2ef864b05f-20261103.sql`,849393bytes,SHA256`a9cb689998171e00c0fad668081ebebed31983214f0afda0217e8eaa30289075`. Verified existing quoted scanner cursor, source0140 current-account changes, and absence of0145/0146 source markers. Shared generator was not run by this agent.

One fresh owned database `fixture_d7804952_t27_mw06rbv7_99c2e6` advanced past the prior statement889 cursor failure, then stopped at statement919,line4757,normalizedoffset342244 with ER_BAD_FIELD_ERROR1054/SQLSTATE42S22: `Unknown column 'id' in 'OLD'`.

Exact bounded statement:

```sql
CREATE TRIGGER product_intake_head_update BEFORE UPDATE ON product_intake_workspace_heads FOR EACH ROW BEGIN
IF NOT (NEW.draft_id <=> OLD.draft_id) OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id JOIN product_intake_workspace_versions old ON old.id=OLD.version_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private' AND v.revision>old.revision) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_head_source';
END IF;
END
```

Authoritative hand source `deployment/babal/mariadb-product-intake-workspace.sql:54–55` is appended directly by the shared generator. Its table alias `old` collides with MariaDB trigger `OLD`; the head row has draft_id/version_id rather than id. Canonical SQLite0092 uses the same alias. Proposed Maria-only alias rename to prior_version preserves exact predicates/references; requested root authorization before editing because this is outside the narrow FK repairs.

Read-only related alias mapping found one additional `old` table alias in authoritative `mariadb-recovery-response-cycles.sql:23` inside BEFORE INSERT recovery_response_current_notice. That later source has not yet been reached/proven by this native import; it remains untouched. No other old/new table aliases matched in the authoritative Maria slice inventory.

Owned server PID23624 authenticatedShutdown=true,forcedStop=false,stopped=true; independent process check found no Maria server. Exact import evidence is owned `import-through0144-mw06rbv7_99c2e6.json`. No automatic next import or shared regeneration was performed.

### Authorized Maria-only trigger alias repair and next missing prerequisite

Root authorized exact product_intake_head_update alias old→prior_version. Checked authoritative ownership: this is hand-authored parity source; only the shared generator reads/appends it, with no separate slice generator. Changed three references in `mariadb-product-intake-workspace.sql`, preserving all predicates and OLD/NEW trigger fields. Left unproven recovery alias unchanged.

Generated to **fresh artifact output only** with `node scripts/generate-mariadb-schema.mjs --output-directory=.test-artifacts/t27/nativealiasfix-a7631e8b`; did not write shared deployment outputs. Frozen schema849423bytes,SHA256`cbdabbd1420147987af84815d0ab658beafb5bf2a4413bacf3e871c43a0fa5b3`. Byte comparison with preceding frozen source proved that only the three authorized alias references changed;0145/0146 absent.

One new owned database `fixture_d7804952_t27_mw06uffe_841b57` passed repaired statement919 and stopped at statement1022,line5383,normalizedoffset392044: ER_NO_SUCH_TABLE1146/SQLSTATE42S02, `Table 'fixture_d7804952_t27_mw06uffe_841b57.order_cancellation_events' doesn't exist`.

Exact bounded statement:

```sql
CREATE VIEW manual_payment_balances AS SELECT o.id AS order_id,
 CASE WHEN o.current_total_paisa IS NULL THEN o.grand_total_paisa ELSE o.current_total_paisa+COALESCE((SELECT JSON_VALUE(e.next_json,'$.platformServiceFeePaisa') FROM order_cancellation_events e WHERE e.order_id=o.id ORDER BY e.version DESC LIMIT 1),o.buyer_platform_fee_paisa) END AS payable_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.order_id=o.id AND r.status='verified'),0) AS received_paisa FROM orders o JOIN manual_payment_windows w ON w.order_id=o.id
```

Read-only prerequisite mapping: canonical SQLite0039 creates cancellation event/review tables before0098 defines this view. Existing authoritative `mariadb-partial-cancellation.sql` defines them (events atline8), index, immutable history guards, wallet restore trigger, cancellation_version/made_to_order_snapshot and the original chk_cancellation_totals. Shared generator reads it but only extracts five current-total columns and the wallet_cancel_restore trigger; it never appends the full source. Generated frozen output contains no cancellation table CREATE. All full-source dependencies orders/order_items/wallet_entries exist before manualPaymentAllocationsSql. Proposed complete existing-source append immediately before manualPaymentAllocationsSql, with prerequisite-order regression; requested root authorization before any ordering/source integration change.

Owned PID3568 authenticatedShutdown=true,forcedStop=false,stopped=true; independent process check found no Maria server. Exact import evidence owned `import-through0144-mw06uffe_841b57.json`. No automatic next import.

### Complete cancellation prerequisites integrated; next identical implicit-FK collision

Root authorized complete existing `partialCancellationSql` append immediately before `manualPaymentAllocationsSql`, matching canonical0039-before0098. Generator change is one ordered source append. Checked duplicate columns/constraint use IF NOT EXISTS; the full source drops/recreates the exact earlier extracted wallet_cancel_restore trigger; all later source override order remains unchanged. No backfill or altered constraint semantics.

Added fresh-generation prerequisite regression to `tests/mariadb-prerequisite-order.test.ts`. It generates only into a unique `.test-artifacts` directory and requires the exact full authoritative source before payment balances, existing wallet parent tables, idempotent column/constraint operations and the deliberate identical wallet-trigger replacement. Red without append, then2/2 passed,exit0,609.6952ms.

Generated only `.test-artifacts/t27/nativecancellationfix-c02da891`; frozen854304bytes,SHA256`09a1496380928b96a477b4f240927bb84ebdfe385ab59022242daa84b090d9c4`, no0145/0146. One new owned database `fixture_d7804952_t27_mw06zixd_74a61d` passed the missing-view prerequisite and stopped at statement1099,line5874,normalizedoffset425188: ER_FK_FAIL_ADD_SYSTEM1823/HY000. Engine diagnostic explicitly reports implicit `order_cancellation_reviews_ibfk_1` already exists and recommends unique explicit names.

Exact failing ALTER:

```sql
ALTER TABLE order_cancellation_reviews ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN owner_id VARCHAR(191) REFERENCES users(id), ADD COLUMN backup_id VARCHAR(191) REFERENCES users(id),
 ADD COLUMN first_action_at BIGINT, ADD COLUMN first_due_at BIGINT, ADD COLUMN next_update_at BIGINT,
 ADD COLUMN original_facts_json LONGTEXT CHECK(original_facts_json IS NULL OR JSON_VALID(original_facts_json))
```

Identical collision repair is preauthorized. Authoritative hand source `deployment/babal/mariadb-cancellation-scope-holds.sql` has no separate slice generator. Replaced only owner/backup inline references with named `fk_cancellation_review_owner` and `fk_cancellation_review_backup`, preserving nullable VARCHAR191 columns and users(id) parents. Shared schema/reset outputs remain untouched; repaired source awaits a future coordinated candidate/import. No constraint disabled/dropped.

Owned PID26220 authenticatedShutdown=true,forcedStop=false,stopped=true; independent check found no Maria server. Exact evidence owned `import-through0144-mw06zixd_74a61d.json`. Shared generator edit released to root; no automatic additional import.


### Standing authorization: continue proven narrow repairs to actual complete import

Root authorized sequential fresh frozen through0144 imports after each engine-proven naming/alias repair; new semantics/missing-source changes still require coordination. Fresh artifacts only, no shared deployment output changes or0145/0146 append.

Cancellation-review named FK candidate `.test-artifacts/t27/native-through0144-79aadd0d8a/mariadb-schema.sql`,854442bytes,SHA256`42f14e6a9bfc15d6d3e0d9b011a7054794c794cbc6e4cab4ed15cc8282fd6ba4`, imported into new `fixture_d7804952_t27_mw075nar_7bbaaa`. Passed the previous failure, stopped at statement1130,line5975,offset437748,ER_FK_FAIL_ADD_SYSTEM1823/HY000: `ALTER TABLE complaints ADD COLUMN intake_recorded_by VARCHAR(191) REFERENCES users(id)`. Engine explicitly reports existing complaints_ibfk_1. Applied preauthorized naming-only repair `fk_complaint_intake_recorded_by`, preserving nullable VARCHAR191/users(id). Authoritative hand source mariadb-aftercare-followups.sql is appended directly by shared generator; no separate source generator. Owned PID23456 authenticated shutdown=true,forced=false,stopped=true. Exact diagnostic owned `import-through0144-mw075nar_7bbaaa.json`.


Complaint-intake named FK candidate `.test-artifacts/t27/native-through0144-d2b2f1f833/mariadb-schema.sql`,854522bytes,SHA256`a60e00f78055d21e3fe207df3e0d9ed75c66292ab81df2bab2f65a138d55c036`, imported into fresh `fixture_d7804952_t27_mw076wb7_976c30`. Passed complaint-intake repair; stopped1240,line6365,offset493524,ER_FK_FAIL_ADD_SYSTEM1823/HY000 on `ALTER TABLE seller_recovery_allocations ADD COLUMN registered_debit_id VARCHAR(191) REFERENCES seller_ledger_entries(id)`. Engine explicitly confirms existing seller_recovery_allocations_ibfk_1. Applied preauthorized naming-only `fk_recovery_allocation_registered_debit`, same nullable VARCHAR191/seller_ledger_entries(id), authoritative hand mariadb-seller-recovery-agreements.sql; no separate slice generator. PID23860 authenticated shutdown=true,forced=false,stopped=true. Exact diagnostic owned `import-through0144-mw076wb7_976c30.json`.


Registered-debit named FK candidate `.test-artifacts/t27/native-through0144-5301c6b16a/mariadb-schema.sql`,854611bytes,SHA256`c7a5e7d073e500bd887a05ef4aa6ad5fe03e6e0d7abdd89a6de597d7f0ef8b83`, fresh database `fixture_d7804952_t27_mw078fvx_943dbf`: passed1240, stopped1247,line6389,offset496192,ER_FK_FAIL_ADD_SYSTEM1823/HY000 on `ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_credit_id VARCHAR(191) REFERENCES managed_supplier_recovery_credits(id)`. Engine confirms existing seller_recovery_allocations_ibfk_1. Named only fk_recovery_allocation_fixed_credit, same nullable VARCHAR191/parent, authoritative hand recovery-model-settlements source; no separate slice generator. PID22336 authenticated shutdown=true,forced=false,stopped=true. Diagnostic owned `import-through0144-mw078fvx_943dbf.json`.


Allocation fixed-credit named FK candidate `.test-artifacts/t27/native-through0144-38242f9c11/mariadb-schema.sql`,854692bytes,SHA256`d071d345a762e3713b99bc049764366e8c747b8084d3e1e933b3864c08dbd6c1`, fresh `fixture_d7804952_t27_mw07a1yw_553212`: passed1247, stopped1249,line6392,offset496511,ER_FK_FAIL_ADD_SYSTEM1823/HY000 on `ALTER TABLE seller_recovery_reductions ADD COLUMN fixed_credit_id VARCHAR(191) REFERENCES managed_supplier_recovery_credits(id)`. Engine confirms existing seller_recovery_reductions_ibfk_1. Named only fk_recovery_reduction_fixed_credit in the same authoritative hand source, same nullable VARCHAR191/parent. PID27292 authenticated shutdown=true,forced=false,stopped=true; diagnostic owned `import-through0144-mw07a1yw_553212.json`.


Reduction fixed-credit named FK candidate `.test-artifacts/t27/native-through0144-4b38a5ba1b/mariadb-schema.sql`,854772bytes,SHA256`0957eedd82328b1c4024510b55923c2031977714e530ca29bd4aa95e91db0dda`, fresh `fixture_d7804952_t27_mw07b2fy_0796a1`: passed1249, stopped1260,line6422,offset502240,ER_FK_FAIL_ADD_SYSTEM1823/HY000 on `ALTER TABLE seller_recovery_allocations ADD COLUMN managed_debit_id VARCHAR(191) REFERENCES managed_settlement_entries(id)`. Engine confirms allocations_ibfk_1. Named only fk_recovery_allocation_managed_debit, same nullable VARCHAR191/parent, authoritative hand model-netting source; no separate slice generator. PID33796 authenticated shutdown=true,forced=false,stopped=true; diagnostic owned `import-through0144-mw07b2fy_0796a1.json`.


Managed-debit named FK candidate `.test-artifacts/t27/native-through0144-dbe4543081/mariadb-schema.sql`,854855bytes,SHA256`65fd2afefc04d63d1434ffd7fd79dd4a1952cb085078c1f9b553f4f811b15f0a`, fresh `fixture_d7804952_t27_mw07cchl_549666`: passed1260, stopped1262,line6427,offset502680,ER_FK_FAIL_ADD_SYSTEM1823/HY000 on `ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_debit_id VARCHAR(191) REFERENCES managed_supplier_recovery_credits(id)`. Engine confirms allocations_ibfk_1. Named only fk_recovery_allocation_fixed_debit, same nullable VARCHAR191/parent, same authoritative hand model-netting source. PID24660 authenticated shutdown=true,forced=false,stopped=true; diagnostic owned `import-through0144-mw07cchl_549666.json`.


Fixed-debit named FK candidate `.test-artifacts/t27/native-through0144-e9ced852b6/mariadb-schema.sql`,854934bytes,SHA256`03695aa2dde4687e5bc2f51c3e1d99c4b3f22bf0aa56492d533696b12526ef05`, fresh `fixture_d7804952_t27_mw07dfyw_4ac85d`: passed1262, stopped1305,line6610,offset526848,ER_TRG_NO_SUCH_ROW_IN_TRG1363/HY000, `There is no OLD row in on INSERT trigger`. Actual failing recovery_response_current_notice uses `seller_recovery_contact_windows old ... prior.id=old.contact_id WHERE old.case_id=e.case_id`. This confirms the earlier mapped alias collision. Under explicit root preauthorization renamed only Maria table alias and two references to prior_window, preserving every comparison/relationship, in authoritative hand mariadb-recovery-response-cycles.sql. No separate slice generator; canonical SQLite unchanged. PID31268 authenticated shutdown=true,forced=false,stopped=true; diagnostic owned `import-through0144-mw07dfyw_4ac85d.json`.


Recovery-notice alias candidate `.test-artifacts/t27/native-through0144-c5942ac4f1/mariadb-schema.sql`,854961bytes,SHA256`27b71e12533dd232d6e6c5eab16e0fca9b0c07e966493471d02cb052646395e9`, fresh `fixture_d7804952_t27_mw07evrd_8c8f97`: passed1305, stopped1356,line7034,offset589491,ER_PARSE_ERROR1064/42000 near SQLite `WHEN NOT EXISTS`. Maria carrier-reimbursement parity contains raw SQLite retained recovery_restoration_source and recovery_correction_projection triggers with WHEN/SELECT RAISE; delimiter parsing joins them with the following native trigger. Exact bounded diagnostic owned `import-through0144-mw07evrd_8c8f97.json`.

New non-preauthorized translation defect diagnosed without edits: authoritative `scripts/generate-recovery-carrier-source.ts` captures retained trigger bodies from CRLF `drizzle/0123_recovery_liability_corrections.sql` (89 CRLF lines), then Maria regex requires literal `ON table\nWHEN` and silently returns unchanged input. A read-only exact regex reproduction confirms raw retained SQL does not match, CRLF-normalized input does. Carrier0130 generated SQLite/Maria currently carry10 inherited CRLF lines. Identical defect in `scripts/generate-recovery-payout-return-source.ts` reading mixed-ending0130 leaves one raw projection trigger in Maria0133. Inventory found exactly these three leaked WHEN/RAISE definitions among authoritative Maria slices. Proposed normalize only Maria retained input plus fail-closed converter, LF/CRLF regression and slice regeneration with unchanged SQLite predicates; requested root authorization before changing this translation behavior.

Owned PID36324 authenticated shutdown=true,forced=false,stopped=true; independent process check found no Maria server. No further import until coordinated for this new defect.


### CRLF-safe retained trigger conversion repaired with unchanged SQLite bytes

Root authorized exact Maria-only conversion normalization and fail-closed behavior. Added pure `scripts/mariadb-retained-trigger.ts`, normalizing CRLF only for Maria input, requiring one complete recognized retained trigger, then preserving the full predicate/message in FOR EACH ROW/IF/SIGNAL syntax. Both affected0130/0133 generators now call it; no source-policy conditions changed.

`tests/mariadb-retained-trigger.test.ts` covers LF/CRLF identical output, UPDATE/INSERT action preservation, malformed input failing closed, and exact native parity for all three real retained predicates/messages. Real-artifact assertion was red on the raw carrier trigger, then3/3 passed,exit0,479.3194ms. Regenerated only0130/0133 source slices. Before/after SHA/normalized comparisons proved **both SQLite output files byte-identical**; no canonical migration was applied. Saved comparison source evidence ignored `.test-artifacts/t27/retained-trigger-before-c27f06.json`.

Next candidate generated only into fresh `.test-artifacts/t27/native-through0144-f683a06a0b`,855138bytes,SHA256`c06b54fb0f77f5205761b0fa9b91ab31bb38c5c4d8d474fcf05abf858dda33ce`, no0145/0146 or shared deployment output writes.


CRLF-safe candidate imported into fresh `fixture_d7804952_t27_mw07kbva_526dbe`: passed retained-trigger failures, stopped1454,line7755,offset712522,ER_BAD_FIELD_ERROR1054/42S22: `Unknown column r.commission_reversal_paisa in WHERE` while creating seller_recovery_original_source_pools. Exact bounded diagnostic owned `import-through0144-mw07kbva_526dbe.json`; the full view remains in frozen candidate. PID29748 authenticated shutdown=true,forced=false,stopped=true; no daemon remains.

Root requested concrete schema-only mapping before any old policy source integration. Authoritative mariadb-policy-commission-9-percent.sql includes a legacy future-order9% policy setting INSERT, so **do not append the whole file**. Existing generator extracts only order_items.platform_discount_paisa. Canonical0043 defines refunds.commission_base_refunded_paisa and commission_reversal_paisa as NOT NULL DEFAULT0; both are absent from the0020 generated base and every later generated ALTER, and no later source overrides their definitions. They are retained historical accounting columns, distinct from current effective fee consent/rates. Proposed smallest immediate repair: include only those two exact ALTER statements in existing schema-only prerequisite extraction, excluding policy INSERT/backfill/consent changes; awaiting root authorization.

Read-only wider gap inventory (not edited): item commission_base_paisa, commission_rule_version and seller_agreement_version; return_requests.original_seal_intact; seller_profiles.settlement_terms_reference are also omitted. Frozen base still has idx_seller_ledger_refund_unique on refund_id, while canonical0043 replaces it with refund_id,type uniqueness. These independent runtime parity gaps were reported rather than silently bundled into the immediate view repair.


### Exactly two schema-only refund accounting prerequisites

Root authorized only refunds.commission_base_refunded_paisa and commission_reversal_paisa, retaining exact authoritative BIGINT NOT NULL DEFAULT0. Added those two keys to existing schema-only prerequisite extraction. No whole old policy append, historical backfill, consent/rate setting, index replacement, or other missing column change. The separately mapped gaps above remain for T33; empty-schema import does not settle runtime/money parity.

Updated fresh-generation regression requires both exact ALTERs before original-source view and rejects old9% policy INSERT. Red without keys, then2/2 passed,exit0,625.4079ms. Generated only fresh `.test-artifacts/t27/native-through0144-b2a24ce85f`,855339bytes,SHA256`9ad40ec3dce43454a2c5d52e03bde219dd498a0e850ae176c0c532e78a615fb0`, no0145/0146/shared output writes.


Two-refund-column candidate fresh database `fixture_d7804952_t27_mw07pvwi_fdac60` passed the omitted column but stopped1456,line7757,offset712723,ER_BAD_FIELD_ERROR1054/42S22: `Unknown column native_source.sellerId in WHERE` in the same original-source-pools view. Exact bounded diagnostic owned `import-through0144-mw07pvwi_fdac60.json`. PID5212 authenticated shutdown=true,forced=false,stopped=true; no daemon remains.

Read-only mapping: `positiveOriginalPaidSql` in lib/payments/recovery-partial-paid-source.ts uses a nested derived aggregate per payout with outer scope/seller references (`FROM (SELECT p.id,SUM(x.amount_paisa) scopeAmount ... WHERE p.seller_id=native_source.sellerId ... GROUP BY p.id HAVING SUM(x.amount_paisa)>0) paid`). This Maria engine cannot resolve that outer reference across the derived table. The same helper contributes to0138 and0139 original-source-pool views and runtime queries. Proposed dialect-specific equivalent preserves per-payout positive sums, actual paid bank proof, registered released-entry exclusion and managed allocation-over-fallback deduplication via scalar correlated scope sums; default SQLite branch unchanged. Requires signed/multi-payout fixture equivalence on both engines and root approval before changing query construction. No such repair is applied yet.


### Maria positive-original-paid scope equivalence and historical view preservation

Root authorized a Maria-only equivalent after1456 outer-correlation failure; financial agent confirmed no shared-file overlap. `positiveOriginalPaidSql` adds an optional fourth dialect argument defaulting to the existing unchanged SQLite SQL branch. Maria sums the exact signed matching scope entries **per payout**, retains only payout-level sums>0, and preserves all original actual bank identity/amount/account/state/book-status checks, registered released-entry filtering, managed positive native paid allocation path and paid-native-versus-legacy fallback exclusion. Three read-only source readers use the existing db.dialect marker; optional dialect propagates through partialUnpaidSourceSql. No money-writing command or source-proof condition weakened.

`tests/original-paid-scope-portability.test.ts` executes both original/default and rewritten expressions in an inspected SQLite memory fixture against explicit vectors: registered positive signed100-30+20=90 plus second50-10=40; negative20-30 and zero25-25 excluded; released/unpaid/bad or absent actual-bank proof excluded; unrelated scopes/sellers isolated. Managed native80 plus legacy70-20=50 plus native35 on a mixed payout plus legacy60-10=50 beside a reserved native row yields215; paid native allocations suppress duplicate legacy fallback. Other-scope totals registered680/managed530, unrelated seller65/45, empty0/0. Source fixtures include missing bank, wrong hash/account/amount, pending packet and unpaid original status. These are **isolated query tables**, not native application finance assertions.

Focused memory query plus existing partial-paid/partial-unpaid/unpaid service files passed12/12,exit0,53039.9452ms. Actual portable Maria10.11.19 query fixture also **PASS**, fresh database fixture_d7804952_paid_scope_80bbdc84, constructing a nested native view with rewritten expressions and obtaining the exact vectors main130/215, other680/530, unrelated65/45, empty0/0. Result decimals normalized to safe small Number values for assertion only; this does not claim application driver money-type compatibility. Exact owned evidence `paid-scope-653ec259-6b62-4b5b-bc25-062003d544a6.json`. Owned PID12408 authenticated shutdown=true,forced=false,stopped=true. No further Maria launch while financial agent holds native slot.

Historical generation strategy approved by root: canonical retained SQLite view supplies every predicate. Fail-closed translator replaces exactly one registered and one managed positive-paid fragment and rejects missing/ambiguous shapes. Generators0138/0139 support --mariadb-view-only, patching only the existing Maria view from canonical SQLite; no stale trigger recopy and no SQLite writes.0138 default generation now retains its canonical historical view and explicitly rejects later0139 recovery_receipt_reversal dependencies instead of rebuilding from today's broader capacity helper. The prior generator could silently introduce that later exclusion when regenerated; this drift is now guarded. Final0139 view retains all its later proofs.

View equivalence/preservation regression2/2 passed,exit0,499.4683ms: undoing only translated fragments gives the exact original canonical view; before/after native guards remain byte-identical; historical0138 future dependency, duplicate views and altered proof fragments are rejected. Ran only the two --mariadb-view-only slice updates. SHA comparisons proved BOTH0138/0139 SQLite files byte-identical; whole-native-file comparison proved ONLY original-source-pool views changed. Comparison evidence ignored `.test-artifacts/t27/paid-view-before-f31807.json`. Combined fresh generation/import not yet run, pending root review and native slot release.


After root accepted dialect/view preservation evidence and financial agent released native slot, rechecked retained SQLite hashes and froze fresh `.test-artifacts/t27/native-through0144-158f58c0e5/mariadb-schema.sql`,856245bytes,SHA256`300016b9ce578a8caa50b550cd9a75d10e5d7f956f53d9e2598ce6c4110f1d02`, no0145/0146. Root authorized next combined fresh-fixture import; shared deployment outputs remain untouched.


### Complete through0144 native import PASS (source compatibility checkpoint)

Frozen source `.test-artifacts/t27/native-through0144-158f58c0e5/mariadb-schema.sql`,856245bytes,SHA256`300016b9ce578a8caa50b550cd9a75d10e5d7f956f53d9e2598ce6c4110f1d02`, imported successfully on official portable MariaDB10.11.19 into **new owned empty database** `fixture_d7804952_t27_mw089i9p_cb79c1`. ALL1574 statements passed; SHOW FULL TABLES returned322 tables/views. Exact owned evidence `test-artifacts/mariadb/fixture-20261103032129-d7804952/import-through0144-mw089i9p_cb79c1.json`. No0145/0146 included and no shared deployment schema/reset outputs were written.

Owned server PID22472 authenticatedShutdown=true,forcedStop=false,stopped=true at2026-11-03T05:09:59Z; independently verified exact PID absent. Native slot released and own sources frozen for root global typecheck. No daemon is left for typecheck or later application tasks.

Final focused command `node --import tsx --test --test-concurrency=1 tests/mariadb-prerequisite-order.test.ts tests/mariadb-retained-trigger.test.ts tests/mariadb-original-source-pool-view.test.ts tests/original-paid-scope-portability.test.ts tests/portable-mariadb-fixture-guard.test.mjs` passed10/10,exit0,2765.7044ms. Prior affected memory/source financial service regressions passed12/12; isolated actual Maria positive-paid query vectors passed separately. Root owns any final global typecheck and combined shared output regeneration.

**Scope limit and explicit T33 carry-forward:** this is actual complete through0144 *schema/source import* compatibility, with one isolated query equivalence proof. It is not full application/finance-runtime money verification and does not close T33. Still-unmodified mapped omissions include order_items.commission_base_paisa/commission_rule_version/seller_agreement_version, return_requests.original_seal_intact, seller_profiles.settlement_terms_reference; base idx_seller_ledger_refund_unique still enforces refund_id alone instead of canonical later refund_id,type. These need their own fixture evidence/authorization before changes. No historical money, fee policy activation, consent, real seller/customer data, credentials, canonical D1, deployment, or existing application database was changed.


## Through0146 native schema import begins (T28 source compatibility only)

Root authorized actual owned empty-fixture import of final frozen0145/0146 after financial native tests passed. Verified schema904709bytes/SHA256105d07583aeffc3cb9c6a1c79f8329d97f32ef6b03440a6efc21d29c3048836f and reset source920196bytes/SHA2560bedfc1476c81975760bc0aa36e33a8bd6ab6e3ec5e9c554af0386702d89675d against reviewed candidate. Captured all147 retained SQLite migration hashes in ignored .test-artifacts/t28/native-import-before-a27c10.json. New through0146 guarded import runner preserves earlier0144 script/artifacts and creates only new t28 fixture databases. Reset source is never executed.

First fresh database fixture_d7804952_t28_mw0aab9n_a1d851 failed1591,line8274,offset866383 with Maria error4042/HY000: JSON_TABLE path syntax error. Exact trigger managed_live_clearance_external_files emitted `PATH '))` rather than `PATH '$'))`. Generator0145 used JavaScript String.replace replacement string containing `$'`, which expands as the suffix substitution token. Actual server PID20648 authenticated shutdown=true,forced=false,stopped=true. Exact owned diagnostic import-through0146-mw0aab9n_a1d851.json.

Root authorized callback-only repair. Changed the one replacement to a function returning the literal string. Regenerated0145 source: all147SQLite source hashes unchanged; Maria byte comparison proved only the missing literal `$'` characters were restored. Generator SHA25635a67fdc5762243c1df46bc7f1c45f8c798e3d04f708d902bb07421e549ac748;0145Maria24635bytes/SHA256bfd040799bd17b84f01cbc87f165872589d37e891016c89b3d396313232e257b. Focused literal-path regression was red, then full managed-live source suite5/5 passed,2644.5815ms after combined regeneration.

Fresh reviewed candidate .test-artifacts/t28/native-jsonpathfix-8cf137b2 preserves the previous candidate; both source outputs differ ONLY by the literal path repair. Shared schema904711bytes/SHA256f385b84218ffa02581c6f336405da29f75d7dffeda44e0384b67ae31f9ac7b57; reset source920198bytes/SHA256c65496b1f7173319b631775e885e99ba7125ef8fa8f0a8eda3e48306fc467518. Root authorized retry in a new owned empty database. Root subsequently held financial0146 source edits until this current import/hash check completes; no further generator writes/retries will race the separately approved upcoming party-guard update.


### JSON path repaired;0146 implicit FK collision retained for coordinated update

Fresh retry database fixture_d7804952_t28_mw0ah2o5_1a4d5c passed the JSON_TABLE repair and reached1616,line8321,offset883383. Maria ER_FK_FAIL_ADD_SYSTEM1823/HY000 on `ALTER TABLE managed_commercial_snapshots ADD COLUMN live_clearance_id VARCHAR(191) REFERENCES managed_live_clearances(id)`. Engine explicitly confirms existing managed_commercial_snapshots_ibfk_1. The preceding live_activation_decision_id inline ALTER succeeded, establishing the restarted implicit-name collision on the second addition. Recommended coordinated Maria-only explicit unique FK names for all three live proof references; column types, nullable status and parents must remain unchanged. No0146 or additional shared output edit was made while root held those sources for the separately approved selected-party guard update.

Exact owned diagnostic import-through0146-mw0ah2o5_1a4d5c.json. Owned PID28448 authenticatedShutdown=true,forcedStop=false,stopped=true at2026-11-03T06:11:46Z; independently confirmed exactPID absent. After import ALL147 retained SQLite migration hashes remain byte-identical. Heavy and source slots released to root/browser/financial agent. Current frozen schema remains904711bytes/SHA256f385b84218ffa02581c6f336405da29f75d7dffeda44e0384b67ae31f9ac7b57, reset source920198bytes/SHA256c65496b1f7173319b631775e885e99ba7125ef8fa8f0a8eda3e48306fc467518.

Through0146 schema import is **not yet complete**. Root will coordinate financial0146 party-guard/FK translation changes, source refreeze/shared generation and a later fresh import. No application finance-runtime/T33 parity is claimed.

### Final through0146 native empty-schema import PASS

Frozen candidate8ae4396a2c97961f6dc12640ab85acc9b8a5f03d2556db2e19e18a7f40269ae3 imported successfully on MariaDB10.11.19 into fresh owned database fixture_d7804952_t28_mw0bpws4_3a19b2:1666statements,330tables/views. Evidence owned import-through0146-mw0bpws4_3a19b2.json. No failures in this final run. Prior failed candidates remain preserved. Owned PID10192 authenticatedShutdown=true,forcedStop=false,stopped=true at2026-11-03T06:47:42.282Z; independently exactPID absent.

After PASS copied verified candidate schema/reset into deployment/babal source outputs (reset never executed). Final shared schema917119bytes SHA2568ae4396a2c97961f6dc12640ab85acc9b8a5f03d2556db2e19e18a7f40269ae3; reset932606bytes SHA25600309c3ed4e4163b137cd52dce24a3dcb103f40d1e1bf300eeb839a0be67c293. Light managed-live-schema-source5/5PASS5728.2ms; captured generator parityPASS evidence managed-live-parity-c958e4bc-710c-46e4-83ac-252f7e3e27dd.json confirms frozen0145/0146 SQLite/Maria hashes unchanged. No retained SQLite writes. This proves complete empty-schema import through0146 only, not full application/financial runtime parity or T33 completion. Earlier explicitly mapped T33 schema gaps remain open. Heavy/source slots released to parent.
