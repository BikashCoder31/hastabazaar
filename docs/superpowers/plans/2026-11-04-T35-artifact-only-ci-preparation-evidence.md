# T35 artifact-only CI preparation — deployment held

Bounded local source preparation on 2026-11-04 in `C:/Users/abinash/Desktop/HastaBazaar`. This is not final T34/T35 acceptance, Linux package readiness or deployment authorization. The canonical T35 plan still depends on final T34 evidence. Root owns the master progress/coverage ledgers and global verification queue.

## Source decisions

- `.github/workflows/verify-release.yml` now unconditionally disables the staging job with literal `${{ false }}`. It retains its historical deployment source and clearly requires later explicit user authorization plus a reviewed source change. There is no manual/default-true switch. The artifact jobs contain no SSH or hosting-secret access.
- New `scripts/prepare-release-schema-input.mjs` requires exactly one explicit output argument and one explicit lowercase SHA256. Output must be a new direct child of `.test-artifacts/t35`; existing evidence, unsafe paths and linked artifact ancestors fail closed. It runs only the existing source generator, checks actual bytes against the reviewed hash and emits a selected schema path only on success. Failed candidate output is retained for review. It never executes SQL or blesses a changed hash.
- The workflow generates from checkout source, requires reviewed V8 hash `7827e2ab78c852a53d9fffa76aa7e91ca4530b88a0ea82378d9a3153a255be6e` and passes that exact generated file as explicit `--schema-input` to `build:babal`. It does not rely on ignored fixtures existing in CI. Reset SQL is a sibling source artifact, never selected for the build or included in the manifest; existing package reset guards remain in force.
- The workflow name, legacy native job name and summary distinguish artifact preparation from complete release readiness. Existing native verification source and artifact handoff are retained. Old Docker/suffix/runtime incompatibilities remain unresolved and may block packaging. No automatic bypass was added.
- CI explicitly includes `tests/prepare-release-schema-input.test.mjs` alongside the existing seller-registration MJS selection. It does not add the entire MJS glob: `complete-version-migration-schema.test.mjs` requires ignored t30/t33 fixtures; `native-public-feedback-combined-schema.test.mjs` additionally assumes the canonical Windows root. Those regressions need a separately reviewed portable fixture contract.

## Fresh bounded verification

Evidence root: `.test-artifacts/t35/artifact-only-ci-preparation-20261104/`. Pre-existing dirty workflow and staging-preparation document are preserved byte-for-byte under `before/`; the slice was reviewed against those copies, not treated as the entire Git diff.

Final owned source/document/evidence hashes are retained in `source-freeze.json` under that evidence root. This is a bounded slice inventory, not the dirty checkout's final release identity.

- Initial `node --test --test-concurrency=1 tests/prepare-release-schema-input.test.mjs`: **0/6 RED**, expected missing helper and still reachable deployment condition. `red-helper-tests.log` retains the observed assertions. The deployment assertion initially reported the absent constant expression; its final assertion now reports that absence directly before parsing the literal.
- Final same command: **6/6 pass, zero skips**, exit 0. `final-helper-tests.log` retains the final fresh result. Actual helper subprocesses generate schema source and prove correct selection, missing/malformed/duplicate/unknown arguments, mismatched expected hash, no selected output on failure, existing-output preservation and unsafe destination rejection. The success case compares public SQL/reset/manifest bytes before/after.
- The workflow regression inspects its job-level YAML scalar and parses the staging hold as the Boolean literal `false`; it also rejects deployment credential/SSH references in artifact jobs. GitHub scheduling itself cannot be exercised locally without a prohibited dispatch. This is a configuration invariant, not a claimed remote execution proof.
- `node --check scripts/prepare-release-schema-input.mjs` and `node --check tests/prepare-release-schema-input.test.mjs`: exit 0. No type-aware compiler or global lint was run in this slice; root owns those checks.
- Source-only local proof command: `node .test-artifacts/t35/artifact-only-ci-preparation-20261104/verify-generated-schema.mjs`, exit 0. It invoked the real helper into new owned `.test-artifacts/t35/ci-reviewed-v8-20261104/`, compared all **959,110 generated schema bytes** with retained reviewed V8 and verified public152 SQL/reset/manifest plus V8 unchanged. `generated-schema-proof.json` records selected and retained hashes. Its expected hash was not replaced.

No SQL/reset/migration/seed/restore ran. No canonical database or `.staging`, Git state, remote credentials, hosting, provider, mail, payment, seller activation, server, browser, application build, compiler, full native suite or Linux package was changed or executed. No workflow/CI dispatch, push, upload or deployment occurred. Frozen build wrapper/plugin/packager sources were not edited by this slice.

## Continuation boundary

Finish final T34 source acceptance and root-owned global checks; reconcile the remaining MJS portability coverage; review exact retained-target suffix/partial-state handling, exhaustive readiness coverage and maintained native runner. Then, only under the separately authorized heavy queue, build/package final approved source on Linux x64 and verify the extracted artifact, native dependencies, hosted operator, missing-DB response and authorized isolated journeys. The previous schema-wiring 15/15 bounded result is separate evidence; this slice did not rerun or expand that claim.

Hosted simulation/capture isolation, target ownership/paths/permissions/resources, lock/restart/rollback behavior, canonical readiness and genuine target capability remain unresolved. Keep deployment held until the user separately authorizes a concrete reviewed target action and its source change. Artifact preparation cannot provision infrastructure, send mail, execute payments or activate sellers.
