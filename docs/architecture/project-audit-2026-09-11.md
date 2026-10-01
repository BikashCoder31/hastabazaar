# Hastabazaar project audit — 11 September 2026

## Decision

Prioritize **identity, permissions and purchase eligibility** before expanding features. This audit reproduced three security/business-control failures locally: an unverified password registration can claim an email-matched staff invitation; changing User-Agent resets the effective login throttle; and a published product remains purchasable with a suspended seller/profile owner. A fourth confirmed defect makes readiness report success with a required delivery table missing.

These are local reproductions, not evidence of production exploitation. No live authenticated workflows, customer records, emails, messages, provider calls, deployment or configuration changes were performed. No next-phase feature was implemented. The [proposed roadmap](proposed-roadmap-2026-09-11.md) awaits the owner's section choice.

## Scope, preservation and evidence rules

Reviewed the six requested documents first, then source, route guards, repositories, migrations, tests, deployment runtime and supporting architecture documents. The current working tree, including uncommitted work, was the audit target. No checkout, reset, commit, migration generation, dependency upgrade or source fix was made.

Application hosting remains Babal.Host, application root `/home2/hastabaz/hastabazaar-app`, startup `app.cjs`. The supplied production Node version is 22.23.2. This audit used Node 22.23.1 locally. Existing authentication, privileged-account configuration, media, returns snapshots, reward/discount records and disabled deposit/withdrawal policy were preserved. Private account addresses are intentionally omitted. Public support remains `support@hastabazaar.com`.

Status meanings:

- **Verified local:** freshly executed assertions, with scope specified. Repository tests do not prove a rendered browser journey.
- **Verified live read-only:** anonymous GET status/content/header evidence only.
- **Source-confirmed:** implementation inspected; its complete runtime journey was not freshly exercised.
- **Historical:** prior reports supplied by the owner; not counted as fresh verification.
- **Incomplete/dependency:** existing functionality with an explicit missing operational or external capability.
- **Optional:** improvement rather than a demonstrated defect.

## Fresh verification

Evidence is in `outputs/audit-2026-09-11/`.

| Check | Result and limits | Evidence |
|---|---|---|
| Existing automated suite | **82/82 pass**, no failures/skips. Uses isolated in-memory SQLite fixtures and fake mailers; fixture applies numbered migrations through 0027. | `tests.txt`; `tests/returns-complaints.test.ts:608` |
| TypeScript | **Pass**, `tsc --noEmit --incremental false`, including a final check after artifact housekeeping. | `typescript.txt`, `typescript-final.txt` |
| Babal production build | **Pass** in an independent source copy using existing dependencies. Original `dist`, `.next` and incremental cache were preserved. | `build.txt`; `scripts/build-babal.mjs` |
| Source/test lint | **Fail: 56 error diagnostics** from `oxlint app components lib tests`. Includes hooks, promise handling, deprecated event types, image/semantic rules and unused values. Not all diagnostics imply an actual user-facing defect. | `lint.txt` |
| MariaDB commerce integration | **Pass** after creating a fresh localhost-only MariaDB 11.4.9 instance/data directory. Initially connection-refused; then existing harness passed. New synthetic database only; no prior local DB reused. | `mariadb.txt`; `scripts/test-wallet-mariadb.ts` |
| Additional local authenticated HTTP checks | Staff invitation claim and User-Agent throttle bypass reproduced against the isolated Babal build with email/provider environment removed. Admin response 200 and granted role checked in DB. | `security-reproduction.json`, `.txt`, `.mjs` |
| Additional local commerce check | Suspended seller profile and suspended owner account still returned public product detail, accepted a cart item and created a COD order. | `seller-suspension.json`, `seller-suspension-reproduction.mjs` |
| Readiness fault injection | Removing `delivery_assignments` in the synthetic security database still returned `marketplaceReady: true`. Only the audit database was changed. | `security-reproduction.json`; `app/health/route.ts:12` |
| Live anonymous HTTP | 21 GET checks. Twelve public HTML pages and health returned 200; four account/dashboard gates returned 307; robots, sitemap, local test switcher and nonexistent delivery lookup returned 404. | `live-http.json`, `live-http.mjs` |
| Release identity | SHA256 matches deployment report; **3,216 ZIP entries**, `app.cjs` and `server.js` present. No deployment performed. Does not establish byte equality between current source and live server. | `release.json` |
| Workspace preservation | Before/after porcelain status matched before report creation. No existing application source changes introduced. | `worktree-before.txt`, `worktree-after.txt` |

