# T35 preparatory release-schema byte pipeline

This bounded local correction does not close T34 or T35 and does not establish release readiness. Staging and production deployment remain held. Work used only the authoritative HastaBazaar checkout and isolated synthetic fixtures. No canonical database, `.staging`, credentials, provider, mail, payment, seller activation, remote host, Git state or recovery archive was changed.

## Findings and ruling

The manifest generator could hash `--schema-input` while retaining the standard packaged path. Both packagers subsequently copied the historical public SQL at that path; the Windows packager did not validate migration hashes. The fixed manifest inventory also omitted 76 maintained non-reset SQL companions. Further consumer tracing found that `lib/operations/readiness.ts` and `lib/operations/form-health.ts` statically import the public JSON, so copying a different manifest after compilation alone would leave stale compiled readiness.

Ruling: keep the historical public SQL/JSON untouched; require explicit reviewed schema selection for a hosted build; snapshot the exact selected buffers and manifest once; use that snapshot for compilation and standalone copying; package only verified standalone bytes. A default `build:babal` invocation now fails before generating assets or compiling. The existing CI workflow must be separately reviewed and given an explicit candidate input before any future use; this task neither changes nor dispatches that workflow. The generator's existing output-only readiness-fixture mode stays compatible.

Ruling: expand the explicit inventory in the full-schema generator's reviewed append order, preserving the reset exclusion and original prerequisite ordering. This is artifact discovery, not authorization to replay all companion SQL against an existing database. Current manifest table/trigger discovery is not proof of exhaustive native CHECK/FK/retention semantics or target readiness.

## Changed behavior

- `generate-release-manifest.mjs --schema-input=<file> --asset-root=<new-directory>` writes the exact raw SQL buffers it hashes, including line endings, then its manifest under standard `deployment/babal/` paths. It refuses to replace an existing bundle. Output-only `--output` cannot be mixed with bundle output.
- `build-babal.mjs` requires one explicit schema argument, prepares a private bundle before compilation and carries it into `dist/standalone`. Changing the original selected source during compilation cannot replace the snapshotted bytes. The private temporary directory is cleaned; the selected source is preserved.
- `release-schema-assets.mjs` validates release identity, schema-first usage, safe unique migration paths, hash shape, actual bytes and real filesystem path components. Copying uses the already-validated buffers. Standalone verification reuses `release-files.mjs` for required files, credentials/private state, databases, reset SQL, unapproved SQL, links and inventory checks.
- Linux and Windows packagers read the standalone manifest and SQL. They never refresh those files from historical repository assets. Extracted archives are checked again. Linux x64, explicit release ID, source commit, smoke, archive hashes and non-overwrite requirements remain intact. The Windows ZIP remains Windows-only evidence.
- `vite.config.ts` installs `build-release-manifest-plugin.mjs` only for the hosted build. It resolves both static readiness consumers to the compiler-child snapshot supplied by the wrapper. Local preview keeps its existing configuration. No manifest file exists under `public/` and no separate public manifest route was found; the package's standard `deployment/babal/release-manifest.json` remains the standalone metadata asset. The security operator dependency graph does not import these manifest consumers and was not changed.

## Verification record

Fixture destinations were inspected before execution. New source fixtures live under `.test-artifacts/t35/schema-assets-*`; the existing Windows packager test owns a unique temporary directory and removes only that directory. No actual application build or server was run. The build-orchestration test substitutes only external application/operator compilation, while running the real generator, build wrapper, byte copy and inventory checks.

