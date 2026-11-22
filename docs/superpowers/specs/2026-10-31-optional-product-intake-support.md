# Optional product details, customer preview and support assistance

Status: **approved for the work plan, 31 October 2026**. The user explicitly approved the product form, support workflow and Super Admin notifications, including the described assistance states, staff confirmation boundaries and first triage within one service business day. While D21 retail/category/variant planning was underway, the user directed that all available product details be accessible without compelling every seller to fill them, that customer preview guide completion, and that sellers can ask support to arrange missing information or fields. This latest D22 direction supersedes earlier mandatory-field/photo assumptions at seller product intake. It does not authorize publishing invented or incomplete essential offer facts. **Implementation remains on hold.** No form, product, data, support message or deployment changes here.

## 1. The intended experience

Use the same **Basics → Photos & details → Review** editor and D19 private calculator/customer preview. Make seller entry optional for saving and sending an initial product draft for review/assistance. Sellers can start with whichever information they have, see what their customers would see, and return to the same saved product reference. Do not turn this into another approval-only access loop.

Two inadequate alternatives are a giant mandatory form and an entirely empty form that quietly publishes guesses. The recommended approach is optional intake, useful progressive disclosure and a truthful private preview, followed by staff-assisted completion and normal publication checks. This is the user-approved approach and detailed workflow.

The key distinction is **receiving a seller's incomplete draft versus approving a public offer**. Missing information may need completion before publication or ordering, but it must not prevent the seller from saving, seeking help or submitting the information they already have. Existing authentication, ownership, upload security, abuse limits and financial/publication authority remain enforced; these are not additional fields the seller must fill.

## 2. All supported details available without clutter

| Area | What the seller sees |
|---|---|
| **Basics** | Product name, category, description, photos and price/stock entry as approachable starting points. Show a live saved-state indicator. No repeated Optional suffixes or required-star clutter. |
| **Recommended for this product** | Category-relevant details such as clothing sizes/materials, stationery pack contents, or electronics model/compatibility/warranty. Suggestions explain why a customer may need the information. The seller can skip and continue. |
| **More product details** | Searchable/collapsible access to every supported product-detail group: brand/maker, materials, dimensions, sizes/colours/options, specifications, pack contents, care, preparation, warranty and applicable dates/other supported attributes. Selecting a category recommends a subset; it does not permanently hide the other available detail groups. |
| **Private review information** | Protected supporting evidence/notes when relevant; never part of the customer preview. Registration/bank credentials and unrelated account fields do not belong in the product-detail library. |
| **Private pricing helper** | Optional owner-private costs/target profit, as approved. No normal admin/support-review access, no compulsory margin and no universal price cap. |
| **Cannot find the detail you need?** | **Get help with this product**, linked to the saved draft and intended category when known. The seller can describe a missing option/field or ask staff to help complete the listing. |

Do not manufacture new unsupported fields merely to claim the library includes everything imaginable. Every currently supported public product attribute must be discoverable and clearly grouped. A missing type of information can be requested through support and added through the controlled category/form process if suitable. Technical field IDs, security tokens, raw financial controls and irrelevant identity/bank fields remain outside this library.

Empty optional sections are omitted from the actual public rendition. A private preview can explain that an empty section will not be shown. Do not publish empty headings, sample text, unknown values as facts or defaults that imply a warranty, brand, size, stock level or product condition the seller has not established.

## 3. Preview and non-blocking guidance

Keep a nearby **Customer preview** action and the full final Review preview. Show actual title/photos, selected sellable option, price/valid savings and supplied descriptive details in card/detail layouts. D21 variants use their actual selected offer; no mixed-variant discount or parent average price.

Use three plain guidance groups:

- **Ready to show:** supplied information that can be rendered truthfully. This is not a claim of admin approval.
- **Would help customers:** suggested descriptive details, with a short reason and an Edit link. These do not block seller intake.
- **Needed before publication / ordering:** specific unresolved offer or safety/eligibility information with a field link and Get help action. Distinguish the affected action; no generic all-or-nothing completion score.

If price, image or title is missing, show a clearly marked preview placeholder such as Price not provided or Add a photo to see the preview. Never turn a blank price into Free/NPR 0, unknown stock into In stock, or a placeholder image into a published product photograph. An incomplete preview can still be shown; a preview-service failure preserves work and offers Retry/help.

Preview nudges should be helpful, not a hidden mandatory checklist. No universal requirement to enter costs, fill all specifications, add multiple photos, choose a gift occasion or tick a new confirmation checkbox. The existing Submit/Resubmit action can record the seller's intended candidate; merely opening the preview neither submits nor approves it.

## 4. Save, send and support states

