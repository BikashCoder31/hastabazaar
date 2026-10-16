# Program Management local acceptance — 2026-09-29

Update — 2026-10-16: the approved additive upgrade is applied and the current company-store flow has normal Chrome evidence, including no-PAN onboarding, separate review/activation/publication, company packing/readiness, simulated delivered/paid sale, 9%/91% earnings held for the unchanged delivery period, and later PAN transition. See [the current verification report](2026-10-16-company-store-readiness-verification.md) for Passed/Failed/Not tested, preservation and remaining limits. All333 original rows are preserved. Loyalty remains paused/unpublished. The dated results below describe the earlier version and must not be used as latest acceptance evidence.

Scope: `/admin/programs`, Super Admin, both existing Managed Maker commercial models. Local testing only.

## Confirmed issues and fixes

- The page showed static readiness text without application/product queues or configuration controls. Reproduced by opening Program Management as Super Admin. It now reads persisted maker stages, product states, effective commercial terms, and grouped financial records; embeds the four existing program settings using the existing validated, audited settings API.
- Product review inventory must include `under_review` and `needs_changes` and exclude deleted products. Regression fixtures cover these statuses and deletions.
- Accepted supplier obligations awaiting payment preparation and outstanding records after a registered-seller transition must stay visible. Balance-based review counts account for adjustments and paid amounts; legacy records have a separate queue. Counts do not promise payment eligibility. Existing payment and activation guards remain authoritative.
- Activation model choices displayed hardcoded percentages. They now refer to the configured rate; the overview uses the effective setting and preserves historical transaction snapshots.
- The local launcher supplied runtime/origin through process environment, but Vite did not forward them into Worker bindings. Browser evidence showed production-blocked classification in an explicitly local preview. A serve-only allowlist now forwards validated local staging runtime and loopback origin. Production/hosted runtime guards, remoteBindings:false, and the existing `.staging/state` database remain intact.

## Verification

- Meaningful regressions reproduced the static page, missing edge-case queues, and missing local binding helper before implementation.
- 47 focused tests passed: program hub, existing business settings presentation, managed activation, fixed supply, settlements, managed catalog integration, and local preview bindings.
- Independent specification review: PASS, including local binding fix.
- Independent code-quality/security review: PASS.
- Browser: both commercial model choices and activation mode can be selected as unsaved previews; reload preserves saved values. Maker review link responds successfully. Desktop and 390px mobile render without page errors or horizontal document overflow. Admin, Seller and Customer cannot access the Super Admin page.
- Browser after automatic local server configuration reload correctly shows `SIMULATED — NOT VALID FOR PRODUCTION`.
- All 38 pre-existing modified/untracked file hashes preserved.
- Checked 140 local database tables. Only Cloudflare `_cf_METADATA` changed during runtime reload; all 139 application/migration table hashes and counts match the initial capture. No business settings, original financial records, or governance history changed during browser verification.

Evidence: `C:/Users/abinash/Desktop/Hatskala/program-management-20260929/` contains regression logs, focused test log, browser script/results/screenshots, initial file hashes, and database hashes.

## Remaining boundaries

- Sale-linked payout preparation/completion has no dedicated UI yet. This page truthfully displays its records read-only; adding those mutation controls remains pending the user's scope choice.
- Live activation stays blocked by existing commercial/legal/financial readiness gates. Local D1 verification is not MariaDB or production readiness.
- Canonical preview fixtures were not activated or paid. Lifecycle and finance mutation verification uses isolated test fixtures.

Final checks: TypeScript (	sc --noEmit --incremental false), scoped lint across all 10 code/test task paths, and local production build passed. Existing repository-wide lint issues in scripts/staging/local-d1.mjs remain outside this task.
