# Local Audit Remediation Roadmap

> **For agentic workers:** Use superpowers:executing-plans for an approved implementation batch, or superpowers:subagent-driven-development when parallel agent work is explicitly selected. This document divides the work; prepare the change-specific implementation steps when a batch starts. Track completed work with checkbox marks and verification evidence.

**Goal:** Resolve the current audit findings and verify the marketplace locally before considering deployment or live integrations.

**Architecture:** Retain the existing Vinext/React application and its database adapters. Repair existing transactional and UI contracts in small batches, preserve working-tree changes, and keep managed commerce within its current simulation gates. Optional features follow stabilization and receive their own scoped designs.

**Tech Stack:** TypeScript 5.9, React 19, Vinext, Node.js >=22.13.0, SQLite/D1, the Node/MariaDB adapter, tsx tests, oxlint, and existing browser tooling.

**Spec:** [Project audit](C:/Users/abinash/.codex/visualizations/2026/09/30/01a0f2dd-89c4-77c1-9b97-f0cf98fec1b0/Hastabazaar-project-audit-2026-09-30.md) and the user's 30 September instruction to divide the work and continue locally until finalized.

## Global constraints

- Develop and test locally only. Deployment, remote pushes, production migrations, and live provider activation remain outside this phase.
- Use fictional data and disposable databases; route mail/SMS/payment/carrier work to local fixtures or test doubles.
- Preserve existing working-tree changes and local data. Do not reset, replace, or merge either existing checkout wholesale.
- Base implementation on the newer staging source at 49688867776029e0f18198d45c186e74517562e2, including its existing working-tree changes. A checkout of the commit alone is not the audited baseline.
- The staging source is C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala. The desktop checkout is older and has separate local changes. Establish an appropriate local implementation workspace before changing source.
- Keep Managed Maker flows simulation-gated throughout remediation.
- Preserve integer-paisa money calculations, immutable order/commercial snapshots, authorization, idempotency, and audit trails.
- Recheck each finding against the implementation baseline before changing it. Exclude issues already repaired in newer staging.
- Avoid unrelated redesigns, broad refactors, dependency upgrades, and rebuilding features that already exist.
- A feature idea in this roadmap is a candidate, not an instruction to implement every proposed feature.

## Recommended sequence and ownership

Each batch has one implementation owner and one verification record. Separate workstreams do not automatically create new Codex chats or delegate implementation.

| Batch | Workstream | Audit findings | Dependency | Exit result |
| --- | --- | --- | --- | --- |
| 0 | Local workspace and validation | Engineering/coverage gaps | First | Reproducible source baseline, disposable data, reliable commands |
| 1 | Critical identity and commerce | F01, F02, F03, F04, F08 | Batch 0 | Reset, refund, replacement, self-review, and delivery-completion invariants hold |
| 2 | Runtime, security, and privacy | F11, F12, F15, F16, F17, F19 | Batch 0; finish critical work first | Bounded runtime failures and correct request/privacy protections |
| 3 | Managed accounting | F05, F06, F07 | Batch 1 | One accounting model per item, correct reversals, single accrual |
| 4 | Seller editing and upload validation | F09, F10, F18 | Batch 0 | Product edits preserve data and invalid images are rejected safely |
| 5 | Public forms and discovery | F13, F14, F20, F21, F22 | Batches 1–2 contracts | Recoverable forms, truthful state, valid discovery metadata |
| 6 | Accessibility and measured performance | Audit improvement sections | Batch 5 | Usable controls and measured media improvements |
| 7 | Local acceptance | All batches and outstanding coverage | Batches 0–6 | Evidence-backed local candidate; deployment still pending |
| Backlog | New capabilities | Feature ideas | Stable affected flows | Individually scoped, prioritized features |

Auth work in Batch 1 can be reviewed independently from return work, but integrate each change before moving to the next shared contract. Batch 4 can run alongside unrelated runtime work if separate owners are later selected.