Release SHA256: `9C7252A09DA937C2A7608D09F65284833C1C7EDA8E40DC08EE29F13B16DFB30C`.

The native database checks are valuable for the SQLite-to-MariaDB adapter, transactions and triggers, but MariaDB 11.4.9 is not exact production-version parity: hosting documentation identifies 10.11. Fresh checks covered commerce/referrals and targeted authentication/control defects, not every MariaDB workflow under load.

### Browser and production limits

The in-app browser failed to initialize with `helper_unknown_error: apply deny-read ACLs`. Web fetch also failed, but anonymous HTTP checks succeeded through the local Node runtime. Therefore **no fresh screenshots, desktop/mobile rendering, keyboard walkthrough, screen-reader test, real GPS test or browser performance measurement was obtained**. No visual audit or accessibility conformance is claimed. The historical 22 anonymous desktop/mobile checks and local functional screenshots remain historical evidence, not fresh results.

No live login, OTP/reset request, seller application, cart mutation, checkout, guest tracking POST, review upload, staff action, rider update or email retry was performed. Production role correctness, mailbox delivery and carrier settlement remain unverified. Public 200 responses and readiness do not prove those workflows work.

## Journey inventory: what already exists

| Journey/feature | Actual state and evidence | Remaining boundary |
|---|---|---|
| Password, Google, email-code and password reset | Present. Hosted sessions are hashed in DB, cookies HttpOnly/SameSite; active-user checks exist. Google validates issuer/audience, state/nonce/PKCE and verified email. Reset tests verify challenge consumption and session revocation. `lib/auth/hosted-session.ts`, `google-oauth.ts`, `password-reset.ts`; auth tests. | Registration/mailbox trust defect below. Actual Google exchange and inbox delivery not tested here. |
| Role routing | Staff precedence, approved seller next, customer fallback has fresh unit coverage. Seller access requires active user + seller role + approved profile. `lib/auth/sign-in-destination.ts`, `lib/auth/seller.ts:43`, `tests/sign-in-destination.test.ts`. Live anonymous gates redirect. | Live authenticated destinations not retested. |
| Seller application/approval | Signed-in email must match application; existing accounts cannot be attached anonymously. Approved seller resolution preserves existing auth subjects. `app/api/seller-applications/route.ts:58`, `lib/db/repositories/seller-applications.ts`, `lib/auth/seller.ts`; seller-link tests. | Do not infer the historical complainant is approved or repaired. Verification documents and real approval decisions need authorized review. |
| Product publishing/archive/delete/unpublish | All present. Archive/delete ownership/state and active Super Admin unpublish have fresh DB regressions. Logical deletion retains product/order history; unpublish returns product to review. `lib/db/repositories/products.ts:849`, `:1286`, `:1312`; tests at `returns-complaints.test.ts:2713`. | Suspension is not enforced consistently at purchase time. Do not add duplicate product controls. |
| Product estimates, preparation and returns | Shared delivery calculation; one tariff per order, maximum item preparation + transit. Product return eligibility and order policy are snapshotted. `lib/checkout/validation.ts:144`, `lib/db/repositories/orders.ts:191`; mixed-seller test at `:1259`. | Free-text districts lack authoritative serviceability; spelling and arbitrary names can fall into nationwide defaults. |
| Cart/checkout/COD | Durable cookie cart; integer paisa, server pricing, idempotency, transactional inventory reservation, policy acceptance and receipt protection. Fresh SQLite and native MariaDB checks pass. `lib/db/repositories/cart.ts`, `orders.ts`; `deployment/babal/mariadb-referrals-wallet.sql` inventory trigger. | Not a fresh end-to-end browser checkout. Purchase eligibility gap below. |
| Multi-seller preparation and shipping | Seller fulfillment is item-scoped; aggregate order becomes ready when all sellers are ready. Existing shipping jobs are order/seller/direction-scoped. `lib/db/repositories/fulfillment.ts:227`, `operations.ts`; `docs/architecture/order-fulfillment.md`. | Final shipment, delivery assignment, dispatch/delivery and customer tracking remain whole-order. Separate operational jobs are not independent customer parcel tracking. |
| Delivery/COD collection and seller earnings | Staff dispatch/deliver/cancel exists. Deliver also captures COD and accrues immutable seller ledger entries; payouts have maker-checker protections. Tests exercise ledger/refund effects and native cash/credit flow. `fulfillment.ts:413`, `:575`, `payouts.ts`. | Delivered, paid by buyer and carrier-remitted are not equivalent business events. Manual payout and refund references are records, not bank integrations. |
| Promotional wallet/referrals | Separate sections exist; Rs. 50 future friend discount/reward, campaign controls, wait windows, case holds, atomic spend/restoration and historical-value preservation have fresh assertions. `wallet.ts`, migration `0024_referral_offer_fifty.sql`; native suite. | Deposits/withdrawals remain disabled. Customer wallet is distinct from existing seller settlement requests. Phone abuse controls rely on user-supplied contact information. |
| Returns/refunds/complaints | Item-level cases, policy snapshots, statutory-review paths, partial quantities, evidence, liability, independent high-value approval and exactly-once ledger/stock outcomes exist and are extensively tested. `returns.ts`, `complaints.ts`; tests `:2330`, `:2582`. | Manual transfer/destination verification, physical collection and retention decisions remain operational. Do not rebuild returns from scratch or rewrite old snapshots. |
| Notifications and guest tracking | Transactional order-email outbox, leases/retries, redacted errors, protected scheduler and coarse guest tracking exist. Fresh tests include concurrent mail claims, failure retry and private-field exclusion. `lib/email/order-updates.ts`, `app/api/jobs/order-emails/route.ts`, `order-tracking.ts`. | Optional retry cron not configured according to latest deployment report; not independently rechecked in cPanel. Generic notification outbox is separate; SMS delivery is not connected. |
| Reviews/photos/replies | Verified delivered purchase, up to three validated images, moderation and versioned seller replies exist. Private/public access and stale decision tests pass. `review-extras.ts`, `lib/reviews/uploads.ts`; review-photo route. | Image metadata is not stripped; signature checks are not transcoding or malware scanning. |
| Address pins/riders/couriers | Optional finite coordinate validation, manual fallback, explicit sharing, assignment-only updates, two-minute freshness and closure cleanup exist. DB tests pass. `lib/delivery/repository.ts`, `components/delivery/rider-sharing.tsx`; migration 0027. | Active browser/device required; no background guarantee. Manual courier company/reference/HTTPS link only. No booking/webhooks/courier GPS. |
| Protected customer tracking | Owning account or receipt cookie required for delivery details; anonymous delivery GET denied. Customer response omits rider email/address. `app/api/orders/[orderNumber]/delivery/route.ts`, `lib/delivery/repository.ts:4`. | No live order's GPS/receipt access tested; public coarse tracking must stay separate. |
| Public information/discovery | About, Contact, Shipping, Returns, Privacy, Terms and referral terms respond live. Shop filtering/pagination, maker profiles, wishlist and product titles/descriptions already exist. `lib/content/public-pages.ts`, `app/shop/page.tsx:74`, product `generateMetadata`. | SEO metadata coverage and fresh mobile/accessibility acceptance remain incomplete. |

