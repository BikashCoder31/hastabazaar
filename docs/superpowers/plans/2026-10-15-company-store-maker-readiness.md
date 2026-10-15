# Company-store Maker Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the local no-PAN maker journey under the company store, including accepted 9%/91% terms, safe payments, future terms and reviewed PAN transitions.

**Architecture:** Extend the existing application workspace with owner-scoped operations; keep Registered Seller authorization unchanged. Pin accepted company/commercial evidence on new orders, and expose existing managed finance through transactional, audited operations. Existing independent-seller and fixed-price paths retain their own rules.

**Tech Stack:** TypeScript, React, vinext, D1/SQLite, existing configuration/form adapters and Node tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-company-store-maker-readiness-design.md` (approved, including subsequent change-handling answers).

**Execution:** Main agent implements and exclusively controls server, active database and upgrades. Separate `gpt-6.1-sol` code/test reviewers use extra-high reasoning; reviewers do not mutate shared data or control Chrome/server. Use the existing Desktop branch `codex/company-store-maker-readiness`; do not launch a worktree.

## Global Constraints

- Work in `C:/Users/abinash/Desktop/Hatskala`. Preserve newer work.
- Use the checked launcher and `http://localhost:3018`. Keep the current valid server when available.
- Keep `local_staging`, development mode, captured mail and simulated payments. Do not push or deploy.
- Do not reset, seed, replace or restore the active database. Preserve history, uploads and backups.
- Any storage upgrade needs a concrete SQL/source/destination review and an isolated rehearsal before a separately authorized active-data step. Startup checks must never apply it automatically.
- Existing order and agreement snapshots are immutable.
- Keep existing production activation gates and simulation labels.
- Company retention is 900 bps of eligible value; maker entitlement is the reconciled remainder. Managed retention and independent Commission are separate mechanisms.

## Review Focus

- A changed/cancelled future offer must not cause early use or implicit acceptance of new terms (Tasks 1, 3).
- Ownership or authority revoked between validation and commit must leave no domain/audit/form writes (Tasks 2, 4, 5).
- An order-wide complaint or refund must not escape a maker's financial hold through missing item attribution (Task 4).
- A refund arriving after payment preparation must block payment or require reconciliation, rather than pay the old amount (Task 4).
- A PAN transition must preserve historical company sales and still establish genuine Registered Seller access at its effective boundary (Task 6).

## Existing Work — Reuse, Do Not Rebuild

History checked in the chats **Improve commission field handling** (2026-10-14) and **Update policy for pending PAN** (2026-10-13/14), their saved plans, current source and Git ancestry. Historical preview paths are references only.

| Area | Verified state in Desktop | Work allowed by this plan |
|---|---|---|
| No-PAN intake, private government ID, optional personal PAN, explicit agreement and company account | Completed in `ef1529c`/`774fc29`; included in Desktop HEAD; 2026-10-13 plan checked complete | Reuse intake/storage/UI. Extend effective acceptance selection and missing operational wiring only. |
| Private configurable commission and separate maker retention | Completed in `db9476e`; included in Desktop HEAD | Reuse settings, access and agreement presentation; test separation, do not create another rate system. |
| Commission dashboard, scheduling/cancellation, acceptance and history | Completed 2026-10-14; recovered into Desktop in `55be02c` | Reuse `scheduleCommissionRate`, `cancelCommissionRate`, `acceptCommissionRate`; only integrate the genuine PAN transition. |
| Managed calculation, ledger, simulated commerce and fixed-price operations | Existing `29ab84f` through `9ae90bf`/`89e21ad`; included in Desktop HEAD | Reuse all existing models and historical records. Complete missing UI, case/transaction guards and safe reservation lifecycle. |
| PAN transition request/review/scheduled apply | Already started in `route-transition.ts` and milestone-3 tests | Complete actual maker access, private certificate/current-terms validation, correction and atomic seller role/status/acceptance; do not add a parallel transition system. |
| Full new-maker journey under current identity rules | Not complete: draft submission, discovery/access and payout gaps identified in source review | Add full-schema regressions and repair those exact gaps. |