**Serialize shared-file changes:** Batch 1 and Batch 3 both affect returns, payouts, orders, and parcel completion. Do not assign concurrent edits to these repositories. Coordinate shared test helpers, configuration definitions, migrations, and form controls through one owner.

## Review focus

1. A request authenticated before reset must not create a session after reset commits — owned by Batch 1.
2. A competing transaction or replay must not produce a refund, inventory log, or entitlement without its corresponding guarded transition — Batches 1 and 3.
3. Omitted product fields and delayed form responses must not erase previously saved or newly entered values — Batches 4 and 5.
4. Runtime disconnects and status/configuration outages must terminate or expose a retry while preserving authorization — Batches 2 and 5.
5. SQLite success must not conceal MariaDB incompatibility, fixture setup failure, or skipped browser coverage — Batches 0 and 7.

## Batch 0: Establish the local development baseline

**Primary files:** package.json, tsconfig.json, .oxlintrc.json, README.md, scripts/staging/local-d1.mjs, scripts/staging/verify-environment.mjs, tests/helpers/incentive-db.ts. Modify only gaps confirmed in the chosen implementation workspace.

- [x] Record the source commit, working-tree changes, dependency lockfile, and baseline checks. Preserve the staging modifications when preparing or reusing an isolated local workspace.
- [x] Confirm the local database path and fictional fixture ownership before running migration/seed/reset commands. Use existing staging guards.
- [x] Verify the documented empty-database bootstrap path; fill missing instructions or commands only where current staging still has a gap.
- [x] Make lint and type checking cover maintained source without traversing archives, audit copies, generated output, or browser profiles.
- [x] Define deliberate test concurrency. Execute the 16 native-fixture files separately and initially serially; capture underlying setup errors rather than silently excluding files.
- [x] Record any existing failure as a baseline issue with its exact command, cause, and owner.

**Done when:** A developer can start the local application from fictional data and run source checks reproducibly. No user data was reset. Known test gaps are explicit.

## Batch 1: Repair critical identity and commerce invariants

**Primary files:** lib/auth/password-reset.ts, lib/auth/contact-verification.ts, app/api/account/contact-verification/route.ts, lib/db/repositories/returns.ts, lib/cancellation/repository.ts, lib/operations/parcels.ts.

**Existing tests to extend:** tests/password-reset-request.test.ts, tests/checkout-contact-verification.test.ts, tests/returns-complaints.test.ts, tests/cancellation-accounting.test.ts, tests/referral-release.test.ts. Add a dedicated regression file where the existing harness cannot express the relevant interleaving.

- [x] **F01:** Reproduce reset versus contact completion with synthetic accounts and a deterministic interleaving. Revoke retained contact proof and guard session creation against reset/session invalidation within the transaction. Verify no session survives the reset boundary.
- [x] **F02:** Use the current delivery financial snapshot for promo and non-promo refunds. Exercise partial cancellation, prior delivery refunds, failed/rejected refund rules, and concurrent approvals. Assert aggregate refunds stay within the current paid allowance. Failed refunds atomically reacquire capacity before restarting.
- [x] **F03:** Make replacement inventory consumption a transactional condition. When another purchase takes the final unit, reject the replacement and roll back its outcome, stock log, and related effects together.
- [x] **F04:** Store the authenticated requester and enforce self-review protection against actual order ownership. Cover an existing dual-role customer/staff identity and legitimate independent review, including high-value decisions and ownership changes before commit.
- [x] **F08:** Align delivered status and delivered_at for delivered-plus-cancelled orders. Verify referral release and earnings timestamps; a fully cancelled order must not receive a delivery-completion timestamp.
- [x] Check the expected conflict cause and final persisted state in race tests. A nested BEGIN error is not proof that a business guard worked.

**Done when:** Each regression fails before its corresponding fix, passes afterward, and preserves existing replay/authority protections. Review changes separately before combining shared return/parcel logic.

## Batch 2: Repair runtime, security, and privacy behavior

