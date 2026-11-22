# Form Management — keep, simplify and remove inventory

Status: field cleanup and product review intake policy approved on 30 October 2026; planning only. The user approved this keep/simplify/remove approach and explicitly allowed one clear cover photo with optional gift occasions when submitting products for admin review. This records approval, not implemented behavior. Remaining separate policy/details are identified below. Implementation, configuration publication, migration and deployment remain on hold until planning is complete and the user asks to begin.

Approved D22 amendment, 31 October 2026: [optional product intake/support](2026-10-31-optional-product-intake-support.md) supersedes mandatory product-entry assumptions in this historical inventory. All supported product details remain discoverable; incomplete entries reach assistance, while truthful publication/order checks apply later. The old 65-entry/source findings remain observations, not a claim that new behavior already exists.

Related: [Approved approach](2026-10-30-form-management-reliability.md), [working plan](../plans/2026-10-30-seller-order-response.md), [Seller Center](2026-10-30-seller-center-workspace.md), [Super Admin Seller Management](2026-10-30-seller-management-workspace.md).

## 1. What was reviewed and what the numbers mean

Reviewed the current local registry, catalogue presentation/editor, native registration, maker/business profile, product submission, bank, stock and payout-request components, and the registered contracts for other catalogue entries. All 65 catalogue entries are classified below; detailed field recommendations focus on seller management and the shared editor. This was not a browser journey test or a complete endpoint audit of every feature.

Also opened the single canonical local D1 application database read-only and selected only form configuration metadata/definitions. No seller/customer answers, document contents, bank records or production database were read. No configuration or database was changed.

| Local finding | Meaning |
|---|---|
| 131 registered form definitions | Includes native operations, identity and queries, not 131 questionnaires users must fill out. |
| 65 exposed in the catalogue; 66 excluded | Existing filtering already hides many system/feature-owned forms. |
| Seven exposed forms permit built-in display editing | Four seller forms and three public contact/feedback variants. Most catalogue entries do not permit changing their core fields. |
| 58 exposed forms have only protected built-in fields | Their catalogue entries largely wrap native actions with extra-question capability or describe a fixed action. |
| 64 of the 65 exposed entries permit extra questions | Broad configurability is available even for many sensitive or routine operations. Availability is not evidence of a business need. |
| 89 latest published definitions; all 65 catalogue entries have one locally | No missing publication among those 65 at this snapshot. This is not proof of production readiness or successful submission. |
| One custom question in all inspected latest publications: `seller.application.contact_time`, archived | “Best time to contact you” is already retired locally. No active custom questions or display overrides were found in those publications. |
| No saved draft configuration records | There was no unpublished local question set needing separate classification at this snapshot. |
| Stored definitions passed the current server draft validator | Does not validate actual fetch permissions, frontend parsing, deployed code compatibility or full feature behavior. |

The local evidence does not support blaming a large number of active unnecessary custom questions. The main simplification opportunity is reducing unnecessary runtime dependency, technical editing controls, repeated entry and irrelevant always-visible fields. Production definitions may differ and must be inventoried before any later cleanup.

## 2. Meaning of each recommendation

- **Keep:** retain the information and its appropriate business validation. It may belong in the native Seller Center or staff task rather than the generic editor.
- **Simplify:** reduce repeated entry, group related fields, improve labels or show conditional fields only when relevant. Preserve distinct information and historical meaning.
- **Remove from ordinary editing:** stop exposing a system value or native action as a configurable question. Keep its server checks and historical records.
- **Archive:** stop collecting a reviewed obsolete custom question on new forms while retaining prior answers and field identity. No destructive deletion of evidence or transactions.

Initial registration remains permissive under the approved policy; it is separate from the information needed before product publication, accepting orders or payouts. Hiding a field must not leave an invisible validator blocking submission. Conversely, visual cleanup must not bypass a legitimate requirement for a later action.

## 3. Registration, identity and addresses

