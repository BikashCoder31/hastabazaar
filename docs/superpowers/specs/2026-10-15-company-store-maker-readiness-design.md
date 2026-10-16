# Company-store maker selling and loyalty readiness

## Approved intent

On 2026-10-15 the user approved completing the existing company-store maker flow, a Program Management readiness checklist, guarded payment controls, and loyalty preparation for later activation. The user selected sale-linked compensation: company retention 9%, maker entitlement 91% of the eligible product value after a delivered, paid sale.

The intended users are new makers without a business PAN, their customers, and the Super Admin operating the company store. Success means a new maker can complete the whole local journey through normal UI, with truthful readiness messages and correct ownership, company identity and financial records. Passing calculation tests alone is insufficient.

The user approved this written specification on 2026-10-15, then confirmed the change-handling requirements below. Product implementation has not started.

## Project and data constraints

- Work in `C:/Users/abinash/Desktop/Hatskala`. The starting commit is `55be02c0764c9df82d1efffd6f637f548fa2de17`; preserve newer work.
- Use the checked launcher and `http://localhost:3018`. Keep the current valid server when available.
- Keep `local_staging`, development mode, captured mail and simulated payments. Do not push or deploy.
- Do not reset, seed, replace or restore the active database. Preserve history, uploads and backups.
- Any storage upgrade needs a concrete SQL/source/destination review and an isolated rehearsal before a separately authorized active-data step. Startup checks must never apply it automatically.
- Use separate, clearly named fictional records for populated browser tests. List the records and their restoration or retention plan before creating them. Existing accounts, products, orders, agreements, point balances and financial history must not be overwritten.
- Preserve Registered Seller access rules and the existing fixed supplier-price route. Do not grant independent-seller privileges merely to admit a maker.
- Keep existing production activation gates and simulation labels. Completion here means a fully tested local flow, not approval for live commerce or tax invoicing. Existing supplier/tax obligations in the maker agreement remain explicit.

## Findings that define the work

Read-only source review and the current Chrome page identify these gaps:

1. Applicants can create private drafts, but normal product revision/submission requires approved Registered Seller access. Admin product review starts from submitted products, while maker activation needs an approved product.
2. Maker activation changes participation to active, but the normal seller workspace still requires an approved seller profile and seller role.
3. Public managed-product eligibility and shop/catalogue queries apply inconsistent profile checks. An active maker's product can qualify for one surface and disappear from another.
4. Public product labels currently identify the maker as the seller. Orders and simulated documents need an explicit company-selling identity alongside maker attribution.
5. Maker acceptance records a rate, but checkout currently selects the latest effective retention setting. New orders must honor the accepted agreement instead of silently changing the maker's percentage.
6. Sale-linked holding-period release and payout functions lack a complete UI/API path. Payout preparation needs a transactional recheck against concurrent refunds and disputes before exposure.
7. Loyalty's valid draft/publication flow exists. Its missing-field feedback and initial weekly setup need to make the activation steps clear.

These are current gaps, not regressions introduced by this work. The financial race is a source-review finding requiring an isolated regression before a fix is claimed.

## Chosen approach

Complete the existing maker/application, product-review and Program Management pages. Add one central checklist and link each missing requirement to the existing responsible page. A separate setup wizard would add another place to maintain the same review state; the central checklist also remains useful after initial setup.

Use the existing application workspace for maker operations, with clearly scoped product editing and earnings sections. Registered Seller pages and authority checks remain dedicated to their existing route. An active maker gets a usable workspace without being represented as a PAN-registered independent seller.

## Maker intake and product lifecycle

- Start with an individually authenticated account and an explicit Managed Maker application.
- Business PAN is not an application requirement for this route. Government identity evidence and explicit acceptance of the current company-selling agreement remain required. Personal PAN remains optional and is validated when supplied.
- Store identity documents privately. Only the authorized Super Admin review flow may access them. Do not expose private identity, address, receiving-account or agreement answers in public maker/product pages.
- Display the company selling identity and the 9%/91% agreement before acceptance. Preserve the accepted company/account identity, agreement version, rate, actor, time, language and form version.
- Allow the authenticated owner to create, edit, submit and correct their own eligible product drafts. Reject another maker's IDs and ineligible application stages on the server.
- Admin can review submitted products before maker activation. Publication requires both approved product state and active, eligible maker participation.
- Keep application approval, program readiness, maker activation and product publication as explicit separate states. No self-review or client-controlled activation.
- Require corrections and renewed acceptance when relevant identity or commercial terms change. An outdated agreement must produce an actionable message, not an implicit new acceptance.
- Suspension, disabling, archival and deletion must remain effective across editing, discovery and ordering.

## Company store and customer journey

