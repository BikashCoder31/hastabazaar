# Consolidated staff UI verification (local)

Verified 2026-09-13 with scripts/verify-consolidated-staff-ui.mjs. The native MariaDB and Chrome/Playwright run exited 0; all five check groups passed. No application source changes were needed in this pass.

## Environment and isolation

The flow under test was staff navigation -> permission proposal and independent approval -> active-session access changes -> exception ownership and next action -> recorded audit navigation. Browser plugin not available; the parent explicitly requested a Playwright harness. Used the existing local MariaDB server on 127.0.0.1:13316, a fresh synthetic database consolidated_staff_1789256309528, and the standalone app on http://127.0.0.1:43874. The harness loaded the current release manifest into the fresh database and repeated new additive migrations. It never used existing business records. Email/provider environment was cleared, outbound sockets were blocked except the local database, and browser external requests were blocked. The harness stopped its own app and browser in finally and left the shared database server alone.

## Verified behavior

- At 320, 390 and 1440 pixels, Super Admin, restricted Admin and legacy Admin navigation matched their effective access. Reserved team and action-audit pages rejected both Admin types; restricted Admin could not open product management.
- A Super Admin proposed an order-to-support permission change. The proposer could not approve it, and the old scope remained active while pending. A second Super Admin approved through the rendered form. The restricted Admin's unchanged session cookie then lost Orders and gained Returns & complaints on the next request.
- A failed-delivery source appeared in the unassigned exception queue. The rendered order form recorded an unassigned next action, then assigned the work to an eligible operations Admin. The support-only Admin was absent from the owner choices. The queue and two history records showed the saved owner and next action. The order total, payment status and failed parcel status remained unchanged.
- Super Admin filtered recorded actions to exception.assigned at all three widths. The recorded order link opened the authorized source without creating another history event.

Page content/navigation, interaction responses and state transitions were asserted. Navigation pages had no page errors; screenshot assertions rejected horizontal document overflow. Mobile permission, exception history and audit screenshots were visually reviewed: controls and required labels were readable, with the audit table using its intended horizontal scrolling container.

## Evidence and commands

Evidence: outputs/consolidated-local-20260913-042936/staff-ui/integration.json (status passed), alongside 19 full-page screenshots. Key command: set CONSOLIDATED_STAFF_BUILD_READY=true, then node --import tsx scripts/verify-consolidated-staff-ui.mjs. Scoped oxlint on both new product and staff harnesses exited 0.

## Snapshot limits

This run used the reviewed standalone snapshot before the new /admin/progress page and Super Admin per-actor progress matrix. Those new surfaces and their changed navigation require the next build and a separate focused run. Newer notification-sender source changes were also outside this snapshot. This pass does not prove external email delivery, exception resolution, every staff permission combination, or browser engines other than Chrome. The separate product report covers its completed native/browser checks; it was not rerun here.

## Follow-up R011 conditional-label review

The prior 17-form static inventory was not exhaustive. Source review plus actual component SSR found missing visible required markers in SellerApplicationForm's DocumentField helper (three verification uploads), the scheduled pickup confirmation note, and GovernanceConsole's generic Field helper. CatalogManager's URL slug also had native required validation but no marker. Narrow fixes add stars to those labels only; the optional bank upload stays unmarked, and validation requirements are unchanged. Governance Field derives its marker from the direct rendered child control's required prop; all its current input/textarea/select usages follow that shape.

Changed source: components/seller/seller-application-form.tsx, components/seller/shipping-workspace.tsx, components/admin/catalog-manager.tsx, components/admin/governance-console.tsx. New tests: tests/seller-application-required-labels.test.ts and tests/conditional-required-labels.test.ts. Three actual SSR regressions failed on absent visible label text, then passed after fixes; the tests explicitly strip HTML tags to avoid mistaking CSS asterisks for visible markers. Coverage includes signed-in and anonymous application states, required versus optional uploads, scheduled pickup, and required/optional governance input, textarea and select controls. Scoped oxlint exited 0 after its test children-prop warning was corrected.

These latest label changes postdate the staff browser snapshot. Catalog URL slug was verified in source; the next focused browser run should open its Add category form and visually check the rendered marker. No claim is made that every conditional form state in the application has been browser exercised.

## Final-build progress and catalog follow-up

The final checkpoint build (build-checkpoint-final.txt) was explicitly authorized and tested with scripts/verify-consolidated-progress-ui.mjs, CONSOLIDATED_PROGRESS_BUILD_READY=true, on the same isolated app port 43874 with a new synthetic database consolidated_progress_1789257525126. The run exited 0; all four groups passed. Both app and browser stopped in finally. Scoped harness lint also passed.

At 320, 390 and 1440 pixels, a restricted Admin with audit and order access saw only their own two parcel dispatch records and one completed-outcome group with count 2. Their own product approval evidence was excluded by current permissions, and another Admin's evidence was absent. Matching-record and source-order links completed authorized client navigation. Super Admin's per-person matrix included both actors and recognized completion outcomes; review-start evidence was excluded from its completion totals. Actor filtering narrowed the matrix. A forged other-actor filter, date range over 366 days, and an Admin lacking audit permission were rejected; the latter also had no Recorded work navigation link.

The Add category form was opened in the rebuilt app and the required URL-slug star was asserted from rendered label text, separately from its native required attribute. Mobile screenshots for own work, Super Admin progress and catalog were visually inspected. Tables intentionally scroll horizontally at narrow widths; there was no horizontal document overflow. No application source changes were needed during this final browser pass. The harness's first attempt asserted a client-navigation URL before navigation settled; adding explicit waitForURL corrected that test timing issue, and the fresh rerun passed.

Final evidence: outputs/consolidated-local-20260913-042936/progress-ui/integration.json (status passed), seven screenshots, and the separate harness. The earlier staff-ui evidence remains the historical permission/exception run; new progress evidence closes its stated /admin/progress and per-actor matrix snapshot gap. Other R011 helper-label fixes were verified by the three SSR regressions, not by a new browser sweep of every conditional form. Synthetic audit rows deliberately represent recorded action evidence; this focused UI test does not claim those fixtures prove real-world dispatch or settlement. External delivery remained blocked.