### Historical seller-access complaint

The owner reports no matching application was found for the historical complainant. Source fixes and synthetic seller-link tests do not establish that account's application, ownership or approval. `docs/architecture/seller-access-investigation.md` retains unresolved live access evidence; `approved-seller-link-fix.md` describes a separate generic fix. This audit did not inspect or alter the live account, did not associate another business, and does not mark the complaint resolved.

## Prioritized findings

Effort is an initial engineering estimate excluding waiting for providers and production approval: S = roughly 1–2 days, M = 3–5 days, L = 1–2 weeks. P1 means urgent before expanding usage; P2 means next-phase reliability/privacy work; P3 means later polish. No P0 production compromise is asserted.

### F01 — P1: staff invitation can be accepted without mailbox proof

**Confirmed local bug; impact: unauthorized staff access; urgency: before new staff invitations; effort M.** Password registration immediately creates an active session for the supplied email (`app/api/auth/register/route.ts:64`). `acceptMatchingInvitation` looks up a pending invitation by `identity.email` and grants its role (`lib/auth/staff.ts:169`, role insertion later in that function), without a verified-email state or a mailbox-bound invitation claim.

In the isolated production build, a pending synthetic Admin invitation followed by password registration and an Admin GET yielded an Admin role and HTTP 200 without any mailbox challenge. Evidence: `security-reproduction.json`. Preconditions include knowing/guessing an invited address not already protected by an existing registration. This is not proof that any existing privileged account was compromised. Bootstrap has a no-existing-active-Super-Admin guard and must remain safely recoverable.