- Preserve the product's maker ownership for attribution, inventory and earnings. Do not move every maker's records to a shared login.
- Show `Made by [maker name]` and `Sold by HastaBazaar`, using the configured company store name and canonical legal identity where appropriate.
- Use one route-aware eligibility policy consistently for homepage collections, search, catalogue filters/counts, maker storefronts, detail, cart and checkout.
- Snapshots on new orders and documents preserve the company as selling party/invoice issuer and preserve maker attribution, the accepted agreement, the accepted 900-basis-point rate, discount funding, holding-period policy and simulation status.
- Existing order and agreement snapshots are immutable. Later settings changes require a new accepted agreement for future orders and cannot rewrite earlier transactions.
- Keep managed-maker retention settings separate from independent Registered Seller commission schedules. A change to one must not silently alter the other route.
- Company operations handle customer fulfilment and returns through authorized staff workflows. Makers see the information needed for their own products and earnings; this does not grant unrestricted customer or other-maker data access.
- Local documents clearly remain simulated and are not presented as approved tax invoices.

## Earnings and guarded payment operations

- Eligible product value follows the accepted terms: exclude separately stated tax/delivery and deduct maker-funded discounts. Company-funded discounts do not reduce the maker's agreed base.
- Earn the 91% entitlement only from authoritative delivered-and-paid facts. Unpaid, undelivered and cancelled sales do not become payable.
- Apply the original immutable split for refunds. The full refund must leave no rounding residue or duplicate reversal.
- Keep calculated, earned, held, eligible, reserved and paid amounts distinct in both maker and Super Admin views.
- Program Management shows actionable sale-linked records and their reasons: holding period, active dispute/return, refund adjustment, eligible amount, reserved payment and paid record.
- Wire an explicit audited action to release mature eligible records. A normal page read must not release funds or create payment records.
- Add Super Admin-only preparation, approval and simulated payment-recording controls using existing capability and transaction-guard patterns. Preserve applicable existing action separation and independent-review rules.
- Before each financial transition, recheck current authority, maker/account readiness, authoritative delivery/payment facts, dispute/return state, original terms, cumulative refunds and unreserved payable balance inside the transaction.
- Payout preparation and refunds must use compatible locking/guard rules so an interleaved refund cannot reserve the earlier amount. Duplicate and changed-intent retries must have safe, explicit outcomes.
- An unpaid payment blocked by a later adjustment can be cancelled with recorded reservation release and prepared again for the correct net amount. Never delete payment history, cancel a paid record as though no payment occurred, or double-count a post-payment refund against later earnings.
- Payment recording requires a simulation reference. This request does not execute a live transfer or connect an external payment provider.
- History records the actor, reason, before/after state, request ID, form version and result. Failures roll back domain, audit and form-answer writes together.

## Program Management experience

- Show the selected 9%/91% route and truthful local readiness.
- Show a checklist for company account, current maker agreement/identity, application review, product review, activation/publication and settlement readiness.
- Every blocked item explains what is missing, who must act and a link to the relevant form or queue.
- Keep maker queues, product queues, payment queues and history visible with useful empty, loading and failure states.
- Keep the existing fixed-price route and its records intact; no automatic model switch for existing makers.
- Keep this page, private review and financial mutation controls Super Admin-only on both pages and server actions. A hidden navigation link is not authorization.
- Desktop and small-screen views must remain readable, keyboard accessible and free from horizontal page overflow.

## Approved future changes and PAN transition

- The user explicitly confirmed that both future settings changes and a maker obtaining PAN and moving to the Registered Seller route must work.
- Future company/retention changes take effect through versioned settings and explicit renewed maker acceptance. Show pending terms, the effective time and the next action. Do not apply an unaccepted rate to new orders.
- A maker may submit private registration/PAN evidence and accept the current Registered Seller agreement/commission terms from their own application workspace. Requested corrections can be resubmitted with recorded history.
- An independent Super Admin reviews the transition and records an effective time. Before that time the maker remains on the managed route. At that time an authorized, idempotent operation atomically applies the reviewed legal/tax details, approved seller status, seller role and exact accepted commercial terms.
- Do not alter Registered Seller authorization to accommodate incomplete transitions. Reject missing, unowned or rejected evidence and stale commercial acceptance. If required terms change before application, require renewed acceptance/review instead of silently substituting the new fee.
- Keep product IDs and every earlier managed order, invoice, refund, dispute, entitlement, payout and supplier obligation. Earlier managed financial work remains visible after transition; only new independent transactions use the Registered Seller route and its accepted commission.

## Loyalty preparation and later activation

