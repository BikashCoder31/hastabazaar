# Local configuration and policy corrections

> For agentic workers: use subagent-driven-development for independent date/consent tasks and execute the coupled checkout/settlement work in the main agent. Review the complete change with separate GPT-6.1 Sol code/test reviewers at extra-high reasoning.

Goal: make saved prospective rules, customer-reviewed totals and calendar dates reliable, and prepare policy improvements as unapproved drafts.

Architecture: reuse existing versioned Business Settings, order/acceptance JSON and append-only audit records. Bind checkout to a complete presented quote and policy context; snapshot new registered settlement terms. Preserve all legacy rows and historical evidence.

Spec: user-approved read-only audit at `C:/Users/abinash/.codex/visualizations/2026/10/16/01a14556-3584-7d82-961e-ed79b6202897/changeable-values-audit/report.md`.

Constraints: canonical HastaBazaar checkout; no database migrations/seeds/resets/backfills, record edits, setting publication, email sends, pushes or deployment. Keep the running protected server, approved Git baseline, current 9%/91% terms, paused loyalty/grace settings and all previous uncommitted work. Test writes only in isolated fixtures. Leave changes uncommitted for review.

## Tasks

- [x] Capture source/table/upload hashes and verify port ownership and local:check.
- [x] Calendar correction: failing product date round-trip/month-end/leap-day tests; implement strict Nepal parsing/edit/display and rider holiday validation; run related tests.
- [x] Consent correction: failing actual-language/unsupported-language/evidence tests; retain complete future registered acceptance evidence in existing audit JSON; preserve old history and contexts. Correct live commission explanations without changing historical labels.
- [x] Checkout correction: failing non-promo cart/price/referral/wallet/policy stale-quote tests; issue a complete read-only quote context, require it on fresh checkout, compare against server-derived current context, preserve identical retries and existing origin/auth/commit guards.
- [x] Settlement correction: failing prospective hold/reserve snapshot tests; snapshot applicable new registered terms in existing order policy JSON and accrue from those terms. Explicitly preserve original legacy rules for orders lacking the new snapshot; do not backfill or rewrite existing ledger rows.
- [x] Publication correction: prevent misleading changes to unsupported payout minimum/calendar/reserve features; explain the limitation in admin controls. Do not change existing published values or approved positive-balance payout behavior.
- [x] Content correction: centralize current public support contacts where safe, keep internal recipient routing separate, and prevent local/staging referral invitations from pointing test codes at production. No invented contact details or policy hash changes.
- [x] Draft policy improvements: exact consent, settlement disclosures, complaint/refund clocks, verified contact checklist, retention/access and controlled publication. Draft only, no adopted/published/effective status.
- [x] Independent code and test reviews; resolve material findings with regressions.
- [x] Run related safe tests, lint, typecheck, build, local:check and read-only Chrome desktop/mobile checks. Compare all data/upload hashes; keep correct server running and normal Chrome open.

## Review focus

Replaying old checkouts must remain safe even when settings/cart change. Fresh checkout must never accept an unreviewed larger payable amount. Financial settings are not permission to impose new deductions on existing agreements. Legacy missing snapshots must not be replaced with today's values. Calendar-only dates must not depend on browser/server timezone. Future consent must record the exact presented language/text. Draft policies must not affect current public policies or require reacceptance.

## Execution ledger

- Initial preflight passed; port 3018 PID 15884 belongs to this canonical checkout. Before snapshot: 153 tables, 12 uploads, 3035 source files.
- Ruling: retain the active dirty checkout because AGENTS.md makes it authoritative and the user requires preserving newer work; no extra worktree or Git reset.
- Ruling: omit unsafe full-suite tests that touch the application's recovery folders or external databases; run reviewed isolated suites and report scope. Prior broad runs exhausted desktop resources.
- Ruling: production recipient routing and unconfirmed company phone/listing fields remain unchanged; approved contact evidence is absent, so prepare a draft checklist rather than inventing values.
- Review resolved: use one referral-campaign snapshot; guard hold/reserve versions at commit; retain the original quote across policy changes and retries; disable quote reset during a pending submission. Separate GPT-6.1 Sol extra-high code and test reviewers reported no remaining material findings in the reviewed scope.
- Final verification: lint, typecheck, build and local:check passed. Domain run: 217/218 passed, with one stale hardcoded-support-email source assertion; corrected focused legal suite passed 5/5. Earlier seller-summary expectations were updated for the prior dashboard field, without changing dashboard behavior. Browser fixtures passed 27/27; final retry regressions passed 5/5.
- Actual local browser checks passed at widths 1440, 390 and 320: saved commission 9%, rate-neutral consent, checkbox state, Earnings link, no horizontal overflow, no page errors or business-record requests. Normal Chrome remains on http://localhost:3018/seller for the existing approved seller.
- Preservation: schema, all 152 application table hashes and all 12 upload hashes match the starting snapshot. Only Cloudflare's internal _cf_METADATA changed. HEAD, canonical Git setting and approved baseline are unchanged; baseline ancestry passed. Port 3018 remains owned by PID 15884 in the canonical checkout; both health endpoints returned 200.
- Limits: no actual order, agreement acceptance, setting publication, payout or email was submitted. Native MariaDB, staging and production were not exercised. No migration, backfill, commit, push or deployment was performed. Policy drafting does not implement automated complaint clocks, a retention engine, scheduled payouts or nonzero reserve activation.
- Evidence and manual checklist: C:/Users/abinash/.codex/visualizations/2026/10/16/01a14556-3584-7d82-961e-ed79b6202897/local-corrections/report.md.