Before each task, compare the intended function/adapter/schema with current source. If newer work already supplies it, verify and reuse it instead of implementing it twice. Retained request IDs and unique guards must also prevent double processing at runtime.

## File Structure and Shared Contracts

- `lib/managed-commerce/accepted-terms.ts`: typed, server-selected current/upcoming offers and accepted terms; no government-ID fields in commerce/public projections.
- `lib/auth/managed-maker.ts`: authenticated owner/stage/restriction checks; does not change `lib/auth/seller.ts`.
- `lib/managed-commerce/settlement-readiness.ts`: item/order case attribution and payable blockers shared by release, preparation and payment.
- `components/seller/maker-product-workspace.tsx`, `managed-terms-acceptance.tsx`: maker product actions and explicit current/upcoming terms acceptance.
- `components/admin/managed-settlement-controls.tsx`, `program-readiness-checklist.tsx`: guarded finance operations and actionable readiness.
- `tests/helpers/company-store-maker-fixture.ts`: full real schema in memory using `incentiveReportDatabase()`, actual authorization/repositories, synthetic authentication identities only.
- `drizzle/0071_company_store_maker_readiness.sql`: reviewed additive storage; if this migration number is taken by newer work, renumber consistently before creating it.
- `scripts/staging/company-store-readiness-upgrade.mjs`: separately reviewed, manifest-bound schema/new-form initialization; repeat runs are no-ops. It must not call a general seed/bootstrap/reset routine.

### Task 1: Accepted terms, additive storage and reusable full-schema fixture

**Files:** Create the accepted-terms module, migration and fixture above; create `tests/company-store-maker-settings.test.ts`, `tests/company-store-maker-upgrade.test.ts`; modify `lib/db/repositories/managed-maker-details.ts`, `lib/sellers/managed-identity.ts`, `app/api/seller-applications/managed-terms/route.ts`, `lib/forms/registry.ts`, `lib/forms/access.ts`, `lib/forms/plain-language.ts` and `lib/forms/catalog-presentation.ts`.

**Interfaces:** Export `ManagedTermsOffer` (server offer ID/context, company/account snapshot, agreement version/language, effective time and setting version IDs) and `AcceptedManagedTerms` (offer plus detail ID, seller/acceptor/time/form version). Export `getManagedTermsOffers(db, sellerId, now)`, `getAcceptedManagedTerms(db, sellerId, now)` and `acceptManagedTerms(db, {sellerId,actorId,offerId,context,language,requestId,now,form})`. An accepted offer is usable only when its source settings are currently effective; future acceptance must not change today's terms.

- [ ] Write tests named `current and upcoming offers require explicit exact owner acceptance`, `managed retention is independent of Registered Seller Commission`, and `additive upgrade preserves every existing row`. Assert `accepted.retentionBps === 900`; after an effective managed change to 1200, no new order is permitted until matching acceptance; independent 1100-bps scheduling leaves managed 900 unchanged.
- [ ] Run those tests before implementation; require failures at missing accepted-term selection/provenance behavior, not fixture/setup errors.
- [ ] Add nullable `accepted_managed_detail_id` references to participation and managed commercial snapshots, nullable agreement language/form-version provenance to application details, and nullable validated `registered_terms_snapshot_json` to transition applications. Reuse existing immutable agreement JSON and existing evidence-reference JSON. Preserve old rows without backfilling assumed identities/rates. Financial allocation storage is specified in Task 4. Do not place actor-dependent form defaults in the DDL migration.
- [ ] Prepare the separate upgrade script with check/rehearse/apply modes, canonical/runtime/marker/single-D1 guards and an approved exact-SQL manifest. Its reviewed apply step requires a verified existing Super Admin actor and initializes only the four new form IDs in Tasks 1/5, version 1, published, empty custom fields, with audited provenance and deterministic per-form request IDs. Skip existing published configurations unchanged; stop on a pre-existing unpublished draft. A second run creates no migrations/configs/audit records. Never create an actor, reset data or run general bootstrap/seed code.
- [ ] Register `seller.managed-terms-acceptance`; GET the current/next published terms and POST explicit owner acceptance on the existing managed-terms endpoint. Reuse existing identity evidence for renewal; rejected/missing evidence remains blocked. Store the language actually shown and validated form version. Guard settings cancellation/publication and actor revocation inside the acceptance transaction. Preserve old immutable evidence.
- [ ] Run `node --import tsx --test tests/company-store-maker-settings.test.ts tests/company-store-maker-upgrade.test.ts tests/managed-maker-identity.test.ts`; require zero failures. Rehearse upgrades only on isolated fixtures/copies. Commit only this task's tested files.

