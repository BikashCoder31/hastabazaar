# Company-store makers and loyalty: local verification

Active project: `C:/Users/abinash/Desktop/Hatskala`.

The user approved the concrete storage upgrade with “go ahead”. The two reviewed additive migrations and four missing empty forms were applied successfully, with an exclusive backup first. All 151 original tables and all 333 original rows remain intact. Integrity and foreign-key checks pass. No startup check was bypassed. Code verification includes commit `07fd261`; the final handoff uses the checked Desktop launcher on port 3018.

## What is prepared

- A maker without business PAN can use their own customer account to prepare products for sale through the company store. Private identity checks, independent staff review, activation and product publication remain separate.
- Sale-linked settlements use the maker's exact accepted offer. At the approved 9% rate, an eligible NPR 1,000 sale gives NPR 90 to the company and NPR 910 to the maker. Old sales keep their original terms.
- Super Admin can review earned amounts, holds, refunds, payment reservations and simulated payments. A later refund can require cancellation and preparation of a corrected payment; it cannot silently increase a payment or change paid history.
- A maker becoming a Registered Seller must provide private registration, tax and receiving-account evidence, accept the current seller agreement and receive independent approval. The approved change keeps the receiving reference and written agreement reference. Earlier managed sales and payments remain available separately.
- Initial loyalty setup shows 5, 7, 9, 10, 11, 13 and 15 points, with grace off. Dates and shared points limits remain blank until the user chooses them. The active program remains paused and unpublished.
- Future loyalty rules keep current rules until the new Nepal-time start. A later Pause keeps the scheduled change paused. Incompatible limits or conversion stop new earning while preserving earned points and permitted redemption.

## Test inventory

| Area | Temporary tests | Current saved website in normal Chrome |
|---|---|---|
| No-PAN maker, private identity and accepted terms | Passed | Passed: normal signup, one owned application, no business PAN, private fictional ID/bank documents, recorded 9% terms |
| Owned product draft, submission and corrections | Passed, including actual multipart HTTP handlers and image decoding | Passed: API created one four-photo draft; Chrome edited and resubmitted it. Four saved photos loaded. Full four-file Chrome picker sequence not completed; automation was very slow |
| Super Admin review and separate activation/publication | Passed | Passed: independent maker/product reviews, activation blocked before product approval, later activation and separate publication |
| Public catalogue, search, product details, cart and checkout | Passed in repository tests, including stale-term removal | Passed for one fictional product/order, correct company seller identity and totals; homepage and all four gallery selections also passed. Initial gallery clicks were a testing-tool issue, explained below |
| Delivery/payment conditions, holding periods, cases and refunds | Passed with simulated fixtures | Passed: company packing/readiness, courier assignment, dispatch, delivery, simulated COD collection/remittance, 9%/91% earned split and unchanged seven-day hold. Full returns/refunds not submitted |
| Reservations, cancellation, approval, simulated payment and exact retries | Passed, including refund/permission/form races | Hold correctly leaves payable/reserved/paid at zero. Positive mature payment not tested against saved data; hold was not shortened |
| PAN transition, normal seller access and later seller payout | Passed | Fictional multipart transition submitted via normal owned API; independently scheduled and applied in Chrome at a Nepal-time boundary. Normal seller sign-in/dashboard/finance passed. Earlier NPR910 company earnings remain visible at /sell/application. Later seller payout remains untested |
| Preservation of populated invoices, refunds, entries and paid allocations during transition | Passed | Earlier fictional company order retains company identity, 9000 paisa retention and 91000 paisa maker entitlement after transition. All 333 original rows preserved |
| Loyalty seven-day cycle, repeat, missed day, pause and redemption | Passed in isolated SQL/native D1 tests | Deliberately not submitted against saved data |
| Scheduled loyalty boundary, cancellation, stale client and blocked conversion/limits | Passed in isolated tests | Deliberately not submitted against saved data |
| Initial weekly setup, required details, saved versus unsaved review | Passed in isolated Chrome component tests | Passed read-only: 5/7/9/10/11/13/15, grace off, earning paused, missing dates/limits named, save/publish disabled. No draft or publication created |
| Terms/payment recovery after a lost response or changed offer/form | Passed in isolated Chrome component tests | Not tested after the upgrade |
| Native D1 maker migration statements and history guards | Passed | Applied only after explicit approval; repeat plan adds zero migrations/forms |
| Super Admin summary filters | Passed in repository tests | All four passed with waited URLs and correct Nepal date labels. Test accounts are excluded; populated ranking remains fixture-tested |
| Staff job templates, permissions and forms | Targeted API/repository tests passed | Admin orders allowed; six Super Admin pages blocked directly; 10 action probes return Admin403/anonymous401. Eight job templates previewed without saving. Catalog search, key validation, phone/desktop previews and v1 history checked; existing forms not edited/published |
| Customer/rider areas, all orders/returns/admin sections and small screens | No claim of complete coverage | Buyer signup/profile/contact verification/order history/rewards and selected admin pages checked. Rider operations on hold. Complete role matrix, every populated admin action and fresh small-screen acceptance remain untested |
| Real payments/email, production tax approval and remote MariaDB | Not tested; local simulated scope only | Not tested |

