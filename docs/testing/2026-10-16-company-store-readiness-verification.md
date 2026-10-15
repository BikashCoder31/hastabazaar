# Company-store makers and loyalty: local verification

Active project: `C:/Users/abinash/Desktop/Hatskala`.

This report separates temporary test results from checks against the user's saved website. The reviewed storage upgrade has not been applied to the active database. The preview is stopped, and the launcher correctly refuses to start until that upgrade is separately approved. No startup check was bypassed.

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
| No-PAN maker, private identity and accepted terms | Passed | Not tested after the upgrade |
| Owned product draft, submission and corrections | Passed, including actual multipart HTTP handlers and image decoding | Not tested after the upgrade |
| Super Admin review and separate activation/publication | Passed | Not tested after the upgrade |
| Public catalogue, search, product details, cart and checkout | Passed in repository tests, including stale-term removal | Not tested after the upgrade |
| Delivery/payment conditions, holding periods, cases and refunds | Passed with simulated fixtures | Not tested after the upgrade |
| Reservations, cancellation, approval, simulated payment and exact retries | Passed, including refund/permission/form races | Not tested after the upgrade |
| PAN transition, normal seller access and later seller payout | Passed | Not tested after the upgrade |
| Preservation of populated invoices, refunds, entries and paid allocations during transition | Passed | Not tested against saved records |
| Loyalty seven-day cycle, repeat, missed day, pause and redemption | Passed in isolated SQL/native D1 tests | Deliberately not submitted against saved data |
| Scheduled loyalty boundary, cancellation, stale client and blocked conversion/limits | Passed in isolated tests | Deliberately not submitted against saved data |
| Initial weekly setup, required details, saved versus unsaved review | Passed in isolated Chrome component tests | Not tested after the upgrade |
| Terms/payment recovery after a lost response or changed offer/form | Passed in isolated Chrome component tests | Not tested after the upgrade |
| Native D1 maker migration statements and history guards | Passed | Not applied |
| Staff job templates, all permission combinations and form-version editing | Covered only where exercised by the project suite | Full current Chrome inventory still required |
| Customer/rider areas, all orders/returns/admin sections and all small-screen pages | No claim of complete coverage | Not tested as a complete current browser journey |
| Real payments/email, production tax approval and remote MariaDB | Not tested; local simulated scope only | Not tested |

Chrome component tests use intercepted APIs. Repository and HTTP tests use disposable real-schema databases. Their results do not claim that the complete saved website has passed normal Chrome acceptance.

## Review findings corrected

1. Prepare a second payment, then refund a previously paid sale. The old code could pay the original second amount despite the new debt. The corrected operation checks every seller-wide refund offset again in the transaction. Tests also cover a new earning masking the debt in the total balance.
2. Refund 5 paisa and then 1 paisa at the 9% split. The second refund has no additional maker-money reversal. The old readiness check required a forbidden zero-money ledger entry. Readiness now checks the full refund calculation and exact source facts.
3. Change the effective managed retention without renewed maker acceptance. Products previously stayed available in discovery/cart while checkout rejected them. Discovery, detail and cart now require matching accepted terms too.
4. Apply a PAN transition without receiving-account evidence. The previous change could grant seller access without a usable payout destination. Submission, review and application now require the private evidence and keep the reviewed references.
5. Disable or suspend a maker just before renewed-terms acceptance commits. The operation now uses the same owner/restriction guard as the maker workspace, before validation and inside the transaction.
6. Lose a future-terms response, then change its form or cancel/replace the offer. The original request, offer, publication and answers are retained. A separate recovery panel reaches removed offers. Only a matching receipt clears the attempt, and recovered old offers cannot start a fresh acceptance.

Separate GPT-6.1 Sol reviewers with extra-high reasoning reviewed implementation and tests. Their scoped follow-up verdicts have no important remaining finding in these fixes. Server and active database operations remained with the main agent.

## Concrete storage upgrade awaiting approval

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

The public sign-in warning was previously traced to browser-extension DOM changes (`data-sharkid`, `data-sharklabel`, `shark-icon-container`) before hydration. No authentication or security rule was changed to hide it. A fresh normal Chrome check remains part of the browser handoff.

## Pending handoff

Obtain the separate concrete upgrade approval required by the approved specification, apply only that reviewed upgrade, run `npm run local:check`, and start through `npm run dev` or `START-HASTABAZAAR.cmd`. Keep earning paused and grace off. Complete the normal Chrome inventory, then leave the Super Admin pages open and the correct Desktop server running.

Do not push, deploy, seed, reset, restore a backup over active data, or erase test history. Before any later browser writes, name the new fictional records and how settings will be restored through new audited versions. Existing records must not be overwritten.
