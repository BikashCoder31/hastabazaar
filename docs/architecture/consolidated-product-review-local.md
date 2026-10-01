# Product and signup local review — 2026-09-13

Reviewed approved R002/R005/R008–R013/R016 against outputs/consolidated-local-20260913-042936/source-before.zip and current source. Selected baseline copies are retained as .txt in outputs/product-review-before to avoid adding duplicate TypeScript compilation inputs.

## Findings fixed

- R013 still rendered a required Materials input despite removing its validator requirement and Producer field. Removed that remaining input. Existing producer/materials and SKU stay in database; the revision UPDATE excludes all three regardless of supplied values. The route continues to preserve original values while parsing removed fields.
- Revision upload limits previously depended on a pre-read count. Added photo/video count predicates to the initial conditional UPDATE, evaluated inside its transaction. Over-limit revisions are no-ops and all subsequent media/occasion/audit inserts retain mutation-id gating. An existing gallery is not required to backfill four photos; unchanged legacy galleries larger than five also remain revisable, but cannot gain more photos.
- Added the current review_request_id to revision data and a hidden reviewRequestId field. Public PATCH rejects absent/stale tokens when a nonempty current token exists; the repository checks the expected token atomically as well as needs_changes status. This protects against old forms submitting after another review cycle. Existing internal callers can omit the optional token, but retain status and transaction-level quota checks.
- Gallery previously returned early when no image existed, hiding a legitimate optional video on a historical photo-free listing. The placeholder now occupies only the image area, and optional video remains visible. Photo counts exclude video. A real server-render test verifies mixed photos/video, video-only and empty galleries; it uses a lightweight next/image test stub, not browser playback.
- Product API uniqueness messages now include native MySQL duplicate errors and explain retry instead of asking sellers to fix an automatically generated SKU. Corrected garbled occasion-range text in those routes.

## Verified contracts

- Signup reads exact password and confirmation without trimming/truncation, compares before credential persistence, and never stores confirmation. Native required/min/max inputs and custom mismatch validity use the same helper. Existing Google, session and mailbox transition logic was not changed by the review.
- New product SKU generation overrides supplied SKU, uses a full UUID, and the shared claim table blocks cross-seller collisions. A forced first-attempt collision test verifies rollback, a new generated reference, one committed audit/media set and preserved historical claim. Existing SKU duplicate migration tests pass without renumbering old listings.
- New listings require four photos through UI and server, with optional fifth. Revision limits are separately enforced; no retroactive four-photo requirement. SQL INSERT and revised UPDATE bind alignment are exercised by real in-memory SQLite transactions, including preservation of legacy warranty, identity and media.
- Warranty Yes accepts any positive day/month/year unit without requiring all units. Keep-existing omits replacement choice and the route retains free-text terms; No intentionally clears them. Product description/preparation labels and required-field labels are present.
- Product discount is derived from stored paisa with comparison-price validation; detail and card use ProductDiscount, promoted product mapping includes both selling and comparison paisa. Workspace links use existing approved-seller/customer guards and preserve the current session; they do not assign roles.

## Files and tests

Changed in this review: lib/db/repositories/products.ts; app/api/seller/products/[id]/route.ts; app/api/seller/products/route.ts; components/seller/product-submission-form.tsx; components/catalog/product-gallery.tsx; lib/products/submission.ts; tests/product-revision-concurrency.test.ts; tests/product-gallery.test.ts; tests/product-identity.test.ts.

Targeted tests: signup-confirmation, product-discount, product-form-consolidated, product-identity, product-video, product-gallery and product-revision-concurrency. Thirteen assertions/test cases pass in the final focused group. Targeted oxlint was run for the reviewed signup/product/gallery/form/repository/routes/layouts and new tests with zero findings after fixing test harness typing. Cumulative TypeScript/native/build/browser verification belongs to root while other agents integrate notifications.

## Limits

Video validation bounds file size at 20 MB and container-declared duration at 60 seconds, parses bounded MP4 boxes, and rejects malformed metadata. It does not inspect codecs, transcode, decode all frames, scan for malware, or prove actual content duration. H.264 is requested in UI for compatibility but not enforced by codec scanning. The existing media endpoint streams the whole private/public-authorized object without range support; browser seek/playback/device compatibility remains root browser QA. No live data, production, deployment, messages or database-server startup was used for this review. No migration edits were needed for these fixes.

## Completed native/browser product run

The isolated products harness passed all seven native/browser groups on the reviewed build at port43874. Evidence: outputs/consolidated-local-20260913-042936/products/integration.json and screenshots. Fresh MariaDB schema plus repeated new additive migrations passed; invalid signup created no accounts; same-session workspace switches, four-photo/optional-video/months-only warranty, generated SKU and preserved legacy identity/media all passed. Native stale and simultaneous video revisions produced one success and one conflict. Actual ffmpeg-generated two-second H.264 loaded metadata and played at320/390/1440; detail/card discounts and photo cardinality passed without overflow. Mobile product and form screenshots were visually inspected.

The first browser attempt exposed an unindented Materials JSX block that the initial text replacement missed. Exact-block removal and tests/product-form-render.test.ts now verify real rendered absence rather than only parser behavior. The subsequent complete browser run passes. Successful form reset also clears conditional warranty/return and discount preview state for Add another product. Own app/browser were stopped in finally; the shared root MariaDB server was left running.