The current `/sell/apply` renders `SellerRegistrationIntakeForm`, posts to `/api/seller-registrations` and still fetches `seller.application` configuration. That registry definition names `/api/seller-applications` and marks `tradingName` and `businessDescription` as required display fields. The current intake uses static registration labels, accepts missing information and omits the business-description section. Align the editor, preview, native parser and current route before offering these edits: the catalogue's required badges do not describe the current intake accurately. This mismatch is established in source, but not proven to cause the reported production error.

| Existing field/group | Recommendation and destination |
|---|---|
| How you want to sell (`hasBusinessTaxRegistration`), applicant type, tax status | Keep the route decision in registration; show business type and tax status only for the registered-business route. Use plain labels and explain the route. Keep route transitions in their reviewed workflow. |
| Legal name, shop/trading name, representative name | Keep their distinct meanings. Label legal name by route: Full legal name or Registered business name. Shop name is public; representative name appears when someone applies for a business. Do not merge verified identity with a changeable public name. |
| Account email | Keep read-only from the signed-in account with its actual verification status. Correct it through account settings; avoid asking the seller to retype it in each submission. Do not imply phone verification from email verification. |
| Phone country and contact phone | Keep together, Nepal selected initially and the existing agreed 10-digit/no-SMS intake policy. Reuse saved contact details where appropriate. Do not add an OTP field or change international-number policy during this cleanup. |
| Province, district, municipality, ward, locality | Keep one structured operating-address group. Reuse saved information and validate only supplied/needed values at the relevant stage. Avoid asking for the same operating address in three separate profile screens. |
| Full pickup address and full return address | Keep both distinct destinations, with the existing Same address checkbox and editable dashboard values. Offer reuse of the operating address where appropriate; retain an editable full-address preview and manual alternative. Do not overwrite a distinct return location automatically. |
| City customers will see / public city | Keep as a public display field separate from private operating/pickup/return addresses. Suggest the saved municipality, with seller confirmation/editing. Do not publish a private street address to avoid this extra field. |
| Citizenship number (`governmentIdDescription`) and ID type | Keep in Registration & documents, with Citizenship number for citizenship evidence. The current ID-type selector also allows other types: label the corresponding number accurately if another permitted type is chosen. A document-type policy change needs separate agreement. |
| Personal PAN; business PAN/VAT number; tax status | Keep route-specific fields and validation. Avoid showing both personal and business tax inputs indiscriminately or asking the same tax number twice. They are not interchangeable identities. |
| Business registration number and registration authority | Keep only for the applicable business route, grouped with business registration evidence. Use the saved record during later reviews. |
| Identity, PAN, VAT and business-registration uploads | Keep the applicable evidence, one clear upload/status card per document. Show saved filename, review state and reviewer/date where permitted. Verified evidence remains locked behind the agreed reasoned change-request flow. |
| Agreement checkbox, current terms and application acknowledgement | Keep actual consent and acknowledgement semantics. Show a short checkbox label with expandable full text and current/scheduled commission wording from the approved terms plan. Versions, acceptance context and timestamps are automatic records. Do not combine separate legal events into one misleading checkbox or let staff accept for a seller. |
| Bank details, public maker profile and products in the initial application contract | Keep them in their dashboard sections as previously agreed. Their old keys still appear in the broad registry definition; remove misleading registration-editor exposure only after confirming consumers. Do not erase the underlying data. |
| Best time to contact you (`contact_time`) | Keep archived. It is already archived in the local latest publication; verify production state before any later action. Remove the editor's contact-time example so it does not encourage reintroducing the question. |
| Hidden `website` anti-abuse field | Keep its protection in the native implementation, hidden from normal users/editors. It is not a real website question and should not be deleted as unwanted seller data collection. |

No imports/usages of the old `SellerApplicationForm` were found outside its own component in the inspected app/components search. It still contains older profile, product and bank sections. Flag it for a complete reference/dependency review before retiring it; do not treat its old visible fields as the current `/sell/apply` screen or delete shared subcomponents that the current maker correction flow still uses.