Related source risk: Google callback joins an existing account by email (`app/api/auth/google/callback/route.ts:42`) and retains its password credentials/sessions. A previously unverified password account may therefore remain accessible when the genuine mailbox owner later uses Google. That full external-provider scenario was not reproduced. Resolve both through explicit verified identity/account-linking rules, without breaking existing users or privileged access.

### F02 — P1: caller-controlled User-Agent bypasses login throttling

**Confirmed local bug; impact: credential abuse and resource consumption; urgency: immediate hardening; effort S–M.** `lib/http/rate-limit.ts:8` hashes scope, forwarded address and User-Agent. After eleven same-agent invalid login attempts produced `error=rate`, a different User-Agent immediately returned `error=invalid`, proving another credential check was permitted. Evidence: `security-reproduction.json`.

Use independent account and trusted-client/network budgets that cannot be reset by rotating User-Agent. The trust of `cf-connecting-ip`/`x-forwarded-for` behind Babal's proxy also needs verification; spoofing those through production was not tested. Keep shared-network users and denial-of-service lockouts in mind. No aggressive live probes were run.

### F03 — P1: suspended seller remains purchasable

**Confirmed local bug; impact: new orders to a seller unable/unauthorized to fulfill; urgency: before relying on suspension; effort M.** Catalog lists check approved profile state, but direct product detail (`lib/db/repositories/products.ts:1236`), cart insertion (`cart.ts:108`), checkout item checks (`orders.ts:160`) and the MariaDB reservation trigger check publication/stock without enforcing seller/profile owner eligibility consistently.

With both profile and owner set to suspended in the synthetic fixture, detail loaded, cart accepted the item and a COD order committed. Evidence: `seller-suspension.json`. A second fresh reproduction with an approved profile and the exact disabled-owner state also created an order (`seller-disabled-owner.json`). Staff governance separately disables users (`operations.ts:852`); its active-account denial does not itself unpublish products. Add a shared purchase-eligibility rule with transactional enforcement against concurrent suspension. Preserve already-recorded orders and their aftercare.

### F04 — P2: readiness can report success with missing current schema

**Confirmed local defect; impact: misleading deployment/monitoring signals; effort S–M.** `app/health/route.ts:12` only checks `0020_snapshot`, while current functionality depends on later tables and triggers. A synthetic missing-delivery-table fault still reported marketplace ready. Moreover the route returns 200 even if the marker is absent and readiness is false. Evidence: `security-reproduction.json` and source.

Separate process liveness from release-specific readiness. Verify the required migration manifest/tables/triggers without exposing schema details publicly; return an unhealthy status when readiness fails. Never use a base/reset import as repair.

### F05 — P2: email recovery and notification ownership are operationally incomplete

