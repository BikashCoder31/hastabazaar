# Super Admin Form Catalog — Design Specification

**Date:** 27 September 2026

**Status:** Written design for review; implementation has not started

**Branch:** `codex/hastabazaar-v1-2-1-staging`

**Environment:** existing isolated local staging worktree only

## 1. Outcome and scope

Super Admin can manage the fields presented by every Hastabazaar form: add a field, edit its display details, choose whether it is required, reorder it, and remove it from future submissions. Published changes apply to existing render sites and future visits without a code deployment for each field change. A removed custom field is archived; answers already submitted remain available under the access and retention rules of their parent record.

The catalog covers customer, account, seller, rider, staff, and Super Admin surfaces, including authentication, checkout, search/filter, upload, and operational decision forms. The repository currently has 68 rendered `<form>` instances across 51 files. The implementation inventory must identify each distinct form and its receiving route or action; repeated instances of one form share a stable form ID. A repository policy test must fail when a future form is added without registration and a server adapter.

The Super Admin may edit safe built-in labels, help text, placeholder text, ordering, visibility, and required status where the receiving operation explicitly supports the change. Protected system fields remain visible in the editor with a lock explanation. The Super Admin may add and archive custom fields. This does not let a form setting rewrite checkout calculations, authentication rules, consent, authorization, fraud controls, upload validation, financial state machines, or audit requirements.

This design is for local staging. It does not authorize production access, migration, configuration change, or deployment.

## 2. Form families and capabilities

| Family | Examples | Configuration and answer behavior |
| --- | --- | --- |
| Data collection | profile, address, contact, feedback, review, seller application, product submission, rider application | Safe built-in fields and new custom fields render; the server validates them and links answers to the created or updated record. |
| Transactions | checkout, gift cards, returns, complaints, payout requests | Custom answers may add context to a successful transaction; core amounts, contact/delivery facts, consent, evidence, and required reasons remain protected. Answers join the relevant order, case, or request record. |
| Identity and access | registration, login, email code, password reset, staff invitation | Credentials, codes, identity keys, anti-abuse fields, and access decisions are protected. Custom answers are accepted only by an explicit adapter, never stored alongside password/code material, and never captured from a failed authentication attempt. |
| Operational decisions | seller/product moderation, parcel/rider actions, refund/payout approval, settings and governance | Additional answers are contextual evidence linked to the resulting action/audit subject; they cannot change the decision's required evidence, permissions, or state transition. |
| Query and filter | shop search, catalog filters, order tracking lookup, staff activity filters | Presentation of existing criteria is editable where safe. A new criterion can be published only when its adapter defines query semantics; an unconnected field cannot appear to filter data while being ignored. Query values are not copied to the answer store. |

Every form gets an explicit capability display: editable built-ins, protected built-ins, allowed custom types, and whether custom values are stored or act as query criteria. The editor must explain why an operation is unavailable. A data-collecting form cannot silently omit configured fields; a query form cannot silently ignore a configured criterion.

## 3. Field model and publishing

A code-owned registry assigns each form a stable ID, audience, route/action, base fields, and adapter. A base field has a stable key, input type, label, existing validation constraints, and a capability classification (`protected`, `display_editable`, or `configurable`). Only an explicit adapter may grant a built-in field optionality, hiding, or changed choices; an editor toggle alone cannot override server logic.

Custom fields have immutable IDs and keys, label, optional help/placeholder, type, order, required flag, optional choices, and status. Initial safe types are short text, long text, number, date, single choice, multiple choice, and checkbox. Email and phone use type-specific validation. File/image/video fields require an existing purpose-specific upload adapter with its authorization, content inspection, limits, private storage, and access policy; a generic upload field cannot be published. Fields do not accept executable code, HTML, URLs for remote scripts, or arbitrary SQL.

The Super Admin editor supports draft, preview, publish, archive, and restore. Publication requires a reason and current version number. A stale version returns a conflict rather than overwriting another edit. The published configuration is immutable and versioned; rollback publishes a new version based on an old one. The audit log records actor, reason, form, version, and before/after configuration. Only an active Super Admin may mutate or publish configuration; ordinary Admin may not acquire this power through delegated permissions.

Two new tables support this contract. `form_config_versions` stores `form_id`, version/revision, draft or published status, bounded configuration JSON, actor/reason, and timestamps; the highest published version is current for each form. `form_answer_sets` stores a unique `(form_id, request_id)`, configuration-version reference, parent subject type/ID, actor when known, bounded answer/field-label snapshot JSON, and submission time; an owner index supports record detail lookup. Published configurations are immutable. Answer snapshots are not edited through the form catalog, but remain subject to authorized privacy deletion and legal retention. Append-only physical migrations must update the canonical Drizzle/D1 schema and the maintained MariaDB schema in step, but may be applied only to disposable local staging during this work. Existing migrations are not rewritten.

