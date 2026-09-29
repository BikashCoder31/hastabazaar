# Form Catalog simplification — local acceptance

Date: 2026-09-29

## Approved behavior

Remove universal forms from the editable administration catalog while preserving their application behavior, saved configuration, validation and history. Keep business-specific forms, including checkout, applications, product submissions, customer care, supply, delivery and finance.

The shared catalog policy excludes 33 of 93 registered forms. The remaining 60 use friendly names and six business categories. Runtime registry entries and configuration readers are unchanged. Excluded direct links show read-only version history; their draft, publish and restore endpoints reject edits. Super Admin authorization remains required.

## Verification

- Regression RED: identity registration still appeared in the API list; its draft endpoint accepted a write. After the policy/guards, all 33 exclusions reject all three catalog mutation actions before any write.
- Rendered UI regressions verify friendly names, grouping, retained links and read-only excluded details.
- Final focused suite: 481 tests passed. The corrected existing admin-page role-boundary test passed separately (1/1); the corrected route suite also passed 16/16.
- TypeScript and scoped lint passed. Full lint remains blocked by two pre-existing restrict-template-expressions errors at scripts/staging/local-d1.mjs:58; that file is identical to HEAD and was not changed.
- Independent specification review PASS, followed by quality/security review PASS, including the final test-only correction.
- Actual local browser: list exclusion/retention, friendly labels, retained seller editor, excluded read-only detail, blocked draft/publish/restore, readable existing version history, and anonymous/customer/seller denial all passed. Desktop 1440px and mobile 390px inspected; no document horizontal overflow.
- Read-only canonical database checksums match for 139 form configuration versions, 36 answer sets and 339 audit records (514 rows).
- Hashes of all 38 pre-existing modified/untracked paths remain unchanged. Existing responsive, header and slider work was not staged.

## Local evidence

Evidence is retained in C:/Users/abinash/Desktop/Hatskala/catalog-simplify-20260929: initial snapshots/hashes, focused-tests.log, scoped-lint.log, typecheck.log, browser-results.json, data-before.json, data-preserved.json and desktop/mobile screenshots.

Existing preview reused. No production access, deployment, migrations, financial changes, or database reset. Visible user sessions remain open. MariaDB readiness is outside this change and remains subject to the previously documented blockers.
