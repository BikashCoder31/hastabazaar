# Release preparation scope audit — 29 September 2026

Read-only audit of `C:\Users\abinash\.codex\worktrees\hastabazaar-v1-2-1-staging\Hatskala`, HEAD `80424cf`. Initial snapshot contained 26 modified tracked files and 12 untracked files: 38 pre-existing changes. No repository files were edited, staged, or committed by this audit. No tests, builds, browsers, production access, or secret inspection were performed. This report records source findings, not fresh passing execution evidence.

## Intended scope: all 38 existing changes accounted for

| Group | Count | Files and intent |
| --- | ---: | --- |
| Shared responsive content/navigation and admin wrapping | 9 | `app/globals.css`, `app/admin/homepage/page.tsx`; account/admin/seller navigation; `components/ui/sidebar.tsx`; homepage hero/occasion managers and homepage visibility control. Fluid gutters/type, bounded grid tracks, wrapping labels/filenames/buttons, compact admin cards. |
| Hero composition and slider interaction | 11 | `components/admin/homepage-hero-preview.tsx`; product slider; hero carousel/copy; occasion carousel; `lib/homepage/hero-autoplay.ts`, `hero-presentation.ts`, `occasion-autoplay.ts`; new `components/ui/slider-dots.tsx`, `lib/catalog/product-slider-position.ts`, `lib/homepage/slider-autoplay.ts`. Shared public/editor composition, square compact media and flowing captions, dots with keyboard navigation, reachable product snap positions, six-second homepage timers, native manually played public hero videos, inactive hero slides made inert. |
| Header | 3 | `components/layout/site-header.tsx`, new mobile-product-search component and header CSS module. Complete logo/name and actions on one row; phone search opens the existing dialog; inline search from 640px; local visual restyling. Authentication links and GET `/shop?q=` remain in source. |
| Tests | 11 | Modified: form-catalog query presentation, hero carousel/presentation, occasion carousel, responsive-media operations/public, site-header auth. New: hero-dots layout, site-responsive layout, slider-autoplay, slider-dots. |
| Local browser regression scripts | 3 | `scripts/header-single-row-check.mjs`, `responsive-layout-check.mjs`, `responsive-admin-layout-check.mjs`. Loopback-only or hardcoded localhost; public geometry/search checks and disposable local admin role/preview checks. |
| Evidence ledger | 1 | `docs/testing/site-wide-responsive-media-self-test.md`. Adds composition/header follow-ups and distinguishes previous verification from later corrections. |

The UI changes do not introduce new upload/storage authorization, production configuration, database migrations, or mutation routes. Private admin hero-media URLs remain private URLs in the preview. Responsive layout changes are intended source changes, not expendable audit artifacts; all must be retained when preparing the cumulative release.

## Release findings

### P1: manifest omits seven additive migrations

At the initial audited state, `scripts/generate-release-manifest.mjs:10` hardcodes 40 migrations and stops at single-super-admin approvals. Current additive SQL not listed:

1. `deployment/babal/mariadb-checkout-contact-verification.sql`
2. `deployment/babal/mariadb-first-cod-review.sql`
3. `deployment/babal/mariadb-first-cod-evidence-guards.sql`
4. `deployment/babal/mariadb-form-catalog.sql`
5. `deployment/babal/mariadb-feedback-delivery-jobs.sql`
6. `deployment/babal/mariadb-data-rights-legal-holds.sql`
7. `deployment/babal/mariadb-address-answer-owner-tombstones.sql`

This is seven omissions, **not eight**: the other unlisted SQL file, `mariadb-reset-empty-import.sql`, is destructive and must stay excluded. The existing base `mariadb-schema.sql` must retain `empty-database-only` usage; it must not replace incremental maintenance of an existing database.

`scripts/package-babal-release.ps1:33` copies SQL only from manifest entries. `lib/operations/readiness.ts` checks only manifest-required tables, columns, triggers, and CHECK fragments. Therefore an unchanged manifest both excludes necessary upgrade files from the package and can falsely certify an old database that lacks current application/security storage and triggers. Regenerating the JSON from the old generator does not correct this.

Dependency-safe append order is the seven-file order above, with two hard dependencies: first-COD review before first-COD evidence guards (triggers target `first_cod_reviews`); form catalogue before feedback jobs (composite foreign key to `form_config_versions`). All require existing user/order/shipping/audit base structures supplied by the preceding migration chain. Legal holds and address tombstones require `users`; they can follow the form/feedback migrations.

New enforcement that must be represented after generation includes contact-change proof revocation; form publication update/delete immutability; COD confirmation evidence and fulfillment gates; feedback/configuration references; legal-hold retention and historical answer ownership. The current parser recognizes the new CREATE TABLE and guarded/plain CREATE TRIGGER declarations. Add an inventory regression to prevent future additive SQL being silently omitted and assert dependency order, required objects, checksums, and reset exclusion.