Publishing a newly required field affects submissions begun after publication. An open form submitting an older version receives a clear stale-form response and can refresh without losing entered text where practical. Existing records remain valid, and no historical answer is backfilled. Archiving a field removes it from future submissions but does not erase the field definition or old answers. The editor must warn when a required field would be removed or made optional.

## 4. Rendering, validation, and persistence

The same resolved published form version drives both the rendered controls and server validation. Client-side `required` and input hints improve usability; the server alone decides whether an answer is valid. The adapter merges configurable fields with its existing parser without weakening the parser's nondelegable checks. Invalid/missing required answers receive field-specific errors. Unknown fields, duplicate keys, invalid types, oversized answers, and stale versions are rejected. Custom values are bounded by field and form limits and cannot collide with protected names.

If the configuration store cannot be read, the server must not silently accept a submission under default rules that bypasses a published required field. It returns a retryable error. Existing rate limits, same-origin checks, bounded bodies, and authorization run before custom-answer persistence.

Successful submissions store a versioned answer set containing the form ID, field IDs, field labels/type snapshots, normalized answers, creation time, actor where known, and the owning domain record or audit subject. The owning action and answer set must commit together where the repository already uses a transaction; otherwise the adapter must provide an idempotent link and must not record a failed operation as success. Repeated requests must not create duplicate answer sets. Passwords, login codes, session tokens, payment credentials, and anti-abuse values are never copied into custom answers or audit JSON.

Answers display in the authorized owner/staff view of the corresponding record. A submission without a long-lived domain record has a restricted form-submission detail view. Visibility follows the parent record's permission and privacy boundary; no global answer endpoint exposes private seller, rider, customer, or staff information. Archived field answers remain readable to authorized viewers until the applicable privacy deletion or legal retention process removes them. Exports and privacy requests include applicable custom answers; legal hold remains respected.

Search/filter forms do not persist answers as personal records. New query fields need a named server-side filter adapter and tests for their result behavior before publication. This is an intentional protection against decorative controls that appear functional but do nothing.

## 5. Super Admin experience

Add **Form catalog** under Controls, visible only to Super Admin. The index groups forms by audience and shows a coverage status, published version, and last change. The editor shows a realistic form preview at phone and desktop widths, a field list with protected-field explanations, add/edit/archive controls, required toggles, choice editing, draft validation, version history, and a publish confirmation showing the affected surface. The preview uses the same renderer as the live form. Keyboard use, labels, error summaries, and screen-reader required state remain accessible.

An authorized answer viewer can see field labels and values as they existed at submission time. Archived-field answers are marked historical. The catalog does not expose password/code/token data and does not turn old operational actions into editable records.

## 6. Integration boundaries and rollout

This is a shared platform plus several integration families, so implementation is staged. Each milestone has its own testable completion gate; the final feature is complete only when every registered form is integrated or classified as a protected query/system control with its capability reason visible in the catalog.

1. **Foundation:** registry and complete inventory, field/version storage, server validator, answer storage/access model, Super Admin catalog and publisher, audit, and future-form policy test. Integrate a representative low-risk collection form end to end.
2. **Customer and account:** profile/address, contact/feedback, reviews, privacy and other customer data collection; link answers to their records.
3. **Seller and rider:** applications, products, profiles, evidence, shipping and rider workflows; preserve current private-media validation and role ownership.
4. **Commerce and identity:** checkout, gift cards, aftercare, registration and authentication forms; protect transaction/authentication invariants, idempotency, and stale versions.
5. **Staff, Super Admin, and query forms:** all remaining operational forms and filter/search surfaces; add only query criteria with real query adapters. Close inventory gaps and browser-test every form family.

The implementation plan may split these into smaller plans where the adapter or security boundary merits an independent review. A form's rollout is not complete when its field merely appears on screen: server validation, successful submission, versioned persistence or query behavior, answer visibility, and authorization must be verified together.

## 7. Verification and acceptance

Use test-driven development for every milestone. First observe a failing test for the behavior, implement it, and rerun. Tests cover draft/publish/version conflicts, Super Admin-only writes, protected fields, safe built-in requiredness, custom field types and limits, stale forms, successful and failed submissions, idempotency, archived historical answers, privacy/access isolation, upload validation, and query criteria that actually filter. A repository policy test scans form render sites and fails on missing registration or server adapters.

Run focused tests, the full suite, TypeScript, lint, build, and schema checks. Browser QA covers phone, tablet, compact desktop, desktop, and wide desktop, with representative customer, account, seller, rider, staff, Super Admin, checkout, and auth flows. Verify keyboard and screen-reader semantics, error focus, long labels, optional/required cues, empty answers, and responsive layout. No production data or services are used for these checks.

Acceptance requires that a Super Admin can add a field, make it required, submit a valid answer, see it on the correct record, archive the field, and still read the old answer; an unauthorized user cannot publish or read another party's answer; protected fields cannot be weakened; and every form in the inventory has a tested capability classification. The final report must distinguish fully integrated form families from any remaining blocked adapters and must not claim complete site coverage until the inventory is closed.
