# Section 3 — customer journey, accessibility and discovery

Date: 13 September 2026. Status: implemented and verified locally; cumulative candidate prepared. **Not deployed.**

This continues the approved third section of the 11 September audit roadmap. Source, documentation and prior verification were inspected before extending existing components. Work uses isolated synthetic data, local Windows Node 22.23.1, MariaDB 11.4.9 and headless Chrome. Babal Node 22.23.2 and its actual MariaDB version remain deployment-time acceptance gates. No production requests, deployment, real messages or customer-record changes were made during implementation. An official census document was read solely to check administrative district names.

## Confirmed gaps and changes

| Finding | Impact | Resolution and evidence |
| --- | --- | --- |
| Arbitrary district text received the nationwide tariff; province mismatch was accepted. Known aliases could select the wrong price band. | Incorrect quote/address and avoidable failed delivery. | `lib/checkout/nepal-address.ts` defines district/province membership and explicit spelling aliases. Checkout and saved-address writes validate new input; unknown/ambiguous districts receive no quote. Product and checkout datalists help customers choose. `tests/customer-journey.test.ts`, `address-red.txt`, `address-green.txt`. |
| Ward `0`/`00` passed checkout; saved-address ward was unvalidated. | Invalid delivery information. | Both write paths now accept optional numeric wards 1–99 and normalize leading zeroes. This is a format/range check, not a municipality-specific ward registry. Existing stored addresses and order snapshots are untouched. |
| Checkout silently disabled submission before district/policy completion; server errors did not receive focus. | Poor keyboard/error recovery. | Client shares server validation, explains invalid district/province choices, and focuses the error summary. Native field checks remain. Address form opening/error recovery and root skip links now have working focus destinations. Optional GPS shows progress; denial keeps manual checkout usable. A screenshot exposed smooth-scroll hiding the focused heading beneath the sticky header; `skip-link-red.txt` reproduces this after scroll completion, and the existing scroll margin now also covers main landmarks. |
| Guest delivery panel called `/api/orders/.../delivery`, outside receipt cookie `Path=/orders`. | Guest receipt could not authenticate its delivery-panel request. | New `/orders/[orderNumber]/delivery` route reuses the existing authorization handler; the panel uses this path. Cookie scope remains unchanged. Existing API is retained for compatibility. Final browser regression requires guest-cookie 200 and unrelated-browser 404. |
| Every representative page fetched the large source logo twice, including its favicon. | Roughly 3.1 MB of avoidable transfer per uncached visit. | `scripts/prepare-brand-assets.mjs` generates 96 px display and 32 px icon assets during Babal build. Original logo is preserved. The two delivered files total 19,007 bytes; no branding redesign or uploaded media rewrite. |
| No sitemap/robots routes; product metadata lacked stable canonical/share/structured data. | Weak public discovery and duplicate/private indexing risk. | `lib/seo/discovery.ts`, `/sitemap.xml`, `/sitemaps/[page]`, `/robots.txt`, product/shop metadata and middleware. Sitemap partitions use the same published/approved/active/not-deleted eligibility as the storefront. Product JSON-LD uses stored NPR price/stock and aggregate **published** reviews, safely escaped. No invented ratings, shipping guarantees or review endorsements. |