Chrome component tests use intercepted APIs. Repository and HTTP tests use disposable real-schema databases. Their results do not claim that the complete saved website has passed normal Chrome acceptance.

Final affected regression run: **166 passed, zero failed**. A separate existing transition-contract run passed 86 checks and found two old bank-document fixture assumptions; after correcting those fixtures, the affected 25 checks passed. The final privacy/owner/multipart group passed 14 checks. Native maker schema proof passed. Type checks, full lint and the local production build passed.

The full `npm test` run finished after about 68 minutes: **2,766 checks, 2,738 passed, 12 failed, 16 skipped** (exit 1). It started before the final review corrections, so it is not a clean full-suite result for the final commit. All 12 failing cases passed in the subsequent focused runs. The final public-query fixture run passed 17 checks. These group counts overlap and must not be added as unique tests. The complete suite was not repeated after those corrections.

To reproduce the integration failures on the earlier version, run the listed file with `node --import tsx --test tests/<filename>`. The final-version reruns now pass:

| Failing test file | Cause and correction | Final evidence |
|---|---|---|
| `form-catalog-json-envelopes.test.ts` | The module mock made the synchronous finance-action classifier asynchronous; keep the real pure classifier. | 166-check run |
| `form-catalog-managed-workspace-eligibility.test.ts` | Missing link stub and an expectation for the replaced free-text transition form; assert the single owned multipart flow. | 166-check run |
| `form-catalog-policy.test.ts` | The source inventory expected the previous form/action totals; enumerate the new required sites. | 166-check run |
| `form-catalog-query.test.ts`, `homepage-products.test.ts`, `recently-viewed.test.ts` | Narrow catalogue fixtures omitted the accepted-terms evidence tables and legal-name column now used by the shared eligibility query; extend fixtures from the real schema. | 166-check and final 17-check runs |
| `form-catalog-seller-data.test.ts` | Old draft labels and an unrendered link prevented the history/pagination assertion; check the actual current rendered history. | 166-check run |
| `form-catalog-stale-reset-polish.test.ts` | The activation fixture lacked the now-required immutable accepted terms; provide genuine evidence. | 166-check run |

These were compatibility failures in existing test fixtures after this work, rather than proof of a pre-existing website defect. Application authorization and accepted-terms checks were retained. The separate transition-contract fixture corrections name bank documents explicitly and assert the intended private-document visibility.

Full-run output is saved in `.superpowers/sdd/2026-10-15-company-store-maker-readiness/integration-full-test.log`; corrected-run output is in `final-affected-regressions.log`, `final-transition-contract-fixed.log`, `final-public-privacy.log` and `final-public-query-fixtures.log` in the same folder.

The broad project run also contains explicit opt-in MariaDB commerce/identity/release tests, screenshots requiring a running site, and a Linux-only process test. Skipped checks are not counted as browser or production proof. No MariaDB service was connected, and deployment upgrade scripts for these new local storage additions remain outside this local verification.

The successful build still reports existing Vinext import-extension warnings, the middleware deprecation and routes its static analysis cannot classify. These are reported separately from the corrected feature defects below; unrelated build configuration was not changed to suppress them.

## Review findings corrected

