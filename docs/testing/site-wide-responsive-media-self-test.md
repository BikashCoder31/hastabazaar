# Site-wide responsive media self-test

Initial verification: 22 September 2026. Final-review corrections and affected-row rerun: 26 September 2026, in the same disposable local staging worktree only. Production remains unverified and unapproved for deployment.

## Scoped rereview follow-up — 26 September 2026

Rereview of `7530ced` identified one additional P2 policy false negative: the inset fallback paths in both `hasContainingBlockGeometry` and `frameMarker` could bypass `collapsingGeometry`. An absolute `inset: 0` inner class with `max-height: 0!important` incorrectly borrowed a valid outer frame's geometry. Both fallbacks now require no possible collapsing geometry before borrowing that space. Only the policy helper, regression tests and this ledger changed; production source/browser behavior and local business state are untouched.

TDD: `npx tsx --test tests/responsive-media-final-regressions.test.ts` ran RED with 4 pass / 2 intended failures, each returning `[]` instead of `missing-frame`. The two regressions cover an intervening inset wrapper and a marked inset frame, each containing a fill Image. An additional in-flow image in the marked frame isolates `frameMarker`'s fallback independently of the out-of-flow check. Plain inset and positive `max-height: 12rem!important` counterparts remain valid. After the two guards, focused GREEN and all gates below passed.

| Fresh follow-up command | Result |
| --- | --- |
| `npx tsx --test tests/responsive-media-final-regressions.test.ts tests/responsive-media-contract.test.ts tests/responsive-media-policy.test.ts` | 34/34 pass; repository policy zero violations |
| `npx tsx --test tests/responsive-media-*.test.ts tests/product-gallery.test.ts tests/homepage-hero-presentation.test.ts tests/homepage-hero-carousel.test.ts` | 62/62 pass |
| `npm test` | 459/459 pass; zero failed/skipped |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0; local build only; existing notices unchanged |
| `git diff --check` | exit 0 |

The existing 56-row/28-crop browser evidence below remains applicable to unchanged production source; it was not rerun for this test-helper-only correction. No server was restarted, no fixture version was changed, and no second review wave was initiated. All previously documented limitations and retained-history boundaries remain unchanged.

## Final-review fix wave — 26 September 2026

This section supersedes the original product-photo fit and admin/public crop conclusions below. The original product photos were marked `contain` but Vinext rendered inline `object-fit: cover`; the original admin preview checks verified cover mode, not crop parity. Those observations were insufficient and are not treated as passing evidence for the corrected behavior. Unaffected original rows remain historical evidence, not newly rerun certification.

### Corrections and RED/GREEN evidence

| Finding | Correction and focused evidence |
| --- | --- |
| F1 — product main photo crops | ProductGallery supplies `style={{ objectFit: 'contain' }}`, overriding the real Vinext fill default. The new actual-Vinext rendered test failed on `object-fit:cover` before the change and passes on `object-fit:contain`; thumbnails still render cover. Seven browser product rows and all 28 photo selections now compute contain. |
| F2 — borrowed containing-block geometry | The policy walks the actual possible positioned ancestors for fill/absolute media, including an intervening unmarked wrapper. The exact unreserved `div.relative` fixture failed RED (incorrectly accepted); it is now rejected, while a reserved `relative h-48` or static wrapper passes. Named CSS and conditional/computed inline absolute positioning have the same regression coverage. |
| F3 — collapsing CSS precedence | The policy preserves possible geometry declarations across important, layered, conditional, and nested rules. `.inner {position:relative; height:0!important} .inner {height:12rem}` failed RED (incorrectly accepted), then rejects; positive-height alternatives, including important/layered/conditional cases, pass. Ambiguous possibly collapsing geometry is conservatively rejected, not silently last-write merged. |
| F4 — marker contradicts operative fit | New `invalid-fit` checks inspect actual utility/shared-helper/CSS/style contracts, account for Vinext's inline fill default, and require unconditional matching fit. Contradictory cover/contain, conditional styles/CSS, natural fixed-height classes, and unknown/shadowed/self-referencing aliases reject; matching cover/contain/natural examples pass. The original contradictory fixture and later natural-height fixture failed RED before implementation. Self-review caught named CSS absolute media and recursive aliases: 2/4 focused tests failed RED, then 32/32 policy/contract/repository tests passed GREEN. |
| F5 — admin/public crop differs | Public and admin render shared copy, spacing, layout, media styling and caption. The preview explicitly represents a 1440px desktop or 390px mobile layout, uniformly scaled to fit its editor. Container queries preserve the represented layout and focal position independently of host width. Browser RED recorded preview aspect 1.333333 vs public desktop 0.98002045. GREEN compares frame aspect, computed fit, focal position and normalized visible source crop—not merely markers. Rendered admin tests preserve private URLs, preview labels, copy and non-navigating draft actions. |
| F6 — inaccurate size hints | Sizes now follow actual grid breakpoints, gaps, side rails, shell padding and maximum widths; regular and wide product sliders have distinct hints. Independent formula tests failed RED (320px productGrid reported 320 instead of 280; 1920px regular slider reported 302 instead of 318), then pass, including four-column recently-viewed slots at 1024px and bounded large screens. No grid layout was redesigned. |

The initial combined gallery/policy regression run was 1 pass / 4 intended failures. Subsequent focused gates passed after each minimal correction. An initial lint run rejected a new test's Function constructor and `module` variable; the test now evaluates bounded arithmetic through TypeScript's expression AST and uses `renderedModule`. No lint rules were suppressed.