**Known configuration gap + source-confirmed boundary; impact: delayed/missed customer updates; effort S–M.** Latest deployment says cron was not configured. Existing endpoint processes at most six eligible jobs per invocation; SMTP success means acceptance, not inbox delivery. Without unattended retries, recovery depends on later order activity or staff intervention. `docs/architecture/order-updates.md`, `app/api/jobs/order-emails/route.ts`, `lib/email/send-order-updates.ts`.

`orders.ts:341` also creates generic customer email/SMS notification rows, while actual order mail uses `order_email_jobs`; these are distinct outboxes, not proof of duplicate emails. Customer UI filters to in-app notifications, so do not claim queued SMS/email is publicly shown as delivered. Establish one documented source for mail delivery status, queue-age monitoring and Babal cron recovery. This audit did not configure cron or send mail.

### F06 — P2: whole-order fulfillment does not model independent parcels/COD remittance

**Incomplete capability, not a calculation bug; impact: multi-seller exceptions, support workload and reconciliation; effort L.** Shipping tariff is intentionally charged once. Sellers prepare individually and operations can record seller shipping jobs, but dispatch/delivery/COD capture and rider assignment are whole-order. `fulfillment.ts:227`, `:413`, `:466`, `:575`; `lib/delivery/repository.ts`; delivery architecture doc explicitly states this boundary.

If sellers ship separately, partial delivery, failed delivery and parcel references need coherent customer presentation. Preserve the present tariff until the owner approves a commercial change. Record buyer cash collection separately from courier remittance; do not interpret staff-marked delivery as proof of bank receipt. Existing payout/refund maker-checker records should be extended, not duplicated.

### F07 — P2: upload body bounds and metadata protection are uneven

**Source-confirmed gaps; runtime resource-exhaustion exploit not attempted; impact: memory pressure/privacy; effort M.** Reviews use a streaming 16 MB cap (`lib/reviews/uploads.ts:20`). Seller applications (`app/api/seller-applications/route.ts:38`), product submissions and return uploads rely on Content-Length checks before `formData()`, then per-file validation. Unknown/chunked request size can reach parsing without that application-level bound. The Server Actions body setting is not proof of an equivalent cap for every route handler; actual Babal proxy limits remain unverified.

Apply bounded streaming parsing consistently. Customer review images retain original bytes/metadata, as documented in `review-photos-replies.md`. Moderation/access protection exists, but a warning does not remove EXIF location data. Consider safe image decoding/transcoding, dimensions limits and metadata removal; preserve private originals only if an approved retention purpose requires them. Do not bulk-rewrite existing uploaded media during a feature change.

### F08 — P2: public response security headers are incomplete

**Verified live header absence on sampled HTML; impact: defense in depth; effort S–M.** Sampled home/shop/login responses lacked CSP, frame protection, HSTS, Referrer-Policy and nosniff. Evidence: `live-http.json`. This is not proof of XSS or clickjacking exploitation. Private review-photo route already applies restrictive CSP/nosniff, so avoid claiming headers are absent everywhere.

Validate Babal/Node header ownership; test a compatible policy against Google sign-in, scripts/styles, media and maps. Preserve opt-in geolocation. Stage HSTS carefully after validating HTTPS coverage rather than assuming all subdomains are ready.

### F09 — P2: SEO coverage is incomplete

**Verified live/source gap; impact: discovery and share quality; effort M.** `/robots.txt` and `/sitemap.xml` returned 404. Root/shop HTML lacked canonical and structured-data tags. Product-specific title/description generation already exists (`app/products/[slug]/page.tsx:44`); do not rebuild that. Root metadata (`app/layout.tsx:4`) does not supply canonical/Open Graph defaults; `/track` already has noindex.

Add published-only canonical URLs, sitemap, intentional robots/noindex behavior and valid Product/Offer/Breadcrumb metadata where backed by real data. Never include orders, receipt links, private media or account/admin/rider data. Filter combinations should avoid unlimited duplicate indexable pages. Do not fabricate ratings, stock, delivery guarantees or legal identifiers.

### F10 — P2: quality gate and deployment documentation have drifted