1. Prepare a second payment, then refund a previously paid sale. The old code could pay the original second amount despite the new debt. The corrected operation checks every seller-wide refund offset again in the transaction. Tests also cover a new earning masking the debt in the total balance.
2. Refund 5 paisa and then 1 paisa at the 9% split. The second refund has no additional maker-money reversal. The old readiness check required a forbidden zero-money ledger entry. Readiness now checks the full refund calculation and exact source facts.
3. Change the effective managed retention without renewed maker acceptance. Products previously stayed available in discovery/cart while checkout rejected them. Discovery, detail and cart now require matching accepted terms too.
4. Apply a PAN transition without receiving-account evidence. The previous change could grant seller access without a usable payout destination. Submission, review and application now require the private evidence and keep the reviewed references.
5. Disable or suspend a maker just before renewed-terms acceptance commits. The operation now uses the same owner/restriction guard as the maker workspace, before validation and inside the transaction.
6. Lose a future-terms response, then change its form or cancel/replace the offer. The original request, offer, publication and answers are retained. A separate recovery panel reaches removed offers. Only a matching receipt clears the attempt, and recovered old offers cannot start a fresh acceptance.

Separate GPT-6.1 Sol reviewers with extra-high reasoning reviewed implementation and tests. Their scoped follow-up verdicts have no important remaining finding in these fixes. Server and active database operations remained with the main agent.

## Approved storage upgrade applied

Source and destination are the same active database:

`C:/Users/abinash/Desktop/Hatskala/.staging/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`

The exact reviewed SQL files are:

- `drizzle/0071_company_store_maker_readiness.sql` — SHA-256 `e355fff952e05a0bd814a5415521eec3767e8da47cbde133791d4bd6a7383cd7`
- `drizzle/0072_loyalty_scheduled_changes.sql` — SHA-256 `0c84de7b308f56330900364438e86df3aa4308930e246338cb73cf7cbb9466e5`

The upgrade adds 11 nullable/defaulted columns, an empty allocation table, indexes and history/validation guards. It initializes only these four missing forms as published version 1 with **no custom questions**:

- `seller.managed-terms-acceptance`
- `staff.managed-eligibility-release`
- `staff.managed-payout-preparation`
- `staff.managed-payout-action`

It records four form-publication audit rows under the existing local Super Admin and two migration records. Existing published forms are preserved; an existing unpublished draft stops the upgrade for review. No users, products, orders, claims or commercial settings are created or overwritten.

Manifest approval hash: `f9792ce614f9cd9e1df84eb27fbf2a326183c97c4002e8e1cc83efa94737910d`.

After explicit approval, the exact upgrade was applied. `npm run local:check` passes all 89 required forms and the new feature guards. The correct Desktop preview was checked before any restart; no second server or alternate port was used.

Fresh pre-apply backup: `.superpowers/sdd/2026-10-15-company-store-maker-readiness/before-approved-active-upgrade-20261016.sqlite`. The approved apply proof is `approved-active-preservation.json`. Final comparison after fictional commerce and PAN transition is `final-active-preservation.json`: **333/333 original rows preserved**, integrity `ok`, no foreign-key errors, and repeat upgrade plan zero/zero. The old source SHA below records the earlier rehearsal, not the now-upgraded active file.

Consistent untouched backup:

`C:/Users/abinash/Desktop/Hatskala/.superpowers/sdd/2026-10-15-company-store-maker-readiness/before-readiness-20261016.sqlite`

Upgraded rehearsal copy:

`C:/Users/abinash/Desktop/Hatskala/.superpowers/sdd/2026-10-15-company-store-maker-readiness/rehearsal-readiness-20261016.sqlite`

The rehearsal preserved all **151 existing application/migration tables and 333 existing rows**, including every existing visible column. Integrity and foreign-key checks passed. Feature readiness and all **89/89 forms** passed. The second run added zero migrations, forms or audits. The active database file stayed unchanged during the rehearsal. Its recorded SHA-256 is `be76e0965bf501b0812ad65d0aa2e76d3494d9996ea80ceae68ae1298a71f85e`.

Evidence, including per-table counts/hashes, is in `.superpowers/sdd/2026-10-15-company-store-maker-readiness/active-upgrade-rehearsal.json`. A fresh exclusive backup is also required immediately before any approved active apply. The upgrade refuses an occupied preview port and never overwrites an existing backup.

## Chrome checklist after approved upgrade