The generator's `requiredChecks` remains a manually maintained historical five-check list. Merely adding files automatically registers tables/columns/triggers, but does not verify newer CHECK constraints or foreign keys. That is a readiness coverage limitation to document; a populated native disposable-database migration check is needed to validate those constraints. Native readiness should at least fail when a newly required table or trigger is absent.

### P2: responsive image sizes still describe the old shell geometry

`app/globals.css:161` changes shared gutters to `clamp(0.75rem, 5vw, 2rem)` per side. At 320px the shell now has 32px total gutters; existing `lib/media/responsive-media.ts` and `tests/responsive-media-sizes.test.ts:62` still assume 40px. For example product-gallery/recent-grid hints report 280px while the new shell width is 288px. Similar drift affects shop/editorial/maker/saved-product/not-found/thumbnail formulas below 640px.

`app/globals.css:165` also changes the wide product shell from `min(94vw, 1680px)` to `min(100%, 1680px)`; `productSliderWide` still uses 94vw formulas and a 1788px cap breakpoint. At 1536px, the actual 1680-capped shell is 1536px with 96px gutters, giving a five-column card width of 268.8px; the old hint gives 250.368px. At 1920px both converge to 297.6px, so checking only the final cap misses this regression. The desktop logo now renders at 56px in the new CSS module while `brandMark` remains 48px.

Impact is image selection/sharpness and download accuracy, not authorization or page overflow. Update hints and independent geometry expectations together, including 320px, an intermediate phone width, 1536px, the new 1680px cap, and 1920px. Existing source/formula tests can currently pass while asserting obsolete geometry; they do not measure the rendered shell.

### Evidence gap: latest slider/header behavior needs current certification

The ledger's earlier 56-row crop/video matrix and 465-test/build evidence predates the latest one-row header and some slider changes. It explicitly says this for the header. New CSS module styling is also absent from the ledger's listed verification scope. Older claims about explicit pause controls, seven-second occasion autoplay, automatic public video playback, video-end advance, and zero video elements under reduced motion no longer describe current source.

Current public videos expose native controls, do not call `video.play()`, pause rotation while playing, and resume a six-second timer after pause/end. Reduced motion stops rotation but now retains a non-autoplaying video element with its poster. Hero and occasion arrows/pause buttons are removed in favor of dots; hover/focus/document visibility/reduced motion still suspend the shared timer. These appear deliberate UI behavior changes rather than unexplained security changes, but they need an updated behavioral acceptance record. Removing explicit persistent pause leaves touch readers without a dedicated pause control; record that tradeoff and check the intended UX before presenting old pause certification as current.

`tests/slider-autoplay.test.ts` verifies the standalone timer but does not mount `useSliderAutoplay`, subscribe a real carousel API, or exercise media events. The older helper tests still test a `manual` pause reason in helpers that the live carousel no longer calls. Source-marker checks cannot establish current focus/visibility/video pause behavior.

## Targeted verification recommended to the release owner

- Run focused unit/render checks for the 11 changed/new tests plus `tests/responsive-media-sizes.test.ts`, `tests/responsive-media-policy.test.ts`, `tests/responsive-media-contract.test.ts`, and `tests/responsive-media-final-regressions.test.ts`. Use explicit filenames on Windows rather than a PowerShell literal glob.
- Run manifest inventory/order regression and `tests/release-manifest-trigger-names.test.ts`; include contact verification, first-COD review/confirmation, form-catalog schema/repository/feedback/access, and owner-history tests in relevant release coverage.
- After fixes, run normal full suite, TypeScript, lint, local Babal production build, and `git diff --check` once on the exact final candidate. Some existing full-suite tests launch browser fixtures; execution belongs to the release owner's coordinated verification, not this read-only audit.
- Against the already guarded disposable staging server, run the three new browser scripts. Add current carousel hook/media checks: six-second wrap, manual reset, hover/focus/visibility/reduced-motion pause, dots/keyboard/swipe, video play/pause/end/departure/reset, and at least the maximum-eight-slide layout. Check header search/configured labels, long helper text, focus restoration, signed-in/out actions, and inline/dialog boundary at 639/640px.
- Re-measure public/admin representative media crop parity at 390/1440px after composition changes and image slot geometry at phone/intermediate/wide-shell cap widths. Current public search scripts alone do not test native video lifecycle or admin/public video crop.
- Validate migration import/order and new constraints using a fresh disposable MariaDB instance with fictional data, never the existing hosted database. Verify the final zip contains all seven additions and no reset/seed/env files, and verify its hashes against the final manifest. Production application, backup, live-schema verification, and deployment remain outside this audit and are not authorized here.

No additional source-level authentication bypass or secret exposure was identified in the 38 responsive/header changes. This is a bounded audit; it does not certify the entire cumulative marketplace or a hosted runtime. Parent release preparation may supersede the manifest finding with a verified repair.
