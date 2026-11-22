# T31 screen/API/form access audit — 3 November 2026

Status: source-based preparation while root closes T30. T31 implementation has not begun. Canonical checkout only. No runtime source, configuration, canonical database, deployment or real record was changed by this audit; no native/browser/typecheck process or broad test suite was run. Only this report was written. Findings below are source proofs and proposed acceptance cases, not passing browser evidence.

## Controlling requirements and coverage boundary

Read T31 in `2026-11-01-implementation-6-verification.md`, the all20 scope, requirement/progress ledgers, T24 evidence, and the controlling paired walkthrough, Overview/shared review, Finance/payments and Fees/programs/promotions specifications. Cross-checked the referenced Seller Center, Seller Management, Products/storefront and Orders/customer-care screen requirements against the actual route/component/form contracts. Existing T07–T30 evidence supports reuse, but its isolated tests and a registered route are not full paired-screen verification.

Primary requirement keys: paired walkthrough R308–R325; Seller Center R162–R175, especially Home R164 and Requests R172; Overview R242–R250; Finance R112–R125; Fees/programs R219–R232; aftercare R265–R276; V01–V20 remain included. The ledger contains historically unchecked/partial rows even where later task evidence exists. Do not interpret an unchecked row alone as an implementation defect or erase the missing paired acceptance proof.

Latest amendments control: optional intake, genuine selected offers, no compulsory30day repricing, continuous staff calendar, one eligible Super Admin for covered Finance stages, private evidence/current authority and explicit deployment holds. New backup programme, QR/gateways, automatic bank feeds/transfers, excluded public-language/badge policy and fixed working hours remain explicit exclusions; they are not missing T31 features.

## Concrete findings

### F01 — P2: staff-supported intake cannot load customer-only forms

Requirement: paired§8/§10, Orders§8/§10, R275/R321/R323, V03/V10/V16.

`components/admin/supported-case-intake.tsx:11` selects `commerce.complaint` or `commerce.return-request` with `usePublishedFormConfig`. Registry `lib/forms/registry.ts:206–207` assigns both customer audience. `app/api/forms/[formId]/route.ts:120` requires an actual `customer` role for that audience; the staff branch does not apply. The intake page `app/admin/cases/intake/page.tsx:9` and its native intake receiver authorize support staff.

Repro: active staff-only Admin with `support.manage`, or staff-only SA, opens an existing order in supported intake. The page is authorized, but form GET returns404; the submit button at `supported-case-intake.tsx:24` remains disabled. Do not assume every valid staff account also has a separately stored customer role merely because effective staff permissions include customer capabilities.

Fix direction: authorize the two exact protected intake form reads for their actual staff receiver authority, or use an explicit staff intake contract sharing the native protected fields. Customer record ownership and mutation checks must remain unchanged. Test staff-only and dual-role actors, not only SA+customer fixtures.

### F02 — P2: return logistics/follow-up form reads require unrelated refund approval

Requirement: Orders§8/§10, paired§8/§10, R247/R275/R321/R323, V09/V10/V16.

`app/api/forms/[formId]/route.ts:37` maps `staff.return-case-action` only to `refund.approve.standard`. `components/admin/return-handling-actions.tsx:9–18` uses that contract and requires its config before submission. The actual handling receiver `app/api/admin/returns/[id]/handling/route.ts:12,21` requires `order.manage`. The detail page `app/admin/cases/returns/[id]/page.tsx:31,183` also supports order/support staff, and `aftercare-followup-actions.tsx:10` uses the same return contract for their owned follow-up work.

Repro: explicit order-only operator opens an approved return to issue instructions/record receipt; or support-only staff opens permitted return follow-up. Page/native action authority exists, but form GET404 disables the form. Default legacy Admin having all these permissions masks the defect.

Fix direction: read access must reflect the union of actual supported action permissions, with action-specific server enforcement retained. Do not grant refund approval to logistics staff to make the form load. Verify instructions/receipt/inspection/follow-up and unauthorized refund mutation independently.

### F03 — P2: seller Home is still aggregate category links, not the approved prioritized work list