### Task 2: Maker-owned product submission, corrections and usable workspace

**Files:** Create `lib/auth/managed-maker.ts`, `components/seller/maker-product-workspace.tsx`, `components/seller/managed-terms-acceptance.tsx`, `app/sell/application/products/[id]/edit/page.tsx`, `tests/company-store-maker-products.test.ts`; modify `app/sell/application/page.tsx`, `app/sell/application/products/new/page.tsx`, `components/seller/product-submission-form.tsx`, both product POST/PATCH routes, `lib/db/repositories/products.ts`, `app/api/forms/[formId]/route.ts`, and `lib/forms/access.ts`.

**Interfaces:** Export `requireManagedMakerApi()` and `requireManagedMakerPage(returnTo)` returning `{userId,sellerId,authSubject,stage}` after active-account, owner, managed-route and restriction checks. Add explicit `workspaceMode: 'seller'|'maker'` and return URLs to `ProductSubmissionForm`; reuse `seller.product-submission` and its protected multipart contract. An explicit managed request mode selects maker authority; normal seller requests continue through `requireSellerApi()`.

- [ ] Write `maker can submit draft and resubmit requested product corrections` and `maker product writes recheck owner stage and restrictions at commit`. Assert draft → submitted → needs_changes → submitted using real schema; a different owner gets 404/403 with unchanged rows/answers/audit; rejected/suspended makers cannot submit. An active maker must open `/sell/application` without receiving a seller role.
- [ ] Run `node --import tsx --test tests/company-store-maker-products.test.ts` and confirm the current draft-to-review dead end fails.
- [ ] Implement shared owner authority and transaction guards in product creation/revision/inventory paths. Preserve media ownership, size/rate limits, removal rules, catalogue validation, exact replay and optimistic product status checks. Extend form-config audience narrowly to the same maker actions. Product publication remains a staff operation after maker and product approval.
- [ ] Render all owned product states with edit/correction links, sanitized own earnings and explicit next steps. Company operations retain fulfilment/customer handling; do not expose unrestricted seller tools or private customer records. Show pending/current terms and an explicit renewal action from Task 1.
- [ ] Run the new test plus `tests/seller-product-remediation.test.ts`, `tests/form-catalog-product-client.test.ts`, `tests/form-catalog-managed-workspace-eligibility.test.ts`, and `tests/managed-maker-identity.test.ts`; require zero failures and commit the scoped result.

### Task 3: Company selling identity and consistent commerce eligibility

**Files:** Modify `lib/managed-commerce/activation.ts`, `components/admin/managed-maker-activation-form.tsx`, `lib/products/eligibility.ts`, `lib/db/repositories/products.ts`, `catalog.ts`, `cart.ts`, `orders.ts`, `managed-documents.ts`, `lib/managed-commerce/snapshots.ts`, `app/products/[slug]/page.tsx`, customer card/cart/order/document renderers that consume those projections; create `tests/company-store-maker-lifecycle.test.ts` and extend the settings test.

**Interfaces:** Activation selects `AcceptedManagedTerms` by server identity/current settings; staff cannot supply replacement company or agreement references. New managed snapshots carry `acceptedManagedDetailId`; their company identity comes from that immutable accepted detail. Add a sanitized selling-identity projection `{makerName,storeName,legalSellerName,participationRoute}` to public product/order views. Reuse `publicProductEligibility(alias, now)` everywhere route eligibility is needed.

