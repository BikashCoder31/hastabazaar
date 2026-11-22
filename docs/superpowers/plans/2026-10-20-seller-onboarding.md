# Seller onboarding routes — local implementation

**Goal:** Offer clearly explained company-supplier and registered-business routes, with prospective private evidence requirements and no automatic permission to sell.

**Execution:** Main agent implements and controls the server/database. Separate GPT-6.1 Sol reviewers at extra-high reasoning review code and tests. No migrations, seeding, resets, imports, deployments, pushes or real account activation.

## Design and gaps found before implementation

The existing application, seller participation, immutable maker agreement, private documents, operational addresses, review queue and financial snapshots are reused. The inspection found optional personal PAN/bank evidence, discarded sole-proprietor registration fields, no legal/accounting clearance record, misleading seller/store wording and personal-PAN reuse during business transition.

- [x] Add a prospective intake contract for all new HTTP applications. Keep exact historical replay and legacy records separate. Require personal PAN/certificate and government ID for company suppliers; registration/business PAN/representative ID and applicable VAT for business sellers. Require verified account contacts, bank evidence, beneficiary/bank details and pickup/return addresses for both.
- [x] Store private bank intake as an explicitly pending reference and retain the original submitted bank details in private bank-document object metadata. Exclude this pending reference from payout eligibility and require replacement with an independently reviewed staff reference before business approval. Do not put bank data into audit logs or configurable answers.
- [x] Preserve the v1 managed agreement byte-for-byte. New intake uses the separately versioned `managed-supplier-maker-2026-10-20-v2` agreement, hashing the displayed company identity and effective sale-linked rate. Corrections append evidence and retain the prospective contract. Fixed-price supply still needs its separately accepted purchase terms, without additional automatic commission.
- [x] Keep submissions in the existing `submitted` review queue, displayed to applicants as **Under review (queued)**. Staff still starts review. Managed maker readiness, product approval and commercial activation remain separate. Prospective business activation requires Super Admin approval and commit-time evidence checks.
- [x] Block prospective managed activation for both commercial models. This code deliberately has no free-text clearance bypass. Adding an evidence-bound legal/accounting/beneficiary clearance decision requires a separate reviewed workflow after the business arrangement is approved.
- [x] Use recorded company selling identity for product/cart/checkout/order disclosures. Snapshot the public supplier name into new order statements and show the retained supplier name on simulated invoices. Historical snapshots and financial amounts are not rewritten. Unknown historical invoice identity is explicitly left for review.
- [x] Retain managed-to-business transition history. Saved personal PAN certificates cannot count as business PAN; use a fresh transition upload or a retained transition-origin business certificate. Existing transitions retain their snapshots.

## Existing incomplete applications

No application or acceptance is deleted, filled with invented information, or silently upgraded. Legacy v1 applications retain their contract and correction history. Staff can request evidence through the existing correction/review process. Prospective applications retain v2 and must provide its mandatory evidence when correcting. Missing legal/accounting clearance does not become permission to trade. Existing simulated legacy commerce and historical financial snapshots remain intact.

## Official Nepal sources checked on 20 October 2026

- [IRD FAQ](https://ird.gov.np/faq/): distinguishes personal PAN and business PAN, describes sole-proprietor firm-registration evidence, and conversion after business registration. Personal PAN is not proof of business registration.
- [Department of Commerce E-Commerce Act page](https://doc.gov.np/content/4/electric-business--e-forever--act-2081/) and [mandatory listing notice](https://doc.gov.np/content/470/urgent-notice-regarding-mandatory-listing-e-commerce-2083-05-01/): the current official commerce portal presents mandatory e-commerce listing notices.
- [Department firm/e-commerce portal](https://online.doc.gov.np/onlineuser/Login): separate firm registration and e-commerce listing entry points.
- [Nepal Law Commission Act page](https://lawcommission.gov.np/content/13517/electricity-trade--e-workers--act--2081/): official Act reference. Its linked English PDF repeatedly timed out; this implementation does not claim a completed clause-by-clause legal assessment.

No official source checked established a blanket exemption for unregistered makers supplying through a platform. Treat eligibility of the specific supplier arrangement as unresolved rather than infer an exemption.

## Required legal/accounting decisions before commercial activation

Confirm whether each supplier needs firm/industry/municipal registration or conversion to business PAN; sector/product licences; the company's and sellers' e-commerce listing duties; actual purchase/resale versus consignment; transfer of title and risk; source invoices and stock books; VAT, withholding and reporting; who issues each tax invoice; written payout, returns, defects and warranty allocations; privacy retention/access. Confirm the company's e-commerce listing details rather than invent a number.

The application agreement is a versioned proposed contract. It is not a legal opinion or authority to borrow the company's PAN. New managed commercial activation stays blocked while the required clearance workflow and decisions remain outstanding.

## Verification scope

Use isolated SQLite/Miniflare fixtures for writes. Disable inherited persistent native database test modes. Relevant tests cover prospective input, contact/evidence commit races, review authority, immutable legacy evidence, private document boundaries, both blocked managed models, financial settings and transitions. Run lint, TypeScript, build and read-only local preflight. Browser checks use existing fictional seller access without passwords, application submission or agreement acceptance, at desktop and mobile sizes. Keep launch settings/baseline and the canonical localhost:3018 server intact.

Evidence logs and Chrome screenshots are outside the repository in the current chat's visualization directory. The normal Chrome extension could not reliably capture screenshots/viewport sizes; visible installed Chrome through Playwright supplied repeatable evidence. The earlier header-search hydration warning was reproduced as Playwright's default screenshot caret hiding leaving an empty input style before hydration. Captures now preserve the caret and fail on every console/page error. Desktop and mobile public search checks pass with analytics intercepted locally; no account or application submission is involved.

The follow-up complete isolated run finished with 3,100 passed, zero failed and 21 existing guarded skips (3,121 tests). A stale upload-label expectation was corrected to require representative ID and bank evidence for prospective registered applications. Two recovery-test fixtures now copy unchanged guarded helpers into unique temporary projects, keeping their synthetic database, WAL and backup files out of the active `.staging` folder. The test child uses test runtime, disabled native/live-browser opt-ins, cleared remote credentials and temporary media/evidence roots; its two file workers retain normal process isolation. Application agreements, retained data and launcher protections are unchanged.