Requirement: Seller Center§3, paired§2/§2.1/§2.2, R164/R309–R311, V02/V09/V10.

`components/seller/seller-action-overview.tsx:15–57` constructs six fixed count cards linking to generic Orders/Shipping/Products/Cases. Cases are after listing/stock cards; line75 explicitly says orders, listings, then customer cases. There is no case identity, next responsible party, actual due/update time or severity sort in that projection. `app/seller/page.tsx:79` mounts it above readiness, earnings and recent orders, without the canonical case-level seller task list.

Repro: a seller has an imminent/overdue clarification or urgent case and routine stock/listing work. Home cannot prioritize/open that precise case or show its promised next update, contrary to the approved order/customer-care-first list. Independent readiness summaries are useful and should be retained.

Fix direction: compose actual permitted source tasks with original due/priority/next actor and exact links; show a compact top list plus View all. Keep optional price advice separate and do not turn staff-waiting work into seller resubmission demands.

### F04 — P2: Requests & help omits approved order/care and financial request families

Requirement: Seller Center§9, paired§2.2/§6/§8/§9, R172/R311/R319/R321/R322, V02/V09/V10/V12/V13/V15.

`app/seller/requests/page.tsx:12–15` renders only `listSellerReviewTasks`. Its exhaustive source-owner predicates at `lib/workflows/review-tasks.ts:244–260` cover application/documents, product/profile/protected changes, terms and intake. They do not select seller order-response/cancellation/return/complaint work, payout requests or recovery obligations. Those real records exist in separate Orders/Cases/Earnings workspaces, but are not in the approved single request/reference/next-party list.

Repro: an owner with a return clarification and a payout/recovery request but no product/document review opens Requests. Those requests are absent even though their own individual pages remain accessible.

Fix direction: reuse native safe source projections and canonical references for the remaining families; do not make unrelated seller review tasks or copy financial/economic records. Preserve customer/seller/internal note separation and source ownership after account changes.

### F05 — P2: Overview lacks actual service-health attention and approved queue controls

Requirement: Overview§2/§3/§9 and T31step4, R243–R245/R250, V03/V15/V17.

`app/admin/page.tsx:39–45` reads operational statistics, marketplace summary and review tasks; it does not read actual email/form/system health or show Unknown for absent health. The six queue cards at45–87 and separate confirmation cards around245 cover some business work, but do not provide the required System issues count/urgent service strip. A critical health episode is only visible there after another producer creates a review task; the dedicated System health page is not a substitute for the Overview attention requirement.

`components/admin/shared-review-queue.tsx:46,52–58` offers attention/all/assigned/waiting plus text search. There is no Unassigned or Completed view, nor type/department/owner/priority/date filters. All records is not a Completed filter. Current source status, canonical task identity and overdue sort are useful existing foundations.

Fix direction: compose permission-scoped current health/Unknown and canonical task summaries without counting one task twice or treating missing data as zero; complete the approved bounded queue controls. Confirm delegated staff can reach their permitted work without granting full audit merely to show a queue (`app/admin/page.tsx:34` currently redirects actors without `audit_log.view`). This last access path requires a role journey check, not an automatic authority expansion.

### F06 — P2: queue return context is dropped for several real work families

Requirement: T31acceptance every task returns with context, Overview§5/§7, Seller Management§1, R243/R246/R248/R324, V03/V19.

`components/admin/shared-review-queue.tsx:9–19` receives `returnTo` but system/Team/recovery/returns/complaints/order-response/payment branches do not propagate it. Product and seller branches explicitly do. `app/admin/cases/returns/[id]/page.tsx:49` hardcodes Back to cases, while refund/payout pages expose generic Finance links rather than the originating filtered review queue.

Repro: open a return from Overview Assigned to me with query/page selected, then use its Back control. It goes to Cases rather than the original queue/filter/page. The selected task/scroll context is lost; this is not just absent sidebar styling.

Fix direction: reuse the existing validated local return-context mechanism for every supported family, preserve filter/page/selected task and restore scroll/focus. Reject external or unauthorized return destinations.

### F07 — P2 source finding; account-switch browser reproduction still required: Finance draft state is not reset when actor changes