- [ ] Write `new no-PAN maker reaches review activation publication and checkout` without manually granting approved status/roles. Assert list/count/homepage/detail/cart agree, `Made by` is the maker and `Sold by` is the company; `snapshot.platformRetentionBps === 900`, eligible NPR 1000 produces `9000` paisa retention and `91000` paisa entitlement. Assert private identity fields are absent from public responses.
- [ ] Run the lifecycle/settings tests before fixes; confirm failures at the current activation/discovery/selling-identity boundaries.
- [ ] Bind activation to current accepted identity/terms and a reviewed receiving reference while retaining local-simulation and independent-review checks. Remove only redundant profile clauses that conflict with route-aware eligibility. Recheck active program, accepted terms, restrictions and route/offer provenance inside checkout's transaction; a future/cancelled/unaccepted offer cannot price an order.
- [ ] Pin the selected acceptance on each new order snapshot and derive company documents from it; retain simulation/non-tax labels. Read legacy snapshots as recorded and identify missing legacy evidence rather than inventing it. Later company/rate changes and PAN transitions must not change earlier receipts or document JSON.
- [ ] Run new lifecycle/settings tests plus `tests/managed-commerce-activation.test.ts`, `tests/managed-documents-email.test.ts`, `tests/managed-commerce-calculation.test.ts`, and existing catalogue/checkout tests affected by the actual edits. Require zero failures and commit.

### Task 4: Transactionally safe settlement release and payment transitions

**Files:** Create `lib/managed-commerce/settlement-readiness.ts`, `tests/company-store-maker-settlements.test.ts`; modify `lib/db/repositories/managed-settlements.ts` and only affected return/refund transaction integration. Reuse attribution joins in `lib/db/repositories/product-closure.ts` without its independent-seller fee logic.

**Interfaces:** Export `getManagedSettlementBlockers(db,{sellerId,entitlementId,now})`. Extend release/preparation/payment contexts with server-derived environment, actor, reason, request/form provenance and expected state; return replayable verified receipts. Add `cancelManagedPayout(db,{payoutId,actorId,reason,requestId,now,environment,form})` for unpaid records only. `getManagedFinanceSummary` must distinguish reserved from payable balance and remain usable for historical managed records after a route transition.

- [ ] Write `refund racing preparation cannot reserve the previous amount`, `open item and order-wide cases block every payment stage`, and `prepared payment is blocked by a later refund or authority revocation`. Use `beforeBatch`; assert zero partial payout/reservation/audit/answer writes and exact changed-intent replay rejection.
- [ ] Assert unpaid/undelivered earnings are zero; a NPR 300 eligible-base refund reverses `27300` maker paisa once; full refunds leave no residue. Returns block until rejected/resolved, complaints until resolved/closed, and refunds until paid/rejected/cancelled. Ambiguous order/seller attribution requires review.
- [ ] Write `cancel unpaid reservation permits correct re-preparation without deleting history` and `post-payment refund offsets a later entitlement once`. Assert terminal paid records cannot be cancelled; a blocked old reservation can be cancelled/reconciled, then only the current net balance is prepared. Neither legacy nor new allocation amounts can be counted twice.
- [ ] Run the new settlement tests before changing the financial functions; verify the race/blocker failures are behavioral.
- [ ] Lock/recheck the same entitlement and cumulative ledger state for refunds, release, preparation, approval and payment. Recompute unreserved payable amounts, current cases, delivery/payment facts and receiving-account readiness in the transaction. Include current Super Admin capability guards and immutable form/audit writes. Exact replay still rechecks current authority and parent identity. Preserve existing applicable direct-approval versus independent-review policy; do not weaken it.
- [ ] The existing `managed_payout_entries` has a permanent unique entry link, so do not delete/reuse those historical rows to release a cancelled payment. Add `managed_payout_allocations` in 0071 with `(payout_id,entitlement_id)` identity, nonzero signed amount, `reserved|released|paid` disposition, creation/terminal timestamps and provenance. Guard one active reservation per entitlement. New payments use this allocation path; legacy mappings remain readable and count once. Cancellation marks an unpaid payout rejected and reservations released with audit, allowing a new net allocation; payment marks allocations paid. Include negative post-payment refund offsets in the maker's next net payable amount, never issue a negative payout or alter the earlier paid amount.
- [ ] Run `node --import tsx --test tests/company-store-maker-settlements.test.ts tests/managed-settlements.test.ts tests/managed-fixed-supply.test.ts tests/form-catalog-payout-domain.test.ts`; require zero failures and commit.