1. Open `http://localhost:3018/admin/programs` as Super Admin. Expect the readiness checklist, maker queues and private simulated finance controls. An ordinary Admin must be blocked.
2. Open `http://localhost:3018/admin/loyalty#manage`. Expect paused/unpublished status, seven awards 5/7/9/10/11/13/15 and grace off. Expect missing start/end dates and daily/total limits to be named. Do not submit settings until the user chooses those details.
3. Filling the details and checking Enable only prepares the editor. Save creates a draft. Review the saved rules, then Publish deliberately. A future Nepal start schedules the change; current valid rules continue until then.
4. Open `http://localhost:3018/sell/application` with a separately agreed fictional maker account. Expect owned products, current/upcoming accepted terms and the private registration-change form. A different account must not see the maker's answers or documents.
5. Open `http://localhost:3018/shop`, `http://localhost:3018/cart` and `http://localhost:3018/checkout` with a fictional customer. Confirm company-store selling identity and blocked unavailable products. Explain all new test records before saving orders or payments.
6. Open `http://localhost:3018/admin/commission`, `http://localhost:3018/admin/promo-codes` and `http://localhost:3018/rewards-terms`. Confirm the current saved rules are distinct from drafts and earlier history.
7. Repeat the relevant pages at a small screen width and with the keyboard. Check links, required-field messages, loading, failures and reloads. Record each result; do not infer the whole website from these pages.

The public sign-in warning was confirmed again in fresh normal Chrome: browser-extension DOM changes (`data-sharkid`, `data-sharklabel`, `shark-icon-container`) happen before hydration. No authentication or security rule was changed to hide it.

Proposed check/fix: temporarily pause the autofill extension for localhost, reload the public sign-in page, and compare the warning and injected attributes. If that confirms the cause, exclude localhost in that extension's settings. Do not change application authentication or hide hydration warnings as a substitute. Extension settings have not been changed during this work.

## Normal Chrome journey and remaining checks

The new fictional maker is `qa-maker-20261016@local.hastabazaar.test`, maker ID `3894f6af-cc28-40a3-8dfd-669f71925ec3`. The buyer is `qa-buyer-20261016@local.hastabazaar.test`. The sample cup is `a0e79396-6a17-4348-acc3-3ee482daff6c`. All documents/photos are visibly SIMULATED. These are new labelled records; they were not seeded or copied over existing records.

One normal-Chrome COD order, `HK-20261016-6BFC9C93DF` (`ec73c7c3-9465-4191-a78e-0682c76a2925`), totals NPR1,180: product1000 plus delivery180. Parcel `7c5dd362-1364-4b08-9801-aeb3c63a900e` was prepared, assigned to a fictional courier, dispatched and delivered. Collection/remittance records are explicitly simulated: no real cash, bank, email or courier service was used. Local captured email verification succeeded. The buyer’s original unverified password was removed by the existing verification rule; no password reset was performed.

The later transition `ef9e38b6-82e2-4d42-8b66-fddcb05576e0` used fictional registration/PAN evidence and the maker’s existing private receiving evidence. Super Admin reviewed the saved terms and scheduled 14:06 Nepal time on16October, then applied it when due. The earlier company order still has its original company identity and 9%/91% snapshot. Its NPR910 entitlement remains held until the recorded seven-day hold ends; no maker payout was prepared or paid.

Temporary program activation/model versions were restored through new audited versions: Applications Only and no active model. The original9% retention setting, company identity, existing staff access, promo records and loyalty config were not changed. Test history is retained. Loyalty has current revision0, no draft, paused1, issued0 and no scheduled revision. Dates and shared limits must be chosen before a real saved draft can exist.

### Additional defects found and corrected in the actual browser journey

1. Real maker UUIDs caused native D1 `LIKE or GLOB pattern too complex` errors in accepted-term checks. Exact `instr` folder-prefix checks now support UUIDs and reject foreign/suffix/embedded/case/wildcard lookalikes. Native tests failed before the fix and passed afterward.
2. The checked Worker preview could not load native Sharp for photo decoding. A strictly checked serve-only local media bridge reuses the existing bounded/capability-only loopback decoder. No new environment bypass or relaxed upload rule was added. Actual preview API returned WebP200 and four real saved photos were verified.
3. Private saved photos returned404 to their customer-only maker owner. The delivery route now reuses actual maker ownership, stage, role and restriction checks before cache/storage reads. Anonymous/unrelated/restricted accounts remain denied.
4. Company-store orders had no supported packing/readiness action: seller pages required a seller role, while admin dispatch required ready items. Super Admin can now prepare only the exact company-snapshot item group on the admin order page. Current authority, form publication, COD/restriction checks, history and status transitions commit atomically. Independent sellers remain separate. Both new actions passed normal Chrome and actual HTTP-handler tests.
5. Seller review showed static “Applications Only” and “unassigned” text after activation. It now shows the recorded maker/seller state and links to current program readiness.