### Fresh affected browser matrix

Same guarded localhost environment, bundled Playwright, and cached Chromium 1228; no dependencies installed. Existing fictional catalogue media and the retained private hero QA MP4 were reused. Every cell below represents a measured row at the exact listed viewport, with screenshot evidence in `.staging/artifacts/responsive-media/`.

| Viewport | Product photo | Public image / video / reduced-motion poster | Admin image desktop / mobile | Admin video desktop / mobile |
| --- | --- | --- | --- | --- |
| 320×800 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |
| 360×800 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |
| 390×844 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |
| 768×1024 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |
| 1024×768 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |
| 1440×900 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |
| 1920×1080 | contain, pass | cover, pass / pass / pass | crop match / crop match | crop match / crop match |

Totals: 56 rows, 28 public-vs-admin crop comparisons, 28 gallery selections and 21 hero selections. All 56 have no document overflow, no framework error overlay, no failed HTTP/media responses, no page errors, and no console warnings/errors. This clean result applies only to this fresh affected matrix; historical C1/C2/C3 observations below remain recorded.

- Desktop preview is compared with the same slide's public 1440px layout; mobile preview with its public 390px layout, at all seven editor host widths. These are explicitly labelled representative viewports, not an assertion that one desktop preview simultaneously represents every public width.
- Maximum aspect-ratio difference: 0.00000017075. Maximum normalized source-crop coordinate/extent difference: 0.00000010672. Both are below the 0.002 regression tolerance. Desktop focal position is `50% 50%`; mobile is `63% 50%`. Public image, video and poster frames match at each width.
- Product square frames measured 280, 320, 350, 704, 466.19, 672 and 672px respectively. The actual decoded portrait, landscape, square and detail photos compute contain after every selection. Product video retains contain and native controls. Visible portrait letterboxing and all four fixture borders were checked at 320/1920px.
- Public QA video was actually played at each width; reduced-motion poster state renders zero video elements. Existing carousel selection tests passed. This wave does not repeat the entire historical autoplay/timer/swipe certification.
- Representative screenshots were visually inspected for phone/wide product, image/video previews, desktop image/video and tablet poster. A frame screenshot can include the existing sticky header or carousel/category overlay when scrolled; measured media coordinates, fit and source-crop calculations are recorded independently.
- `final-media-matrix.json` records URLs, meaningful page identity, viewport, geometry, computed fit/position, decoded source dimensions, diagnostics, interactions, comparisons and restoration. Source-crop arrays are cover calculations; contained product certification uses computed contain plus decoded visual/selection checks, not those crop arrays.
- Screenshots: `final-product-{width}.png`, `final-home-{image|video|poster}-{width}.png`, `final-admin-{image|video}-{desktop|mobile}-{width}.png`. `final-crop-red.json` and `final-crop-green.json` retain the image crop regression before/after.

### Fixture restoration, final gates and limits

The first video QA save correctly rejected a leftover image alternative-text field with HTTP 400; only the temporary QA script was corrected to send `imageAlt: null`. Validation and production code were not weakened. Its finally block restored the unchanged baseline through retained version `f04580b0-7bb9-42e7-a615-04d8994ad887`. The corrected run used local QA version `e35880ce-c027-4ec2-9819-429c63b48967`, then restored baseline via normal publish version `b4af5ebe-df75-4b11-9b73-81bee32ec26e`. Effective hero value deep-equals the baseline. Final public retained-video request returns 404; authorized private request returns 200 and `private, no-store`. The private fixture and version history were preserved. Evidence: `final-hero-state.json` and `final-media-matrix.json.restoration`.

| Fresh command / check | Result |
| --- | --- |
| `npx tsx --test tests/responsive-media-*.test.ts tests/product-gallery.test.ts tests/homepage-hero-presentation.test.ts tests/homepage-hero-carousel.test.ts` | 60/60 pass; zero skipped |
| `npx tsx --test tests/responsive-media-final-regressions.test.ts tests/responsive-media-contract.test.ts tests/responsive-media-policy.test.ts` | 32/32 pass; repository policy zero violations |
| `npm test` | 457/457 pass; zero failed/skipped |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0; local compilation only; existing middleware deprecation, route-classification and plugin-timing notices |
| `node .staging/final-crop-check.mjs --red` / without `--red` | intended crop assertion failure / exit 0, 14 image comparisons |
| `node .staging/final-media-matrix.mjs` / `--video-only` | 28 image/product rows completed before correctly rejected fixture save; corrected continuation exit 0, all 56 rows and 28 comparisons retained |
| `git diff --check` | exit 0 |
| Required branch/base ancestry | `codex/hastabazaar-v1-2-1-staging`; 537f009, 61c1422 and clean base 659667b preserved |

The policy remains a conservative source-analysis guard, not a general browser/CSS cascade evaluator. False-positive ambiguity is intentional; browser evidence remains necessary. Exact hint tests cover the affected size consumers but populated recently-viewed/review attachment browser states remain unavailable (L1). L2/L3 and the earlier populated-cart delayed-load limitation remain unchanged. No production deployment, original-checkout edit, config/migration, upload/storage/auth/privacy change, reset/reseed or dependency installation occurred in this wave. The only temporary business-state change was the restored local hero version workflow above.

Reproduction scripts `final-crop-check.mjs` and `final-media-matrix.mjs` are ignored local evidence; the latter publishes/restores local versions and must not be run against other environments or blindly repeated. The committed tests are reusable without these staging mutations.