### Task 5: Program checklist, finance forms, API and history

**Files:** Create the two admin components listed above and `tests/company-store-maker-admin.test.ts`; modify `app/admin/programs/page.tsx`, `components/admin/program-management.tsx`, `lib/managed-commerce/program-management.ts`, `app/api/admin/managed-program/[id]/route.ts`, and form registry/access/plain-language/catalog-presentation/staff-history plus `lib/managed-commerce/form-replay.ts`.

**Interfaces:** Register separate `staff.managed-eligibility-release`, `staff.managed-payout-preparation`, `staff.managed-payout-action` adapters and history kinds; existing `staff.managed-payment-*` stays fixed-supplier-only. Add distinct API actions `release_eligibility`, `prepare_sale_linked_payout`, `approve_sale_linked_payout`, `record_sale_linked_payment`, `cancel_sale_linked_payout`, dispatched to Task 4 contexts. Keep reads side-effect-free.

- [ ] Write `program checklist links every blocked requirement to its responsible action`, `sale-linked actions require current Super Admin authority and exact published form`, and `uncertain response retains the original operation through reload`. Assert Admin/Staff/Customer/other maker/unauthenticated direct requests are denied; cross-site, malformed/oversized bodies and stale/changed replay do not write.
- [ ] Run the new admin test first; require missing-UI/action failures rather than setup failures.
- [ ] Render company, agreement, application, product, activation and settlement readiness with plain-English reasons/links, actual queues and truthful simulation status. Show received/held/eligible/reserved/paid amounts and case blockers. Supply busy/empty/error/success states, keyboard labels and retained attempts; only verified success clears an attempt. Match form/history parent subjects and protections to each action.
- [ ] Run new admin tests, `tests/program-management.test.ts`, `tests/form-catalog-managed-program.test.ts`, `tests/form-catalog-managed-retry.test.ts`, relevant catalogue completeness tests and `npm run typecheck`; require zero failures and commit.

### Task 6: Reviewed PAN transition and historical continuity

**Files:** Modify `lib/managed-commerce/route-transition.ts`, `lib/db/repositories/marketplace-settings.ts`, `components/seller/managed-program-workspace.tsx`, `components/admin/managed-program-review.tsx`, the maker application workspace, `app/api/seller/managed-program/route.ts`, admin managed-program dispatch and `app/api/jobs/order-emails/route.ts`; create `tests/seller-route-transition-lifecycle.test.ts` and a scoped maker multipart transition receiver at `app/api/seller-applications/transition/route.ts`.

**Interfaces:** Retain `submitRegisteredSellerTransition`, `reviewRouteTransition`, `applyDueRouteTransitions` with typed current-terms/evidence/form provenance. Add `resubmitRegisteredSellerTransition(db,{applicationId,actorId,expectedVersion,...validatedEvidenceAndTerms,requestId,now,environment,form})`. Extend `prepareSellerCommissionAcceptance` with a narrowly guarded `managed_transition` mode tied to the owned transition; do not relax ordinary application/approved-seller modes.

