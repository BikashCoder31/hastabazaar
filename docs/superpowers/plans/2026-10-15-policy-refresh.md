# Policy Refresh Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved update in the existing isolated preview.

**Goal:** Update the existing policies and publish Rewards & Shopping Credit, Promo Code and Gift Card terms with revision history and local Chrome verification.

**Architecture:** Extend the shared legal-document registry and existing policy renderer. Archive the exact current canonical documents before editing; publish a new customer-policy revision and document checksums for future checkout snapshots. Show current published reward rules through a restricted public projection, while retaining the static legal rules and historical claim/order records.

**Tech Stack:** TypeScript, React, existing Next-compatible routes, D1-shaped SQLite preview, Node test runner and Chrome.

**Spec:** The user's explicit approval of the preceding policy gap review and request to implement locally. Confirmed contact: support@hastabazaar.com. Company PAN: 624749646.

## Global constraints

- Work only in the existing full preview; preserve all latest commission, promo, seven-day rewards, grace and concise check-in changes.
- No production deployment, money movement, external messages or automatic seller acceptance.
- Missing public phone/listing identifiers remain explicitly unverified; do not fabricate them.
- Update policy information without changing financial calculations, locked conversion, balances, commercial schedules or existing agreements.
- Retain existing seller/Managed Maker acceptance identifiers for unchanged commercial obligations; record the refreshed public document revision separately.
- Do not rewrite existing order, claim, acceptance or settlement snapshots.
- Use 2026-10-15 as the refreshed document date in Nepal time.

## Review focus

- Rewards summaries must use published rules, never saved drafts or admin-only budget/actor data.
- Refund wording must distinguish cash, restored credit and non-cash discounts without reducing mandatory remedies.
- Current and archived document hashes must correspond to their exact normalized content.
- New document links must not remove seller terms access controls or introduce unsupported commercial claims.
- Complaint and invoice wording must distinguish obligations from local simulation and pending production readiness.

## Tasks

- [x] 1. Archive current documents; add versioned policy content, verified contact disclosures, cookie inventory and the three new terms; verify hashes and historical lookup.
- [x] 2. Add routes, legal-hub/navigation/history/effective dates and published rewards projection; validate draft isolation and disclosures.
- [x] 3. Link terms from rewards, promo, gift-card and referral surfaces; preserve claim/checkout/replay behavior and accepted snapshots.
- [x] 4. Run relevant regression tests, typecheck, lint and native build; check preservation, all admin/legal routes and Chrome; leave review pages open.

## Execution

Native execution is already authorized by the user's request to implement these updates and open them locally. No additional approval gate is needed for the reversible local work.

## Verification and review notes

- Archived all seven previous canonical documents before editing. Exact normalized bodies and their original hashes are preserved, including the launch-rate seller wording. Seller history bodies retain the existing authorization gate.
- The customer policy revision is now 2026-10-15; future checkout records include the three new terms. Existing seller and Managed Maker acceptance identifiers remain unchanged because no commercial calculation or obligation is changed.
- Public reward terms expose only published rules and the locked conversion. A real-migrations SQLite test confirms saved drafts and administrative totals do not leak.
- Contact responses now acknowledge durable registration with a stable reference while reporting email delivery separately. The same reference is visible in Super Admin's Contact & feedback records. The preview does not send external mail. A reviewer-found stale reference was reproduced and corrected in the client regression test.
- Independent read-only review found the stale footer reference and missing referral-cookie disclosure; both were fixed. No other material findings.
- Final combined affected checks: 77 tests passed, zero failures. Mobile/navigation/print fixtures cover widths 320–1440 and all ten documents. Final typecheck, lint and native build passed. Chrome desktop checks, all nine public policy routes, history validation, seller authorization and all 34 Super Admin routes passed. The broad run completed 2,612 tests: 2,592 passed, five earlier fixture expectations failed and were corrected, 15 native integration tests skipped. All five corrected cases passed in the final combined 77-test run; a second full-suite run was not performed.
- All 34 Super Admin routes returned 200 after the first rebuild. Twenty-one financial tables matched the checkpoint exactly after restart; unrelated existing sources were preserved.
- Public phone numbers and the e-commerce listing number are not supplied and remain “Not yet confirmed”. The user selected support@hastabazaar.com; mailbox delivery readiness has not been verified. These facts and existing production invoice/Managed Maker readiness gates still require attention before public launch.
- Legal references: [Electronic Commerce Act, 2081](https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf), sections 4, 8, 10, 12, 14 and 33; [IRD FAQ](https://ird.gov.np/faq/) for PAN/VAT and invoicing distinctions. This local update is not a certification of launch compliance.
- The final persistent preview is running at http://localhost:3000. Chrome contains the refreshed legal hub, all customer policy pages, current seller agreement, referral terms, archived Terms & Conditions and an authenticated full Super Admin tab. The Chrome viewport override was ineffective and reset; responsive verification used the existing isolated native browser fixtures. Screenshot evidence: `policy-rewards-desktop.png` in the task's visualization directory.
