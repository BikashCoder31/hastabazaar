# T28 read-only preparation

Prepared 3 November 2026 in the canonical Desktop/HastaBazaar checkout. This is source inspection only: no application/test/schema edits, test execution, live activation, configuration change or database access. T27 precedes T28 implementation.

## Controlling requirements

Use part 5 T28; seller-management specification sections 6–6.3; bank/identity supplement sections 3–6; and all-20-workstream scope V04. Seller-management section 6.1 explicitly scopes initial live readiness to the sale-linked model. Fixed supplier-price live support remains blocked unless separately implemented and verified. The historical live-maker design is supporting context, subject to the later approved scope/terms and single-Super-Admin amendments. Do not hardcode a historical 9% rate or infer clearance from PAN, identity, a bank review, acceptance or a staff note.

## Acceptance mapping

| T28 criterion | Existing implementation to reuse | Needed work / proof |
|---|---|---|
| Verified bank or approval note cannot resolve pending identity/clearance | `lib/sellers/readiness.ts` independently projects identity and bank; `protected-change-policy.ts` and `bank-readiness.ts` bind current evidence; simulation activation explicitly rejects current pending-clearance applications. | No evidence-bound live clearance repository or live decision currently exists. Add exact reviewed source/version/scope/owner/reviewer/time/reference records and current validity/revocation checks; preserve individual route requirements. |
| Approved applicants can prepare/publish browse-only products | `maker-authority.ts` supports pre-activation preparation; `products/eligibility.ts` has separate `publicationSellerEligibility`, public visibility and order eligibility; T17/T18 publication and real offers already exist. | Reuse these paths. Prove approved published in-stock offers remain visible but unorderable before live activation and while a scoped ordering hold applies. Activation must not publish drafts or create stock. |
| Stale/revoked prerequisites fail; clearing one hold leaves others | `getSellerReadiness`, `sellerOrderReadinessGuards`, `acceptedManagedTermsGuards`, protected revisions/holds, current beneficiary validation, and explicit protected-change restoration already exist. | Add a distinct `activateManagedMakerLive(db,ctx,input)` with atomic authority, owner, restriction, exact evidence/clearance/terms/company/settings/capability checks; idempotent outcome recovery and current authority on replay. Bind all cart/quote/order commit consumers to current live proof; stage `active` alone cannot authorize live trading. Preserve automatic resolution of a valid terms acceptance separately from explicit material-identity restoration. |
| After valid fixture activation, exact offer orders/invoices/fulfills/refunds/settles without simulation facts | Actual offer checkout, immutable commercial snapshots, order release/custody, refund obligations, manual payout packets and T27 recovery provide substantial reusable cores. | Existing activation/API/form are simulation-only; `snapshots.ts` always writes `SIMULATED_RECORD_LABEL`, managed payout preparation requires simulation and writes `SIM-MP-*`/simulation labels. Audit and implement the separate real sale-linked route through these boundaries, billing issuer/numbering clearance, refund and settlement. A simulation lifecycle passing is insufficient live evidence. Keep manual transfer authority and actual outcomes; activation sends no money. |

## Concrete source gaps

- `lib/managed-commerce/activation.ts` exports only `activateManagedMakerForSimulation`; retain its `assertSimulationAllowed` checks. No `activateManagedMakerLive`, `live-readiness.ts` or live activation evidence tables were found.
- Both entries in `lib/configuration/capabilities.ts` have `selectableForLiveActivation: false`. Model publication is also guarded. Change the sale-linked capability only after the separate real route and its tests are proven; leave fixed live blocked.
- `getSellerReadiness` has useful statuses, responsible actors and resolution links, but its activation check uses stage/model capability and a simulation audit message; it has no exact live decision/clearance source. Add these rows and exact source references rather than creating a second inconsistent checklist. Apply model-specific bank prerequisites to new-order readiness, preserving bank-only payout hold semantics.
- `/api/admin/managed-makers/[id]/activate` calls the simulation function and returns `{ok:true,simulation:true}`. `ManagedMakerActivationForm` requires that response and retains retry identity. A real protected endpoint/action, stable core form contract, request outcome recovery, scoped history and seller notification must remain distinguishable from simulation.
- `public-catalogue-query.ts` currently selects no managed live models. `eligibility.ts`, `public-offers.ts`, availability/cart/quote and direct `orders.ts` writers must converge on the same current proof, including commit races, mixed carts and preserved existing obligations. Do not merely change the catalogue capability flag.
- Planned `drizzle/0085_live_activation_evidence.sql` is a stale number: `0085_seller_review_sources.sql` already exists. Allocate the next unclaimed additive source at implementation time with root coordination, then generate matching MariaDB source/schema and update fixtures. Never overwrite source0085 or apply a migration to canonical local data during this task.