Requirement: paired§10, Finance§11, Overview§5/§9, R124/R250/R323, V11/V16/V19.

`components/admin/manual-payment-review.tsx:16–19` changes its session key with `actorId` but initializes private draft state only once. Its key-change effect sets a draft only when a saved new-actor value exists; otherwise it keeps the previous actor's state. The next effect persists that same state under the new actor key when `loaded` is already true. The unkeyed mount at `app/admin/payments/page.tsx:9` does not explicitly remount/reset by actor. The draft includes payer/transaction/evidence references, notes and pending command input.

Minimal acceptance repro: keep the page mounted, change the authenticated account in another tab, then refresh the server view into a second eligible actor with no saved draft. React retaining the client instance can retain/persist the first actor's private entries. Source proves the missing reset; no browser exploit is claimed by this read-only audit. Inspect other custom private-draft hooks for the same actor/source transition; `use-case-command.ts:7–10` likewise keeps a pending ref while only updating saved-state on key changes.

Fix direction: actor/source-bound remount or synchronous state/ref reset before rendering/persisting the new scope. Preserve the original actor's opaque outcome recovery without copying private pending input to another scope. Do not solve it by disabling server current-authority checks.

### F08 — P2 workflow completeness: bounded Finance lists lack a continuation/search path for the bounded set

Requirement: Finance§3/§10/§12, T31step4, R114/R123/R125/R322, V03/V11–V13.

`lib/payments/refund-workspace.ts:22` selects at most100eligible obligations, ordered oldest first. The refund page accepts case/obligation parameters and specific notification links correctly reach records, but `components/admin/refund-funding-review.tsx:22` supplies no list continuation/cursor or the approved owner/status/account/currency/date filters. A101st active obligation can remain absent from the generic queue indefinitely unless entered through another known case/deep link. This is a discoverability/queue completeness gap, not a claim the exact known-ID route is inaccessible or caps are unsafe.

Fix direction: bounded authorized pagination/filtering with truthful has-more coverage, using original obligation state. Apply the same audit to other capped Finance projections; do not remove all bounds or expose unauthorized counts.

## Delegated Finance and other form-read matrix

Do not fix an unlisted form name by granting every staff actor SA-level form access. Match an actual consumer to its native receiver first.

| Consumer / contract | Source conclusion | Required check |
|---|---|---|
| Incoming manual payment / COD | Native command UI does not depend on `usePublishedFormConfig` for system controls; designated `payment.receipt.verify` remains explicit. | Receipt verifier-only actor can record/allocate eligible native scope; exceptions/evidence remain guarded. |
| `staff.payout-1`, `staff.payout-request-action` | Both actual client hooks are mapped to `payout.prepare` in the form GET route. | Delegated preparer config200 and native permitted preparation; SA-only approval/execution remains denied. |
| `staff.managed-payment-preparation` | Mapped to `payout.prepare`. | Verify the applicable model/private evidence and actual native preparation route. |
| `staff.payout-2` / managed approval/action contracts | SA fallback/audience is consistent with current reserved approval/actual outcome policy; not a defect merely because a legacy contract says staff. | Same eligible SA can complete covered stages; ordinary preparer cannot. |
| `system.refund-finance`, `system.payout-finance`, `system.recovery-finance`, live native Finance contracts | Actual components use `useCaseCommand`, which does not fetch published configuration. Their unlisted generic form GET404 is not evidence of a broken UI flow. | Test native contracts/replay/current delegated read/preparation; do not invent a generic publication dependency. |
| Return logistics/follow-up and supported staff intake | F01/F02 are genuine client hook/receiver mismatches. | Full explicit-grant role matrix and final revocation, with customer ownership unchanged. |
| Product publication-only staff | Dedicated publication queue and native review wrapper exist; private references are conditional on `canReview`. | Review-only/publish-only/both/neither actual UI→receiver outcomes. |
| Team / incidents | Exact T30 mappings exist for self account and explicit incident permission. | Recheck after root T30 fixes and browser-safe canonical-key extraction land; do not report ongoing owner fixes as new missing implementation. |

