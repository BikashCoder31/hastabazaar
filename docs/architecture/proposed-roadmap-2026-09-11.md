# Hastabazaar proposed roadmap — 11 September 2026

Status: **section 1 selected and implemented locally on 12 September 2026; deployment pending**. See the [section 1 implementation and acceptance report](section-one-security-2026-09-12.md). Section 2 was approved and its local implementation verified on 13 September 2026, including separate seller parcels and explicit cash records; see [section 2 local implementation](section-two-operations-2026-09-13.md). Section 3 was approved and implemented locally on 13 September 2026; see [section 3 customer journey report](section-three-customer-journey-2026-09-13.md). All three sections await deployment acceptance. Based on the [project audit](project-audit-2026-09-11.md), including fresh local reproductions. Estimates assume one engineer and exclude provider waiting time, operational approvals and deployment. They are planning ranges, not commitments.

## 1. Identity, permissions and purchase eligibility — recommended first

**Why:** three locally reproduced failures affect staff privilege, abuse prevention and whether sellers can receive new orders. Feature expansion increases their potential impact. Existing sign-in, seller approval and product controls should be hardened rather than replaced.

**Scope (roughly 1–2 weeks):**

- Establish verified-email/session trust for registration, staff invitation claims and provider linking. Include the unverified-password-before-Google account scenario. Preserve current password, Google, OTP, reset and role-routing paths with a safe legacy-account transition.
- Enforce account and trusted-network request budgets independent of User-Agent; document Babal proxy trust and avoid global lockouts for shared networks.
- Centralize purchase eligibility across listing/detail/media as appropriate, cart, checkout and reservation transaction. Approved profile + active owner + published/in-stock product must agree. Closing or suspending a seller must not erase or prevent operations handling old orders/returns.
- Apply bounded request parsing consistently to uploads. Add safe image metadata/dimension handling for new review uploads, with privacy-preserving failure behavior.
- Add compatible security headers after testing auth/media/maps. Audit staff maker-checker paths and sensitive mutation permissions against the current role matrix.

**Acceptance criteria:**

1. A synthetic unverified password account cannot claim Admin/Super Admin invitations; only demonstrated mailbox control/approved verification can do so. Expired/revoked/wrong-account invitation claims fail. Existing privileged access and recovery pass regression tests without exposing private addresses.
2. Password, Google linking, OTP, reset/session revocation and customer/seller/staff routing all pass local positive and negative tests. Previously unverified password sessions cannot silently retain access to an account claimed through verified identity.
3. Once an account/client budget is exhausted, rotating User-Agent or untrusted forwarding headers does not permit another credential attempt. Legitimate shared-network and recovery cases have documented behavior.
4. Disabled/suspended owner, unapproved/suspended seller and unpublished/deleted products cannot create new orders through UI, direct API or concurrent checkout. A concurrent status change rolls back reservation/credit consistently. Old snapshots, orders, reviews and aftercare remain intact.
5. Oversize uploads without Content-Length are rejected within a measured application bound; valid uploads still work. New published images contain no location EXIF data. Authorization tests cover customer, unrelated customer, owning/other seller, Admin and Super Admin.
6. Existing 82 tests, new defect regressions, typecheck, Babal build and relevant native MariaDB tests pass. Lint scope/failures are resolved or explicitly justified. Desktop/mobile auth/upload acceptance is recorded when browser access is restored.

**Dependencies:** safe local fixtures; Babal proxy behavior; an agreed migration path for existing unverified accounts. SMTP delivery acceptance can use mocks locally and a later explicitly authorized designated inbox. No production account migration or deployment without separate authorization. Historical seller complaint stays unresolved unless its own application/account evidence is reviewed.

## 2. Order, delivery and operational reliability

**Why:** commerce, returns, wallet and dispatch already exist. The next gain is trustworthy order state, cash reconciliation and recovery from failures, rather than another parallel order system.

**Scope (roughly 2–3 weeks, split into reviewable increments):**

- Add release-specific readiness for required schema/triggers and a single current Babal release/migration manifest. Separate liveness from readiness and document additive rollback.
- Make unattended email retry and queue-age/error monitoring operationally clear using existing order-email jobs and Babal cPanel cron. Clarify the separate generic notification outbox and unsupported SMS channel. Prepare configuration/runbooks locally; enabling cron/sending messages requires later authorization.
- Extend existing order/seller shipping jobs into a coherent parcel model where needed. Preserve the current one-charge tariff and order-policy snapshots. Define partial handoff, partial delivery, failure, cancellation/return-to-origin and reassignment behavior.
- Separate recorded delivery, buyer COD collection and courier remittance/reconciliation. Show outstanding cash and discrepancy handling, with idempotent audit/ledger effects and existing maker-checker settlement controls.
- Integrate parcel exceptions with existing item returns, complaints, payout holds and promotional credit/referral calculations. Do not implement bank transfer APIs or customer wallet cash features.
- Prepare restore drill, incident response, queue/reconciliation ownership and production-version MariaDB acceptance. Keep hosted operations entirely on Babal.Host.