**Confirmed lint failure and documentation inconsistency; impact: release errors and regression risk; effort M.** 56 source/test lint errors remain despite successful tests/typecheck/build. Fix meaningful errors, evaluate rule-only diagnostics, and make the intended gate explicit. Existing browser scripts depend on fixed Windows runtime paths, a specific local port and retained preview fixtures; fresh reproducibility needs improvement.

`README.md` still describes private hosting/unsent transactional email and a non-Babal default build/start path. `product-archive.md` and `product-delete-unpublish.md` retain “not deployed” statements superseded by `deployment-delivery-maps-2026-09-11.md`. SQLite migrations/journal reach 0027; Babal base schema represents 0020 and requires the documented additive migration sequence. Produce one current release/migration manifest and distinguish archived instructions. Do not rerun old migrations blindly or introduce another host.

### F11 — P2/P3: mobile/accessibility and performance require fresh acceptance

**Unverified runtime quality + source observations; effort M.** Source has mobile navigation, visible focus styling, reduced-motion CSS, labeled address fields and polite status regions. Lint flags map effect dependencies and review-image semantics. These are leads, not a measured WCAG failure. No current screenshot evidence is available.

Capture shop → product → cart → checkout → receipt/aftercare and seller/admin/rider flows at mobile/desktop widths after browser tooling recovers. Test keyboard/focus, validation announcements, dialog focus, 200% zoom, 320 px layout, touch targets, denied GPS and map-load failures. Public home/shop responses were approximately 170 KB/116 KB of decoded HTML and `no-store`; one network sample is not Core Web Vitals. Measure LCP/INP/CLS, image payloads and DB query costs before choosing caching or bundle work. Do not cache private/session-specific content publicly.

### F12 — P3: address normalization and operating evidence can mature

**Optional enhancement with operational dependencies; effort M.** Free-text district and permissive phone checks exist; arbitrary district text gets a nationwide quote and ward validation accepts zero despite saying 1–99 (`lib/checkout/validation.ts:99`). A normalized district/province/serviceability model would reduce avoidable delivery errors. Validate changes against existing addresses and do not silently reprice old orders.

Backup/incident/privacy registers record evidence; they do not schedule backups, prove restorability or perform legal erasure. Historical backup exists in deployment report, but fresh restore/RPO/RTO, storage capacity, expiry cleanup and production alert ownership were not audited through cPanel. An approved local restore drill and Babal operations runbook are appropriate before higher traffic. Legal-policy adequacy and retention schedules need accountable owner/professional review; this is not a legal compliance certification.

## External dependencies versus optional enhancements

- **Courier booking/webhooks/GPS:** require selected courier's official contract, API/sandbox, status mapping and webhook verification. Existing manual assignment and seller shipping jobs already exist. No integration credentials, provider account or paid subscription was created.
- **Rider background tracking:** current browser page cannot guarantee it. A background-capable application is a separate, optional project with device permissions, consent and operating requirements; it is not a small map fix.
- **Email:** SMTP order sender exists. Babal cron and monitored mailbox acceptance require a later explicitly authorized operational step; SMS is a separate provider dependency.
- **Maps:** current optional OpenStreetMap tiles are external and have no project-owned availability guarantee. Keep written-address fallback; review provider capacity/terms before scaling.
- **Money movement:** customer wallet remains promotional/COD-only. Bank transfer, courier remittance imports and payout destination verification are separate from existing ledger/payout records. Deposits and withdrawals must stay disabled.
- **Optional growth:** Nepali localization, richer search, analytics, image optimization and advanced recommendations should follow security and operational acceptance, not duplicate existing filters, wishlists, reviews or referrals.

## Recommended sequence

1. Identity, permissions and purchase eligibility — F01–F03 plus bounded uploads/privacy and compatible headers.
2. Order, delivery and operational reliability — F04–F06 plus release/runbook gates and existing returns/settlement integration.
3. Customer journey, mobile accessibility and discovery — F09/F11/F12, measured performance and clear per-parcel communication.

Concrete scope, acceptance criteria, effort and dependencies are in the [roadmap](proposed-roadmap-2026-09-11.md). No next section begins until the owner chooses it.