## All20 workstreams retained in this version

“Mapped” below means real source exists to reuse, not that the paired journey was executed during this audit. All rows require closure/evidence; no row is silently moved out of the approved version.

| Stream | Actual screen/source mapping | T31 verification / unresolved requirement |
|---|---|---|
| V01 registration | `/sell`, `/seller/registration`, application workspace/intake and actual saved registration APIs | Incomplete/invalid supplied fields, international formats without OTP, saved upload restore, same application after retry. Preserve T06 evidence; final guide T32. |
| V02 Seller Center | Seven-section `workspace-navigation.ts`; Home/profile/registration/products/orders/finance/requests | F03/F04; exact task/next party/due time, applicants and approved actors, persistent desktop/mobile workspace. |
| V03 Super Admin | Eight groups in `lib/admin/navigation.ts`; actual focused pages and shared queue | F01/F02/F05/F06/F08. Area existence is not completion; complete scoped queue/search/read-only/decision/error/return journeys in every area. |
| V04 verification/activation | Seller detail, document/protected-change workspaces and live clearance | Exact original/replacement files, SA/personal-party guards, permission≠verification≠activation, current/retained evidence and explicit holds. Actual real seller approval remains prohibited. |
| V05 profile/locations | Seller profile/private current/draft/review versions and public profile consumers | Publish-only168hour clock, address copy/edit and historical destinations; ordinary revision/current public distinction, correction and scoped restore. |
| V06 product lifecycle | New/intake/publication/concern workspaces; legacy product routes remain preserved | Empty/zero-cover assistance, same draft on resume, exact feedback, both-permission Approve & publish, separate stock confirmation and no private media leak. Products list has a real Saved product workspaces link; do not falsely report drafts unreachable. |
| V07 price/preview | Product intake private helper, exact-offer calculator and public preview/discount sources | Rupee fee estimate/current route, optional private cost/target, explicit use-price, genuine original evidence; day30 remains advisory and private. |
| V08 customer shopping | Shop/search/product/wishlist/cart/checkout/account/order/refund/case pages | Variant/mixed-cart price/image/availability agreement, actual legal seller, preserved input, F01 paired care. Public checkout gate below prevents an active checkout completion claim. |
| V09 orders/delays | Seller orders/shipping/cases, admin order-response and order detail, customer tracker | F03/F04/F06; released eligible scope,6/12hours from one clock, mixed portions, delay/next update, actual custody and no private staff notes. |
| V10 aftercare | Native cancellation, intake, return handling/replacement and complaint pages | F01/F02/F04 plus all retained T24 gaps below. Actual original policy/quantity/custody/tender must agree across roles. |
| V11 incoming/company bank | Business settings/company accounts, manual Finance/COD, customer order claim | F07/F08; exact instructions, claim≠receipt/allocation/release, partial/excess/late/reversal and original deadline. No real bank activation as test. |
| V12 earnings/bank/payout | Seller finance/payout request, protected beneficiary and payout transfer workspaces | Optional blank note, masked account, pending/held/reserved/paid, same-SA stages, safe retirement and sent/uncertain original reconciliation. |
| V13 refunds/recovery | Customer refunds, refund Finance, seller recovery statement/repayment and staff recovery | F04/F08; actual versus approval, original payer/customer company funding and separate seller liability, retain/reissue/correction, caps and current bank-funding freshness. |
| V14 fees/programmes | Commission/terms, promo/waiver/loyalty/referral/programme screens and calculation preview | Common current/upcoming time and exact acceptance; original order benefits, no waiver stacking/double charge; commercial versus financial roles; no invented cap or default reward. |
| V15 notifications/delivery | Shared bell/inboxes, source-specific destinations, automatic sender/watchdog and current reminders | Exact links/owner after resolution/revocation, read≠done, mandatory SA, acceptance/unknown/retry and no stale burst. Root T30 reminder/ownership fixes are pending checkpoint evidence, not reclassified as T31 completion. |
| V16 forms | Real runtime, published config endpoint, core receipts/health and native system contracts | F01/F02/F07; explicit-grant role loads, actual action-specific validation, safe support reference, native save evidence, client bundle imports and retained input. Never seed/republish canonical data to pass. |
| V17 Team/System/records | New Team/duties/procedures/access review; system/incident/record pages | Recheck final T30 current-authority/availability/fairness fixes and actual protected entrypoints. Native Maria schema proof does not establish all UI/runtime behavior. |
| V18 guidance/help | Existing registration video/captions and contextual product help | Existing assets really exist; component still warns its bank/profile/product registration steps are obsolete. T32 must finish/check the final Nepali guide; it remains this version, not a completed player from file existence. |
| V19 preservation/integration | Existing snapshots/receipts, exact replay, return-context and schema evidence | F06/F07; account switch, expiry, lost acknowledgment and native/browser role journeys, truthful coverage ledger. T33/T34 verification stays mandatory in the same version. |
| V20 categories/variants | Taxonomy/intake/real offers and shared immutable order/invoice/aftercare display | Exact option/pack selection, independent stock, same physical identity and original variant through cart/order/invoice/cancellation/return/refund/Finance; no fabricated combinations or used goods. |

