# Seller and paired Staff UI lint overlay

## Scope and behavior

This follow-up addresses the actual compiler, hook, accessibility and type findings in the previously delivered Seller registration, bank, workshop, document/protected-change and public-profile controls and their paired Staff review. It changes no native mutation permission, form validation/version rule, receipt, money, approval, release or activation gate. The earlier T31/T33 freezes remain historical exact records; the new source hashes are an explicit overlay.

- Rendered pending/retry availability now uses small reactive booleans updated at the same points as the retained RAM payload refs. The exact original body/file still lives in its original ref; no payload is reconstructed, persisted in session storage or transferred to a new actor.
- Registration uses the draft's existing denial state directly, including the submit guard, rather than synchronously mirroring it in an effect. The existing immediate curtain and refresh remain.
- Bank and protected-identity focus/initial listeners use the installed React 19.2 Effect Event contract to read current callbacks without stale closures or state-setting effect loops. Abort, current-scope and owner/revision checks remain. Registration detail effects include the current-scope dependency and keep refresh callbacks current.
- Internal denial-recovery links use the same checked full-document reopen pattern as the existing Customer account boundary. Modified/new-tab behavior remains native, while ordinary recovery loads a new trusted workspace rather than inheriting the denied component state. Seller-only denial still does not revoke Customer access.
- Text FormData entries are narrowed before use; a File object cannot stringify into protected facts or promised dates. Existing legitimate strings and Nepal-time parsing remain unchanged. The original document identity type/reference, verified locks and optional intake are untouched.
- Status output uses semantic `output`, the document apostrophe renders identically, and a meaningless `void` is removed. No lint rule or authority check is suppressed.

## Existing review eligibility in navigation

Seller Center §4 preserves the existing review/reply workflow; the Maker readiness constraints forbid admitting Makers by granting independent Seller privileges. Product's source audit confirmed the native reviews entry requires an active user, an actual Seller role and an approved owned profile. Navigation now receives the existing server-derived `approvedSeller` proof and filters only the Customer reviews affordance. It does not use a participation-route shortcut. Ineligible accounts get a truthful explanation and the existing native `/seller/requests` Help destination, in both mobile and desktop navigation. The canonical route catalogue and old protected deep links remain intact, and the native review page/receiver are unchanged.

A meaningful RED used the actual native activation fixture in a fresh in-memory database: its genuine active Maker stays `under_review` with Customer authority and no Seller role, yet the old navigation exposed Customer reviews. After the fix, the same Maker sees Help; an actually approved Registered Seller keeps the link even with an existing order hold; current Seller-role loss removes it. `seller-review-navigation-{red,green}.tap` preserves RED and **3/3 GREEN / exit 0**. This is fictional fixture activation only, never activation of an actual seller.

The More menu's Escape handler remains available from its summary and every interactive child link, with focus restored to the summary. A server-owned fee-read helper retains the actual request-time clock and original unavailable-rate handling; no browser clock or fake date is introduced.

## Verification

- Actual `oxlint --disable-nested-config` for all **13** changed production UI/layout files: **exit 0**, `seller-owned-lint-current.txt`. No global lint pass is claimed.
- Serial actual browser batch: **7/7, zero skips, exit 0**, 47.129 seconds, `seller-owned-browser-current.tap`. Six cases use actual native/API fixtures with intercepted network; the seventh is the retained registration partial-answer/file restoration client fixture. Exact lost-response retry, new actor/source ownership, denial curtains, sibling privacy, and retired callbacks remain covered. Tests assert no unexpected console or network failures and close contexts/Chrome in `finally`; the parent process exited 0.
- All six current denial screenshots were copied into `.test-artifacts/t34/seller-owned-screenshots/` and visually inspected. Each shows the correct current denial explanation and concealed private fields/siblings. These isolated functional fixtures are not claimed as styled full-site visual acceptance.
- Broader current Seller/nav memory run: **16/17**, exit 1, `seller-navigation-current.tap`. All 13 Seller dashboard/authority cases and the Seller route/access cases pass. The sole failure is Root's unrelated Admin navigation literal count (`workspace-navigation.test.ts:47`, expected 39, actual 43), reported to Root without changing its source or weakening the assertion.
- The React checklist was applied to effect lifetimes, cleanup, current-scope callbacks, exact retained bodies, semantic controls, server-owned time and minimal client authority props.

All work stays in isolated memory/browser fixtures. No canonical/local D1, real provider, live payment/email, deployment, data reset or video work was performed. No browser, native server or worker remains held by this slice. Parent owns global typing/lint and final integrated acceptance.
