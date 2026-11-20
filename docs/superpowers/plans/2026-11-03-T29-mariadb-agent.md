# T29 Maria source compatibility preparation — 3 November 2026

Canonical checkout only. No canonical database, network, real mail, reset execution, Maria process or deployment used in preparation. Root retains SQLite/ORM ownership; heavy slot remains with health owner.

Inspected0147/0148 and paired generator. Narrow authorized repair: Maria-only quote reserved `cursor`; normalize conversion input CRLF and fail closed on residual CREATE TRIGGER/RAISE rather than emitting raw SQLite. Retained SQLite is untouched. `node --test tests/email-mariadb-schema-source.test.mjs`:3/3PASS233.3ms, exact retained parity for both files, LF/CRLF equivalence and malformed unsupported trigger rejection.

Fresh candidate `.test-artifacts/t29/maria-20261103-a901`: schema923624bytes SHA2563edc00ea8003f9b88b5016c2ea0c865b4963dff6ff50324725a23207b91c4b98; reset939513bytes SHA256608bcc1ed4417c4fe9dc8def6e19fcf319baee1a99ddd6441a59341c94f38069. Prior verified through0146 prefix917091bytes byte-identical (excluding final28byte foreign-key footer). freeze.json pins0147SQLite33134f61c8e36db36d3c6c554b3e064422aba182c0280ae61d28e77636fe7a70 and0148SQLitef12a11e205389a471704ad69b28b82c6d5b772e22f7daf48e811014a623a6ba8.

Prepared scripts/test-portable-mariadb-through0148.mjs with exact hash pin, new empty owned database, original guarded portable runtime, authenticated shutdown. scripts/t29-mariadb-constraints.mjs uses fictional fixture rows to test duplicate claims/attempt identity, identity/accepted receipt/phase/deletion retention, reminder uniqueness/immutability, functional observation uniqueness/immutability/check guards, environment-isolated open episode uniqueness, immutable episode identity and successor after resolution. These native assertions are prepared, NOT yet run. Shared combined schema/reset outputs will publish only after import and assertions PASS.

Runtime translator has no reserved-cursor rewrite. Reminder runtime owner notified that operational_reminder_cursors SQL must quote `cursor` consistently; backticks work in SQLite and Maria. No runtime caller changed here.

## Native through0148 verification PASS

Root granted serialized heavy slot. Exact frozen candidate imported into fresh owned DB fixture_d7804952_t29_mw0di8fx_fa3c6a on MariaDB10.11.19:1685statements,338tables/views. All15 negative constraint assertions passed, plus positive independent-environment incident, resolved-episode successor and preserved accepted receipt checks. This corrects the earlier informal17-negative count: actual executable assertion list contains15. Evidence owned import-through0148-mw0di8fx_fa3c6a.json. No native defect or source change during this run.

Owned PID24864 authenticatedShutdown=true,forcedStop=false,stopped=true at2026-11-03T07:38:35.572Z; exactPID independently absent. Published verified candidate schema/reset source files only to deployment/babal after PASS. Shared hashes match frozen3edc00ea8003f9b88b5016c2ea0c865b4963dff6ff50324725a23207b91c4b98 /608bcc1ed4417c4fe9dc8def6e19fcf319baee1a99ddd6441a59341c94f38069. Reset artifact was never executed. Retained0147/0148 SQLite hashes match freeze. Source tests repeated3/3PASS205.7ms. Heavy slot released. This is schema/native constraint evidence, not actual mail/provider/scheduler or full T33 runtime parity.
