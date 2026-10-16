# Approved Work Integration Plan

> **For agentic workers:** Use superpowers:executing-plans for the main-agent integration, with separate read-only code and test reviews. Track completion below.

**Goal:** Recover the approved work from October 10–15 into the canonical Desktop app without losing newer work or existing business records.

**Architecture:** Compare the preserved October 14 full-preview source against its Git baseline `df72577` and the current Desktop app. Bring forward only source changes supported by the recorded approvals; resolve overlaps in favor of retaining both features. Apply reviewed additive local schema changes separately after backup and rehearsal. The launcher and canonical Git configuration remain authoritative.

**Tech Stack:** TypeScript, React, vinext, D1-compatible local SQLite, Node test runner, normal Chrome.

**Spec:** User approval in this chat to integrate Commission, Promo codes, Daily loyalty and other approved work from the past 3–5 days; the recorded approvals in “Improve commission field handling,” “Update policy for pending PAN,” and “Improve form catalog usability.” Existing recovered incentive/weekly/policy plans are supporting specifications.

## Global constraints

- Active project: `C:/Users/abinash/Desktop/Hatskala`; local URL `http://localhost:3018`.
- Preserve `a4fece8`, all later working changes, Staff access, form catalog, homepage, PAN, summary and all four Nepal-time filters.
- Preserve existing records, uploads, backups, branches and normal Git history. Never import the old preview's demonstration database.
- No push, deployment, remote credentials or live email/payment services.
- Main agent alone edits source, controls the server and changes database schema. Reviewers are read only.
- No blind folder replacement, legacy migration renumbering or weakening authorization rules.
- No existing financial settings will be published or changed during verification. Save/publish/claim tests use memory or disposable test databases.

## Review focus

- Merge overlaps must retain current form guidance, autofill handling and exact Super Admin gates; validate existing staff/form/summary tests.
- Existing database rows and legacy claims must survive new columns/triggers unchanged; compare original columns and row identities after rehearsal and application.
- Current seller-specific accepted commission and immutable order snapshots must remain valid; exercise baseline, future schedule, cancellation and seller acceptance.
- Promo/loyalty reports must reject unauthorized direct requests, expose only published public rules and retain decimal NPR/% accuracy.
- Full tests must never run an apply command against the real Desktop database; replace hard-coded destructive negative-test targets with temporary fixtures first.

## Inventory and tasks

- [x] 1. Save source and database snapshots; classify incoming/current/overlapping files against `df72577`. Evidence: `work/integration-recovery-20261015/`.
- [x] 2. Review recent chats/commits. Already present: managed identity, signup controls, private seller terms, homepage parallax, paused rider portal, searchable Admin navigation, mail expiry, AD/BS reporting, PAN, forms and Staff access. Missing: Commission workspace, incentive dashboards/reports/readable inputs, weekly rewards/check-in, and policy/contact/layout refresh.
- [x] 3. Recover approved regression tests first. Demonstrate missing behavior. Integrate the 77 incoming-only and 8 overlapping files in `classified.json`, retaining current-only work. Reconcile test safety and cross-feature conflicts. Selectively recover the Commission tests/docs/native companion from the reviewed recovery ZIP.
- [x] 4. Rehearse new Commission/weekly schema migrations on the fresh backup copy; verify original rows, integrity and constraints. Explain exact active changes, then apply only the reviewed additive schema in one explicit transaction. Preserve current financial configuration. The initial IPv4 probe missed the existing IPv6 listener; later OS inspection confirmed the existing canonical server was still running. No duplicate server was started and original-row verification passed after the transaction.
- [x] 5. Run affected tests, full safe suite, typecheck, lint, local build and read-only launcher preflight. Full 303-file suite: 2,689 passed, zero failed, 16 skipped (13 native MariaDB, one Linux-only, two opt-in browser checks). Main suite used three workers and allowed local loopback; targeted copy/policy checks followed the final wording edits. Independent extra-high gpt-6.1-sol code/test reviews completed; identified issues reproduced and corrected.
- [x] 6. Reuse the canonical checked server and verify the three workspaces, policy pages, form/staff/summary preservation, direct page authorization, unsaved previews/filters and a narrow layout in normal Chrome. Keep Super Admin pages open. Inventory and limitations: `work/integration-recovery-20261015/browser-inventory.json`. Browser direct API navigation was blocked by the client; isolated route tests passed. Active-database publishing/claims/saves and real services were not exercised.

## Execution decisions

- Native integration is authorized by the user's current request; the three feature designs were approved previously. No new product design is introduced.
- Work in the explicitly selected Desktop project. Do not create another launchable copy or use old worktrees as active projects.
- Old wrong-baseline audit remediation is not copied wholesale. Its useful fixes require comparison; independent review determines whether any remain applicable to the current code.
- Temporary in-memory/disposable database tests may create, save, publish and claim fictional records. The active database is used only for read-only browser verification after the separately reviewed schema update.
- Existing preview: port 3018 listens on IPv6 `::1`, PID 20560; `.vinext/dev/lock.json` identifies the canonical Desktop directory. The checked launcher refused a duplicate server. Use `localhost` or inspect both IP families when checking the port.
- Review corrections: preserve a seller's existing accepted baseline commission; exclude Managed Maker orders from registered-seller commission reporting; use checkout's half-up commission rounding in the promo illustration; retain native CONCAT and refund FLOOR fixes. Added populated-upgrade, route authorization and schema-readiness tests.
- User-requested copy clarification: revision-zero paused loyalty defaults are described as saved starting settings, with the weekly editor explicitly separate from saving/publishing. Weekly selection remains unsaved in normal Chrome; existing financial configuration is unchanged.
- Read-only test caveat: the pre-existing checkout page calls `getWallet()`, which provisions a missing wallet on GET. Visiting checkout created one zero-balance `local-test-super-admin` wallet. After a fresh safety backup, a guarded cleanup removed exactly that unused test row; all 147 original application/history tables then matched their original rows and columns. The database was never reset or replaced. Checkout behavior was reported, not changed.
- Public Chrome warning: current profile adds `data-sharkid`, `data-sharklabel` and `shark-icon-container`. Header-search hydration warnings were reproduced on public policy pages. Public sign-in rendered and showed the same extension markup. No sign-in rendering/security behavior was changed; the proposed public-field hydration boundary is reported separately.