## Environment and scope

Browser plugin not available. Used existing bundled Playwright with cached Chromium 1228 (explicit executable because the bundled default cache revision 1234 was absent), plus installed Chrome for the repository carousel verifier. No browser packages were installed. Windows / Node 22.23.1. Origin: http://localhost:3000. Login/role switching used only /local-testing.

The staging guard passed: exact staging marker/path, loopback origin, local D1 and R2, captured email, simulated payments, remote bindings disabled. Existing role identities were reused; no reset/reseed, migration, production binding, external messages, deployment, or production data access. Empty product lists required one fictional product created through the normal seller form, then reviewed and published through normal Super Admin controls:
- Product ID: f4211763-81b6-447d-8977-4f4fdc420255.
- Name: SIMULATED responsive media QA craft.
- Seller: Janakpur Craft Studio (local-test-seller-profile).
- Four generated portrait/landscape/square/detail PNGs and a product-only two-second MP4; no real customer/order/payment data.
- Dynamic product/edit/review destinations were discovered from the shop/seller/admin lists and are recorded below.

The ledger was prepared before browser execution. This final version replaces pending entries with measured outcomes. Screenshots and JSON evidence are local, ignored, and deliberately not committed. All evidence filenames below are relative to `.staging/artifacts/responsive-media/`.

## Original Task 7 automated gates and TDD (historical)

| Check | Result |
| --- | --- |
| Initial full suite after policy correction | 447/447 pass |
| Initial TypeScript / lint / production build | exit 0 / 0 / 0 |
| Final focused `npx tsx --test tests/responsive-media-*.test.ts` | 43/43 pass |
| Final `npm test` (including rerun after test-only type correction) | 450/450 pass; 0 skipped |
| Final `npx tsc --noEmit` | exit 0 |
| Final `npm run lint` | exit 0 |
| Final `npm run build` | exit 0; local compilation only |
| `git diff --check` | exit 0 |
| Ancestors 537f009 and 61c1422 | both preserved |

Existing test SQLite experimental warnings and build middleware-to-proxy / Vite timing notices were not failures. A final TypeScript run first caught a Buffer test-fixture `toString('base64')` ambient-signature error (TS2554); changed only fixture encoding to `btoa(String.fromCharCode(...clip(2)))`, then reran TypeScript, lint, focused upload tests (7/7), and full tests (450/450).

1. **Carried Task 6 cascade regression:** three fresh tests reproduced RED (24/27 contract tests pass, three fail: missing-frame expected but no violation) for important relative versus inline static, important relative versus later normal CSS static, and unlayered relative versus layered static. Scanner now retains possible positioning alternatives before last-write merging and preserves important positioning against normal inline overrides. Bounded nearer variants also pass. GREEN initially 41/41 focused tests; final 43/43. Existing scope/exclusions, all regressions, zero repository violations, and no allowlists are preserved. The analysis is deliberately conservative, not a full CSS cascade evaluator.
2. **Admin review overflow:** actual generated SKU made scrollWidth 362 at 320/360 px. Focused regression failed before adding `break-all` to the existing SKU paragraph, then passed. Reran admin queue/review at all seven sizes: no page overflow.
3. **Seller list overflow:** actual scrollWidth 431 at 320 px (also affected 360/390). Diagnostic isolation identified absolute screen-reader stock labels escaping an unpositioned table scroller. Focused regression failed before adding `relative` to the existing `overflow-x-auto` wrapper, then passed. All seven list/edit sizes rerun: no page overflow; deliberate table scrolling retained.
4. **Authorized native decoder import boundary:** first validated hero MP4 POST hit Vite/workerd HTML 500 (`endsWith`) before the route could run because sharp was eagerly imported. Parent authorized only lazy-loading sharp inside the existing image-validation try block. Subprocess regression with sharp resolution made unavailable failed RED on eager import, passed GREEN with unchanged MP4 bytes/metadata and fail-closed image rejection. Existing real sharp JPEG/PNG/WebP normalization and unsafe-content/MIME/size/dimension checks still pass. Combined focused upload/operations suite: 14/14 at fix time. Real local MP4 POST then returned 201 and all video rows were rerun. No route/storage/auth/config changes. If this ruling is wrong, production image validation could load differently: final review must scrutinize this import boundary. A real image upload in workerd was not certified; native loading still fails closed there.

## Route-by-viewport ledger

“Pass” means correct route identity/title and meaningful DOM; no framework error overlay; no document horizontal overflow; valid mode on every rendered img/video; reviewed crop/contain and visible bounds. It does not mean every console message is absent (C1–C3 below). Product rows remain explicitly partial for unavailable populated review/recent fixtures (L1). Sticky site headers visible in some scrolled screenshots are normal UI, not error overlays.

