# Managed Maker public listings implementation plan

> **Planning precedence — 31 October 2026:** This document is historical design/execution context for the paused work. **Implementation remains on hold.** Do not execute its task instructions as the current full-version plan. The latest [approved/proposed decision register](2026-10-30-planning-readiness-review.md) and [all-20-workstream scope](2026-10-31-complete-version-scope.md) govern fee transitions, optional intake, Approve & publish, sole-Super-Admin finance, notifications and release preferences where they supersede older text. Preserve historical agreements/orders/evidence; reconcile the actual implemented/deployed checkpoint and write the integrated execution checklist before resuming. Staging deployment remains held; no release is authorized here.

> Use superpowers:executing-plans to implement and verify these tasks in the current checkout.

**Goal:** Display staff-published Managed Maker products before commercial activation without allowing orders until existing commercial eligibility is met.

**Architecture:** Separate public listing visibility from the existing strict purchase predicate. Apply visibility only to public reads, search, SEO and media, and expose the purchase state to customer-facing views. Preserve all strict cart and checkout checks, seller restrictions and product ownership controls. Keep product approval and publication as separate staff decisions.

**Tech stack:** Next.js, TypeScript, D1-compatible SQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-30-managed-maker-product-release.md`.

## Global constraints

- No simulated activation, fabricated evidence, changes to seller accounts or weakening of cart, checkout and payout checks.
- Do not modify or seed the active local database; run tests in isolated fixtures.
- No schema migration is required for catalogue visibility.
- Browse-only visibility requires an active owner and an approved-for-activation Managed Maker, subject to restrictions and deletion checks. Existing active makers retain their current-evidence checks.
- Preserve existing registered-seller and active-maker purchasing behavior.

## Review focus

- Rejected, restricted, deleted, suspended and unapproved sellers and products stay hidden.
- Listing photos cannot expose private draft media.
- Existing cart contents and direct requests cannot bypass strict checkout eligibility.
- Search, product-page metadata and availability copy must not describe an unpurchasable item as available.
- Staff publication messages must distinguish review approval, public visibility and order readiness.

### Task 1: Visibility and commerce boundary

**Files:** `lib/products/eligibility.ts`, `lib/db/repositories/products.ts`, `lib/db/repositories/catalog.ts`, `lib/seo/discovery.ts`, relevant customer-facing repositories and `tests/managed-maker-public-listings.test.ts`.

- [ ] Build isolated fixture tests for approved and published Managed Maker visibility, restricted and deleted records, and strict purchase eligibility; observe the missing visibility behavior fail.
- [ ] Introduce a visibility predicate while retaining the existing purchase predicate on cart and checkout; use visibility only on intended read-only surfaces and media.
- [ ] Expose a boolean purchase state on catalogue/detail data and run the focused tests.

### Task 2: Honest customer and staff presentation

**Files:** `app/shop/page.tsx`, `app/products/[slug]/page.tsx`, relevant product card/structured data and `components/admin/product-review-actions.tsx`.

- [ ] Add focused tests for unavailable-order presentation and accurate staff confirmation; confirm failure.
- [ ] Render a clear unavailable-to-order state, prevent misleading inventory and add-to-cart controls, and update publishing language.
- [ ] Verify accessible desktop/mobile views and run focused tests and type checking.

### Task 3: Complete flow and release

- [ ] Run seller product, catalogue, restrictions, cart, checkout, and public media regression tests, followed by the full relevant release checks and read-only local preflight.
- [ ] Review the final diff and test results, build the verified release from an isolated commit, and deploy to staging using the approved release process.
- [ ] Verify fictional seller submission, independent staff approval/publication, public visibility without ordering, and protected cart/checkout on staging. Promote the exact verified artifact to production only after release and health checks; back up as required.
- [ ] Confirm production version and public behavior without changing real seller approvals or data, and report remaining commercial activation work.