Separate GPT-6.1 Sol extra-high code and test reviews found no remaining substantive issue in these fixes. A review caught a missing status-mail flush; it was corrected and covered by the HTTP test. The test reviewer caught a below-threshold COD race fixture; the final test uses a valid500000-paisa hold, proves insertion reached the transaction, and checks full rollback. No active data was used by reviewers.

Additional focused evidence: native/accepted-term group34passed; media/startup group24passed; existing decoder6passed; saved-photo routes4passed. The later fulfillment/photo regression run passed42/43; the single failure was a cancellation test stub missing the newly imported function. The corrected cancellation file then passed3/3. The new preparation HTTP, transaction/race and historical-route cases pass. Counts overlap; do not add them as unique coverage. Final typecheck/lint pass; final build result is recorded in the handoff entry below.

### Passed page-load inventory, with limited action coverage

Normal Chrome opened Returns&complaints (empty queues), Payouts (no positive verified balance), Shipping (the new delivered QA parcel), Exception follow-up (empty), Rider operations (retained on hold), Commission (9% launch schedule and future-rate controls), Promo codes (rules/activity/history and empty current activity). These are page-load/read-only passes, not proof of every save, refund, claim, payout or campaign operation. Other admin pages not individually recorded here are not accepted as a complete functional pass.

### Open problems and reproduction

1. **Chrome autofill hydration warning — existing environment problem.** Open `http://localhost:3018/login` or `/register` with the current autofill extension active. The console diff shows injected `data-sharkid`, `data-sharklabel` and `shark-icon-container`; the development overlay can block the first submit. Proposed fix: exclude localhost in that extension and compare a fresh load. App authentication and extension settings were not changed.
2. **Gallery testing artifact — resolved, not an app failure.** The automation clicked a thumbnail at y848 outside the visible791px screen and did not scroll it into view. Keyboard selection worked. After explicitly scrolling the thumbnails into view, mouse selection of photos2/3/4/1 all passed and the selected photo loaded900px wide. No gallery code change was needed. The earlier failure report is withdrawn.
3. **Small-screen acceptance — not tested successfully.** The browser viewport capability accepted390×844 but the actual DOM remained1901px wide, even after reload. The temporary override was reset. Earlier dated390px results do not prove the latest page layouts. Repeat manually in Chrome device mode.
4. **Nested main landmarks — existing markup issue.** Open `/admin/staff-form-history?kind=order-fulfillment&id=ec73c7c3-9465-4191-a78e-0682c76a2925`; the outer workspace and inner history view both render `main`. History still loads. This was reported without an unrelated markup change.

### Copyable URLs and manual checklist

- `http://localhost:3018/local-testing` — use the existing **Super Admin** button. Do not use missing sample-role buttons: those create seeded accounts.
- `http://localhost:3018/admin` — switch Today/Last7days/Last30days/Alltime; period labels and top-seller scope must match Nepal time. Test-domain accounts are excluded.
- `http://localhost:3018/admin/programs#maker-payments` — checklist and retained maker earnings. Expect NPR910 held and NPR0 payable/paid for the fictional completed order.
- `http://localhost:3018/admin/loyalty#manage` — expect paused/unpublished, weekly5/7/9/10/11/13/15 and grace off. Fill your Nepal start/end and daily/total limits later; Save creates a draft, Publish is separate.
- `http://localhost:3018/admin/commission` and `http://localhost:3018/admin/promo-codes` — review current saved rules separately from drafts/history; no new campaign/rate was published during QA.
- `http://localhost:3018/admin/orders/ec73c7c3-9465-4191-a78e-0682c76a2925` — expect delivered/paid simulated order,1180total, separate collection/remittance and recorded preparation history.
- `http://localhost:3018/admin/sellers/3894f6af-cc28-40a3-8dfd-669f71925ec3` — expect Registered Seller after the applied fictional PAN transition, with retained company history.
- `http://localhost:3018/sell/application` — while signed in as the fictional transitioned seller, expect retained NPR910 company earnings, still held. The normal seller finance page separately shows independent-seller earnings, currently zero.
- `http://localhost:3018/products/qa-clay-cup-20261016-simulated-8a668924` — inspect the four labelled sample photos and gallery behavior. It is a fictional local QA item.