## 4. Shop profile and product-business description

The approved cleanup below is retained. The [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md) and first routine profile review within 1 business day are approved under D3 on 31 October 2026. D2 [published-product edit rules and first revision review within 1 business day](2026-10-31-published-product-edit-rules.md) remain approved. Policy approval does not change current forms or establish implemented behavior; implementation remains on hold.

| Existing field/group | Recommendation and destination |
|---|---|
| Public maker name, public trading name and public city | Present one Shop & profile experience with a clear saved source for each route. Avoid repeated edits to two public-name forms. Keep legal identity separate and preserve the approved seven-day public-profile cooldown. |
| Customer support email and phone | Keep as public contact details. Offer Use my account/business contact with clear disclosure of what becomes public and an option for separate support contacts. Do not assume private registration contact should be public. |
| Business description / Maker story / Tell us about your work | Consolidate the overlapping capture into one shared business/about-shop section with consistent limits and review policy. Preserve existing differing records during migration and ask which content to retain when they conflict. Product descriptions remain product-specific. |
| Product types / Crafts and specialties / experience craft | Group related craft information. Keep specialties and experience meaning distinct, reuse an existing craft choice and avoid retyping the same list. A structured selection can replace repeated free-text lists after taxonomy mapping. |
| Experience band | Keep non-blocking in an About the maker section; show it with the corresponding craft. Empty values should not block profile progress. |
| Facebook, Instagram, LinkedIn, TikTok, X and YouTube links | Replace six always-visible blank inputs with Add social link → select network → enter URL. Preserve supported networks, existing values and URL validation. |
| Shop photo/logo and maker video | Keep photo/logo in the profile and video under additional media. They do not belong in initial registration. Preserve existing media if the field is left blank and show its review state. |
| Identity, agreements and pickup/return fields within correction mode of the public-maker form | Move the correction task into Registration & documents with links from profile. Scope fields to the actual requested correction. Do not let the seven-day public-profile cooldown prevent an identity correction or necessary terms acceptance. |
| Repeated “(optional)” labels and long instructions | Use short labels and one concise completion message; show detailed help on demand. Do not make blank non-required fields fail merely because the label has changed. Requiredness must reflect the action, not a global visual toggle. |

## 5. Product submission and stock

The approved cleanup uses a short main section for product name, category, description, price, quantity, preparation time and photos, with additional information grouped by relevance. Saving a draft and submitting for review remain different actions. The user approved the one-cover-photo and optional-occasions policy for review submissions; the existing component's behavior remains unchanged until implementation is resumed.

