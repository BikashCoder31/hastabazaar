# T35 local candidate source identity — Linux execution pending

Prepared 4 November 2026 in `C:/Users/abinash/Desktop/HastaBazaar`. This bounded source/tooling slice does not establish a Linux release, final T34/T35 acceptance, canonical preview readiness, or deployment authorization. All deployments remain held. Root owns the final schema selection, heavy verification queue, documentation freeze and master ledgers.

## Decision and scope

Canonical T35 accepts an honest blocked release report with exact source/artifact/test evidence; it does not require pretending the dirty implementation is HEAD. The existing manual `scripts/package-babal-release.ps1` can verify a ZIP against built file bytes, but supplies neither a dirty-source identity nor actual Linux build/runtime provenance. The existing hardened extractor is for tar.gz, not ZIP. Adding a ZIP validator or relaxing CI would be more intrusive than a thin separate local runner.

New files:

- `scripts/local-release-source.mjs`: deterministic source capture, expected-digest verification, exclusive materialization of a source evidence copy, private/link/path rejection and seven derived-brand inventories.
- `scripts/build-local-release-candidate.mjs`: Linux-only isolated build → tar → existing hardened extraction → exact inventory/schema verification → existing real packaged smoke → post-run source/archive/brand verification.
- `tests/local-release-source.test.mjs`: small source/copy/admission and archive-tamper fixtures.

The CI packager, manual packager, recovery provenance contracts, workflow staging hold, schema generators and schema manifests were not edited. In particular, the CI `GITHUB_SHA` requirement and real Linux/x64 gate remain unchanged. This local runner refuses `CI`, `GITHUB_ACTIONS` and `GITHUB_SHA`; it accepts no platform, commit, smoke-skip or validation-bypass switches.

## Identity contract

`source.json` has `artifactKind: source-snapshot`, `commit: null`, `linuxRuntimeVerified: false`. It never borrows the current HEAD as source identity. Its SHA256 covers a fixed serialized object containing scope, exclusions, sorted `{path,bytes,sha256}` records, and the explicitly selected schema record. All included contents are actual working-tree bytes, including untracked files. SHA256 is compared to the separately reviewed expected value, not merely read from a modified inventory.

The named scope is **application build inputs and test source**, not the entire workstation or a complete recovery backup. It includes `app`, `components`, `lib`, `db`, `hooks`, `public`, `scripts`, `tests`, `drizzle`, `deployment`, `vendor`, `.github`; root JS/TS/JSON/YAML code/configuration; `.openai/hosting.json`; selected root tooling/launcher instructions; and one reviewed `.test-artifacts/t35/<child>/mariadb-schema.sql`. This includes package and lockfile bytes. Credentials/private data under these selected input roots stop capture; they are not silently included.

The manifest explicitly excludes docs, dependency installation, Git, canonical staging/database/media state, old build/output trees, private root environment files, QA account data, generated `next-env.d.ts`, other root directories/prose/assets, and the seven exact generated brand paths. **Root must freeze the release documents/ledgers separately.** The manifest is not a dependency-install receipt. Installed compiler/native dependencies are checked by the actual later Linux build and packaged smoke, with Node/npm and selected dependency package metadata retained in `toolchain.json`; actual dependency acquisition/cache provenance still requires root's tooling review.

The source copy is an artifact input under the canonical project, never another active checkout or preview launch target. Materialization checks canonical input before/after copying, validates copied bytes, creates a previously absent destination and never copies canonical `node_modules`, private files or generated brand assets. Directory links and traversal are rejected. The runner additionally rejects unexpected files in the isolated source, so a newly inserted `.env.production` cannot exploit canonical root exclusions.

## Execution boundary

The runner accepts only a sibling `source.json` and `source` under a reviewed direct child of canonical `.test-artifacts/t35`. Existing `source/dist`, `source/output`, `source/outputs`, `source/.git`, `source/.next`, `source/.vinext` or the sibling `candidate` stop execution. Dependency and compiler paths must be real paths inside that source copy. It neither installs dependencies nor replaces canonical Windows `node_modules`. Original canonical `dist`, `outputs` and brand assets are never build destinations; root's existing preservation review remains required before its separate checks.

