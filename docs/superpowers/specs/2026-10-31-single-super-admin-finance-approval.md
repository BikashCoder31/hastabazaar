# Single-Super-Admin finance approval — approved amendment

Status: approved for the work plan, 31 October 2026. The user approved the D7 manual-payment rules and targets, removed the mandatory second-Super-Admin refund approval requirement, and explicitly extended that correction to seller payouts, COD reconciliation and recovery/write-off decisions. This amendment supersedes earlier separate-person requirements in D7, D13 and D15 and their Finance/Orders references. Implementation remains on hold until planning is complete and the user resumes work. No actual permissions, bank records, money, application settings or deployment change here.

## 1. Approved rule

One eligible, authorized Super Admin may prepare, review, approve, execute manually where applicable, and record a finance action. It is valid for the same person to be the recorded preparer and approver. No second Super Admin, separate Finance employee or third operator is compulsory. Finance staff may prepare work when available; additional reviewers may help, but their absence cannot block an otherwise valid authorized decision.

The earlier wording required a different person as a second check. The user explicitly replaced that staffing requirement because the company currently has one Super Admin and might continue with one. It must not survive as a hidden API, high-value, funding, preparation, COD or form-validation gate.

## 2. Covered actions and unchanged authority

| Action | Approved authority |
| --- | --- |
| Ordinary bank receipt confirmation | Designated Finance verifier or eligible Super Admin under approved D7 matching rules. |
| Payment allocation exceptions and reversals | Eligible Super Admin; may also have prepared the proposed correction. Actual evidence and source allocation limits still apply. |
| Standard customer refund | Standard refund-entitlement permissions remain; eligible Super Admin verifies destination/funding and authorizes the outgoing packet, including one they prepared. |
| High-value customer refund | High-value thresholds and explicit Super Admin approval remain. The same eligible Super Admin may propose and approve; another reviewer is not mandatory. |
| Seller payout | Finance or Super Admin prepares; any eligible Super Admin may approve, including the preparer. That Super Admin may manually execute and record the outcome. |
| COD receipt/remittance and carrier-fee allocation | Eligible Super Admin reviews actual receipt, collector/parcel allocations and permitted fees; may have prepared the reconciliation. |
| Customer refund funding after seller payout | Eligible Super Admin authorizes available company funding, including their own prepared packet. Customer refund and seller recovery stay separately recorded. |
| Recovery amount/method, installments, disputes and repayments | Eligible Super Admin confirms the applicable decision/receipt and its source evidence. No second-person rule. |
| Over-recovery return, recovery reduction or company absorption/write-off | Eligible Super Admin explicitly decides with the required amount, reason, evidence and history; may have prepared the case. No automatic write-off or invented recovery. |

Ordinary staff do not acquire Super Admin approval authority through assignment, navigation or this amendment. Product review/publication and commercial-policy permissions remain separate. Verified-document ownership checks and bank privacy remain unchanged.

## 3. Checks still required

- Review the actual receipt/transfer evidence, correct party, account/destination version, currency, amount, source obligation, available funds and previous allocations/refunds.
- Respect current identity/bank/terms/readiness holds and supported commercial-model rules. Approval does not manufacture a verified beneficiary or permit third-party seller payout accounts.
- Distinguish approval from actual bank execution/completion. An uncertain outgoing outcome remains reserved for reconciliation; a timeout or email retry cannot cause another transfer.
- Preserve source-based caps and original order/fee/contract snapshots. No duplicated receipt allocation, refund, debt recovery or payout.
- Retain conflict-of-interest checks for the person's own customer refund, personal seller beneficiary or their own rider-cash claim. Those are specific personal-interest cases, not a general second-person workflow. If the only operator is personally conflicted, keep that case owned and pending an eligible nonconflicted decision; do not fabricate a second approver. Acting for the company on ordinary company funds is not itself a personal beneficiary conflict.
- Retain restricted bank/evidence access and proper authentication. This amendment grants no new ordinary-staff access to private seller bank evidence.

Keep distinct recorded decisions even when one person performs every step. Save the real actor for preparation, approval and execution, timestamps, amount, reference, reason, evidence and relevant versions. Show that person's actual actions; do not claim an independent second review occurred. Optional second-review notes are additional evidence, not a completion prerequisite.

## 4. Existing packets and implementation mapping

At later implementation, reconcile every UI, API, domain guard, form definition, permission check and test with this rule. A packet must not be rejected solely because preparer and approver are the same eligible Super Admin. Preserve legitimate source/destination/version/hold checks and case-specific personal-conflict rules.

For legacy packets, recheck current eligibility and required evidence; an old same-person approval is not invalid merely because of actor equality. If a hold, destination, amount or obligation has changed, retain the approved D4 reprepare/review rule, now executable by the same eligible Super Admin. Already-sent/uncertain/paid attempts keep their original facts and are reconciled rather than resubmitted. No bank fact, historic actor or completion evidence is invented.

Later verification must cover one-Super-Admin preparation/approval/execution, optional Finance preparation, high-value refunds, COD and recovery/write-off paths, ordinary-staff denial, personal conflicts, held/changed packets, duplicate attempts, uncertain bank outcomes and truthful history. Use fictional records and simulated money only after work resumes. No application tests or financial actions are performed for this amendment.

Related: [manual payment rules](2026-10-31-manual-payment-rules.md), [bank/identity and payout rules](2026-10-31-bank-identity-changes-payout-approval.md), [refund/recovery rules](2026-10-31-refunds-after-payout-recovery.md), [Finance & payments](2026-10-30-finance-payments-workspace.md), and the [decision register](../plans/2026-10-30-planning-readiness-review.md).