| Existing field/group | Keep/simplify recommendation |
|---|---|
| Product name and description (`nameEn`, `descriptionEn`) | Keep clear customer-facing product content, with permitted label/help customization only. The inspected parser required these fields. D22 permits missing content at assistance intake; actual public content is completed before publication. This changes intake requiredness, not the excluded language/translation policy. |
| Nepali name and description (`nameNe`, `descriptionNe`) | Keep under an Add translation section, preserving existing text. Do not require duplicate language entry merely to save a draft. |
| Category | Keep a searchable category selection. Category/taxonomy definitions stay in product management, not arbitrary custom choices that could break moderation. |
| Gift occasions (`occasionIds`) | Approved for review submissions: optional, so zero selections must be accepted. Retain validation and the existing maximum of five when occasions are supplied; the moderator may complete relevant discovery tags. Never invent tags to satisfy a validator. The inspected current parser still requires 1–5 until the approved policy is implemented. |
| Product photos | D22 now permits zero-cover incomplete review/assistance intake. Before publication, at least one accurate usable cover is needed and one may suffice; no universal four-photo requirement. Preserve saved previews, media security, ordering/replacement and current public media. The earlier inspected UI/parser/revision requirements remain source evidence until changed in later implementation. |
| Product video | Keep non-blocking in Additional media. Reuse existing media and show permitted format/size limits beside upload. |
| Platform SKU and seller SKU | Keep automatic platform identity read-only. Put the seller's own stock code under Advanced details for sellers who use it. Do not ask them to invent or change platform IDs. |
| Selling price, original/compare-at price and discount percentage | Make Selling price the primary editable amount. Under Add a sale price, keep original price and calculate discount percentage as a display. Avoid three competing editable values. Preserve the authoritative server calculation and historical order prices. |
| Private cost, target profit and public preview — approved D19 addition | The [pricing/public-preview supplement](2026-10-31-seller-price-public-preview.md) sets out the approved live fee/remaining-amount summary, optional owner-private cost/target guidance and clear public/private groups with a customer preview. These are approved additions for this version, not claims about the 65 inspected catalogue entries. D20 selling/original-price refinements are now approved, including optional price changes and no automatic 30-day removal. Keep costs out of public/reviewer payloads; do not add mandatory cost/occasion/photo fields or bypass price review. |
| Quantity and preparation days | Keep explicit stock and preparation controls. Preserve stock validation and order commitments; distinguish available-now and made-to-order behavior. A preparation estimate must not be inferred from incomplete marketing information. |
| Stock-update reason | The current stock editor generates “Seller stock count update” automatically. Keep that audit information; do not add a mandatory free-text question for every stock change. |
| Materials | Keep the current add-material interaction under Product details. Blank materials do not currently block submission. Do not turn suggestions into verified sustainability claims. |
| Dimensions, size, colour, variations and specifications | Show category-relevant controls and avoid repeating the same dimensions in multiple fields. Retain free text where structured mapping is not yet agreed. “Variations” was text in this inventory; that alone does not implement purchasable offers. [D21](2026-10-31-retail-categories-product-variants.md) now explicitly includes category-specific forms and real variant identities, prices, stock and order/aftercare support; the detailed rules and expandable categories/subcategories are now approved; implementation remains held. |
| Product story | Keep as an additional public section, not a second required description. Allow a short distinct craft story without forcing repeated content. |
| Country of origin and origin evidence reference | Keep optional origin information with evidence review. Group evidence references under claim verification, explain the expected reference, and do not let a seller-set label turn unverified origin into a verified badge. |
| Care instructions, safety information and licence reference | Keep relevant information in category/claim-specific sections. Do not discard safety/licensing evidence based only on low usage. The relevant native policy must control when it is required. |
| Warranty offered and duration | Keep a clear Yes/No choice; show duration only when offered, as the current UI already does. Keep warranty meaning and stored values; do not require hidden duration inputs when No is selected. |
| Manufacture/expiry dates | Show when relevant to the category/product. Do not demand an expiry date for a product with no expiry; do not hide a required date for a relevant category. |
| Return eligibility and return conditions | Keep the applicable platform policy with clearly scoped seller details. Do not offer an editable generic question that overrides the platform's return rules. |

The image minimum is enforced beyond the UI, including the product revision repository. When implementation resumes, apply the approved review-intake policy to new submissions and review corrections/resubmissions consistently, including server checks and UI copy. Preserve existing media, file validation and the last approved public version. Verify the publication path against its own agreed quality checks; submission does not automatically publish a product or enable ordering.

The subsequent D21 expansion uses versioned category contracts for new-only retail/resale alongside handmade items. Its approved field matrix distinguishes common, category-required, conditional and optional data. Existing 65-entry catalogue counts are a dated inventory, not a claim that new category templates/variant fields already exist. Preserve no irrelevant hidden blockers, one cover, optional occasions and optional private costs.

## 6. Bank details, approvals and other native tasks