**Primary files:** app/health/route.ts, lib/operations/readiness.ts, lib/runtime/node-bindings.ts, lib/http/rate-limit.ts, app/api/auth/password-reset/request/route.ts, app/api/account/privacy/route.ts, app/api/auth/logout/route.ts, components/analytics/traffic-beacon.tsx, lib/db/repositories/analytics.ts.

**Existing test areas:** tests/node-hosting.test.ts, tests/local-preview-bindings.test.ts, tests/password-reset-request.test.ts, tests/first-party-analytics.test.ts. Add focused runtime/rate-limit/logout regressions where absent.

- [x] **F11:** Select the correct readiness dialect. Test initialized SQLite/D1 and disposable MariaDB separately, plus an actually missing schema.
- [x] **F12:** Reject SMTP handshake timeout, response end/close, and post-failure reads; close owned sockets. Use fake sockets without delivering mail.
- [x] **F15–F16:** Separate account allowances from network abuse limits. Verify two customers on one trusted network retain their own allowance, and a reset account check does not consume a dummy shared-network budget.
- [x] **F17:** Make GET logout side-effect-free and use the existing trusted-mutation protections for POST. Test cross-origin rejection and legitimate local logout.
- [x] **F19:** Normalize or exclude private order/account/document routes before analytics persistence. Verify route identifiers never enter aggregate paths, regardless of default configuration.

**Done when:** Runtime errors terminate predictably, budgets apply to the intended identities, logout requires a valid mutation, and analytics records contain only permitted route information.

## Batch 3: Repair managed accounting within simulation

**Primary files:** lib/db/repositories/orders.ts, lib/db/repositories/payouts.ts, lib/db/repositories/managed-settlements.ts, lib/db/repositories/returns.ts, lib/operations/parcels.ts; a migration if database uniqueness requires one.

**Existing tests:** tests/managed-settlements.test.ts, tests/managed-fixed-supply.test.ts, tests/managed-commerce-calculation.test.ts, tests/managed-commerce-activation.test.ts, tests/returns-complaints.test.ts.

- [x] **F05:** Ensure each commercial item enters exactly one earnings/payout model. Check ordinary marketplace, sale-linked managed, and fixed-supply items end to end.
- [x] **F06:** Commit managed refund reversals with refund completion. Verify partial refunds, replay, and relevant liability rules without reversing unrelated obligations. Refunds preceding accrual defer their reversal until the guarded earning credit; replay resumes accounting and simulated invoice hooks.
- [x] **F07:** Claim entitlement state before crediting and enforce one earned entry per entitlement. Two different operation IDs must not create duplicate earnings.
- [x] Validate any uniqueness migration on duplicate-free and representative legacy fixture data; define explicit conflict handling. No new uniqueness migration is required: guarded state claims serialize the existing schema.
- [x] Confirm simulation gates remain effective after all changes.

**Done when:** Settlement totals reconcile with order snapshots, refunds, and model-specific obligations under replay and controlled concurrency.

## Batch 4: Preserve seller data and validate media

**Primary files:** app/api/seller/products/[id]/route.ts, app/api/seller/products/route.ts, lib/products/submission.ts, lib/db/repositories/products.ts, components/seller/product-submission-form.tsx.

**Existing tests:** tests/product-story-materials.test.ts, tests/product-revision-concurrency.test.ts, tests/product-form-render.test.ts, tests/product-watermark-routes.test.ts.

- [x] **F09:** Preserve stored Nepali name/description when an unrelated edit omits those fields. Keep deliberate clearing distinct from omission.
- [x] **F10:** Persist the seller's submitted materials additions/removals while retaining revision and authorization checks.
- [x] **F18:** Decode images and enforce bounded resource use before accepting them. Test corrupt signature-only images, oversized dimensions, legitimate photos, and existing public metadata sanitization.
- [x] Verify edit/save/reload with fictional listings and ensure failed validation leaves no accepted corrupt media or broken listing state.

**Done when:** Saved product data matches the intended edit and media validation fails safely without breaking submission replay.

## Batch 5: Recover public forms and correct discovery