- [ ] Write `PAN transition changes only new transactions at the reviewed effective time`. Assert current valid registration/PAN documents are privately owned, current Registered Seller terms are explicitly accepted, a different Super Admin reviews, route stays managed at `effectiveAt-1`, and application at `effectiveAt` atomically grants approved status, seller role and exact acceptance. Reapplication changes nothing.
- [ ] Write `transition corrections and stale terms require resubmission and renewed acceptance`. Reject absent/unowned/rejected documents, free-text invented agreement versions, backdating, authority/state races and stale scheduled terms. Assert actual `requireSellerPage/Api` access after application without stubbing its authorization.
- [ ] Compare old managed snapshots/documents/entitlements/refunds/payouts/supplier obligations byte-for-byte after transition. Assert they remain visible/actionable; the next independent order uses accepted independent commission and creates no second managed entitlement. Test independent 9→11% schedules separately from managed 9→12% retention changes.
- [ ] Run the new transition test before fixes, then wire private multipart evidence and correction forms into `/sell/application`. Derive accepted terms server-side; preserve form answers/audit. At application, transactionally revalidate effective time, owner, reviewed evidence, restrictions and accepted terms, then apply legal/tax status, role and acceptance together. A failed recheck leaves the managed route intact with an actionable review requirement. Use the existing authenticated scheduler plus an explicit audited Super Admin apply-due action; never mutate on GET.
- [ ] Run new transition/settings/lifecycle tests plus `tests/seller-route-transition.test.ts`, `tests/seller-commercial-terms.test.ts`, `tests/commission-workspace.test.ts`, `tests/managed-maker-identity.test.ts`, and `tests/managed-fixed-supply.test.ts`; require zero failures and commit.

### Task 7: Integrated verification, reviewed local upgrade and Chrome handoff

**Files:** Implementation/test paths above; update `docs/testing/program-management-self-test.md` with observed results. Evidence stays in a dedicated local artifact directory. Do not change launch baseline/canonical settings.

- [ ] Run the three new lifecycle/settings/transition tests together, the financial/admin regressions and affected existing suites; then `npm run typecheck`, `npm run lint`, `npm run build` and Git whitespace checks. Broaden to the project suite once integration passes; record existing versus introduced failures. Miniflare tests may need approved local loopback; they must never use active state. Keep native database opt-ins unset unless the user provides an appropriate test environment.
- [ ] Obtain separate fresh code and test reviews on `gpt-6.1-sol` extra-high reasoning, reproduce actionable findings and rerun affected checks after fixes. Main agent owns integration and every database/server step.
- [ ] Before active schema changes, prepare a consistent SQLite backup and row/column hashes, show exact additive SQL/new form defaults, rehearse on a copy and verify preserved rows plus integrity/FKs. Obtain the separate concrete upgrade approval required by the spec. Stop only the identified Desktop preview before incompatible code/schema is integrated; restart only through the checked launcher after readiness passes. Repeating the approved upgrade must report zero new records/DDL and unchanged application data.
- [ ] Before browser writes, inventory the exact fictional maker/buyer/reviewer IDs, private sample documents, four product photos, product, order, cases and simulated payment records. Explain any new local setting versions and how original effective values can be restored by new audited versions. Retain immutable test history clearly labelled; archive only newly created sample products where authorized. Never restore the database to erase tests. If another Super Admin identity is needed for existing review separation, obtain the required access approval before creating/granting it.
- [ ] Use normal Chrome via the Browser tool. Test the complete no-PAN→sale→refund/payment journey, terms renewal, PAN transition, direct blocked access, links, loading/errors, keyboard use and desktop plus 390px layout. Use only local captured/simulated services. Record Passed/Failed/Not tested for every step, including anything blocked by unavailable accounts or separate upgrade/access approval.
- [ ] Compare original active records after testing; account for only the disclosed new records/settings history. Run `npm run local:check`, verify the Desktop server and leave Program Management and the maker/review pages open. Provide reproduction steps, copyable local URLs and a short manual checklist. Claim local completion only when the full required journey is verified; report live/native delivery boundaries separately.

## Self-review and Handoff

Task coverage: intake/agreements/storage (1), maker ownership/products (2), selling/checkout/snapshots (3), finance correctness (4), Super Admin operations (5), future route changes (6), complete evidence/data preservation (7). Every Review Focus item has a named regression above. Loyalty is independently planned in `2026-10-15-loyalty-start-readiness.md`; neither plan authorizes publishing active loyalty rules.

The written plans require user review before product implementation. Recommended execution is main-agent implementation with the requested separate code/test reviewers, keeping database/server changes centralized.