The actual compiler runs in the source copy using the copied `build-babal.mjs` and selected schema, under a small environment that excludes inherited database/mail/payment/deployment settings. Before compilation, actual `npm ls --all --parseable` must succeed; every reported package resolves inside the copied `node_modules` or frozen `vendor` source, checking the reported package locations; this alone does not prove resolved-entry containment. A local vendor link is accepted, an ancestor/external link is rejected. npm cache/log/temp paths and empty user/global configuration files are owned by the candidate directory; offline mode is required, audit/funding/update-notifier/scripts are disabled, and HOME is preserved. No npm command installs dependencies. The dependency receipt, build exit/transcript/hash and actual Linux Node/npm/compiler package metadata are retained. Source hashes must still match both canonical source and copied source after building and after smoke. Relevant concurrent source changes stop the candidate.

The seven derived brand files are explicitly recorded before/after for both canonical and isolated paths. Initially absent copied brand outputs are valid; all seven must exist after the build. Canonical brand inventory must remain identical, and generated copied brand bytes must remain unchanged during verification. They are also covered by the final standalone file inventory/archive.

The archive uses the existing `verifyStandaloneAssets`, `extractStagingArchive`, `verifyRelease`, and `smokeStandalone` implementations loaded from their frozen copied source, so the extraction library also resolves from the isolated dependency tree. The selected schema hash must match the freeze. Extraction requires a new empty root and existing bounded member/link/path checks; extracted bytes are compared to the pre-archive inventory. Real smoke must run the extracted operator, native Sharp and application liveness/missing-database readiness checks. After smoke the runner rechecks extracted assets, all inventory bytes, archive hash, source inputs and generated assets.

Only after every real gate succeeds is final `inventory.json` written with `artifactKind: local-linux-candidate`, `commit: null`, `sourceIdentityKind: source-snapshot`, `linuxRuntimeVerified: true`, `productionReady: false`, `deploymentAuthorized: false`, exact archive/schema/source hashes, runtime results and file inventory. Before smoke there is only `pending-inventory.json` with `linuxRuntimeVerified: false`. Failed outputs are retained and never reused. Existing CI/staging/recovery contracts do not accept this distinct kind; no installer or production authority is added.

## Fresh bounded evidence

Evidence directory: `.test-artifacts/t35/local-release-identity-astra-20261104/`.

- Initial five tests failed because the new helper was absent; `red-tests.log` preserves that result. After helper implementation, four passed and a Windows junction fixture was blocked by sandbox `EPERM`; `first-helper-tests.log` preserves it. This was a test-host limitation, not accepted link coverage.
- New runner admission initially failed because the runner was absent; `runner-red-tests.log` retains that result. The isolated-copy contamination case initially failed because its validation helper was absent; `isolated-red.log` retains that result.
- Final `node --test --test-concurrency=1 tests/local-release-source.test.mjs`: **10/10 passed, zero skips, exit 0**, `final-helper-tests.log`. The tests cover dirty/untracked edits, changed selected schema, forged commit and manifest/digest, explicit generated/private exclusions, private source input rejection, traversal and actual directory links, unchanged materialized bytes, no destination reuse, private isolated-copy injection, real host/CI admission rejection, extracted runtime/schema tampering, and local versus external dependency resolution. The dependency-path case first failed because its helper was absent (`dependency-red.log`). Junction tests used an auto-reviewed scoped execution with all files under this evidence directory.
- Existing `node --import tsx --test --test-concurrency=1 tests/staging-archive.test.ts`: **3/3 passed, zero skips, exit 0**, `archive-gates-tests.log`. Temp paths remained under the evidence directory. These prove the reused exact-member extraction and link/size/traversal/duplicate/oversize inventory gates on small fixtures.
- `node --check` for both new scripts and the new test: exit 0, `syntax-checks.json`.

There was no WSL start, dependency installation, application compiler/build, server/browser, D1/Maria runtime, database mutation, provider call, workflow dispatch, remote access, upload, Git mutation or deployment. The successful Linux branch of the runner is **not executed or accepted by these fixture results**. Final application tests, lint/typecheck, Linux native dependencies, real archive/runtime and current schema journeys remain root-owned and pending. Hashes in `owned-source-hashes.json` identify only this tooling slice and its direct reused gates, not the full release source.

## Exact later commands and unresolved selections

The following are continuation templates, not executed commands. Angle-bracket fields must be replaced with actual reviewed selections. Do not use a V8/0152 schema by default, invent a source SHA, create a clean commit claim, bypass failed canonical preview checks, or launch the source copy as a preview.

