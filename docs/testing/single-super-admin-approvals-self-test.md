# Single Super Admin approvals — local acceptance, 2026-09-29

## Request and scope

One active Super Admin can prepare/propose and approve decisions across the app. Additional Super Admin invitations remain available; completion does not depend on having a second account. Explicit approval stages, audit attribution, validation, notice periods, permission boundaries, and existing seller/product/rider self-review restrictions remain.

Base: `61f629dd5d138b63e3375187b406e898ea62a204` on `codex/hastabazaar-v1-2-1-staging`. Local scope only. No production access, deployment, real payments or external messages.

## Issue ledger and verification

| Area / route | Reproduction and root cause | Resolution / evidence |
| --- | --- | --- |
| Business Settings `/admin/business-settings` | Propose, submit, then approve as the same SA: authorization and repository SQL rejected matching submitter; page demanded another SA. | Same active SA can approve/reject. Meaningful RED before implementation; settings tests and actual local browser approve/reject passed. Added unconditional repository authority and atomic guards after review found a no-form gap. |
| Staff access `/admin/team` and governance `/admin/governance` | Same-SA permission proposals/promotions were denied in repository, SQL and UI; proposer was omitted from pending notifications. | Same-SA decisions, authoritative permissions and notifications verified. Sole active SA can invite another SA. Self-target permission changes and seller/product ownership conflicts retained. Actual local promotion create/approve passed. |
| Payouts `/admin/payouts`, returns `/admin/cases/returns/[id]`, managed finance `/admin/sellers/[id]` | Preparers were denied final approval in code and database CHECK constraints. Some legacy no-form callers lacked current role checks. | Active authoritative SA can complete the workflows. Native lifecycle and rendered form regressions pass, including denied ordinary/suspended actors. Existing financial calculations and stage validation retained. |
| Carrier remittance `/admin/orders/[id]` | Same staff maker was blocked by UI, repository and database. | Active SA can review their own carrier remittance. Ordinary staff separation and own rider cash denial retained; same-SA lifecycle, exact retry, stale request and boundary tests pass. |
| Refund concurrency | Independent quality review reproduced no-form maker race: parent/event committed although refund update failed. | Unconditional in-batch outcome guard; approve/reject with maker/parent races now roll back. Independent reproduction and all 13 case tests pass. |
| Schema upgrade | SQLite rebuilds need FK disabling before BEGIN; previous runner could cascade-delete populated children. | Regression reproduced deletion; runner now preserves dependent rows, verifies FKs before commit and restores settings. Additive migration0062 preserves prior data/indexes/triggers and permits same-author decisions only for current active SA. |
| Generated readiness manifest | Trigger parser interpreted `CREATE TRIGGER IF NOT EXISTS` as a trigger named IF. | Actual-generator RED/GREEN regression; parser and regenerated manifest corrected while preserving release identifier. |

## Checks

- Integrated 20-file regression run: **304/304 passed**. After the final refund outcome-guard fix, the affected case suite was rechecked: **13/13 passed**, plus the legacy same-SA high-value lifecycle passed. The new case test exercises four race combinations.
- Settings-focused run: **95/95 passed**. Independent finance quality reviewer ran **46/46 scoped tests** and independently reproduced the corrected legacy race.
- Final TypeScript (`--noEmit --incremental false`), scoped oxlint, local vinext build and Git whitespace checks passed.
- **10 local API permission checks passed** across Super Admin, Admin, Seller, Customer and Rider, using isolated temporary browser contexts.
- Browser workflows used normal UI controls. Controlled retention was submitted/rejected and submitted/approved by `local-test-super-admin`; retained value stayed **900 basis points (9%)**. Two rejected marked drafts and one approved same-value version remain auditable. No pending test draft remains.
- The promotion fixture is explicitly SIMULATED, has no selected products and an expired 2026-09-01–02 window, so it cannot change current shopping placements or prices.
- The user's existing visible role sessions were left open and untouched. No duplicate preview server was started; `http://localhost:4173` was reused.

## Data and review gates

- All **22 protected responsive-media files** retain their captured SHA256 hashes; they are excluded from this commit.
- Disposable copied-database migration check preserved **778 rows across 140 tables**, 190 named indexes, all existing FK definitions and all 116 existing trigger SQL definitions; integrity OK and no FK violations.
- Final local migration applied exactly0062 (63 total tracked migrations), after a fresh online backup. All **739 rows across 139 pre-existing application tables** were byte-for-byte preserved; the migration tracking table gained only its intended entry. Integrity OK; zero FK violations.
- Specification review passed for settings, governance/remittance and finance/schema. Subsequent independent code-quality/security reviews passed, including re-review of the refund race fix. No unresolved blocking review finding.
- Detailed logs, screenshots, hashes, review reports and the local pre-upgrade backup are retained in `C:/Users/abinash/Desktop/Hatskala/single-super-admin-20260929/`.

## Limits and remaining work

Native MariaDB execution remains unverified; the previously documented MariaDB readiness blockers are not resolved by local D1 success. Generated MariaDB compatibility artifacts are included but no production migration was run. This change does not claim a fresh complete 1,953-test run or new live-browser payout/refund settlement scenarios; those financial transitions were verified with disposable native fixtures and rendered form tests. Pre-existing broader governance legacy replay/concurrency limitations noted by review are unchanged.