| Route/state | Viewport | Actual resulting URL | Result | Screenshot |
| --- | --- | --- | --- | --- |
| Home: image hero / occasion / maker | 320×800 | `http://localhost:3000/` | Pass | `home-320.png` |
| Home: image hero / occasion / maker | 360×800 | `http://localhost:3000/` | Pass | `home-360.png` |
| Home: image hero / occasion / maker | 390×844 | `http://localhost:3000/` | Pass | `home-390.png` |
| Home: image hero / occasion / maker | 768×1024 | `http://localhost:3000/` | Pass | `home-768.png` |
| Home: image hero / occasion / maker | 1024×768 | `http://localhost:3000/` | Pass | `home-1024.png` |
| Home: image hero / occasion / maker | 1440×900 | `http://localhost:3000/` | Pass | `home-1440.png` |
| Home: image hero / occasion / maker | 1920×1080 | `http://localhost:3000/` | Pass | `home-1920.png` |
| Shop: cards / filters | 320×800 | `http://localhost:3000/shop` | Pass | `shop-320.png` |
| Shop: cards / filters | 360×800 | `http://localhost:3000/shop` | Pass | `shop-360.png` |
| Shop: cards / filters | 390×844 | `http://localhost:3000/shop` | Pass | `shop-390.png` |
| Shop: cards / filters | 768×1024 | `http://localhost:3000/shop` | Pass | `shop-768.png` |
| Shop: cards / filters | 1024×768 | `http://localhost:3000/shop` | Pass | `shop-1024.png` |
| Shop: cards / filters | 1440×900 | `http://localhost:3000/shop` | Pass, C1 | `shop-1440.png` |
| Shop: cards / filters | 1920×1080 | `http://localhost:3000/shop` | Pass, C1 | `shop-1920.png` |
| Populated cart | 320×800 | `http://localhost:3000/cart` | Pass, C2 | `cart-320.png` |
| Populated cart | 360×800 | `http://localhost:3000/cart` | Pass, C2 | `cart-360.png` |
| Populated cart | 390×844 | `http://localhost:3000/cart` | Pass, C2 | `cart-390.png` |
| Populated cart | 768×1024 | `http://localhost:3000/cart` | Pass, C2 | `cart-768.png` |
| Populated cart | 1024×768 | `http://localhost:3000/cart` | Pass, C2 | `cart-1024.png` |
| Populated cart | 1440×900 | `http://localhost:3000/cart` | Pass, C2 | `cart-1440.png` |
| Populated cart | 1920×1080 | `http://localhost:3000/cart` | Pass, C2 | `cart-1920.png` |
| Wishlist | 320×800 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-320.png` |
| Wishlist | 360×800 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-360.png` |
| Wishlist | 390×844 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-390.png` |
| Wishlist | 768×1024 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-768.png` |
| Wishlist | 1024×768 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-1024.png` |
| Wishlist | 1440×900 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-1440.png` |
| Wishlist | 1920×1080 | `http://localhost:3000/account/wishlist` | Pass | `wishlist-1920.png` |
| Custom 404 | 320×800 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-320.png` |
| Custom 404 | 360×800 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-360.png` |
| Custom 404 | 390×844 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-390.png` |
| Custom 404 | 768×1024 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-768.png` |
| Custom 404 | 1024×768 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-1024.png` |
| Custom 404 | 1440×900 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-1440.png` |
| Custom 404 | 1920×1080 | `http://localhost:3000/responsive-media-qa-missing-route` | Pass, C3 | `404-final-1920.png` |
| Product: gallery / video / empty reviews / recent state | 320×800 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-320.png` |
| Product: gallery / video / empty reviews / recent state | 360×800 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-360.png` |
| Product: gallery / video / empty reviews / recent state | 390×844 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-390.png` |
| Product: gallery / video / empty reviews / recent state | 768×1024 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-768.png` |
| Product: gallery / video / empty reviews / recent state | 1024×768 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-1024.png` |
| Product: gallery / video / empty reviews / recent state | 1440×900 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-1440.png` |
| Product: gallery / video / empty reviews / recent state | 1920×1080 | `http://localhost:3000/products/simulated-responsive-media-qa-craft-fb2bab25` | Partial (L1) | `product-1920.png` |
| Seller product list | 320×800 | `http://localhost:3000/seller/products` | Pass | `seller-list-320.png` |
| Seller product list | 360×800 | `http://localhost:3000/seller/products` | Pass | `seller-list-360.png` |
| Seller product list | 390×844 | `http://localhost:3000/seller/products` | Pass | `seller-list-390.png` |
| Seller product list | 768×1024 | `http://localhost:3000/seller/products` | Pass | `seller-list-768.png` |
| Seller product list | 1024×768 | `http://localhost:3000/seller/products` | Pass | `seller-list-1024.png` |
| Seller product list | 1440×900 | `http://localhost:3000/seller/products` | Pass | `seller-list-1440.png` |
| Seller product list | 1920×1080 | `http://localhost:3000/seller/products` | Pass | `seller-list-1920.png` |
| Seller edit / upload preview | 320×800 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-320.png` |
| Seller edit / upload preview | 360×800 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-360.png` |
| Seller edit / upload preview | 390×844 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-390.png` |
| Seller edit / upload preview | 768×1024 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-768.png` |
| Seller edit / upload preview | 1024×768 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-1024.png` |
| Seller edit / upload preview | 1440×900 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-1440.png` |
| Seller edit / upload preview | 1920×1080 | `http://localhost:3000/seller/products/f4211763-81b6-447d-8977-4f4fdc420255/edit` | Pass | `seller-edit-1920.png` |
| Admin product queue | 320×800 | `http://localhost:3000/admin/products` | Pass | `admin-queue-320.png` |
| Admin product queue | 360×800 | `http://localhost:3000/admin/products` | Pass | `admin-queue-360.png` |
| Admin product queue | 390×844 | `http://localhost:3000/admin/products` | Pass | `admin-queue-390.png` |
| Admin product queue | 768×1024 | `http://localhost:3000/admin/products` | Pass | `admin-queue-768.png` |
| Admin product queue | 1024×768 | `http://localhost:3000/admin/products` | Pass | `admin-queue-1024.png` |
| Admin product queue | 1440×900 | `http://localhost:3000/admin/products` | Pass | `admin-queue-1440.png` |
| Admin product queue | 1920×1080 | `http://localhost:3000/admin/products` | Pass | `admin-queue-1920.png` |
| Admin product media review | 320×800 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-320.png` |
| Admin product media review | 360×800 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-360.png` |
| Admin product media review | 390×844 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-390.png` |
| Admin product media review | 768×1024 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-768.png` |
| Admin product media review | 1024×768 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-1024.png` |
| Admin product media review | 1440×900 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-1440.png` |
| Admin product media review | 1920×1080 | `http://localhost:3000/admin/products/f4211763-81b6-447d-8977-4f4fdc420255` | Pass | `admin-review-1920.png` |
| Admin homepage image preview | 320×800 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-320.png` |
| Admin homepage image preview | 360×800 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-360.png` |
| Admin homepage image preview | 390×844 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-390.png` |
| Admin homepage image preview | 768×1024 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-768.png` |
| Admin homepage image preview | 1024×768 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-1024.png` |
| Admin homepage image preview | 1440×900 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-1440.png` |
| Admin homepage image preview | 1920×1080 | `http://localhost:3000/admin/homepage` | Pass | `admin-home-1920.png` |
| Home: active video | 320×800 | `http://localhost:3000/` | Pass | `home-video-320.png` |
| Home: active video | 360×800 | `http://localhost:3000/` | Pass | `home-video-360.png` |
| Home: active video | 390×844 | `http://localhost:3000/` | Pass | `home-video-390.png` |
| Home: active video | 768×1024 | `http://localhost:3000/` | Pass | `home-video-768.png` |
| Home: active video | 1024×768 | `http://localhost:3000/` | Pass | `home-video-1024.png` |
| Home: active video | 1440×900 | `http://localhost:3000/` | Pass | `home-video-1440.png` |
| Home: active video | 1920×1080 | `http://localhost:3000/` | Pass | `home-video-1920.png` |
| Home: reduced-motion poster | 320×800 | `http://localhost:3000/` | Pass | `home-poster-320.png` |
| Home: reduced-motion poster | 360×800 | `http://localhost:3000/` | Pass | `home-poster-360.png` |
| Home: reduced-motion poster | 390×844 | `http://localhost:3000/` | Pass | `home-poster-390.png` |
| Home: reduced-motion poster | 768×1024 | `http://localhost:3000/` | Pass | `home-poster-768.png` |
| Home: reduced-motion poster | 1024×768 | `http://localhost:3000/` | Pass | `home-poster-1024.png` |
| Home: reduced-motion poster | 1440×900 | `http://localhost:3000/` | Pass | `home-poster-1440.png` |
| Home: reduced-motion poster | 1920×1080 | `http://localhost:3000/` | Pass | `home-poster-1920.png` |
| Admin homepage video preview | 320×800 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-320.png` |
| Admin homepage video preview | 360×800 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-360.png` |
| Admin homepage video preview | 390×844 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-390.png` |
| Admin homepage video preview | 768×1024 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-768.png` |
| Admin homepage video preview | 1024×768 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-1024.png` |
| Admin homepage video preview | 1440×900 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-1440.png` |
| Admin homepage video preview | 1920×1080 | `http://localhost:3000/admin/homepage` | Pass | `admin-video-1920.png` |

