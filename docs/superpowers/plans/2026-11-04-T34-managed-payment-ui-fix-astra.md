# T34 managed supplier payment UI correction — 2026-11-04

Scope: `components/admin/managed-program-review.tsx`, the coordinated single caller line in `app/admin/sellers/[id]/page.tsx`, and new `tests/managed-program-payment-render.test.ts`. Root authorized this narrow correction after the managed form regression identified a real dead approved-state action. Existing dirty source was copied before editing. Canonical checkout remains `C:/Users/abinash/Desktop/HastaBazaar`; all deployment/data holds remain.

## Cause and authority mapping

The approved supplier-payment form offered `mark_payment_paid`, while `lib/managed-commerce/fixed-supply.ts` deliberately rejects direct completion through `requireExecutionPacket`. Restoring that shortcut would contradict the approved Finance specification sections 8–9 and the single-Super-Admin amendment: approval is separate from independently evidenced payment, simulation does not become live, and genuine personal conflicts remain excluded.

The existing `/admin/payments/payouts` page already accepts the exact `model=fixed&payout=<original payment ID>` selection. Its workspace retains the original supplier obligation, marks fixed records as simulation, projects either the original candidate or its retained packets, and verifies current authority, source ownership, beneficiary, holds and funding. Its controlled forms retain request/outcome recovery through `useCaseCommand`. No new bank or payment behavior was added.

The actual page requires `payout.prepare`, which ordinary Admins possess. Payment action form history separately requires Super Admin and `payout.approve`. The caller therefore passes two independent, default-false presentation flags using those permissions and `application.userId !== staff.id`. The destination independently rechecks authorization and source-party privacy. Existing general history navigation was preserved.

## Corrected behavior

- Approved supplier payments no longer offer direct completion. The status explains that approval does not confirm payment and links authorized staff to the exact original fixed-payment transfer workspace, retaining the seller return context.
- Legacy prepared approval still uses its original configured form, custom answers and same-tab request recovery. Preparation and all domain/finance rules are unchanged.
- Old `mark_payment_paid` session references remain visible and stored for history review, including when the original record is now paid. They are never retried or silently cleared, and their copy explicitly says they are not payment proof.
- Historical paid records, adjustments and recovery totals remain visible without an empty action selector or completion form. Exact original payment-action history navigation is separately permission-gated.

## Verification and limits

Evidence directory: `.test-artifacts/t34/managed-payment-ui-fix-astra-20261104/`.

- `before/`, `before-hashes.json`: original component and dirty seller page before this slice.
- `render-red.tap`: actual focused render run, **1 pass / 3 fail**, 3.935 s. Failures expose the offered completion shortcut, absent controlled next-step explanation and missing visible retained UUID. Existing prepared approval recovery passes before the correction.
- `render-green.tap`: initial correction **4/4**, 1.795 s.
- `render-final.tap`: final source **5/5**, 2.617 s, exit 0. Includes separate ordinary Admin preparation versus Super Admin history permissions and source-owner denial, exact original URL/return context, paid totals, retained completion reference, and same-request/same-configured-answer retry after a simulated connection loss.
- `caller-only-diff.txt`: comparison against the captured dirty caller proves this slice changed only the approved component invocation line.
- `after-hashes.json`: component, caller and new test hashes at handoff.

Command: `node --import tsx --test --test-concurrency=1 tests/managed-program-payment-render.test.ts`, with TEMP/TMP inside the evidence directory. This is bounded React markup and component-event evidence using simulated hooks/storage/network responses; it is **not actual browser, route-authority, D1, or payment-execution evidence**. The test performs no external request and creates no database. Main suite owns the heavy slot; no lint, typecheck, global suite, D1/MariaDB or browser run was started by this slice.

Queued browser checks were sent to the managed form regression owner: retain the prepared form assertions, inspect approved state without a payment-action form, follow the exact authorized original transfer URL, and retain a preloaded old completion UUID across remount without offering retry. Root owns actual browser scheduling and combined lint/typecheck/build/suite acceptance.

No canonical database, `.staging`, remote credential, live payment, mail, launcher, Git state, backup archive or deployment was modified.