- Approved repeating daily cycle: Day 1–7 awards `5, 7, 9, 10, 11, 13, 15` points, totaling 70 per complete cycle. After Day 7, the next successful daily claim starts at Day 1. With grace off, a missed Nepal calendar day resets progress without removing earned points.
- Keep earning paused, grace off and the active revision unpublished during this work. Do not invent start/end dates or budgets.
- For unpublished initial revision 0 without issued points or a saved draft, present the approved weekly editor defaults. Preserve real saved drafts and legacy published fixed schedules.
- Clearly distinguish unsaved editor values, a saved draft and published rules. Reload must never imply that unsaved values were stored.
- Show the required start date/time, end date/time, daily points limit, total points limit and administrative reason, with field-specific missing/invalid feedback and clear units.
- All earning dates and claim-day boundaries use Nepal time (`Asia/Kathmandu`, UTC+05:45). Start is inclusive and end is exclusive. End must follow start.
- Budgets are shared program limits, not per-customer limits. Preserve finite positive safe-integer validation, each budget covering the largest daily award, consumed-total guards, denomination locking and integer exposure checks.
- Preserve the existing 100 points = NPR 10.00 starting conversion unless the user changes it through the validated flow.
- Later activation is deliberate: fill valid dates/limits/reason, check `Enable daily earning when published`, save a draft, review that saved draft, then publish it. Checking the box or saving alone does not start earning. A future start time remains scheduled until that time.
- Publish uses the verified saved draft, not unsaved edits. Disabled terms do not allow earning. Pausing stops new earning while preserving earned points and permitted redemption.
- Explain that resuming after pause currently requires saving and publishing enabled terms. Do not add an implicit resume side effect to a checkbox.
- The user explicitly chose continuity for future loyalty changes: current rules keep running until the new rules' scheduled Nepal-time start. This requires real pending-revision support; setting a future start on an immediately replaced revision is insufficient.
- Support one pending published revision separately from the current rules and editable draft. Show all three states clearly. An authorized cancellation before its start preserves current rules; replacing it requires cancellation and a newly saved/published draft, retaining history.
- Scheduling an enabled future revision records deliberate activation intent for that time. It does not resume paused current rules early. A later Pause overrides that scheduled activation intent, so scheduled rules cannot silently resume earning after the operator pauses it.
- At the due time, recheck consumed limits and the permanently locked conversion. If the scheduled revision has become incompatible, stop new earning with a clear review-required state; do not rewrite points, change their conversion, or keep issuing under obsolete rules. Redemption of already earned points remains available under its existing rules.
- Reads remain read-only. Effective scheduled state must agree between page/report reads and transactionally guarded claims/publications, including requests spanning the exact change boundary.

## Verification and acceptance

Implementation must add full-schema isolated regressions before fixes for the source-proven lifecycle gaps, then run appropriate existing tests, type check, lint and build.

Required acceptance cases:

1. New maker applies with government ID and no PAN, accepts 9%/91%, submits a product, receives correction, resubmits, is reviewed by an independent Super Admin, is activated and has a product published through normal UI.
2. That maker can use their workspace. A different maker, ordinary Admin, Customer and unauthenticated user cannot gain private review, other-maker or Super Admin financial access, including direct requests.
3. Published eligible products agree across homepage, search, catalogue count/list, detail, cart and checkout. Ineligible or suspended makers cannot sell.
4. Customer surfaces and immutable order/document snapshots distinguish company seller/issuer and maker attribution. A new current rate cannot override the maker's accepted 9% silently.
5. Eligible NPR 1,000 yields NPR 90 retention and NPR 910 maker entitlement. Unpaid/undelivered yields no earned amount. A NPR 300 eligible-base refund reverses NPR 273 once, with cumulative/full-refund rounding checked.
6. Holding periods and open disputes/returns block premature payout. Mature unblocked balances can be released and processed through audited simulated payment steps. Concurrent refund/payout, permission revocation, stale form, lost response and changed retry cases preserve correct balances and provenance.
7. In an isolated loyalty fixture only: initial paused state, valid enabled weekly draft, save without activation, publication, Nepal-day claim, all seven awards, cycle repeat, grace-off reset, invalid/missing dates/budgets, exhausted budgets, pause and preserved redemption.
8. In the active Chrome preview, loyalty remains paused with no publication and no claims. Verify readiness/help and weekly defaults without changing existing records.
9. Normal Chrome desktop and a small viewport cover keyboard input, links, loading, validation, errors and saved-state reload. Keep an inventory separating Passed, Failed and Not tested.
10. Verify the canonical server and active data preservation before/after, report exact reproduction steps for remaining issues, and leave the relevant Super Admin pages open with copyable local URLs.
11. Review and apply a genuine PAN transition at its effective boundary, then open the normal Registered Seller workspace and place a new independent order. Compare earlier managed financial rows and snapshots byte-for-byte and verify outstanding records remain actionable.
12. Change managed retention and independent commission separately, exercise stale and renewed acceptance, and verify historical terms remain intact. For loyalty, test current rules before a scheduled boundary, new rules at the boundary, cancellation, pause after scheduling, duplicate same-day claims, and incompatible limits/denomination becoming blocked without losing points.

Live tax/commercial approval, native production database acceptance and real email/payment delivery are separate checks and must not be claimed from this local acceptance.