**Primary files:** components/account/contact-verification.tsx, components/commerce/checkout-form.tsx, components/forms/form-config-client.tsx, components/forms/configured-fields.tsx, components/layout/customer-contact-form.tsx, components/layout/footer-feedback-form.tsx, lib/seo/discovery.ts.

**Existing tests:** tests/contact-verification-ui.test.ts, tests/checkout-contact-verification.test.ts, tests/customer-feedback.test.ts, tests/form-catalog-rendered-polish.test.ts, tests/product-video.test.ts. Prefer browser verification for purely visual/control changes.

- [x] **F13:** Distinguish signed-out status from unavailable verification. Add retry and preserve safe state; checkout remains blocked until current required verification is confirmed.
- [x] **F14:** Provide retry after initial configuration failure, keeping entered answers intact.
- [x] **F22:** Prevent edits from being silently discarded during a pending submission, including configured extra fields. Exercise delayed success and error paths.
- [x] **F20:** Remove the invalid /makers sitemap entry until a working directory exists. The optional directory belongs to the feature backlog.
- [x] **F21:** Exclude videos from Product image metadata and verify mixed-media listings.
- [x] Verify configured form versions, replay identities, and keyboard submission still behave correctly.

**Done when:** Transient errors have usable recovery actions, entered data survives recovery, and discovery metadata points to valid pages/media.

## Batch 6: Accessibility and measured performance

**Primary areas:** homepage carousels, homepage headings, product gallery/media delivery, maker collections, tracking UI, and submission recovery.

- [x] Add carousel controls and a meaningful homepage H1. The user subsequently removed the featured-story Pause/Resume control; dots/autoplay remain, and other requested carousel controls are preserved. Keyboard, narrow viewport, reduced-motion, focus and actual video checks pass. Physical touch testing remains an acceptance gap.
- [x] Preserve the last successful tracking state on transient failure and visibly offer retry.
- [x] Explain recovery for uncertain submissions using existing saved cases/drafts and replay identities.
- [x] Measure media bytes and loading before choosing thumbnail/card/detail derivatives or cache changes. Preserve publication/ownership checks.
- [x] Review repeated product loads, maker pagination, and MP4 seeking. Implement only measured or reproduced improvements. Range seeking is implemented; duplicated repository queries and collection growth are measured follow-ups.
- [x] Keep any repository extraction directly tied to corrected invariants; avoid a project-wide rewrite.

**Done when:** The affected journeys work on narrow/mobile and desktop layouts, and performance changes have before/after evidence.

## Batch 7: Final local acceptance

- [x] Account for all F01–F22: fixed with evidence, or explicitly documented as a remaining limitation.
- [x] Run relevant regression tests, maintained-source type checking and lint, and both supported local build targets. The continuation's serial run passes 2,259 tests with zero failures and 14 explicit opt-in skips across 231 files; two later files pass 4/4 separately, accounting for all 233 maintained test files. Fresh affected checks cover subsequent source corrections.
- [x] Complete the native-fixture test group and report setup failures separately from application failures. The full serial run includes native SQLite/D1 checks with natural runner shutdown. Earlier 226-file partition counts remain historical evidence in the candidate report.
- [x] Exercise independent-connection refund/stock/entitlement and identity tests on disposable local MariaDB. The current canonical release schema and all 13 actual native acceptance cases pass without fixture-only DDL substitutions or disabled guards.
- [x] Verify customer browse/cart/checkout/cancellation/return, seller edit/inventory/finance, and staff review/refund/fulfillment journeys using fictional users. Actual Playwright with installed Chrome is explicitly authorized by the user; two planned orders reconcile through cancellation and partial refund, and no live provider is contacted.
- [x] Complete responsive, keyboard, retry and narrow configured-form browser checks on the actual local preview. Exact 232px contact/catalog checks pass 2/2, buyer pages pass at 232px, and buyer/seller/staff pages pass at 390px.
- [x] Complete rendered mixed-media checks: four photo selections and real MP4 playback, pause and range seeking pass in Chrome.
- [ ] Complete physical-device touch checks before production acceptance; desktop browser viewport emulation does not prove physical touch.
- [x] Validate empty SQLite/D1 startup with all 67 migrations and fictional roles.
- [x] Verify representative MariaDB release installation and legacy companions. Canonical MariaDB 10.11.19/default general_ci installation, all 48 release steps, overlapping-companion replay and nonempty legacy conservation pass after source repairs. Actual production installed-schema inventory remains an external launch gate.
- [x] Prepare a local candidate summary: source baseline, migrations, executed checks, remaining gaps, and any provider-dependent work. See [the local candidate report](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/docs/superpowers/reports/2026-10-01-local-audit-candidate.md).