The 98 main rows are preserved in `matrix-public.json` (42), `matrix-seller.json` (14), `matrix-admin-pending.json` (14), `matrix-admin-home.json` (7), and `matrix-video.json` (21). JSON contains URL/title/heading/body length, viewport, scroll/client width, raw overflowing-media entries, clipping analysis, media geometry/mode/fit/loading/preload/controls, console and failed responses, layout shifts, and screenshot path. `contact-{320,360,390,768,1024,1440,1920}.png` were visually inspected.

## Geometry, visual checks, loading, and interaction

- All 98 final main rows: pageOverflow false, no visibly escaped media, no framework overlay. Product/review videos contain their full frame; seller thumbnails/previews and editorial/hero media cover their bounded frames; brand artwork keeps its intended natural/contain treatment.
- **Raw-query caveat:** the brief's raw right-edge query is not empty on home rows (2–6 items): it includes intentionally translated inactive carousel slides and clipped horizontal category content. Their ancestor overflow clipping was inspected, visible overflow is zero, and document width equals viewport width. Raw evidence is retained rather than removed or mislabeled as empty. No CSS change was made to disable intentional carousel behavior.
- `reserved-geometry.json`: 70 route/viewport sweeps held image/media responses until DOM rendered, measured frames, released requests, and compared width/height. All stable. This sweep's fresh cart context was empty, so populated-cart delayed-load geometry is not claimed; populated cart is covered by the main matrix with fixed thumbnail frames. Main matrix layout-shift totals were zero except cart 1440 (0.00166821) and 1920 (0.00303916); no media-frame resize was observed. Do not interpret this lab sweep as production field CLS.
- `sections.json`: occasion, maker, footer scrolled into view and loaded at all seven sizes (21 checks); `occasion-loaded-{width}.png`, `maker-loaded-{width}.png`, `footer-loaded-{width}.png`. All loaded media have valid modes. Header overlap in a section screenshot reflects sticky-header capture while scrolling, not clipped content.
- Same file: image/video × Desktop/Mobile admin preview at all seven sizes (28 checks), `admin-preview-{image|video}-{desktop|mobile}-{width}.png`. Both preview types use cover; this original check did not establish crop parity and is superseded by F5 above. Public active-video and reduced-motion poster have equal frame width/height at each size; poster state renders zero video elements.
- `node scripts/verify-homepage-carousel.mjs .staging/artifacts/responsive-media/carousel` passed in Chrome at desktop 1536×960 and mobile 390×844. Three hero slides decode; previous/next/dots/keyboard; autoplay wraps 3→1; hover/focus/manual/hidden-document pauses; occasion two-slide next/previous/dots/keyboard/swipe, ~7-second autoplay wrap, stable height and same pauses; reduced-motion autoplay disabled. Existing private occasion draft was reused for preview; no production publish. Evidence: `carousel/homepage-carousel-results.json` and its screenshots.
- `matrix-video.json`: actual video playing at all seven sizes; natural video end advances to next slide; inactive video pauses and resets currentTime to 0. Full local hero upload/version workflow described below.
- `interactions.json`: product thumbnail buttons 2/3/4/1 update selected state and counter; native product-video keyboard Space starts playback with advancing currentTime, controls and caption, contain fit at 390/1440. Buyer add-to-cart and wishlist were exercised to create populated main-matrix states; no checkout.
- Shop search submitted SIMULATED and reached `/shop?q=SIMULATED&sort=newest` with the fictional result visible.
- Seller future-upload portrait/landscape/square selection at 390/1440 retained identical cover frames (266×199.5 and 459×344.25 respectively); accepted MP4 preview retains native controls, metadata preload and contain mode. These edit previews were not saved. Main seller-edit matrix includes image/video previews at all seven sizes. Existing validated upload endpoint/destination unchanged.
- Resizing already-loaded home, product, seller-edit through all seven widths produced zero image/video requests and zero duplicate raw requests. Current critical hero image eager; inactive hero and offscreen editorial images lazy; product video metadata preload retained. This measures breakpoint-only requests, not a general download-budget benchmark.

