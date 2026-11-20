# Form Management — reliability and simpler administration

Status: approach approved on 30 October 2026; planning only, implementation on hold. Following frequent “Form configuration is unavailable. Please try again” failures, the user approved stable feature-owned core forms with limited Form Management customization, safe publication, preserved progress, useful errors, a simpler editor and archival of reviewed unnecessary questions. This is approval of the planned approach, not implemented behavior or permission to modify production. Implementation remains on hold until planning is complete and the user asks to begin.

Latest D22 [optional product intake/support](2026-10-31-optional-product-intake-support.md) makes all supported details discoverable with optional entry for save/review assistance; missing publication facts are handled later. Every operational notification, including support/application/product intake, must reach Super Admin by email and dashboard/bell alongside its owning team. Preserve permissions, safe values and truthful publication/order checks.

Related: [Working plan](../plans/2026-10-30-seller-order-response.md), [Seller Center](2026-10-30-seller-center-workspace.md) and [Super Admin Seller Management](2026-10-30-seller-management-workspace.md).

The [approved System health & records design](2026-10-31-system-health-records.md) places this approved Form Management approach in the consolidated health/incident workspace. Monitoring, incident and service-recovery rules are now approved; the new backup program is explicitly deferred. Approval does not reopen field cleanup or weaken core validation, access and version safeguards. Implementation remains on hold.

## 1. Evidence and limits of this investigation

This is a read-only local source review, not a captured browser audit or a reproduction of the latest production incident. No production configuration, live logs, failing response or current publication record was inspected in this step. Before implementation, identify the failing form, account stage/permission, application release, response status and published version privately; do not assume every occurrence has one cause.

Observed in local code:

- `components/forms/form-config-client.tsx` fetches a separate form configuration with no-store caching. Non-success responses, JSON/contract rejection and fetch failures lead to the same generic unavailable message. A previous config may remain in memory, but submission requires the Ready state. The client separately validates a restricted schema and specific built-in fields.
- `app/api/forms/[formId]/route.ts` deliberately returns the same not-found response for unknown forms, disallowed audiences and missing publication. Unexpected reads produce a generic 503. This protects discovery but means the visible error does not identify missing publication versus access/session issues. Do not leak restricted form existence when improving it.
- `lib/forms/runtime.ts` resolves the highest published version from the database and rejects absent, invalid or incompatible stored configuration. A saved draft is not a published usable version. Stored JSON is checked against the current application definition.
- `lib/forms/submission.ts` rejects a new submission against a non-current version. It permits a narrowly validated replay of an already-recorded request. A cosmetic publication still increments the version, so version changes can interrupt an in-progress form even when answers remain semantically valid. Do not remove retry/concurrency guards to disguise this behavior.
- Server definitions and the client parser both carry contract constraints. Definition, publication and deployed client/server drift are possible failure categories requiring evidence; divergence was not established for the latest reported failure.
- The existing admin UI already provides filtering, drafts, preview, a change summary, publish/restore controls and history. `lib/forms/catalog-presentation.ts` already excludes many identity, query and feature-managed forms from editing. Hiding an entry in this UI does not remove its runtime publication dependency.
- `lib/db/repositories/form-catalog.ts` preserves field identity/type and supports archiving historical fields. Publish/history/authorization safeguards are valuable. Revalidating stored history against current definitions can also make a record unavailable when contracts change incompatibly; investigate specific affected records without deleting history.
- The editor still exposes a New field key input and suggests “What time can we contact you?” as an example, even though the user removed that question from seller registration. These are concrete simplification candidates, not a reason to discard the whole catalogue.

The confirmed design problems are the undifferentiated recovery message, a broad runtime dependence on published metadata and strict version disruption. The exact live incident still needs diagnosis. No claim is made that a particular production record is corrupt or missing.

## 2. Approved direction and considered alternatives

The approved direction is stable core forms owned by their features, with a smaller Form Management area for permitted wording and extra questions. Preserve required domain validation, permissions, accepted terms, transaction guards and history. This needs coordinated UI and backend work; hiding the catalogue or the error alone is not a fix.

| Approach | Assessment |
|---|---|
| Improve error text/retry only | Useful first step, but missing configuration and version disruption can still stop users. Insufficient by itself. |
| Remove the entire catalogue immediately | Removes useful controlled customization and risks orphaning answers/configuration and breaking existing endpoints. Not recommended. |
| Stable core forms plus limited, versioned customization | Approved approach: common tasks stop relying on editable extra-question metadata, while Super Admin retains useful controlled changes. Requires explicit compatibility and migration planning. |

