# Managed Maker Identity Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Makers without business PAN provide personal details and government ID, optionally personal PAN, accept selling under HastaBazaar, and receive sale-linked compensation controlled by Super Admin.

**Architecture:** Extend existing managed-maker application and program settings. Keep private identity and agreement snapshots in a dedicated private database table. Retain individual maker ownership and use a company selling-account configuration, not shared credentials.

**Tech Stack:** Next.js, TypeScript, SQLite/D1 and MariaDB.

**Spec:** User-approved requirements in this plan.

## Global Constraints
- Required personal details and government-issued ID; personal PAN optional and separate from business/company PAN.
- Super Admin manages managed-maker approvals and company selling account; ordinary registered sellers keep existing authorization.
- Separate explicit agreement acceptance with immutable version/time/company terms snapshot.
- Sale-linked compensation uses existing delivered-and-paid safeguards; never creates payable earnings for unpaid orders.
- Existing functions continue; retain existing commercial activation/simulation readiness guards.
- Company PAN stays in lib/content/company-details.ts; updating it once later updates company identity displays. Never fabricate a PAN.
- Work only in the managed worktree branch codex/managed-maker-identity. No deployment or main merge in this task.

## Review Focus
- Forged managed applications bypassing browser-required fields must fail before writes.
- Non-Super-Admin staff must not approve managed makers or read their private ID/PAN.
- Legacy managed applications without new evidence must not be treated as having accepted new terms.
- Company identity edits must not overwrite historical agreement snapshots or maker identity.
- Corrections after request_changes must permit supplying missing evidence without weakening requirements.

### Task 1: Managed identity, agreement, company account and approval integration

**Files:** lib/sellers/application.ts; lib/forms/submission.ts and related protected form field declarations; app/api/seller-applications/route.ts; lib/db/repositories/seller-applications.ts; components/seller/seller-application-form.tsx; app/sell/page.tsx; managed maker profile correction routes/components as needed; lib/configuration/types.ts and definitions.ts; components/admin/business-settings-manager.tsx; app/admin/programs/page.tsx; app/admin/sellers/[id]/page.tsx; app/api/admin/seller-documents/[id]/route.ts; managed activation form; new private detail repository/helper if useful; drizzle/0068 and matching MariaDB migration/schema/manifest; focused tests.

- [x] Write focused failing tests for required managed government ID, optional validated 9-digit personal PAN, explicit agreement version/acceptance, private atomic persistence, Super Admin-only review, and company account settings.
- [x] Add required government ID type (citizenship, national_id, passport, driving_licence, other_government_id with issuer/description), required private representative_identity upload, optional personalPan and optional personal PAN certificate using existing pan_certificate document kind. Keep registered flow behavior.
- [x] Add managed agreement version constant and user-readable separate terms, explicit unchecked acceptance and server version validation. Snapshot accepted time, actor, company identity, sale-linked commercial model and configured retention (existing default900bps) atomically with application. Do not trust client company/fee fields.
- [x] Save private metadata in new managed_maker_application_details table; adapt SQLite, MariaDB schema and release required migrations. Do not expose metadata in public seller responses.
- [x] Add Super Admin-controlled operational company seller account setting (store name, contact, return address; stable entity reference) alongside existing program settings. Canonical legal identity/PAN stays read-only from company-details. Prefill company selling identity for makers separately from their own personal inputs. Use server settings and defaults safely.
- [x] Restrict managed-maker review actions and private document retrieval to Super Admin including repository authority checks. Require ID and current accepted agreement before approve_for_activation. Allow existing correction workflow to provide missing new evidence; never backfill fake acceptance.
- [x] Connect company account defaults to existing managed activation UI while preserving all activation readiness guards. Preserve existing sale-linked payout rules and demonstrate unpaid orders cannot accrue payable earnings using existing meaningful tests.
- [ ] Update conflicting fixtures and tests, run targeted tests then lint/typecheck and relevant full suite once, self-review and commit. Report exact validation and limitations. Do not deploy or push.

Implementation note: company selling identity is displayed separately beside the existing guarded activation form. Fictional SIM activation references remain unchanged by explicit controller ruling. Full-suite verification is in progress; final affected tests and local Babal build pass.