District membership is checked against the [Nepal census district/province tables](https://docs.censusnepal.cbs.gov.np/Documents/2a8c0376-7ecd-4a43-b6f4-d37441baa8b6__Population_District_Level.pdf). Existing province names are retained. Ambiguous Nawalparasi/Rukum require East/West; explicit aliases include Dhanusa/Dhanusha, Chitawan/Chitwan and Kapilbastu/Kapilvastu. **Administrative inclusion is not courier coverage.** The existing Rs. 150/180/250 one-charge tariff remains; estimates explain that coverage is confirmed during processing. No new courier service commitment was inferred from the census.

## Discovery and privacy behavior

- Public static entries and product sitemap partitions contain only canonical public URLs. Products leave the sitemap immediately when publication/owner/seller eligibility closes; XML uses `no-store` and escaped values.
- Shop query/filter variants canonicalize to `/shop` and receive `noindex`. Product canonical URLs encode the stored slug. Public informational pages use stable canonical links where their existing metadata is defined.
- Private, authentication, cart, checkout, receipt, rider and API responses receive `X-Robots-Tag: noindex, nofollow`; robots contains corresponding crawl exclusions. These are indexing hints, **not access control**. Existing session/receipt/role checks remain authoritative.
- Public HTML also contains signed-in navigation, so middleware explicitly uses private/no-store caching; no shared authenticated HTML cache was introduced. Product media access still depends on its existing server eligibility/authorization checks.
- Sitemap does not enumerate customer names, addresses, order numbers, tokens, uploaded private evidence or account URLs. Product structured data includes only public product media URLs and aggregate approved rating facts.

## Local verification

Evidence root: `outputs/section-three-2026-09-13/`.

- `tests-final.txt`: **100/100** automated tests pass, no failures/skips. Includes the original 94 and six new address/discovery regression tests, including inherited-property input rejection (`alias-red.txt` / `alias-green.txt`).
- `types-final.txt`: TypeScript passes. `lint-scoped.txt`: application, tests and all section-three modified scripts pass without rule suppression. The broader `npm run lint` result in `lint.txt` includes inherited preflight CommonJS/old verification-script warnings; those unrelated files are preserved. The initial new datalist/progress-label findings were corrected.
- `build-final.txt`: successful Babal production build in a separate directory. Original workspace build directories were not replaced.
- `baseline/integration.json`: screenshots and local browser resource/LCP/layout-shift baseline at 320/390/1440 px before application edits. Browser plugin was not available; existing regular Playwright/Chrome was used, with external browser requests blocked.
- `final/integration.json`: **61 screenshots**, customer journey assertions and screenshots at 320/390/1440 px. Home/shop/product/cart; cart-load failure/retry; no arbitrary-district quote; map permission denial; keyboard policy error recovery; guest COD receipt and email/order-number tracking; saved-address mismatch/correction; first-order signed-in wallet + friend discount; actual delivered-item return request; review moderation reflected in structured data; seller access recovery/application pages; wallet/referral pages; mobile filter dialog Escape/focus; desktop 200% CSS zoom. No blocking horizontal overflow or page exceptions. CSS zoom is a local reflow proxy, not OS/browser assistive-technology certification.
- `edge/integration.json`: final-build browser and HTTP regression for inherited-property district inputs (no crash/HTTP 400), valid-alias checkout and guest receipt-cookie delivery access.
- Guest fixtures total Rs. 1,180 (Rs. 1,000 + Rs. 180 delivery). Signed-in fixtures total Rs. 2,000 (Rs. 2,000 products + Rs. 150 delivery − Rs. 100 synthetic promotional credit − Rs. 50 friend discount). Native order amounts and retained return-policy JSON are asserted. Synthetic starting credit is fixture setup, not a new deposit feature.
- `operations/integration.json`, `operations-log.txt`: inherited native security/parcel regression extended to **320/390/1440 px**. Staff parcel preparation, two-seller dispatch/partial delivery, assignment/reassignment, inaccessible stale rider assignment, cash collection/idempotency, maker-checker remittance and unchanged totals/policies; all readiness tables/triggers tested individually; authentication and protected photo checks. This ran before the final guest-route-only change; its handler/permissions remain reused.
- Earlier fixture/navigation diagnostics are superseded by the final passing run. `pre-guest-tracking-fix.json` preserves the actual guest delivery symptom that prompted the route correction. No production workflow is claimed verified by these local results.

## Performance measurement limits and budgets

Resource timings were collected in Chrome with request routing disabling cache, all remote browser traffic blocked and synthetic catalogue data. The original logo response appeared twice at 1,556,229 transfer bytes each. The new display PNG is 16,616 bytes; favicon PNG is 2,391 bytes. Comparable public page visits remove roughly 3.09 MB of transferred logo content. This byte reduction is deterministic and visible across all three viewport widths; timing values vary with local CPU/build warm-up.

`performance-summary.json` records comparable per-page payloads, browser LCP and maximum session-window CLS, plus observed Event Timing durations. **These are lab readings, not field Core Web Vitals or a claimed INP score.** The script retains interaction durations; absence of an entry means below the observer threshold/no measured interaction, not zero latency. Baseline CLS stored the sum of qualifying shifts; the final probe uses the standard 1-second gap/5-second maximum session window. Do not interpret that instrumentation change as a measured CLS improvement.

Local budgets: combined logo/icon <=25 KB; unfiltered home/product transfer <=1.6 MB with these fixtures; local LCP <=2.5 s when a candidate exists; layout-shift window <=0.1 on initial home/product/checkout. Record, investigate and explain exceptions rather than claiming production performance from loopback timings. Large real catalogue photos, slower devices/networks and field INP need later measurement; the synthetic catalogue is not a production traffic sample. No catalogue upload/media pipeline or authentication caching was replaced speculatively.

## Local candidate

`outputs/hastabazaar-customer-section-three-2026-09-13.zip` is cumulative over the latest deployed delivery-maps release, section 1 and section 2. Its adjacent `.manifest.json` records the SHA-256 and every packaged file hash. Packaging checks source/build identity, Linux native dependency integrity and every ZIP entry. No environment files, synthetic databases or test media are packaged.

## Preservation and deployment handoff

No new database migration is required by section 3. The cumulative candidate includes pending section-one `mariadb-identity-purchase-security.sql` and section-two `mariadb-parcel-operations.sql`, plus the release-specific manifest. Never run the base/schema reset over existing data. Prior deployed and local candidate ZIPs remain intact. No Git reset, checkout or commit was made.

Return-policy snapshots, earned rewards/discounts, existing balances, authentication, privileged access, original branding/media, one delivery charge and disabled deposit/withdrawal behavior are preserved. The historical seller-access complaint remains unresolved without that account's own evidence; no business was linked to it.

Deployment-time work remains on Babal.Host: backups/preflight, exact MariaDB compatibility, pending migrations in maintenance order, authenticated real-role acceptance, HTTPS/security/cookie checks, real inbox acceptance and optional email retry cron. No cron was enabled, no messages sent, and no courier booking/webhook/GPS integration was added. Browser-only rider sharing still requires an active device.