1. After final source/schema work settles and the reviewed source-generated schema exists, create a **new** evidence child (example name below must still be unused). Keep canonical `node_modules`, `dist`, `outputs`, database and private files untouched. Root records its separate preservation and docs inventories.

```powershell
New-Item -ItemType Directory .test-artifacts/t35/local-linux-candidate-20261104-01
node scripts/local-release-source.mjs freeze .test-artifacts/t35/<reviewed-final-schema-child>/mariadb-schema.sql .test-artifacts/t35/local-linux-candidate-20261104-01/source.json
```

2. Review the resulting scope, exclusions, exact file/schema inventory and emitted SHA256 against final accepted source. Then materialize exclusively within that new child:

```powershell
node scripts/local-release-source.mjs materialize .test-artifacts/t35/local-linux-candidate-20261104-01/source.json <reviewed-source-sha256> .test-artifacts/t35/local-linux-candidate-20261104-01/source
```

3. Only after root grants the heavy slot, establish real Linux/x64 Node≥22.13.0, npm, compiler dependencies, native dependencies and tar. Inspect the actual canonical filesystem mapping first. **No Linux dependency-install command was selected or executed in this slice:** cache/toolchain availability is uninspected. Any reviewed install must target only the new source child's `node_modules`, preserve package/lockfile bytes, use project-local temp/cache paths, and retain its exact command/result/provenance. A missing tool/dependency is a stop, not permission to use canonical Windows dependencies or weaken the platform gate.

4. From the verified Linux mapping of the canonical project, with the reviewed Linux dependencies already present only in the source child, run the canonical runner:

```text
node scripts/build-local-release-candidate.mjs .test-artifacts/t35/local-linux-candidate-20261104-01/source.json <reviewed-source-sha256> .test-artifacts/t35/local-linux-candidate-20261104-01/source hastabazaar-release-local-20261104-01
```

The exact successful outputs would be under `.test-artifacts/t35/local-linux-candidate-20261104-01/candidate/`: archive, `inventory.json`, `SHA256SUMS`, retained extracted package, toolchain/build/source/brand evidence. This candidate does not yet exist. If any step fails, retain that child and explain the gate; never delete it to reuse the name. If source changes, review a new freeze/candidate rather than altering the expected digest opportunistically.

5. Root independently reviews/re-hashes the same archive, reconciles final current-schema/native/journey/restoration evidence and releases the exact candidate only into a later concrete cutover proposal. Deployment, provider setup, canonical data repair, staging and production operations remain held. Weekly allowance was most recently 29% remaining during this slice; the existing ≤8% safe-stop instruction remains in force.

## Subsequent independent review and corrections — 5 November

Independent review reproduced two P2 defects before any Linux build: Vinext-generated next-env.d.ts was rejected as unexpected, and an npm package main resolved outside isolated source despite a complete successful npm tree. Both were corrected: exact pinned Vinext declaration bytes are admitted only after build/smoke, and the actual runner audits package/entry/link/dependency metadata and records compiler and resolution evidence before compilation. This is a resolution preflight, not a universal runtime sandbox; arbitrary undeclared dynamic imports, direct filesystem/native/subprocess reads and custom resolvers are not all intercepted. Dependency acquisition/integrity remains a separate actual-tooling gate.

A further review found that builtin-named npm dependencies such as webpack's installed events package were falsely treated as missing. The corrected package-root lookup now probes resolution search paths using the package.json subpath while still requiring the actual installed npm root. The fix passes16/16 fixtures, and a fresh Sol review reports no actionable finding in that narrow change; previous entry/link/ancestor/generated-file guards remain. Exact evidence and current hashes: `.test-artifacts/t35/local-release-builtin-fix-sol-20261105/` and `local-release-builtin-fix-review-sol-20261105/review.md`. Earlier15/15 and10/10 counts remain historical scoped runs.

No actual Linux build or runtime acceptance has occurred. Canonical original dist/outputs are retained in place with17,197-file/1,590,333,990-byte preservation inventory; seven brand assets are additionally copied under `.test-artifacts/t35/prebuild-preservation-20261104/`. Manifest SHA256: c4cbe90026b9bc7c035e9c37062a2c8c549f641f92781be18e8eb988372e9228. These are historical artifacts, not a new release. No deployment or canonical database change is authorized by this preparation.