| Existing field/group | Recommendation |
|---|---|
| Seller account beneficiary, bank, branch, account number and bank evidence | Keep in Earnings & bank, outside initial registration and arbitrary questionnaire customization. Preserve account number as text, including leading zeros. Verified details use the approved reasoned change/review flow; do not drop ownership evidence. |
| Bank-review reference and reason | Keep in Super Admin's restricted bank comparison/review panel beside the seller registration and exact evidence. Explain the expected evidence reference; do not substitute “correct” for traceable verification. |
| PAN/identity review reason, document identity and decision | Keep explicit native review controls, reviewer/time and history. Show system-selected document/seller references read-only. Generic custom questions must not set Verified. |
| Application decision and reason | Keep a concise decision control with one appropriate review note and existing audit history. Separate application approval from product visibility, ordering, bank readiness and account restrictions. |
| Seller restriction state, suspension end, obligations, reason category and private note | Keep in a dedicated Access & restrictions task. Show suspension end only for a timed suspension, and obligations when relevant. Keep required safeguards and private notes out of the generic question editor. |
| Activation model, company legal seller, invoice issuer, accepted terms and reviewed payout reference | Keep as controlled selections/references to actual reviewed records. Display saved evidence and unresolved checks. Do not make admins repeatedly type immutable record identities or insert SIM references into production. The inspected activation component is explicitly local simulation; live activation remains unfinished work, not achieved by this inventory. |
| Payout-request purpose and note | D9 approved on 31 October: automatically record the standard purpose and accept a separate optional note. Current eight-character minimum must be removed for ordinary requests; blank/short notes are valid within the existing 500-character bound. Keep explicit submission, calculated eligible amounts, verified destination, audit history and safe retries. This does not remove required reasons from exceptional financial actions. |
| Payout amounts, destination, payment reference, approver and decision | Keep in native finance workflows with calculated amounts/read-only context where appropriate. Never treat them as freely configurable questions. Seller payout accounts and company receiving accounts remain separate. |
| Shipping/order/case references | Fill automatically from the selected order/case and show friendly references. Ask only for the action's actual note, tracking/evidence or response. Preserve ownership, permissible actions and financial checks. |
| Contact/feedback forms | Keep name, email, topic, message and privacy acknowledgement; show phone, subject, order reference or rating only in the relevant variant. Reuse wording across three variants but retain their separate source/routing semantics. Do not merge all histories into one unidentified form. |
| Checkout, returns, complaints, product reviews and privacy requests | Keep each native task's contact, consent, reason/evidence, rating or request-type fields. Offer relevant contextual details only. Existing order/account identities should not be typed again unnecessarily. Retain current eligibility and access checks. |

Company bank account management and manual payment verification remain the separately agreed planned native finance workflow. Do not add full company bank numbers or customer payment evidence into a generic form schema/history or this planning document.

## 7. Form Management editor fields and controls

| Existing editor item | Disposition |
|---|---|
| Form/business name, audience, availability, unpublished changes | Keep a compact overview. Separate a working form with draft edits from a failed form. Link native-only tasks to their owning workspace. |
| Question label | Keep as Question; permit changes only to approved display/custom fields. A meaning-changing rename needs compatibility review. |
| Help text and placeholder | Keep Help text as Guidance; put the example/placeholder under Additional options. Avoid requiring the same instruction in both. Existing configured text is retained unless deliberately revised. |
| New field key and raw key beside every question | Remove manual key entry from ordinary editing; generate stable IDs for new fields. Existing keys remain fixed and visible in advanced diagnostics. No renaming historical storage identifiers. |
| Type | Keep a short Answer format selector with plain names and only relevant types. No data-type conversion of a published field with historical answers. |
| Choices entered as `value | label` lines | Replace with Add choice rows and automatic stable values. Keep published choice identities and answer interpretation. |
| Minimum, maximum and whole numbers only | Keep under validation options for appropriate number questions. Display plain bounds, reject inconsistent settings and retain native limits for money/stock/identity. |
| Required/Optional toggle | Limit to genuinely configurable extra questions with impact explained. Do not allow it to reintroduce compulsory initial-registration fields or disable protected checks. Use clear action-specific completion guidance. |
| Up/Down, Archive and Reactivate | Keep accessible ordering controls and archive/history. Reactivation must recheck relevance, compatibility and current policy. Archived fields should not dominate the default Questions view. |
| Long fixed-field explanations and disabled controls | Replace with a short “Managed by [feature]” summary/link; expand explanations only when needed. The editor already collapses some fixed and automatic fields, so refine that existing behavior. |
| Request/version IDs, seller/actor IDs, status, money-unit aliases, consent context and anti-abuse values | Remove from ordinary questionnaire editing. Preserve them internally and in access-controlled diagnostics where useful. They are required safeguards, not useless stored details. |
| Reason for change, change summary, preview, Save draft and Publish | Keep. Use one clear reason per action, with the live form remaining active. An uncertain save/publish result must keep its safe retry behavior. |
| Version history and Restore | Keep in History with plain names/dates and an advanced version identifier. Restore creates a new compatible publication and cannot erase prior answers or relax current security/terms. |
| Contact-time example | Remove from instructional copy. The user's archived question must not be promoted as the default example for a new one. |