## Explicit gates and retained evidence gaps

1. **Public checkout remains held, not falsely completed.** `lib/checkout/payment-capabilities.ts:2` is literally `{cod:false,manual_bank:false}`; `app/checkout/page.tsx:23` truthfully renders unavailable and the API checks the same capabilities. This is an intentional integration/release gate, not permission to flip a flag during this audit. T31/T33/T34 must map prerequisites and demonstrate the approved customer/seller/payment path under isolated captured/simulated evidence before any later authorized enablement. Do not count a test that stubs the gate as a proven enabled target.
2. **T24 legacy regression remains open.** `2026-11-01-T24-evidence.md` records92pass/14fail in the106test legacy run, later fixes to five assumptions and a final focused stock race. It explicitly retains nine older failures: three readiness fixtures, Ready cancellation, two-parcel receipt, three remittance/authority cases and personal-party final-parcel cancellation. Subsequent code may resolve some; no fresh full run was performed here. Do not claim these still fail today or that the suite is closed. Preserve physical receipt/inspection and funded packet requirements while reconciling stale fixtures.
3. T24 follow-through still names repeated seller clarification, staff-readable first intake evidence, narrower interception remedies, alternative-variant/difference handling, historical open physical cases and all customer-update combinations. Each needs current capability/source mapping and actual paired proof. Unsupported narrower actions must remain explicit rather than fake item-cancel/substitution buttons.
4. T24's old19unregistered-form-sites and inventory-count note is historical evidence, not a fresh count. The T30 focused catalog suite now passes its scoped inventory fix. Run a current source/adapter inventory and reconcile every remaining form; do not infer global form readiness from that focused pass.
5. Existing guide assets: MP4approximately5.4MB and captions9207bytes; source `seller-registration-video.tsx:28` explicitly warns about outdated steps, while captions include old bank requirements. T32 owns final media refresh. Playback/content synchrony was not tested here.

## Task-sized implementation and verification queue

These tasks consume existing task evidence and native projections; they do not authorize deployment, live payment/seller decisions or a canonical data repair. Root's T30 integration checkpoint precedes T31 implementation.

