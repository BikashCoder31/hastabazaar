# T29 exact financial notification destinations — 2026-11-03

Canonical checkout: `C:/Users/abinash/Desktop/HastaBazaar`. Read T29 in implementation part 5, the controlling Email delivery rules and Finance workspace boundaries. Parent authorized only financial branches of `notification-links.ts`, new protected destination helpers/pages, actual refund/invoice anchors, and the coordinated internal programme destinations. No schema, source accounting, payment decision, main ledger or central consumer changes.

## Result and source authorization

`financial-notice-links.ts` maps all nine financial descriptor related types and the two new internal programme types to audience-scoped destinations. Refund customer links now have an actual `refund-<id>` article anchor. Exact commercial credit links use an actual `adjustment-<id>` list-item anchor on the original invoice. Nonfinancial notification families remain parent-owned and unchanged by this slice.

New protected `/admin|account|seller/financial-notices/[type]/[id]` pages use `financial-notice-destination.ts` and a shared read-only `FinancialNoticeRecord`. The resolver requires an actually issued namespace-matching notice for the current actor/audience/source, current active role/permission, and the existing native current-source/current-recipient proof. It rechecks after reading the minimal projection. Stale, unissued, wrong-audience and personally conflicted records return no projection; role revocation is denied. Copied URLs create no authority. Current/retained financial independence remains enforced by the existing source adapter.

Covered financial types: refund obligation, payout packet, actual maker payout, actual earning release, external live clearance, company commercial invoice scope, lawful fee authorization, original live invoice correction, and company funding statement. No private evidence, account numbers, legal basis, statement cash balance, verification metadata or source JSON is returned. The pre-obligation lawful fee page explicitly distinguishes authorization from Finance handoff and completed payment. Payout preparation, processing and bank completion remain distinct.

Super Admin maker links select the exact seller in the existing program finance workspace. Limited payout staff receive the existing protected payout review instead of an inaccessible Super Admin program action. Invoice credit links open the original order for Super Admin and authorized Finance work for limited staff; customer links select the original invoice and exact immutable correction. Clearance links select the exact current seller review. Scope and funding views display their exact retained source before linking to the existing guarded workspace.

Coordinated with the reminder/producer agent: `promo_campaign_notice` uses the actual campaign ID; `loyalty_programme_notice` uses native singleton `default`. Both require an actually issued internal staff notice, current Super Admin `commercial_policy.manage`, and `isCurrentProgrammeNotice` before/after projection. Only generic subject, original reference, current state/milestone and recorded time are shown. Existing `/admin/promo-codes` and `/admin/loyalty` management remains authoritative; no marketing distribution, code, budget, customer list or reward amount is exposed.

## Verification

Observed red failures for missing/inexact audience destinations, missing resolver, and limited department staff being pointed to a Super Admin-only workspace. Corrected the corresponding owned behavior. One temporary source edit had an SQL string quoting syntax error; corrected it and reran the final command successfully.

```powershell
node --import tsx --test --test-concurrency=1 tests/financial-notification-destinations.test.ts tests/financial-notification-destinations-render.test.ts tests/programme-notification-destinations.test.ts
```

Final **8/8, exit 0, 24.11 seconds**. Uses inspected fictional `:memory:` fixtures with all actual migrations, actual payout/refund/funding/clearance/invoice and programme commands, plus actual component rendering. No native/browser/global typecheck was run, as directed.

Evidence includes all audience/type mappings; exact payout record and seller filter; limited staff next step; actual scope/clearance/funding and packet sources; actual paid-refund commercial credit; fee authorization before outgoing obligation and suppression after handoff; wrong audience/missing source; privacy; and role revocation during projection. A deliberately forged correctly shaped staff notice remains denied to the immutable original buyer even after current order-customer metadata changes and a Super Admin role is added. Render checks establish the safe read-only record, real customer refund anchor, and real original invoice-credit anchor. Actual promo publication/pause and loyalty publication open current policy records without private programme values.

Scoped `git diff --check` exit 0 (line-ending notice only). All processes are finished. No real DB, SMTP, server, job enablement, deployment, money movement or policy changes occurred. Parent owns final typing, central consumer integration and overall T29 verification. Source-adapter retained-interest review was flagged to the financial reviewer; this slice does not broaden that source proof.

## Handoff SHA-256

- `lib/operations/financial-notice-links.ts`: `BEF9AC17140019A971582F9B20F26FDD3E049F104251F181E35088610AFB3F74`
- `lib/operations/financial-notice-destination.ts`: `920126E3EDD9B72EF5529ADABE3C41F748940786BBCFD799B0941D90CD20CA71`
- `components/commerce/financial-notice-record.tsx`: `B1366EAC1BE2837FD9D8E4C8A9882957EEE6AC6C6CF50099238744C87CFCDA04`