| Action/state | Approved behavior |
|---|---|
| **Save draft / autosave** | Retain supplied answers, incomplete option rows and completed uploads under owner-scoped storage. Preserve incomplete numeric text as draft input rather than pretending it is valid financial data. Show genuine Saving/Saved/Unsaved/Retry states. |
| **Send for review** | Accept the existing draft into the review/assistance workflow even when descriptive or essential listing details are missing. Freeze the submitted candidate/context, identify unresolved fields and show **Received — details needed** or **Submitted for review**, as appropriate. Missing fields alone do not return a whole-form validation failure. |
| **No usable listing information yet** | Keep the server-generated private draft reference and create a support/assistance request linked to it. Use a generated task label; do not force a product name just to obtain help or create an empty public product. |
| **Supplied but invalid value** | Retain and flag the draft value for correction/help; do not coerce it into valid price, stock, date or variant identity. A safe incomplete assistance intake can proceed, but the value cannot become a live offer or authoritative money/stock record. Security failures, unsafe files and unauthorized requests still fail precisely without erasing unrelated saved work. |
| **Get help with this product** | Save permitted draft progress first, then explicitly send one linked support request after showing the context to be shared. A note is optional; a generated purpose is sufficient. If saving or sending fails, state what is and is not saved/sent. |
| **Staff reviewing / waiting for seller** | Show the actual owner, specific missing details and next action. Continue edits in the same draft/version chain. Staff do not falsely mark incomplete intake approved. |
| **Ready for product decision** | Once actual publication requirements are satisfied, the exact candidate goes through ordinary review and Approve & publish/Approve only under existing permissions. No automatic publication when a help ticket closes. |

Reuse one product/reference/version chain and link assistance with review work. Repeated clicks, Save plus Send, Get help plus Send, or lost responses must not create duplicate products, open requests for the same issue or notifications. A private draft changed after submission does not silently modify the frozen version a reviewer is assessing; use the approved supersede/resubmit version rules.

## 5. Support can help without guessing or exposing private data

The request carries the authorized product/draft reference, selected category if known, relevant missing/invalid-field summary, and the seller's chosen ordinary product context. It excludes private cost/target values, unrelated PAN/bank evidence, secrets and raw diagnostic logs. Staff get access only through the corresponding product/help capability; a support link does not grant publication or sensitive-document authority.

Staff can explain a field, request the minimum missing fact, help arrange an appropriate photo/information from the seller, or prepare a proposed description/category/option mapping from actual supplied facts. Record who changed what and its source. Do not invent measurements, authenticity, warranty, stock, price or seller consent. New unconfirmed public facts need seller confirmation through the normal draft/submission action or recorded explicit seller communication before publication; do not add a blanket second confirmation checkbox for every seller. Existing D2 authority/conflict rules remain.

If the seller needs a missing field/option/category, support records the need and routes it to the category/Form Management owner. Use a supported existing attribute when it accurately fits, otherwise propose a versioned template extension and verify visibility, validation, privacy and all consumers before publication. Do not ask the seller to edit a technical catalogue or create a mandatory global question for one shop. The request stays visibly open while a real capability is missing; do not promise completion merely because it was forwarded.

Approved assistance target: first triage within one service business day under the existing continuous service calendar, without promising listing publication by then. Keep the existing first-complete-product-review target; distinguish assistance age and review readiness, and retain original request history so resubmission cannot hide overdue support. Assign an eligible owner/backup through the existing Team workflow. Use the approved bell/email delivery, deduplication and suppression rules; reading a notice is not resolution.

### Super Admin oversight notifications — explicitly required

The user additionally directed that product-support requests trigger Super Admin and that every operational notification reach Super Admin through **both email and dashboard/bell**, explicitly including new seller applications and product listings needing attention. This requirement and workflow are now explicitly approved, not an optional department-only subscription or manual digest. The department/assigned staff still receive their appropriate work; Super Admin oversight does not remove their ownership.

| Business event | Super Admin oversight |
|---|---|
| New submitted seller application, including incomplete registration | One linked application notice with its current stage, missing-action summary and responsible queue. |
| New product submission/resubmission, including incomplete assistance intake | One notice for the submitted candidate/issue, with category/record reference and actual review/assistance status. |
| Get help with this product, missing field/category request or substantive support update | One linked support notice, including relevant progress, seller reply, overdue work and final outcome as distinct events. |
| Registration/document/bank/profile changes, review decisions, corrections and activation/restriction work | Authorized record-linked notices with exact scope and current outcome; never private evidence in the email body. |
| Orders and customer-care workflow notifications | Supervisor copies for new/actionable orders and the existing fulfillment, reminder, delay, cancellation, return/complaint and outcome events, deduplicated independently of how many ordinary recipients the event has. |
| Payment, payout, refund, recovery, fee/terms, category/form publication and system incident/recovery notifications | Corresponding authorized oversight events in both channels under the actual workflow; no new financial authority or unapproved schedule is implied. |

