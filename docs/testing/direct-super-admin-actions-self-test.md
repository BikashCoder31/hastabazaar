# Direct Super Admin actions — local acceptance report

User correction, 2026-09-29: Admin requests in existing approval workflows need Super Admin confirmation; a Super Admin's own actions complete directly, without self-submission/self-approval or an approval-required banner. This supersedes the explicit self-approval flow in the earlier single-super-admin report. Existing role grants remain unchanged; Admin does not gain business-settings or staff-permission access. Creating additional Super Admin accounts remains available.

Base: a1ab0380dd1296ed20c24309fcccf13dfde4c1fd on codex/hastabazaar-v1-2-1-staging. Local scope only; existing localhost:4173 preview and isolated visible user sessions retained. No schema migration, database reset, deployment, production access or real payment.

## Issue ledger

| Role / route | Reproduction and cause | Verified correction |
| --- | --- | --- |
| Super Admin /admin/business-settings | Save created a draft, then required submit and approve; the editor displayed Super Admin approval required. | Save changes publishes atomically in one POST; Save and schedule retains effective-date rules. Optional drafts remain. Badge removed; notice periods, form validation, authority, exact retries, concurrency and audit retained. Actual local save returned 201 with a published version and matching creator/publisher, without submission. |
| Super Admin /admin/team; Admin and Super Admin /admin/governance | Permission saves and SA placements remained pending under unconditional proposal behavior. | SA permissions apply atomically; SA placements activate for their scheduled window. Admin placements remain pending until SA confirms. Direct permission history links to its actual receipt; self-target and role boundaries remain. Actual expired empty SA placement became active directly; two Admin fixtures became active only after SA confirmation. |
| Super Admin /admin/payouts, /admin/cases/returns/[id], /admin/sellers/[id] | Financial preparation/initial high-value decisions unconditionally created a pending stage. | SA creates approved seller/managed/supplier payouts and approves high-value refunds directly. Eligible Admin preparations/reviews retain their existing pending stage. Payment processing/recording remains explicit. Native disposable state, form, authority-race and ownership regressions pass; no live payment scenario executed. |
| Super Admin and Admin /admin/orders/[id] | Carrier remittance always became pending. | SA carrier entry posts once in its guarded transaction; Admin entry requires SA confirmation. Rider handover review and own-rider cash restrictions retained. Exact replay, excess cash and role-race rollback verified. |
| Super Admin /admin | Independent specification review found old instructions requiring a different authorized person. | Role-aware dashboard now explains direct SA decisions and pending Admin confirmation. Rendered RED/GREEN regression added. |

## Verification

- Combined affected regression gate: **297/297 passed across 19 suites**. Initial run exposed one legacy refund test that still prepared as SA and attempted a second approval; its maker is now Admin so it continues testing the two-stage boundary. Final combined rerun is fully green.
- Mounted settings retry browser suite: **1/1 passed**, covering general direct save, optional drafts, homepage compatibility, opaque retries across reload and response verification.
- Browser: direct settings save and direct SA promotion passed. Two Admin promotion submissions were pending before SA confirmation and active afterward. **10 local API role checks** passed across SA, Admin, Seller, Buyer and Rider; other roles cannot read/save Business Settings. Dashboard copy also rechecked in browser.
- TypeScript --noEmit --incremental false, scoped oxlint, local vinext build, and Git whitespace checks passed.
- Independent specification review: **119/119** selected tests passed; its dashboard finding was fixed and re-reviewed. Subsequent independent code-quality/security review: **103/103** selected tests passed, plus supplemental final fixture review. No introduced blocking finding remains. Counts overlap the integration gate.

## Data preservation and fixtures

All 22 original responsive-media files retain their captured SHA256 hashes and are excluded from the commit. Fresh online SQLite backups were taken before browser changes. A read-only comparison confirmed **349 original rows across 11 customer/order/financial/governance/audit tables** are byte-for-byte preserved. Integrity check is OK; foreign-key check has no violations.

Three explicitly marked same-value retention publications remain in history, all 900 basis points (9%); two were created while correcting browser-harness status expectations from 200 to 201. The earlier setting intervals close prospectively as designed; no historical transaction value changed. Three expired empty promotion fixtures remain: one direct SA placement and two Admin-to-SA confirmations. They have no products and an expired 2026-09-01–02 window. No original financial balance or governance audit was edited, and daily rewards remain at their existing disabled default.

Evidence, plans, RED/GREEN logs, review reports, screenshots, hashes and backups: C:/Users/abinash/Desktop/Hatskala/direct-super-admin-20260929/. Key files: integration-green.log, mounted-settings.log, typecheck.log, lint.log, build.log, browser-direct-results.json, browser-admin-boundaries.json, data-preservation.json, spec-review.md and quality-review.md.

## Limits / remaining work

This is local D1 verification, not MariaDB or production readiness; previously documented MariaDB blockers remain. The complete historical 1,953-test suite was not rerun. Financial transitions were exercised with disposable native fixtures and rendered controls, not real payouts or new live-browser settlement cases. Existing native no-form financial helper replay paths retain their prior request-ID-only limitations; configured HTTP mutation paths retain digest-bound exact replay. The existing managed-maker demo's minimal fixture/current-authority schema mismatch was noted but not changed or claimed verified here.