Priority: treat this as a foundation for the Seller Center redesign. Stabilize the core form path and publication/recovery behavior before adding more screens dependent on the same mechanism.

## 3. Separate core behavior from customization

Build an inventory mapping each form to its owning feature, route, audience, core fields, permitted custom questions, stored answers and current publication dependency. Categorize actions by their actual semantics rather than blindly excluding all forms with one technical mode.

- Core registration, profile editing, product submission, stock updates and order actions use versioned feature-owned contracts. They retain their permissions, validation and domain rules even if optional editorial settings are unavailable.
- Sensitive actions such as document verification, bank review, payout approval, commission acceptance, permissions and account access stay with their purpose-built workflow. Their authority, amounts, legal text, required evidence and validation cannot be redefined by an arbitrary extra-question editor.
- Catalogue customization is limited to approved display fields and extra business questions with a documented purpose. Default new extra questions to non-blocking; making one mandatory needs an explicit explanation of the action affected and compatibility review. This cannot override optional registration/product draft or assistance intake under the approved scope and D22. Genuine required facts belong to the affected later publication, ordering, verification or financial action; an extra-question editor cannot redefine those core rules.
- Protect the agreed simple seller registration: no restoration of mandatory intake fields through generic customization, no repeated “optional” labels, and no bank/product/public-profile sections moved back into initial registration. Those requirements belong to the relevant later action.
- Where a truly optional customization is absent, the feature may use its explicit, reviewed built-in baseline. This must be supported by the server contract and preserve any submitted extra answers. Do not silently drop required configured information or treat an invalid/missing policy as permission to perform a sensitive action.
- If metadata is temporarily unreachable, continue only with an explicitly eligible, verified published definition that the server will accept. Do not trust arbitrary client cache, an expired/revoked definition or an old commercial agreement. A general database/session outage may still prevent saving; core independence must not produce false success.

The current registry, published versions and submitted answer histories remain until their consumers are deliberately migrated. A label rename from Form catalog to Form Management does not imply this separation has been completed.

D21 [category-specific forms and real variants](2026-10-31-retail-categories-product-variants.md) now extends the approved stable-core approach. Category contracts govern relevant field visibility/validation and allowed offer structure; ordinary wording/extra-question edits cannot redefine money, stock or variant identity. Preserve draft values across category changes, show an impact preview, and never bypass required category policy with a generic fallback. New-only condition and relevant requirements apply at the actual product action; initial registration and unrelated fields stay permissive.

## 4. Draft, validate, preview and publish safely

Keep the existing draft/publish distinction. Editing or saving a draft must never interrupt the current live form.

Proposed sequence: choose the business form → edit permitted questions/wording → check changes → preview the actual feature form → publish when checks pass. Preview should use the same rendering and validation contracts as the seller/customer/admin feature, with fictional input and no real submission effects. A generic extra-question preview is not enough to prove the whole feature still works.

Before publication, check the candidate against deployed server/client contracts, allowed fields, field identities, permissions, action-specific requiredness, accepted-term boundaries and the current live version. Show a plain change summary, affected users/actions and whether saved drafts need review. Keep technical details available in a diagnostics panel.

Publish atomically and retain the previous valid live version. A failed publication leaves it working. Detect incompatible releases/configuration before traffic is switched; a Published badge alone is not proof that the runtime form can load and submit.

Provide Restore previous working version as a controlled action with a preview and recorded reason, retaining history and existing answers. Restore must pass current compatibility checks; it cannot roll back security requirements, accepted commission terms or current authorization. Do not automatically restore an invalid historical record or publish empty defaults to clear an error.

Extend release readiness with a form manifest and checks for required definitions, renderer compatibility and allowed access at representative seller stages. Review any required data transition explicitly, preserving prior answers and original versions. Keep the canonical local launcher/preflight guards unchanged: no automatic seeding, migration, database reset or fallback launch to make a check pass.

## 5. Avoid breaking forms people are filling out

Classify each publication by impact:

| Change class | Proposed handling |
|---|---|
| Verified presentation-only change | Permit compatible in-progress submissions under an explicit server-side compatibility policy, recording the version actually shown. No forced full restart merely for spacing/reordering or genuinely equivalent wording. |
| New required question, changed choices or changed answer meaning | Preserve compatible answers/uploads, explain the exact changes and ask for only the newly needed review/input before the affected action. Keep approved optional draft/registration/product-assistance intake available; do not turn a later publication/ordering requirement into compulsory initial entry. |
| Terms, commission, security, money or identity-verification change | Require the applicable current review/consent and authoritative checks. Never treat it as cosmetic or bypass it through an old draft. |