Still not tested against saved data: every staff permission combination, changes to existing forms and restored form versions, real waiting-period maturity/payment, positive returns/refunds/complaint resolution, every seller/rider action, every small-screen layout, real external services or production readiness. These remain explicit gaps, not implicit passes.

### Final handoff evidence

Code commit `07fd261899dfb38568a50f6be82d8c580788e572`. Final typecheck, lint, build and local:check all exited0. The checked launcher prints this Desktop root/commit, the preserved local D1 path,89/89forms and local-staging simulation mode. Final running preview log: `.superpowers/sdd/2026-10-15-company-store-maker-readiness/final-running-desktop-preview.log` (exec session98317). Startup performed a cold dependency optimization; port3018 became ready afterward. No alternate launcher or port was used.

Fresh Chrome after restart confirmed normal seller access, retained managed earnings, homepage, gallery mouse/keyboard selection, historical company money in Super Admin and the paused/unpublished loyalty setup. Super Admin Program Management and loyalty are left open. The viewport override was reset after verifying that both old and fresh Chrome tabs ignored the390px override; latest small-screen behavior is therefore not claimed.

### Implementation decisions and their limits

- Use the canonical Desktop feature branch, without worktrees, as requested. This trades isolation for continuity with the one active local project; existing work was preserved.
- Bash skill helpers were unavailable; equivalent PowerShell briefs/ledgers retained the evidence gates. The risk is workflow metadata drift; Git commits and verification logs provide the durable record.
- Load page-only navigation lazily so API authorization can be tested separately. Browser navigation still needs separate acceptance evidence.
- Add immutable public identity snapshots to the reviewed additive migration so later names/company settings cannot rewrite receipts. This adds nullable storage; older records may lack those names.
- Use real accepted evidence and published setting provenance in fixtures rather than manually granting seller access. Narrow older fixtures needed schema updates.
- Reuse the refund/accrual engine and existing exported APIs, with financial readiness/operations split internally. One unpaid reservation per maker simplifies refund reconciliation and can delay parallel payments.
- Preserve the legacy backend Admin preparation policy; the new catalog operations require current Super Admin, forms and a simulated environment. No wider staff access was granted.
- Keep financial replay in its existing exact parent/audit/form path rather than duplicating it in fixed-supply replay. A mismatch is rejected instead of guessed.
- Compare the same explicit visible/generated columns during preservation checks. This avoids false differences from generated order columns and retains additive-column compatibility.
- Bound the payments view to20makers/50payments each with pagination/history links; it is not an unlimited all-record download.
- Keep one transition engine and its existing exports. New transition submissions use owned private certificates and the displayed current English agreement. The previous free-text shortcut directs to the single multipart form; unsupported languages require later work.
- Preserve original accepted registration/terms in each submission audit. Failed due rechecks request corrections and keep the managed route; manual apply uses one guarded staff-form transaction. This can require renewed review after settings change.
- Retain current/pending/draft loyalty terms separately, binding each receipt to its publication provenance. Private reasons/answers are re-entered rather than stored in session metadata; recovery takes more user input.
- Complete company packing/readiness through current Super Admin authority and historical company snapshots, reusing existing preparation transitions. No independent seller role or relaxed dispatch readiness is introduced. Mixed-state groups continue to follow the existing whole-maker preparation rules.
- Retain labelled QA records and all backups/logs rather than deleting skill workspaces, as the user's preservation instruction requires. Temporary program settings were reversed prospectively; loyalty was never saved or published.

No minor code-review finding was deliberately deferred in the implemented feature. The existing autofill warning, nested-main markup and explicit untested areas remain as reported above.

Do not push, deploy, seed, reset, restore a backup over active data, or erase test history. Before any later browser writes, name the new fictional records and how settings will be restored through new audited versions. Existing records must not be overwritten.
