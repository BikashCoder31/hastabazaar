# 4 November 2026 — bounded presentation regression investigation

Scope: only the two failures in `tests/admin-presentation.test.ts`, in the authoritative Desktop/HastaBazaar checkout. No production code, Git configuration/worktree, canonical database, launch, browser, provider, live operation or deployment was changed/run. This note records a test correction, not a full-suite pass.

## Original evidence and root causes

The unchanged original full run is `.test-artifacts/t34/full-npm-test-20261104-1446.tap`: subtest 97 fails at line 758 (assertion at test line 24), and subtest 101 fails at line 800.

- Navigation: the first stale assertion denies every ordinary Admin `/admin/team`. The approved `2026-10-31-team-business-policies.md`, section 2, explicitly grants a limited My responsibilities view. Actual `app/admin/team/page.tsx` returns the own model before loading the private directory/access panels. `getTeamWorkspace` rechecks current authority, limits ordinary output to own duties/procedures/handoffs/tasks/contacts/access and applies the own-scope proof and read fence. This investigation found no reason to restore the former blanket Team denial. The old empty-grant list also omitted the current authorized Overview and My responsibilities destinations.
- Email scope: the old test assumes `order.manage` grants global Order emails. The approved Email delivery design preserves privileged global operations. Both native mail pages and navigation require `email.delivery.manage`; it is absent from configurable ordinary Admin grants. The corrected test denies this route to the ordinary order desk instead of broadening production access.
- Hero: the original TAP actually fails the manager-local `/api/admin/homepage/hero-media` regex first. The real manager delegates to `useHomepageUpload(actorId, ...)`; that hook owns the same native POST/upload and GET/recovery endpoint. The manager still saves `key:'homepage_hero_slides'` through the native Business Settings command. Its existing whitespace-flexible key assertion already matches and was retained. No application code was changed to restore an inline endpoint or reformat a setting key.

Reviewed instructions/specifications: `AGENTS.md`, `LOCAL-START.md`, approved Overview/shared-review navigation, Team/business-policies, System health/records, Email delivery, Products/storefront and the existing Homepage Hero design. The current T31 root note supplies prior native/browser evidence; those historical runs are not counted as new evidence here.

## Test changes and fresh verification

Only `tests/admin-presentation.test.ts` was edited. Its pre-existing `/security` expectation was preserved within the corrected current list.

- Unknown/nonstaff roles still deny all navigation, including with supplied permission names.
- The reserved-route matrix now covers commercial, homepage, mail, forms, accounting, recovery, private history and rider destinations. Supplying every permission name does not confer reserved access on an ordinary Admin. Explicit product-publication, payment-verification, technical-view and active-procedure grants are independently checked; `order.manage` grants none of them.
- Ordinary staff see My responsibilities; Super Admin sees Team & business policies. The empty configurable grant exposes only Overview, Notifications, My responsibilities and Account security.
- Hero fields are now checked on actual `renderToStaticMarkup` output of the manager and actual preview, using image/video control variants to cover conditional fields. Only Next's router is stubbed for node; no UI component, published config, scope hook or upload hook is replaced. All 15 previously approved fields, both preview controls, the native form identity and file input remain asserted. Hero-before-product-search ordering, page authorization, native setting key and first-slide editability assertions remain. The manager-to-upload-hook wiring and hook's native POST endpoint are explicitly asserted.

Fresh final command: `node --import tsx --test tests/admin-presentation.test.ts tests/admin-task-navigation.test.ts` — exit 0, 11 passed, 0 failed, 0 skipped, 3.707s. Artifact: `.test-artifacts/t34/presentation-regression-20261104-final.tap`. The earlier targeted current file also passed 7/7 (`presentation-regression-20261104-targeted.tap`); related navigation alone passed 4/4 (`presentation-regression-20261104-navigation.tap`). Final combined run includes the additional explicit-grant matrix.

Scoped oxlint command exited 0 with no diagnostics before the final explicit-grant matrix; its final-source repeat is recorded in `presentation-regression-20261104-lint.txt`. No global compiler, database or browser job was started while root owned the heavy full-suite slot. Server rendering proves control presence, not interaction/recovery behavior; the existing separate native/browser journeys remain necessary for those claims. Root owns the full-suite ledger and remaining integration gates.