## Reusable tests and missing acceptance evidence

These files were inspected/discovered; they were **not rerun** during this preparation.

- `seller-readiness-matrix.test.ts`, `seller-readiness-interface.test.ts`, `seller-readiness-native.test.ts`: pending PAN versus verified bank, separate capability states, scoped holds, truthful unavailable source rendering and shared role-safe UI.
- `seller-document-review.test.ts`, `protected-change-holds.test.ts`, `protected-change-disposition.test.ts`, `protected-change-native.test.ts`: exact reviewed evidence, concurrent replacement, independent holds, explicit restoration and product-readiness race. Reuse without broad document unlocks.
- `managed-commerce-activation.test.ts`: simulation prerequisites, self-review/permission/production denial and original commercial-role snapshots. `company-store-maker-lifecycle.test.ts`: simulation activation, accepted identity/rate preservation, privacy and program closure racing checkout. Its no-PAN lifecycle explicitly calls simulation and directly changes delivered/paid facts; it is not the real T28 journey.
- `product-publication-revision.test.ts`, `product-publication-http.test.ts`, `product-publication-native.test.ts`, `product-publication-browser.test.ts`: reviewed publication, browse/order distinction, exact offers and current dependency guards.
- `company-store-maker-settlements.test.ts`, `company-store-native-terms.test.ts`, `company-store-native-schema.test.ts`, existing T21–T27 payment/refund/payout/recovery fixtures: preserve actual historical model/evidence and financial caps while adding the live path.

Add `tests/live-activation-evidence.test.ts` before new behavior. Cover ordinary-staff/self/cross-seller denial; bank-with-pending-identity and missing clearance; stale/revoked/replaced identity/PAN/beneficiary/clearance/terms/company/settings before read and at commit; overlapping holds; exact replay/lost acknowledgement; browse-before-live; effective terms changes; selected stock/offer and mixed-cart atomicity; current proof at final order commit; and one genuine fictional sale-linked order→invoice→fulfillment→payment→refund→settlement/manual payout chain with no simulation references. Use native serialized races and actual UI recovery after source inspection. Keep fixed live denial and registered-seller regression explicit.

## Stale original-20 workstream rows

The progress ledger's task rows already record implementation and local evidence through T26. Its coarse workstream table largely still says “Not reconciled / Not verified.” Those labels understate the mapped verified slices; updating them must preserve open integration, native MariaDB, target configuration and deployment limits. This preparation does not edit the shared ledger.

| Workstream rows requiring reconciliation | Existing T00–T26 evidence to link | Remaining qualification |
|---|---|---|
| V01 | T06 registration/recovery | Complete journey remains. |
| V02 / V03 | T02/T04/T05 shells, T06/T09/T10, T17/T18/T22 operational workspaces | T29–T31 full workspace/notification/coverage integration remains. |
| V04 | T07/T08/T10 evidence, holds and readiness | T28 live activation is still absent. |
| V05 | T09 versioned profile and cooldown | Native/complete journey remains. |
| V06 / V07 | T17/T18 intake/publication; T16 pricing/preview | Downstream/complete journey remains. |
| V08 (already partially reconciled) | Add T21 payment/release evidence to existing T19/T20 | Current row says payment/release integration is next despite T21/T22 recorded evidence. |
| V09 / V10 | T22 response/delivery, T23 cancellation, T24 aftercare | T24 legacy suite qualification and T29/T30/T34 integration remain. |
| V11 / V12 | T11/T21 company/manual payments; T08/T26 bank/payouts | Real account evidence/execution, native parity and shared scheduling remain. |
| V13 | T15 aftercare allocations and T25 refund funding | T27 is still active at preparation time. |
| V14 | T14/T15/T20 fees/consent/combination snapshots | Actual authorized configuration and remaining integration remain. |
| V15 / V16 / V17 | T01/T04 shared notifications; T03/T12 forms; T02 authority/clocks | These are verified foundations, not complete T29/T30 delivery/coverage/health outcomes. |
| V19 | T00 reconciliation and T01 preservation contracts, plus per-task isolated checks | T33–T35 parity/full journeys/release remain. |
| V20 (already partially reconciled) | Add T21–T24 lifecycle evidence to existing T12–T20 | Row still lists T21–T24 lifecycle as future work; full integrated journey remains. |

V18's unreconciled status is supported by the still-pending T32 final Nepali guide work; do not imply completion from existing media. All 20 target configuration/delivery cells remain held/unverified until their actual evidence exists. The same caution applies to older task-row phrases naming now-implemented downstream tasks: reconcile those references without erasing their remaining integration obligations.