**Done when:** The local candidate has a reproducible evidence record and agreed remaining limitations. This milestone does not trigger deployment, remote pushes, or live services.

## Optional feature backlog

| Candidate | Prerequisite | Proposed order |
| --- | --- | --- |
| Financial reconciliation in the existing exception workspace | Correct commerce and managed ledgers | First operational extension |
| Makers discovery directory | Correct catalog eligibility and metadata | Early contained feature |
| Back-in-stock subscriptions | Reliable inventory, local outbox, preference controls | Early customer feature |
| Seller autosave and upload recovery | Correct product revision and media validation | Early seller feature |
| Structured purchasable variants | Stable checkout, stock, refund snapshots | Separate larger feature plan |
| Shared gift lists | Wishlist visibility and reservation design | After foundations |
| Customer self-service privacy export | Correct request scope and existing fulfillment controls | Separate privacy extension |
| Gift delivery planning | Defined operational capacity and promise | Later |

Choose features individually after stabilization; local mocks can demonstrate provider-dependent behavior without activating a service.

## Working agreement

For each batch: recheck the finding, reproduce the issue, make a focused correction, verify the affected behavior, review the diff, and update this roadmap with evidence. Preserve unrelated edits when creating a local checkpoint. Do not push or deploy.

**Current status (1 October 2026):** Batch 0–6 remediation and available Batch 7 local acceptance are complete in `C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala`. Actual Chrome journeys, full regression, fresh source checks, both application builds, canonical MariaDB installation/recovery and the final normalized package/extracted runtime pass. The isolated branch and preview are preserved. All 96 captured original staging source hashes are unchanged. Physical-device and external launch acceptance remain separate gates; no push or deployment occurred. Current evidence is in [the readiness continuation report](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/docs/superpowers/reports/2026-10-01-local-readiness-continuation.md).

**Review follow-ups resolved:** F04 high-value owner self-review, F02 failed-refund capacity reacquisition, and parcel replay recovery of managed invoice issuance received regression tests and independent approval. The final candidate report records the complete checks and remaining acceptance gaps.

**User homepage correction (1 October 2026):** Removed the featured-story Pause/Resume control as requested; dots and existing autoplay handling remain. Three subagents covered the component correction, category forensics and media/review checks. The prior ten categories were intact in the original desktop database but absent from the isolated preview database. After a disposable recovery snapshot, the audited catalog API restored only their public bilingual metadata and ordering; existing Others and all prior destination rows were preserved. Six existing images now load. Focused carousel regressions passed 10/10, scoped lint and TypeScript passed, and actual desktop browser checks confirmed category links, loaded images, horizontal/keyboard access and dot navigation. The full audit suites/builds were not repeated for this correction. The candidate report contains the current screenshots and evidence; development remains local only.

**Acceptance limits:** The continuation supersedes the earlier candidate's local setup and rendered-journey gaps: canonical MariaDB release installation, protected baseline initialization, fictional recovery, full commerce/media journeys and exact 232px Chrome automation now pass. Existing active Super Admin authority is required for baseline initialization; the initializer creates no users or roles. SMS stays dormant through explicit `CHECKOUT_CONTACT_POLICY=email_only`, with verified email and valid phone numbers still required. Production remains on hold for installed-release/schema inventory, host acceptance, real email delivery, production backup/restore evidence, physical-device touch and separately authorized deployment. Local provider simulations do not certify live delivery or production recovery.
