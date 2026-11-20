# T34 JSON request envelope regression — 4 November 2026

Only `tests/form-catalog-json-envelope-followup.test.ts` and `tests/form-catalog-json-envelopes.test.ts` changed. Before copies, diagnostics, test logs and owned source hashes are in `.test-artifacts/t34/json-envelope-regression-root-20261104/`.

The original fixture returned a fabricated generic parent row for every audit query, including the new exact core-form replay lookup. This falsely reported a prior core receipt and made legitimate published custom answers fail as unknown. The fixture now creates the actual canonical audit table from `0000_clear_lizard.sql`, executes audit lookups against that genuinely empty table, and enables memory foreign keys. No receipt is fabricated and no runtime guard changed.

The remaining homepage test lacked current source version/visibility and persisted actor identity. Its explicitly intercepted readonly homepage projection now supplies version1, visible, no prior request. Its isolated memory users, roles and permission profiles carry the fictional active Super Admin and matching auth subject; the actual current-authority queries execute against those rows. Domain side effects remain deliberately intercepted by the original envelope harness. This is request-boundary coverage, not proof of a native homepage mutation.

Validation: focused diagnostic1/1 failed with the actual `Unknown or duplicate answer` response; first repaired whole group47/48 passed; final group48/48 passed, no skips, exit0,16.373s. Exact final command: `node --import tsx --test --test-concurrency=1 tests/form-catalog-json-envelope-followup.test.ts tests/form-catalog-json-envelopes.test.ts`. Original malformed UTF-8/JSON, advertised/streamed overflow, exact upper budget, validated snapshot equality and zero-effects-on-parse-failure assertions remain. Failure messages now retain the response body for diagnosis.

No browser, native engine, compiler, canonical database, launcher or deployment operation occurred. The ongoing original full-suite log remains independently unsuccessful until its own verdict; this scoped rerun does not rewrite that result or certify all current dependencies.