## Console and mismatch ledger

| ID | Observation | Resolution / remaining concern |
| --- | --- | --- |
| M1 | CSS cascade could erase a possible nearer containing block | TDD scanner correction above; repository scan zero |
| M2 | Long admin SKU leaked horizontal width | Minimal paragraph wrapping; seven-size rerun passes |
| M3 | Seller accessible label escaped table clipping | Position existing scroller; seven-size rerun passes |
| M4 | Eager native sharp import blocked hero MP4 route | Authorized lazy import; RED/GREEN, real upload 201, video rerun passes |
| C1 | Chromium/Vinext reports preload link with invalid as on shop 1440/1920 and product 360/390/1920 | No failed media response or overlay; retained as runtime preload observation, not fixed by changing media/security behavior |
| C2 | Existing cart Link rendered via Base UI Button warns nativeButton=true expects button | Present all populated-cart sizes; media works, but button/link semantics deserve separate review |
| C3 | Custom 404 emits expected 404 resource console error | Page identity “This page has wandered away.”; normal custom page, not a crash. One original wide screenshot captured concurrent Vite upload failure; after M4 rerun `final-access-check.json` / `404-final-1920.png` has only expected 404, no overflow/overlay |
| L1 | No populated product reviews/attachment or another eligible recently-viewed product fixture | Empty reviews and recently-viewed request state exercised; populated review attachments/recent cards remain browser-unverified. Automated component/contracts pass. No fabricated order/review was inserted |
| L2 | Chromium/Chrome only | No Firefox/Safari or physical touch-device certification |
| L3 | Native image decoding inside local workerd | Image decoder unit paths pass in Node and unavailable decoder fails closed; live workerd image-upload success is not claimed |

No failed image/video response in the final matrix. Console is therefore “with recorded observations,” not “error-free.”

## Hero fixture lifecycle and cleanup

No valid hero MP4 existed. Created `hero-qa-only.mp4` (two seconds, solid colour, 640×360) under ignored staging artifacts, distinct from the catalogue demonstration fixture. Uploaded through existing Super Admin validated route (201), media ID 1cc76bb4-f571-41cb-89fe-7e67b470d302. Never placed in public/ or catalogue records.

Saved baseline default hero as local version 498eed1a-94b0-480b-aae6-766c614fe11d; video QA version d470d20e-7f85-4698-8cda-1128c393d60e. After QA, normal reverse/publish produced restoration version 7e1e822a-cb6a-4e7b-b5d9-c2152a02dd63; effective hero value deep-equals baseline. Evidence: `hero-restore.json`, `hero-video-state.json`, `hero-restoration.json`.

Final public media URL returns 404; authorized private URL returns 200 with private/no-store caching. Normal DELETE archive request returns 409: “Media referenced by a retained version cannot be archived.” Retained local history/private object deliberately preserved; no bypass or destructive database cleanup. `final-access-check.json` proves the boundary. Fictional catalogue fixture and private retained QA media remain only in disposable staging.

## Reproduction and self-review

Temporary browser scripts were kept under ignored `.staging/`: `responsive-matrix.mjs` (--admin-pending, --public, --seller, --admin-home, --video), `responsive-interactions.mjs`, `reserved-geometry.mjs`, `sections-responsive.mjs`, `final-responsive-check.mjs`; setup/restore scripts are mutation-bearing and must not be blindly rerun. The committed existing carousel verifier is reusable. Screenshots are local evidence, not distributable committed test fixtures.