A label edit can change meaning and is not automatically presentation-only. Bound eligibility of previous definitions and support explicit revocation. Continue to recheck account permissions, product ownership, prices, inventory, bank state and applicable policies at submission; accepting a compatible form version is not freezing those business rules.

Stable field identifiers allow answer mapping. Archive a removed question from new collection while preserving its previous answers and labels. If an answer cannot be mapped safely, identify that field and retain it for review in the permitted private draft/history; do not silently discard or submit it under a different question.

Keep real save state visible. Restore previously saved progress after navigation, session recovery or a form update. Avoid full-page reload instructions when an in-place refresh/review can resolve the issue. Retry an uncertain submission using its existing request identity and show the recorded result instead of duplicating an application/product/payment action.

## 6. Helpful errors and staff diagnosis

Treat error states separately, while protecting permissions and private data:

| Situation | Seller/user experience | Authorized staff experience |
|---|---|---|
| Loading | Short loading state; keep already entered data visible where safe | No incident until a defined failure/timeout occurs |
| Connection problem | “We couldn't connect. Your last saved progress is available.” Retry; distinguish saved from unsaved changes | Failure category, time and non-sensitive request reference |
| Session expired | Sign in again, then return to the preserved permitted draft | Authentication outcome, without exposing credentials |
| Form questions changed | “This form has been updated. Review the highlighted questions.” Keep unaffected answers | Old/new compatible versions and affected fields |
| Actual configuration unavailable/invalid | Explain temporary unavailability with Retry and Get help; never claim saved work that was not saved | Exact missing/invalid/incompatible publication category, form ID, environment, release and recovery action |
| User not permitted | Clear access/help route when safe; do not disclose restricted forms | Permission and seller-stage mismatch investigation |

Add a safe support reference and automated incident signal for confirmed configuration failures, deduplicated by form/version/environment. Show impacted tasks and failure trend in Super Admin's form health view. Do not log answers, citizenship documents, account numbers, tokens or full request bodies. Distinguish a business validation problem from an infrastructure problem.

Expose bounded retry and real save/delivery feedback. A customer-facing failure must not silently lock every independent dashboard section. A configuration failure during commission acceptance must create an actionable technical follow-up under the approved 24-hour assignment/48-hour recovery target, without faking acceptance or bypassing the new-order hold.

## 7. Smaller, clearer Form Management UI

Proposed primary view: business form name, who uses it, availability, unpublished changes, last changed by/date and Open/Preview actions. Separate Live and working, Draft changes, Needs repair and Managed by its feature. Draft edits alone should not be counted as an operational outage. Retain category/search filters where they help finding work.

Use three main editor areas: Questions, Preview and Change history. Keep publish checks and a concise “What will change?” summary close to the Publish action. Health diagnostics, version IDs, internal keys and system details live in Advanced details for authorized users rather than the everyday editing path.

Specific cleanup candidates:

- Generate a stable key from a new question's identity rather than asking ordinary editors to invent a technical field key. Preserve identifiers for existing fields; labels must not rename stored keys.
- Remove the obsolete contact-time example and discourage reintroducing fields already removed from seller registration.
- Review duplicate questions and repeated collection of known profile data. Reuse appropriate existing data with a visible source/review option rather than silently copying private information into unrelated submissions.
- Hide non-editable system controls from the standard editor or link directly to their owning feature. Keep diagnostics/history discoverable. Some of this separation already exists; extend it based on the inventory rather than duplicating it.
- Archive truly unused custom questions only after checking their owning process, dependencies and historical answers. “Useless” must mean no present business purpose, not merely low usage or a technical-looking name. Never delete verification, audit or financial evidence as cosmetic cleanup.
- Reduce repeated warnings and required/optional clutter while retaining a clear indication of what a specific action still needs. Protect server requirements rather than relying on visual labels.

Do not add form editing to the seller's own workspace. Sellers complete the relevant feature form; only authorized staff manage shared questions. Link Super Admin from a failing seller task to the correct form health/configuration view with context.

## 8. Phases for later implementation and verification

1. Diagnose representative failures with protected read-only environment/configuration checks. Record the actual response, permission, published/version contract and affected action. No mass-republish or blanket reset.
2. Add precise recovery and diagnostics while preserving existing authorization, replay and publication controls. Keep live drafts/answers intact.
3. Migrate the highest-impact core seller forms away from unnecessary editable-metadata dependency, one feature at a time. Make required custom information and historical answer handling explicit; preserve optional initial registration and current financial checks.
4. Add compatibility-aware publishing and in-progress draft recovery. Simplify the admin editor and archive only reviewed obsolete fields. Complete the form-to-feature inventory before removing a runtime consumer or database dependency.
5. Verify the complete UI → API → saved record → admin review journey with fictional data before a separately authorized release. Use the user's chosen release process and backups; this planning document does not authorize staging/production operations.

