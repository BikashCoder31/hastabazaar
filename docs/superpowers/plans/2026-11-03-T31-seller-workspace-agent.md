# T31 Seller Home / Requests evidence

Authoritative checkout: `C:/Users/abinash/Desktop/HastaBazaar`. Isolated SQLite `:memory:` fixtures only; no canonical data, launcher, mail, payment service, migration, deployment or Git changes.

## Implementation checkpoint

`lib/seller/workspace-tasks.ts` projects original review, order-response, complaint, return, cancellation, registered payout, actual live payout, recovery case/repayment claim and product draft/correction facts. Home shows a compact actionable list and Requests supplies current/all views and actor-bound continuation. Applicant/application workspace uses the same projection. No parallel task or economic store is created.

Seller actions, staff waiting and recorded outcomes are distinct. Staff triage targets do not become seller deadlines; unconfirmed recovery contact creates no seller response deadline. Native order release, response/clarification, accepted installment and staff update clocks remain original. Task timestamps display Nepal date and time. Financial tasks retain requested/approved/processing/uncertain/actually-paid distinctions, and the owned Finance destination has real original request/live payout anchors. Managed terms link to their actual acceptance form rather than the registered form.

Every projection rechecks current actor identity/status/role, exact ownership and displayed native source versions after asynchronous reads. Private evidence, bank data and source proof stamps are absent from the task DTO. Mixed-order cancellation uses the exact affected seller IDs. Explicit unavailable families cannot appear as an empty success.

Continuation bounds output and retains exact task identities, including history. The current implementation reads/hydrates all owned native rows before ranking; it does not claim a bounded database source scan.

## Meaningful failures and verification

- Product correction RED: old staff triage target incorrectly appeared as a seller deadline. Fixed without changing native clocks.
- Recovery RED: an eight-day-old case with no confirmed contact incorrectly required seller response. Fixed to current staff waiting.
- Mixed-order cancellation RED: an unaffected seller saw another seller's cancellation request. Fixed to exact native affected-party scope.
- Historical dashboard aggregate initially passed32/33. The old accepted725 fixture had no explicitly published baseline and conflated unaccepted offer with unavailable configuration. Root approved using existing `historicalCommissionDatabase(false)`: explicit historical900 baseline, original accepted725 fact, another seller's unaccepted725 offer, and unchanged original recorded9% ledger amounts. No native rate selection or fee code changed.
- Final memory aggregate **33/33 PASS**, exit0,69.70s: `.test-artifacts/t31/seller-workspace-memory-final.tap`. Includes actual complaint response, original13-hour order release, source/owner change during reads, API auth/revocation, actual agreed recovery/repayment evidence request with allocation0, and genuine isolated live payout prepare/approve/start/actual-bank-paid lifecycle.
- Actual React task list + actual protected GET browser journey **1/1 PASS**, exit0,13.80s: `.test-artifacts/t31/seller-workspace-browser.tap`. All network intercepted; complete fictional memory fixture, desktop/mobile CSS, native exact links, waiting/history, keyboard focus and revoked refresh. Browser/context closed. Screenshots `.test-artifacts/t31/seller-requests-desktop.png` and `seller-requests-mobile.png` inspected after final timestamp change. Browser journey does not claim navigation through every native financial action page.

No T31 native D1/Maria/global typing run by this agent at this checkpoint. Root serializes final checks and owns task ledgers. Additional assigned Team/System Health return-navigation work is a separate source checkpoint.

Actual Seller Home + Requests + Finance server composition subsequently passed **2/2**, exit0,11.52s (`.test-artifacts/t31/seller-workspace-pages.tap`): original payout reference/link matches the rendered existing Finance anchor, and offboarding during the last product/earnings read rejects the whole Home response. Framework authentication identity, Link/Image and CSS loading are fixture boundaries; source readers and page functions remain real. No runtime changes were needed for this composition verification.

## Additional Team / System Health navigation checkpoint

The actual protected Team task redirect preserves safe return context alongside its original tab/task/control fragment. Team's five tabs, people filters and ordinary My responsibilities preserve the same caller; policy/editor links retain the current Team tab. System Health source links retain the observed workspace; incident selection, linked sources and saved-result navigation preserve context; Records forms and source links preserve their exact search filters. Back links are validated with the existing `/admin` helper and grant no access.

Actual page/redirect/render acceptance **RED4/4 → GREEN4/4**. Final context/helper/render/current-authority/source-boundary aggregate **11/11 PASS**, exit0,28.75s (`.test-artifacts/t31/team-system-context-final.tap`). The Records test follows the existing authorized scoped queue URL rather than inventing a new detail route. No domain mutation, authority, clock or schema was changed. Seller and navigation runtime files are stable at this checkpoint; further T31 Product UI work is separately assigned.