Original Task 7 self-review (before the final fix wave): only two owner-file layout classes changed; the scanner fix retains conservative uncertainty and no allowlist; image/video validators still reject unsafe MIME/content/size/dimensions, with only decoder import timing changed. No product/auth/payment/email/storage/routes/config/migrations changed. Scope remained in authorized staging. Review should pay particular attention to the sharp import boundary, conservative scanner false-positive tradeoff, C1/C2, and explicitly incomplete L1/L3 browser coverage. See the superseding final-wave section for the subsequent gallery, hero presentation, size-hint and policy corrections.

## Responsive-reference follow-up (2026-09-26)

The user supplied Flipkart screenshots as examples of layout adapting to narrow phone, phone, and tablet widths. They are behavior references only; HastaBazaar keeps its own branding and purpose-specific media shapes. The local homepage was checked at those widths:

| Effective browser viewport | Result |
| --- | --- |
| 240×608 (the browser harness minimum when requesting 232px) | No page-level horizontal overflow. The hero stacks with a square image; its carousel controls wrap and remain inside the frame. The maker story grid shrinks to its shell. |
| 380×608 | No page-level horizontal overflow. Copy and hero image share a row; the image is square and controls remain on one row. |
| 722×608 | No page-level horizontal overflow. The tablet hero stacks and uses its 8:5 media frame. |

The 232px reference could not be reproduced exactly because the local viewport control floors at 240 CSS pixels. These are homepage-only follow-up checks, not a claim that every route in the full matrix was retested at these three widths. The homepage regression test pins the narrow-phone / phone / tablet transitions, and the repository media-policy test continues to enforce the shared responsive contract for future TSX image/video render sites.

The 232px limitation above applies to the interactive viewport control. The later headless Chromium layout pass below set 232 CSS pixels exactly.

## Responsive content and layout follow-up (2026-09-26)

This follow-up expands beyond image frames so the written content and controls reflow too. Shared shell gutters now scale with viewport width; section headings and links shrink/wrap rather than forcing fixed-width rows; long text may break safely; and account, seller, and staff navigation labels wrap instead of being ellipsized. The homepage hero copy now scales with its container alongside the square phone image. At ultra-narrow widths the public header shows its compact brand mark, and Super Admin homepage product titles wrap inside preview cards.

The 21-view local browser check covered the homepage and shop, buyer account, rider, seller dashboard/product list, and Super Admin homepage at 232, 380, and 722 CSS pixels. All routes returned successfully; no page-level horizontal overflow or visible text clipping remained. The pass first found clipping in the ultra-narrow header wordmark and Super Admin product title; targeted regressions were observed RED, then the fixes were checked GREEN and the same browser rows rerun. This is representative route-family evidence in addition to the earlier media matrix, not a visual certification of every authenticated page state or every route-specific interaction.

The repository media-policy test still enforces responsive modes/sizing for future image and video render sites. `tests/site-responsive-layout.test.ts` now protects the shared content, navigation, header, and narrow admin-title rules against regression.

## Responsive composition correction (2026-09-26)

This supersedes the earlier phone/tablet hero composition claims. The user's screenshot demonstrated that zero page overflow alone was insufficient: a tall narrow copy column stranded the square image, while an absolutely positioned caption broke across words and escaped its frame.

- Compact hero: headline and square media share a row from 300px through tablet widths; description, actions, and benefits span the row below. Below 300px the composition stacks for legibility. Captions flow beneath compact images and retain the desktop overlay treatment. Public slides and the scaled editor preview use the same classes and copy component.
- Other sections: category headings stack at narrow widths; maker images use a square phone frame; maker/occasion headings use smaller fluid sizes; maker captions have both horizontal bounds; footer CTA padding/type/icons and compact-desktop columns fit their containers. Occasion controls and hero dots wrap, including the maximum eight hero slides.
- Super Admin: media-library filenames/IDs wrap in shrink-safe grid tracks, preview actions wrap, filters use bounded single-column tracks, and product thumbnails/actions stack on narrow screens. No upload, authorization, visibility-save, publication, or storage logic changed.

### Evidence and regression checks

`scripts/responsive-layout-check.mjs` reproduced the original defects RED at 390px before implementation. The revised three image slides passed at 232, 320, 360, 390, 430, 640, 722, 768, 1024, 1440, and 1920px. A final four-width rerun (232/390/722/1440) also passed after the eight-dot wrapping change, including a 100-character caption enlarged to 24px and 240-character body copy. These stress changes exist only in the disposable browser DOM; nothing is saved. Checks cover square compact frames, full-width descriptions, row separation, bounded captions, reachable slide controls, page overflow, uncaught page errors, and failed media responses.

Visual inspection included all three hero slides, categories, occasion cards/controls, maker story, footer, and representative shop, product, account, and seller views. Screenshots are under `.staging/artifacts/responsive-layout-composition/` and `.staging/artifacts/responsive-layout-routes/`. Element screenshots can show sticky-header overlap or off-viewport capture gaps; a separate occasion-bottom capture confirmed its second card and controls are fully visible when scrolled.

The read-only route-family sweep covered shop, the existing fictional product detail, empty cart, authenticated account, seller product list, rider dashboard, Super Admin homepage/product queue, and a custom 404 at 232/390/768/1024/1440/1920px. Initial staff access-denied rows were a role-switch navigation race, not editor coverage; the verified admin rerun explicitly waited for local identity navigation. That rerun exposed the 232px editor clipping and prompted the fixes above. `scripts/responsive-admin-layout-check.mjs` then passed at 232/320/390/768/1024/1440/1920px with zero clipped checked elements; the scaled 390px preview retained a 171×171px media frame and full-width description below the visual row. It changes only a disposable local browser session and preview-mode state, never business records.

