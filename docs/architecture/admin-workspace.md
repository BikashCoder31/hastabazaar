# Admin and Super Admin workspace

## Scope of this pass

The staff workspace now follows the storefront and Seller visual language.
Development remains local and English-only. No deployment, role assignment,
real invitation, operational payment, carrier booking, or live integration was
performed as part of this UI pass.

- Grouped Operations, Marketplace, and Controls navigation; active-page state,
  role badge, skip link, loading skeleton, and responsive rail.
- Live overview queues for seller applications, products, ready orders,
  returns, complaints, and seller payout requests. Counts come directly from
  the database, not the limited rows loaded by list pages. Ready orders count
  distinct orders even if multiple vendors have ready items. Assigned and
  escalated complaints remain included.
- Super Admin-only overview of pending payouts, high-value refunds, and
  promotions. These are queue totals, not a promise that the current operator
  may decide every record: their own proposals need a different checker.
- Tabbed governance: listing rules and promotions for Admin; additionally
  accounts, incidents, and backup verification for Super Admin. User search
  explicitly covers the latest 300 loaded accounts, not every marketplace
  account. Incident and backup lists remain capped at 100 each.
- Payout preparation dialog, state-aware decision form, independent-approver
  guidance, confirmations, and explicit manual-payment wording. Minimum payout
  copy uses the configured policy. The history's approval count is labelled as
  belonging to the loaded history; overview totals are uncapped.
- Confirmations for staff invitations, account-status changes, promotion
  decisions, rule activation changes, and final privacy decisions. Own-account
  suspension and own-promotion decisions are not offered.
- Labelled catalogue, classification, payout-request, review and privacy forms.
  Failed requests retain input, release pending controls, and report errors.
  English taxonomy edits retain an existing secondary-language name; new
  entries retain English fallback data in the bilingual-ready schema.
- Actual incident response/resolution notes replace the previous canned
  resolution statement. Backup evidence, privacy completion, and manual payout
  recording explicitly do not claim to perform external work.

## Boundaries

Navigation and action visibility are presentation, never authorization.
Existing staff page/API guards, same-origin checks, maker-checker enforcement,
order-item seller boundaries, integer-paisa values, and append-only audit/ledger
writes remain in place. This pass does not change the order, return, refund, or
payout state machines.

Governance reads now take the authenticated staff role. For Admin, the server
does not query or serialize user-account, incident, or backup datasets.
Previously these datasets were sent to a client component that merely hid
their sections. The repository also rejects non-staff roles. Promotion creator
IDs are supplied to identify the maker accurately.

The shared Admin mutation hook locks concurrent submissions and reuses the
request identifier when the same URL, method, and payload are retried after an
uncertain response. A changed payload or confirmed success starts a new
attempt. This is mounted-form retry protection, not durable offline queuing.
Staff invitation endpoints retain their existing invitation protocol and do
not claim this new request-ID mechanism.

No schema or migration changes were needed. Migrations 0000–0020 remain
append-only and unchanged.

## Validation — 2026-09-07

- 27 automated tests pass, including existing checkout, item-level return,
  refund, complaint, seller isolation, payout, shipping, privacy and catalogue
  fixtures.
- New coverage checks deny-by-default staff navigation; payout state/authority
  and preparer restrictions; mutation response errors; distinct ready-order
  totals; assigned/escalated complaint counts; restricted governance datasets;
  independent promotion decisions and repeat-decision idempotency.
- TypeScript, lint, Drizzle migration metadata checks and production build pass.
- All 21 migrations applied to a separate clean local D1 database; foreign-key
  check returned no violations. The active development database was not reset.
- HTTP smoke checks: Admin's 12 ordinary workspace routes returned 200 and
  Staff access redirected to the access-denied page; Super Admin's 13 routes
  returned 200. Guest POSTs to governance, payouts, and staff invitations
  returned 401; Customer and Seller POSTs returned 403. Those rejected checks
  did not create staff invitations or financial records.
- No interactive browser/layout walkthrough was performed in this pass.
  HTTP success is not a claim that every populated screen has been visually
  tested. Financial and case workflow tests use isolated fixtures.

## Next local verification

Use /local-testing to select a role. A Customer session cannot enter the
Seller or staff workspace just by visiting its URL.

1. Walk through the navigation and forms at desktop and mobile widths.
2. Exercise a populated test seller, multi-vendor order, return and complaint.
3. Prepare a test payout as Admin; approve as a different Super Admin; confirm
   that the maker cannot approve and a repeated operation does not duplicate
   its ledger effects.
4. Check keyboard focus, dialog cancellation, validation, and network-error
   retries on populated forms.
5. Review any remaining workflow gaps before production preparation.

External carrier APIs, notification delivery, actual bank transfers,
infrastructure backups/monitoring, approved legal text, production identities,
and deployment remain separate launch work. This pass does not claim that
every marketplace feature or production-readiness check is complete.