## 8. Catalogue placement inventory — all 65 current exposed entries

Approved cleanup direction: keep a small set of business question editors and show the remaining tasks as managed by their features. This is removal of unnecessary generic editing/dependency after deliberate migration, not removal of the task, endpoint, records or historical form identifier.

### Retain limited wording/extra-question management (seven entries)

`seller.application`, `seller.maker-profile`, `seller.profile`, `seller.product-submission`, `public.contact`, `public.feedback`, `public.footer-feedback`.

Reconcile the registration definition before enabling its presentation edits. Consolidate shop wording where semantically shared without merging legal records, cooldowns or history. Extra questions need a documented purpose and owner; they cannot override native fields or become a missing-config dependency for a core task.

### Preserve the rider application; hide inactive configuration from the everyday view (one entry)

`rider.application`: keep native legal name, phone, district and identity evidence in rider operations. Do not remove the workflow because it is on hold. Expose any later useful optional questions only when that workflow is deliberately resumed and reviewed.

### Move generic customization to the native owning task (57 entries)

| Owning workspace | Current catalogue identifiers covered |
|---|---|
| Product management and stock | `staff.catalog`, `staff.product-classification`, `staff.product-review`, `seller.inventory` |
| Seller review, terms and restrictions | `staff.seller-review-action`, `staff.managed-maker-activation`, `staff.seller-governance`, `seller.managed-terms-acceptance` |
| Order, customer care and privacy | `commerce.checkout`, `commerce.return-request`, `commerce.complaint`, `commerce.order-cancellation`, `account.privacy-request`, `account.review`, `seller.review-reply`, `seller.case-return-response`, `seller.case-complaint-response`, `staff.return-case-action`, `staff.complaint-case-action`, `staff.cancellation-review`, `staff.order-fulfillment`, `staff.review-moderation`, `staff.privacy-action`, `staff.first-cod-confirmation` |
| Shipping and rider operations | `seller.shipping-request`, `seller.shipping-action`, `shipping.console-request`, `shipping.console-action-seller`, `shipping.console-action-staff`, `staff.parcel-control`, `staff.delivery-assignment`, `staff.rider-control-1`, `staff.rider-control-2`, `rider.report` |
| Managed supply and route transitions | `seller.managed-supply-proposal`, `seller.managed-transition-request`, `staff.managed-supply-decision`, `staff.managed-transition-decision` |
| Finance and settlement | `seller.payout-request`, `rider.remittance`, `commerce.gift-card-issue`, `staff.invoice-adjustment`, `staff.managed-adjustment`, `staff.managed-payment-preparation`, `staff.managed-payment-action`, `staff.managed-eligibility-release`, `staff.managed-payout-preparation`, `staff.managed-payout-action`, `staff.payout-1`, `staff.payout-2`, `staff.payout-request-action` |
| Governance and operations | `staff.exception-work`, `staff.governance-rule-create`, `staff.governance-promotion-create`, `staff.governance-incident-create`, `staff.governance-incident-update`, `staff.governance-backup-verify` |