**Acceptance criteria:**

1. Removing any required new table/trigger in an isolated fixture makes readiness fail with an appropriate unhealthy status; liveness remains independently understandable. Healthy readiness does not leak internal details.
2. Simulated SMTP failure recovers on retry without rolling back commerce. Concurrent workers cannot claim the same current lease. Crash-after-acceptance duplicate risk is documented; stale messages communicate current state. Queue-age and failed-job ownership are visible to staff.
3. A two-seller order can be prepared independently and represented accurately through split delivery/failure scenarios. Seller A cannot read/change seller B's parcel; the customer sees only their own references and actual statuses. One tariff remains unchanged unless separately approved.
4. Partial delivery does not mark every item delivered or release unrelated money/rewards. Collected versus remitted amounts reconcile in paisa; repeated references/events cannot duplicate cash/ledger effects. Manual evidence is required for recorded off-system transfers.
5. Reassignment removes old rider access; stop/closure/staleness suppress location; customer tracking remains receipt/account protected. Whole-order behavior remains compatible for old records.
6. Existing and new historical-snapshot, credit restoration, partial-refund and maker-checker tests pass on isolated SQLite and the production MariaDB major/minor version. A restore drill verifies media and data consistency without restoring over live activity.

**Dependencies:** section 1 purchase/access controls; owner's chosen real-world parcel and cash-handling rules; designated operations staff. Manual operation can ship without a courier API. Booking/webhooks require the selected courier's official documentation, sandbox, contract and signature rules; provider work should be a separate adapter after those exist. Babal cron/backup changes and any live test messages require authorization.

## 3. Customer journey, mobile accessibility and discovery

**Why:** discovery and conversion depend on customers finding the site and understanding delivery, returns and order progress. Existing product metadata, filters, pagination, wishlists, reviews and referrals give a useful foundation. Fresh visual evidence is currently missing, so start by measuring the actual screens.

**Scope (roughly 1–2 weeks):**

- Capture and test home/shop → product → cart → checkout → receipt/tracking/returns on desktop and mobile, including guest and signed-in paths. Include seller application recovery and key staff/rider mobile controls.
- Improve field validation, focus/error recovery, keyboard/dialog behavior, touch targets, zoom and slow-network/GPS failure states from observed defects. Keep manual addresses fully usable without maps.
- Normalize district/province choices and aliases with explicit serviceability/quote behavior; correct ward validation. Preserve old address and rate snapshots.
- Add published-only sitemap/robots/canonical and evidence-backed product/share metadata; exclude private and account URLs. Avoid indexing filter duplicates or exposing credentials through URLs.
- Measure real LCP/INP/CLS and payloads; optimize images, public data queries and loading only where measurements justify it. Keep public caching isolated from authenticated/private content.
- Make delivery estimates, one-charge/multi-seller behavior, promotional-wallet limits and return terms consistent across product, checkout and tracking. Connect to section 2's parcel model when available.

**Acceptance criteria:**

1. Recorded desktop and 320/390 px mobile walkthroughs have no blocking overflow, unreachable actions or unexplained validation failures; 200% zoom and keyboard-only critical paths work. Focus order, accessible names, errors and status announcements are manually checked; automated accessibility findings are triaged, not treated as conformance proof.
2. Guest/COD and signed-in promotional-credit checkout display matching server totals and return/delivery terms. Map denial/network failure does not block manual checkout. No arbitrary district silently receives a misleading guaranteed quote.
3. Sitemap and robots return valid responses. Canonicals are stable; product structured data reflects actual published price, stock and approved reviews. Accounts, orders, receipts, admin/rider pages and private media are absent from discovery artifacts.
4. Measured performance baselines and chosen budgets are saved for representative mobile/desktop pages. Improvements show a repeatable gain without breaking media privacy or auth isolation. Do not invent Core Web Vitals from raw HTTP timing.
5. Existing search/filter/pagination/review/referral functionality remains covered; no duplicate feature systems or new branding are introduced. Public support contact remains correct. Deposits/withdrawals stay disabled.

**Dependencies:** working browser capture/test tooling; section 1 security fixes; product/operations confirmation of service areas. Section 2 is needed for final split-parcel wording, but SEO/accessibility work can proceed independently. Nepali localization and background rider apps are optional later projects, not included automatically.

## Suggested choice

Choose **section 1** first. Section 2 follows because accurate fulfillment and recovery protect both customer trust and seller finances. Section 3 improves reach and conversion once those controls are dependable. The audit is not authorization to implement or deploy any of these sections.