Run these scripts against the existing local server with `PLAYWRIGHT_MODULE` pointing to an installed Playwright module and optional `CHROMIUM_PATH` pointing to Chromium. Both refuse non-loopback base URLs. `RESPONSIVE_WIDTHS` can select a public subset. The normal repository media-policy enforcement remains unchanged; the full suite passes 465/465, TypeScript and lint pass, `git diff --check` passes, and the final local `npm run build` succeeds. Build output retains the existing middleware-deprecation and route-classification notices; it does not deploy anything. Logs are in `responsive-layout-composition/final-tests.log` and `final-build.log`.

Limits: Chromium/local fictional data only; empty cart rather than a newly populated cart; no fresh saved video/publication workflow in this follow-up; no claim of every authenticated state, physical device, Safari/Firefox, or production certification. Earlier populated-media evidence remains separate. Production was neither accessed nor modified, and no deployment was performed. Changes remain in the existing staging worktree for review.

### Header logo correction

The previous header class hid the image logo from 300–639px while displaying only the wordmark. The logo now remains visible and non-shrinking at every breakpoint (32px on phones, 44px from 640px). Only the text wordmark hides below 360px to preserve space for navigation/account/cart controls. The regression was observed failing before the fix; six focused layout/media-policy tests and lint pass afterward. Local Chromium checks at 232, 299, 300, 320, 359, 360, 390, 430, 639, 640, 768, 1024, and 1440px confirm the logo decodes, remains visible, does not overlap the cart, and causes no page overflow. `logo-320.png` and `logo-390.png` record the updated header; the reusable public browser check now also asserts logo visibility. The earlier full-suite/build results precede this two-class header correction.

### Complete brand visibility — supersedes the correction above

The user requires both the logo and the name at small widths. Neither is now hidden. Below 360px the complete brand occupies the first header row; menu and account/cart controls occupy a second row, retaining their touch-target sizes. Above that threshold the existing single-row header remains. The wordmark scales continuously and never truncates. A failing regression was checked before the fix; all six focused layout/media-policy checks and lint pass afterward. Local Chromium verified decoded logo, visible full-name text bounds, no brand/control overlap, and no page overflow at 200, 232, 299, 300, 320, 359, 360, 390, 430, 639, 640, 768, 1024, and 1440px. Screenshots `full-brand-{232,320,390}.png` are in the composition artifacts directory. The reusable public browser check now tests both logo and wordmark visibility. No production or authentication behavior changed; the earlier full-suite/build evidence predates this header-only follow-up.

### Combined mobile search/control row

The latest requested header combines menu, search, cart, and account in one row below the complete brand at widths below 1024px. Desktop retains its single-row header. One shared search form replaces the duplicate desktop/mobile forms; its mobile submit button uses a labelled search icon. A failing layout regression was observed before implementation, then six focused tests passed. Browser checks at 200/232/300/320/360/390/430/639/640/768/1023/1024/1440px verified row alignment, visible branding, no overlapping search/account areas, and no page overflow. At extreme 200px width the input is only 4px wide: this is an overflow check, not a claim of comfortable usability at that width. At 320px the input is 96px wide and submitting SIMULATED successfully reaches the shop search. `compact-header-320.png` was visually inspected; 232/390px captures are retained alongside it.

The preview initially retained old CSS, requiring a local restart. The first restart omitted `HASTABAZAAR_RUNTIME_ENV` and selected the default local state, producing missing-table errors. It was stopped and restarted with the documented guarded local-staging settings after verifying the existing staging marker; the original `.staging/state` data then rendered normally. No schema migration, seed, reset, production access, or configuration-file edit was performed. The current preview is the isolated staging checkout on loopback port 3000.

### Entire header in one row — supersedes the two-row header above (2026-09-27)

The user's clarification requires the brand itself, not only the controls, on the same row. The shared storefront header now places menu, full logo/name, search, cart and account in a single horizontal row. Below 640px search is a labelled icon opening the existing accessible dialog; from 640px the inline search field remains. Phone control widths and brand typography scale with available space. The logo/name are never hidden. Authentication, links and the GET `/shop?q=` search contract are unchanged.

`scripts/header-single-row-check.mjs` failed against the old two-row layout at 232px before implementation. It now passes at 232/280/320/360/390/430/639/640/768/1023/1024/1440/1920px, checking complete-row alignment, non-overlap, visible branding and no page overflow. Every phone width also exercises search open/close and restored focus; 320px additionally submits `handmade` and verifies `/shop?q=handmade`. No uncaught browser errors occurred. Screenshots at 232px and 390px were visually inspected. This browser regression replaces the obsolete CSS-text assertion that enforced two rows. The four focused layout tests, TypeScript and lint pass. Browser-plugin skill unavailable; validation uses the installed Chromium/Playwright runtime without adding dependencies. CLI documentation lookup was unavailable in offline npm cache; the existing local dialog implementation and types were inspected and reused.

Scope: local staging on localhost:3000 only. Extreme narrow widths use compact controls; this is not a claim of equivalent touch comfort or physical-device/Safari/Firefox certification. Earlier full-suite/build evidence predates this header correction. No production access, deployment, migration or data reset.