Keep the 66 already-excluded definitions under their existing native ownership. In particular, do not reintroduce password/OTP, permissions, commission scheduling, bank review, account recovery or local-testing controls as arbitrary extra questions. A diagnostic index may still list them with an appropriate link and access control.

If production has active custom fields on a proposed native-only task, inventory each question, purpose, requiredness, answers and consumer first. Map genuinely needed information into the native task or retain a controlled extension. Never discard it merely because the local environment has no active custom fields.

## 9. Approved decisions and remaining planning work

Already approved constraints carried forward: simple optional initial registration, Nepal-default phone without OTP at intake, bank/profile/products in the dashboard, archived contact-time question, public profile cooldown, document change requests, current terms acceptance and the implementation hold.

The user has approved this field cleanup and the one-clear-cover-photo/optional-gift-occasions policy for admin review submissions. Preserve the implementation hold. Remaining preparation and separate decisions:

1. Map the approved field grouping and seven everyday editors/native links against production's actual definitions and dependencies before applying cleanup. Preserve any needed production-only questions and historical answers.
2. Record consistent implementation and acceptance checks for one usable cover image with zero gift occasions at review submission, additional images, selected valid occasions, photo replacement/removal and correction resubmission. Current code still enforces the older requirements during the planning hold. Public quality requirements and moderator decisions remain separate from intake acceptance.
3. Carry forward approved D9: standard normal payout purpose and an optional note. Map the native/API/repository/form-contract changes; implementation remains on hold.
4. Finalize private/public contact reuse, conflict handling for overlapping profile content, and category-specific product fields. Retain evidence and current policy until mapping is agreed.
5. Define compatibility and answer preservation for edited questions, hidden conditional fields and historical aliases. Reconcile the catalogue preview with the actual route/component/validator for each retained editor.

When implementation is resumed, test empty optional registration, route changes, verified-document locks, public/private addresses, draft restoration, native tasks without optional customization, in-progress publications, required custom extensions, product/media revisions and preserved historical answers. For the approved product policy, one clear cover and no occasions must pass with otherwise valid data; zero usable photos must reach D22 assistance intake without losing progress, while publication waits for an accurate usable cover. Verify UI and server validation together. Do not run migrations, seed/reset data or bypass the canonical launcher to make a check pass.

## 10. Source trail

- `lib/forms/registry.ts`, `lib/forms/catalog-presentation.ts`, `lib/forms/validation.ts`, `lib/forms/plain-language.ts` — definitions, exposure policy and validation.
- `components/admin/form-catalog-editor.tsx` — existing label/help/key/type/choice/validation/archive/preview/publish/history controls.
- `app/sell/apply/page.tsx`, `components/seller/seller-registration-intake-form.tsx`, `lib/sellers/registration-intake.ts` — actual current intake and field list; `components/seller/seller-application-form.tsx` — older component requiring a retirement audit.
- `components/seller/maker-application-profile-form.tsx`, `components/seller/seller-profile-form.tsx`, `components/seller/seller-products-description.tsx`, `components/seller/managed-maker-identity-fields.tsx` — overlapping public, business and correction tasks.
- `components/seller/product-submission-form.tsx`, `lib/products/submission.ts`, `lib/db/repositories/products.ts` — product fields, current occasions/photo requirements and revision enforcement.
- `components/seller/bank-details-form.tsx`, `components/seller/payout-request-form.tsx`, `components/seller/inventory-editor.tsx`, `lib/sellers/dashboard-form-contracts.ts` — native bank controls and current payout/stock behavior.
- `components/admin/seller-document-review.tsx`, `components/admin/managed-maker-activation-form.tsx` — local document controls and explicitly simulated activation form. These local files do not establish production deployment state.
- Read-only local `form_config_versions`: latest publications and draft presence only, no submitted answers or private evidence. Counts are a dated local snapshot, not a production diagnosis.
