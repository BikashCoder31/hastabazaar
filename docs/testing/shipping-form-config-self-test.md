# Shipping & claims configuration error — 2026-09-29

## Reproduction and root cause

Role: Super Admin (also affects ordinary Admin). Route: `/admin/shipping`.

Open Shipping & claims with an empty job queue. The page shows "Form configuration is unavailable. Please try again." even though `/api/forms/shipping.console-action-staff` returns HTTP 200 and its published configuration.

`ShippingConsole` also loaded `shipping.console-request`, a seller-only form, unconditionally. That request correctly returned HTTP 404 for staff. The component then displayed that irrelevant request-form error in its shared error area.

## Intended fix and safeguards

Enable seller request configuration only in seller mode. A disabled configuration must perform no request, expose no stale error/configuration, and remain non-submittable. Re-enabling must fetch fresh configuration. Abort handling must reject late responses from a disabled request.

Staff action configuration continues to load. Genuine failures stay visible and disable submission. Existing API audience restrictions, request IDs, shipping history, and financial/governance data are unchanged.

## Evidence

Local artifacts: `C:/Users/abinash/Desktop/Hatskala/shipping-form-20260929/`.
`reproduce.log` records staff form HTTP 200, seller request form HTTP 404, and the visible error. `before.png` captures the original page.

Mounted regression tests failed before the fix for the unnecessary staff request and disabled-hook behavior. The seller request regression already passed.

## Verified result

- Local browser: Super Admin and Admin load only the staff action configuration; the false error is absent. A forced staff HTTP 503 still displays a real error. Seller request configuration remains available, while Seller and Customer cannot retrieve staff configuration or open the admin shipping page. No mobile horizontal overflow.
- Independent specification review: PASS. Independent quality/security review: PASS.
- All 38 pre-existing modified/untracked file hashes remain unchanged.
- All 139 application/migration tables retain their original hashes and counts. The only difference among 140 checked tables is Cloudflare runtime `_cf_METADATA`.
- The empty-state messages remain accurate: no shipping coordination records or saved staff shipping answers exist in the current local fixture. The fix creates no records.

Final verification: 30/30 focused tests passed after the final implementation, including mounted shipping client safety, form rendering, and disabled/reenabled configuration lifecycle regressions. TypeScript and scoped lint passed. Logs: `C:/Users/abinash/Desktop/Hatskala/shipping-claims-config-20260929/` (RED and final GREEN evidence).
