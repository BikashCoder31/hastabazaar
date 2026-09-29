# Category discovery, category images, and seller wordmark — local acceptance

Date: 2026-09-29. Worktree: codex/hastabazaar-v1-2-1-staging. Local preview: http://localhost:4173.

## Issues and fixes

- Customer, homepage/category browsing: the active Food category was excluded by a fixed built-in slug allowlist and homepage artwork filtering. Discovery now returns every active category, including categories without products. `/categories` provides a complete directory; homepage links use uploaded artwork, built-in artwork, or a labelled placeholder.
- Customer, gift discovery: a newly created occasion had no dedicated directory and depended on curated homepage content for visibility. `/occasions` and homepage occasion links now list active occasions independently. Birthday uses its existing `sathi-birthday` slug; no record was renamed.
- Super Admin, `/admin/catalog`: categories lacked optional imagery. The category editor now uploads a private raster preview and assigns it only on Save entry. Replacement/removal use optimistic image baselines, existing form validation, idempotency, answer snapshots, and audit records. Public delivery is restricted to the currently assigned image of an active category. No image URL or unsafe file bypass is accepted.
- Seller, `/seller`: shared wordmark used navy for both words. Bazaar now uses the same red as the homepage, retaining the accessible brand name.

## Scope and preservation

Migration 0063 adds category media and image assignment tables. It was applied only to the existing local D1 database after a SQLite backup; no reset or duplicate preview server. Original Food/Birthday records and original application/history rows are preserved. The hash snapshot covers 38 pre-existing changed/untracked files plus the parallel agent's newly created brand regression test. All 39 hashes remain unchanged; the 38 unrelated paths are outside the commit scope.

Category image controls are category-only. Occasion image editing was not requested. Categories without products remain discoverable; product availability is not fabricated.

## Verification

- 42 focused automated tests pass: discovery/assignment, media routes, local decoder, editor, directories/homepage, brand, form governance, hero media, and existing rider decoder. Two additional existing catalogue query tests pass.
- Browser: existing Food and Birthday visible on homepage and full directories; their links select the exact shop filter. Category directory checked at desktop and 390px; a 12-category homepage strip stays on one row.
- Browser: uploaded image private before save, visible/decoded afterward; replacement revokes old image, removal revokes current image, inactive category hidden. The fictional image lifecycle category was deactivated through the form after testing.
- Rapid re-edit regression: initially reproduced a stale image baseline and old active state while the server refresh was pending. The editor now disables reopening until refreshed rows arrive; immediate replace/remove without reload passes.
- Browser: seller and customer upload attempts both return 403.
- Seller and homepage Bazaar computed colour matches exactly: rgb(165, 18, 28).
- Normal production build, final scoped lint, and typecheck pass. Independent specification review (including the refresh gate), then code-quality/security review pass with no outstanding findings.
- All 39 captured file hashes match (38 unrelated paths plus this task's brand test). All original rows across 139 baseline application/migration tables are preserved; Food/Birthday unchanged.

Evidence is stored locally in `C:/Users/abinash/Desktop/Hatskala/catalog-discovery-images-20260929`, including failing/passing tests, browser scripts/results, screenshots, a pre-migration SQLite backup, and row/hash preservation checks.

Local D1 verification does not establish MariaDB or production readiness. The guarded local image decoder is a preview-only transport for the same native raster validation pipeline.