| Slice | Concrete work / proof | Coverage |
|---|---|---|
| 31A form-read role alignment | Add failing actual form GET+native receiver tests for staff-only support/order/Finance, dual role and SA. Fix F01/F02 narrowly; test forbidden financial mutations still fail. Include real browser module imports, no stubbed form hook. | V03/V09–V13/V16; R247/R275/R323 |
| 31B seller actionable Home | Build current-source exact task projection and top-list ordering with future/overdue/urgent/waiting fixtures. Open precise record, resolve it, compare Home/list/detail, ensure optional price advice never overdue. | V02/V04–V10/V12/V13; R164/R309–R322 |
| 31C Requests/history completion | Add order/care/payout/recovery families using safe native sources and current owner guards; test one reference, next actor/update and no internal notes/other seller data. | V02/V09–V13/V15; R172/R311/R321/R322 |
| 31D Overview and queues | Actual health/Unknown attention, five meaningful scoped summary groups; Unassigned/Completed/type/owner/date/priority views; counts agree after actions and no overlap sum. | V03/V15/V17; R243–R250 |
| 31E source context and bounded Finance search | Carry validated return context through every branch; restore filter/page/selected row/focus. Add authorized cursor/filter/has-more for >100Finance obligations without global unbounded scans. | V03/V11–V13/V19; R114/R123/R248/R324 |
| 31F private draft/account switch | Reproduce F07 with a mounted actual component and auth change; isolate actor/source state and pending refs, expiry/relogin, old attempt recovery and no cross-account persistence. | V11/V16/V19; R124/R250/R323 |
| 31G seller/admin product and profile pairs | Applicant, approved owner, reviewer-only, publisher-only, both/neither; empty intake→help→confirmed facts→stock preview→review→publication; current/pending profile+168hour boundary and exact variant previews. | V01/V04–V07/V20; R233–R240/R312–R317/R325 |
| 31H customer quote/order/payment pair | Published browse-only/withdrawn/stock states across card/detail/cart; mixed selected offers, stale quote, retained address, same request outcome; manual claim/partial/late/COD then actual preparation release. Keep public gate truthfully held until authorized prerequisites are proven. | V08/V09/V11/V14/V20; R315–R319 |
| 31I aftercare full pair and legacy reconciliation | Customer request→seller clarification/reply→staff physical/financial decision→actual receipt/inspection/replacement/refund result. Include historical cases/interception/alternative offer limitations, then the complete106test legacy suite with meaningful fixture updates. | V09/V10/V13/V20; R265–R276/R321 |
| 31J Finance end-to-end roles | Incoming verifier, delegated preparer, same eligible SA, customer/seller/original+retained party: funding shortage, sent uncertainty, bank change/reversal freshness, safe retirement, actual refund completion and separate debt/disposition. | V11–V13/V19; R076–R096/R112–R125 |
| 31K fees/programmes + notification outcomes | Current/upcoming/no-future, missing/accepted terms, original promo/credit/waiver allocations and cancellation; exact recipient/source links, resolution before handoff, accepted/unknown and no repeat SA copies. | V07/V08/V14/V15; R219–R232/R323/R325 |
| 31L all-area/mobile/accessibility closure | All eight admin areas and seven seller sections: real busy/empty/failure/waiting/blocked states, keyboard/focus/mobile, evidence fallback, no impossible action and exact source links. Reconcile coverage ledger section-by-section. T32guide, T33native cutover and T34all20report remain tracked same-version dependencies, not exemptions. | V01–V20; R250/R324 and all owning rows |

Reuse planned `tests/workspace-paired-states.test.ts` (not present at this audit), `tests/seller-dashboard-experience.test.ts` and `tests/return-case-presentation.test.ts`, plus actual route/native fixtures already established by the owning tasks. Inspect each target before running. Heavy/typecheck/browser/native/Maria checks remain serialized by root; this audit ran none. No fixture or stub may replace the actual authority, form loader, source guard or financial transition being claimed.

## What was not judged as a defect

- A route name/file or navigation shell is not completion; conversely no literal coming-soon placeholder was found that justifies discarding working source. Missing paired proof is labelled separately from a source-confirmed defect.
- Reserved SA approval/action forms and system-native commands were not broadened into delegated generic form access without an actual consumer/receiver mismatch.
- Current T30 fixes are owned by root/incident/Team agents: ownership fair cursor, availability-current reminders, final incident read guards, job/watchdog contract and pure browser-safe canonical-key extraction. Recheck the final checkpoint rather than reporting their in-flight state as new T31 findings.
- No claim of actual canonical readiness, provider delivery, live enablement, Maria application-runtime parity or complete T24/T34 regression closure is made. Existing backup-transfer history is not interpreted as authorization for the deferred new backup programme.

Verdict: T31 is ready for task-scoped implementation after the T30 checkpoint, but not ready to be marked complete. F01/F02 are direct action-blocking form access mismatches; the remaining approved screen composition/context/draft/queue obligations and every all20paired verification row remain explicit.