Acceptance scenarios for later verification:

- Saving an admin draft leaves the live seller form usable; failed publish leaves the valid live version unchanged.
- A cosmetic compatible publication does not discard answers or cause repeated stale-form failures; a meaningful changed question prompts only the required review.
- A missing optional customization does not stop a migrated core task; missing required policy/evidence still blocks only the relevant action with a truthful explanation.
- Missing publication, malformed configuration, renderer/schema mismatch, wrong audience, expired session and network outage are distinguishable to staff and recoverable to the user where possible.
- Applicant, under-review, approved-for-activation and active sellers can reach the correct forms without broadening permissions. A feature page and its form endpoint agree on who may use it.
- Product photos, saved registration details and profile drafts survive retries/review; lost responses do not duplicate submissions.
- Archive/restore retains historical labels/answers and cannot reuse a field identity with a different meaning/type. Old contracts remain readable without being mistaken for active definitions.
- Required registration options, document locks, bank changes, current commission acceptance and payout/order guards remain correct throughout migration.
- Native previews and published forms agree in Nepali/English and on mobile/keyboard use. Availability badges reflect validated readiness, not merely a version number.
- Recovery/release tests never seed, migrate or reset the canonical local database automatically or bypass the launcher checks.

### Required release evidence

On 30 October 2026, alongside approval of the seller/admin notification bell, the user reiterated that Form Management must be properly managed and reliable. Treat the following as acceptance requirements for later implementation. Planning approval does not establish that these checks have passed, and no claim of zero possible future failures is made.

| Area | Evidence needed before the affected release is considered ready |
|---|---|
| Actual cause and configuration compatibility | Identify the affected form, account stage, release, response and publication version. Validate required definitions against the target client/server contracts; a published-version badge or local metadata-only check is insufficient. |
| Seller and staff journeys | With fictional data, verify relevant registration, profile, documents, product submission/correction and staff review from UI through API to saved record and returned state for the appropriate account stages and permissions. Product review intake must accept one cover/no occasions and also D22 incomplete/zero-cover assistance intake. Publication must require an accurate usable cover and the actual offer facts; no blank value may become fake valid data. |
| Publication and edits in progress | Draft saves and failed publications leave the valid live form usable. Compatible changes preserve answers; meaningful changes identify what needs review. Concurrent edits and retries do not overwrite newer records or duplicate submissions. |
| Optional and conditional fields | Empty optional registration and inactive conditional fields do not block their permitted action. Relevant mandatory evidence, consent, bank checks and financial constraints still apply. Client and server rules agree. |
| Progress, media and recovery | Confirm saved answers/uploads survive navigation, session recovery, retries and supported version changes. Show truthful unsaved/failed states; no silent loss or false success. Test restore with compatible history and preserve audit records. |
| Bell and full inbox | Direct links open the current authorized record/section/field, preserve drafts and handle moved/archived fields safely. Read status synchronizes without completing the underlying task. Notification loading/read failures do not block otherwise valid form work. |
| Release recovery and observation | Record results against the candidate release/configuration versions, resolve known blocking failures, verify the recovery path and diagnostic alerts, then perform the planned smoke checks after a separately authorized release. Do not expose private answers in diagnostics or weaken validation to obtain a passing result. |

Implementation and deployment remain on hold until planning is complete and the user asks to begin. These checks must follow the canonical local launcher/database safeguards and the user's eventual release authorization; no seeding, reset, migration or deployment is authorized by recording this requirement.

## 9. Planning decisions still open

The core/customization approach and [keep/simplify/remove field cleanup](2026-10-30-form-management-field-inventory.md) are approved. On 30 October 2026 the user also explicitly approved one clear cover photo and optional gift occasions for product submissions to admin review. The inventory records all 65 catalogue placements; actual production definitions/dependencies and compatibility/revocation handling still need mapping before cleanup. D9 now approves a standard payout purpose with an optional note; map that change across native and form-contract validation during later implementation. The essential next implementation evidence is the current affected production form/version and the failure category; do not present local source/configuration checks as a proven production root cause. Implementation remains on hold until planning is complete and the user asks to begin.

Only planning documents were updated to record approval. No code, configuration, data or historical record has been changed. The user retains the implementation hold until planning is complete and implementation is explicitly resumed.