- Baseline manifest inventory: 4 pass / 2 fail (including failed parent), caused by the missing maintained companions. Retained in `.test-artifacts/t35/schema-wiring/baseline-manifest.log`.
- Selected schema and missing-selection regressions: 0/2 RED before implementation, then 2/2 GREEN. RED showed no selected-byte bundle and asset preparation reached without explicit selection. Logs: `red-schema.log`, `green-schema-initial.log`.
- Windows package RED: tampered built SQL was accepted and overwritten from root; the new rejection assertion failed. `red-package.log`.
- Windows package GREEN: the schema hash rejects before archive creation; correct selected SQL and manifest are independently inspected inside the ZIP even when root SQL and root release identity are historical. Byte totals, hashes, extracted inventory and refusal to overwrite prior artifacts pass. `green-windows-package.log`.
- The initial combined run hit Windows sandbox `EPERM` on two disposable junction fixtures. The same bounded five-file set was retried through tool approval with the needed filesystem permission and passed **14/14, zero skips**. `final-tests-junction.log`. This does not convert platform-restricted tests or Linux packaging into passes.
- Compiler-input regression: the actual wrapper did not supply a selected manifest to its compiler subprocess. `red-compiler-input.log`. The wrapper now supplies its exact selected snapshot; the orchestration fixture confirms the compiler input JSON and copied standalone JSON are identical even when the original schema changes during compilation.
- Actual hosted-config Vite RED: the scoped compiled consumer returned `local-unversioned-candidate` instead of the selected fixture release. `red-vite-consumers.log`. GREEN uses the actual hosted configuration's plugin and actual `readiness.ts`/`form-health.ts` modules. It proves compiled release identity, form-health fallback identity, selected schema hash and selected readiness tables, while leaving the public JSON unchanged. It creates no server or application build.
- Final bounded regression set: **15/15 pass, zero skips**, exit 0, **25.498 seconds**. `final-consumer-tests.log`. Command: `node --import tsx --test --test-concurrency=1 tests/release-package-manifest.test.ts tests/release-schema-assets.test.ts tests/release-manifest-completeness.test.ts tests/release-manifest-trigger-names.test.ts tests/staging-archive.test.ts`.
- Final scoped type-aware lint: exit 0 for the six changed JavaScript scripts, two changed tests and `vite.config.ts`. `final-scoped-lint.log` is empty because no diagnostics were emitted; the runner exit was explicitly captured as 0. The three interim diagnostics in the new test (byte-decoding type and deprecated Vite options) were corrected before this run.

Root owns global typecheck/lint/full-suite acceptance. They are not claimed by these targeted runs. No native database suite, full application build, Linux artifact, hosted smoke, live readiness or deployment was performed here.

## Reviewed V8 source-assets proof

`.test-artifacts/t35/schema-wiring/v8-assets-proof.json` records an isolated source-only bundle, with every bundled migration hash verified:

- Selected `.test-artifacts/t33/native-public-feedback-candidate-v8/mariadb-schema.sql`: SHA256 `7827e2ab78c852a53d9fffa76aa7e91ca4530b88a0ea82378d9a3153a255be6e`.
- Manifest SHA256 `e7dc570ce73aae5d38241f1655ce18db77082298c2859e68f8175180085bb668`; **134 migration files**, **355 table discoveries**, **466 trigger discoveries**. These counts are discovery metadata, not native acceptance.
- Historical public152 SQL remains SHA256 `70f52749d19f5ec87375f897c8d50c8c040e09bfa20a6f36184c3399e49791e8`.
- Current154 companion remains SHA256 `8224c191c834d7c7260f8be6f04aa530940aeff898e323ba26645dd34a01e763`.
- The public reset SQL, public manifest and native V8 evidence are separately hashed before/after and unchanged. The reset SQL is not included in the bundle.

The preparation identifier `hastabazaar-release-preparation-v8-schema-only` labels source assets only. It is not an approved final release ID, a built application, a Linux package or a new native rehearsal. Old152/V7/V8 evidence remains historical and unchanged.

## Continuation boundary

Finish T34 source acceptance, review the current readiness requirement coverage and exact retained-target suffix, and only then build the approved source with an explicit selected schema on Linux x64. Verify the extracted exact application, native dependencies, operator, missing-DB fail-closed response and authorized isolated readiness/journeys. Review artifact-only CI and hosted simulation configuration separately. None of those operations is supplied or authorized by this note.

Owned pre-edit copies are in `.test-artifacts/t35/schema-wiring/before/` to separate this correction from pre-existing dirty work. Final owned source hashes and evidence hashes are recorded in `.test-artifacts/t35/schema-wiring/source-freeze.json`; master progress and coverage ledgers remain root-owned. The serialized verification slot was returned to Finance after the final scoped checks; this task leaves no running compiler/server/database process.
