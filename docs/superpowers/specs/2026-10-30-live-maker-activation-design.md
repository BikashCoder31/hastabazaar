# Live Managed Maker activation and document verification

> **Planning precedence — 31 October 2026:** This document is historical design/execution context for the paused work. **Implementation remains on hold.** Do not execute its task instructions as the current full-version plan. The latest [approved/proposed decision register](../plans/2026-10-30-planning-readiness-review.md) and [all-20-workstream scope](../plans/2026-10-31-complete-version-scope.md) govern fee transitions, optional intake, Approve & publish, sole-Super-Admin finance, notifications and release preferences where they supersede older text. Preserve historical agreements/orders/evidence; reconcile the actual implemented/deployed checkpoint and write the integrated execution checklist before resuming. Staging deployment remains held; no release is authorized here.

Status: proposed for user review. This document does not itself verify documents, activate a seller, enable payments, or deploy changes.

## Goal

Allow an independent Super Admin to record verification of a seller's PAN and identity evidence, and allow a Managed Maker to accept real orders only after all applicable seller, program and commercial checks are complete. Thagu Kala is the motivating case; the workflow must work for other makers without changing their records automatically.

## Existing constraints

The existing application stage `approved_for_activation` is distinct from active seller status. Bank verification has its own independent review. Both existing managed commercial models are marked unavailable for live activation, and the current activation code is simulation-only and rejects the current supplier agreement pending separately documented clearance. Public display of reviewed and published products remains separate from order eligibility. The canonical local database must not be seeded, reset, migrated or restored for development.

## Approaches

1. Remove the simulation guards and let approval activate selling immediately. This skips checks and does not establish that orders, refunds, invoices or settlements work correctly; reject this approach.
2. Build an evidence-bound live workflow around the existing sale-linked model, preserving the previous selection of a 9% company share and 91% maker entitlement where the maker has actually accepted those terms. Require documented clearance and comprehensive end-to-end verification before enabling it. This is the recommended approach. Other existing models remain blocked unless independently implemented and verified.

## Document verification

- Super Admin can inspect each private PAN or representative identity document and record verification with a reason. Explicitly identify the exact seller and document, reviewer and time. Bank evidence continues to use the existing independent bank-verification flow.
- Only currently submitted, applicable evidence may be verified. Guard ownership, current status, active reviewer permissions and concurrent changes on the server inside the transaction; prevent self-review. Preserve private access and historical records. A replacement or changed evidence does not inherit an earlier verification.
- Show pending and verified states and actionable errors without exposing private documents or identity numbers publicly. Record an audit trail. Do not assert the truth of the documents on behalf of the reviewer.

## Live activation

- Show a checklist identifying each missing condition and its responsible action. Activation is an explicit, audited Super Admin action, independent of the seller. It must recheck every condition atomically, reject stale or changed inputs, and be safe to retry.
- Require an active account, eligible application, no restriction or deletion hold, applicable verified identity and PAN evidence, independently verified current payout beneficiary, an approved product, current accepted agreement and the actual accepted company identity and commercial terms. Do not create acceptance on the seller's behalf or invent missing evidence. A seller without applicable PAN must not be silently reclassified; show what is missing for the chosen route.
- Require evidence-bound legal/accounting clearance for the actual operating model, supplier registration and tax assessment, invoice issuer, and recorded payout verification. Record reviewer, reference, scope and time; revalidation is required if the underlying material changes. Neither this application nor an admin checkbox establishes legal compliance by itself.
- Activate only a genuinely live-ready commercial model and versioned effective program configuration. Preserve the maker's accepted rate and company identity for each order. The 9%/91% split applies only where present in the accepted agreement; request renewed acceptance if necessary.
- Protect the full chain: public listing, cart, checkout, order identity, invoice, delivery/payment status, cancellations/refunds, earning and settlement records, and payout eligibility. Never label simulation records as live. Keep payouts separately controlled; activation does not send money.
- If any production dependency, legal/business clearance, infrastructure or unimplemented live financial path remains unresolved, list it and keep orders blocked. Do not bypass guards or change a real seller, settings, accepted terms or financial records to force success.

## Testing and rollout

Use fictional isolated fixtures to test authority, cross-seller access, concurrent document changes, stale clearance and agreements, duplicate requests, restrictions, and withdrawal/replacement of evidence. Prove the approved product's cart and checkout are blocked before activation and work after legitimate activation, with correct company identity, immutable accepted terms, order lifecycle, refund, earning and payout safeguards. Run existing registered seller and managed-maker regression tests, lint, type checks, build and native database compatibility tests. Browser-test seller and admin flows using fictional staging records. Review migrations and backup/rollback before applying any hosted change; deploy staging first and only then production after checks pass. Do not activate Thagu Kala or claim her documents verified merely because this feature is deployed.