Apply this supervisor-copy rule to every operational notification producer in the planned workflows, not just the examples. Include feedback/privacy-request review work where it already generates an operational task, with safe summary only. Authentication codes, passwords, personal login messages, raw diagnostics, page views, autosave keystrokes and routine successful health polls are not operational business notifications and are not copied. Private cost/target data is never included.

Deliver to every active eligible Super Admin account through its configured email and shared dashboard/bell record. A person who is also the assigned department owner receives one logical notice per event/recipient/channel, not one for each role. The bell and dashboard show the same in-app notification/read status. Use source event/version/recipient/channel identity; retries update the same delivery work. An eligible Super Admin still receives the required oversight notice when that same person performed the source action; do not apply an old actor-self exclusion to these supervisor copies. Existing daily/weekly summaries may supplement these event notices, never replace or delay them, and must omit resolved attention items. An email and an in-app notice are the two requested channels, not unwanted duplicates.

Use automatic first attempts and the approved retry/recovery schedule. Missing/failed Super Admin email is an actionable delivery/setup problem, not a reason to omit the dashboard notice or label email Sent. A transport outage cannot guarantee immediate mail delivery; retain/retry eligible work, show the truthful channel result and use the approved independent outage route. No ordinary batch-send click is required. Provider acceptance remains distinct from confirmed inbox delivery.

Every source event remains in authorized history. Suppress obsolete action-required reminders after resolution, as already approved. If a pending attention email becomes obsolete before handoff, use the relevant truthful current outcome/update rather than send an incorrect claim that the task is still pending; preserve the original event and suppression reason. Repeated reads/retries do not create another message, and a genuinely new candidate/reply/event may notify once. Authorized deep links recheck current access; forwarding an email cannot grant protected data access.

## 6. Publication and commerce remain factual

Before public publication, the reviewer needs the actual identity/category of what is sold, usable truthful public description, valid selling offer/price, at least one accurate usable cover, and any genuinely necessary category/claim/variant information. One image can suffice; no four-photo rule is restored. Current authority, evidence, legal-seller/publication eligibility and privacy boundaries still apply. Optional extra descriptions do not become blockers merely because a field exists.

Before accepting an order, the exact selected offer also needs valid order eligibility, actual stock/reservation or supported made-to-order capacity, applicable preparation/fulfillment information and required commercial/payment checks. Missing readiness is disclosed with an owned next step, never silently changed into fake default values. A valid approved browse-only listing remains distinct from an orderable one.

The latest direction changes seller intake, not truthfulness or authority. Staff can complete details with the seller, return precise corrections, or reject an unsuitable claim/product under the existing workflow. Category No warranty or blank return text does not erase the approved platform/customer remedies. The new-only condition, private-cost policy and verified-document protections remain intact.

## 7. Relationship to previous approvals and later verification

This amendment replaces earlier instructions requiring a complete category/name/price/photo packet merely to save or send a product for staff attention. Their legitimate publication/order checks move to the applicable later action. Earlier one-cover/no-occasion examples still succeed; zero-cover incomplete intake now also reaches assistance and cannot publish until an accurate cover is provided. Initial registration and other document/finance actions keep their own approved rules.

Apply this separation in native forms, category contracts, parser/storage, review APIs, support intake, permissions, completeness/status indicators and mobile/customer preview. Missing optional metadata must not recreate Form configuration unavailable or discard answers. A missing required runtime capability still produces a truthful recoverable state; no automatic database/configuration repair is permitted.

Later verify: empty/incomplete intake, zero-photo intake versus publication, missing/invalid money and stock without fake values, all detail groups reachable, category switches without lost fields, no hidden optional blockers, safe upload failures, seller-private cost isolation from support, same-reference help/review retries, staff edits and seller confirmation, template requests through governed publication, frozen candidate/version races, exact variant/money/history preservation, correct notifications/ownership and mobile/keyboard preview/error recovery.

- [x] Record the user's optional-entry, all-supported-details, preview-guided and support-assisted direction.
- [x] Require Super Admin email plus dashboard/bell oversight for every operational notification, including new seller applications, product submissions and support requests; preserve safe payloads, automatic delivery and deduplication.
- [x] User approved the detailed product-form, state/assistance and Super Admin notification workflow on 31 October 2026, including first assistance triage within one service business day. No actual support request is sent by planning.
- [ ] Include the amended acceptance cases in V06/V16/V20 without dropping the previously approved scope.

**Implementation and deployment remain on hold.**
