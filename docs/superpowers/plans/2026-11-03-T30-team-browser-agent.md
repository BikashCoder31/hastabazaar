# T30 Team browser evidence — 2026-11-03

Canonical checkout: `C:/Users/abinash/Desktop/HastaBazaar`. This is isolated local verification, not deployment or a production submission claim.

## Actual journey and boundaries

`tests/team-governance-browser.test.ts` bundles the actual `TeamWorkspace`, `TeamAction`, published-form hook, configured fields and browser-safe submission helpers. It invokes the actual Team governance GET/POST and form GET routes against a freshly allocated `completeVersionFixture` SQLite `:memory:` database; `PRAGMA database_list` verifies that every attached database has an empty file name. The complete fixture was inspected before use. Fixture users and addresses are fictional.

Framework authentication resolves the current fixture actor and calls the real `staffMutationGuard`; domain authorization and native source checks remain real. Next Link preserves anchor behavior and router refresh reloads the real workspace projection. Every browser request is intercepted; unknown origins/routes are aborted. No app server, canonical launcher, canonical database, real delivery or external network is involved. The Browser plugin was unavailable, so the frontend testing skill fallback uses installed Chrome through Playwright.

The journey verifies:

- Super Admin coverage plus actual tab links to People, calendar, identity and policies.
- Native duty save with distinct eligible backup, then a simulated lost acknowledgement **after** the actual API commits. Reload and retry send byte-identical JSON, receive the original result and leave exactly one native `save_duty` event.
- Proposed handoff and the ordinary assigned staff member's actual acceptance. The native state becomes `accepted`; the receipt action disappears after actual refresh.
- Ordinary staff see My responsibilities and no Super Admin tab navigation or roster controls. A well-formed direct save attempt using the previously valid form envelope receives 409; native ownership remains unchanged. Assignment does not grant access.
- At 390×844, basic Tab focus works and document width does not exceed the viewport. After revoking the original Super Admin role in the isolated database, an already mounted roster submits to the actual API and receives 403, retains the exact unsent reason, and creates no additional native event.
- No unexpected browser console warnings/errors or framework error overlays. Expected simulated 503 and authorization 409/403 resource diagnostics are excluded explicitly.

## RED, repair and final verification

The initial actual journey reproduced a production defect before any POST: TeamAction invoked `readConfiguredSubmission` but rendered neither its required hidden form version nor `ConfiguredFields`. Every save therefore displayed `Form version changed. Refresh and try again.` The Team owner repaired `components/admin/team-action.tsx:28` with the actual configured fields and canonical protected base keys. The helper was not weakened or stubbed.

Intermediate test-only corrections aligned the People assertion with its real section heading, waited for the accepted action to disappear after refresh, and read the filled textarea through its stable textbox prefix rather than its changing exact wrapping-label name. The fixture explicitly includes UTF-8 and Tailwind sources for every relevant Team dependency and its own shell classes.

Final command:

```text
node --import tsx --test tests/team-governance-browser.test.ts
```

Final result: **1/1 passed**, exit 0; journey 10,676.039 ms, total 13,440.837 ms. Browser/context close and fixture disposal run in `finally`; the process completed before the heavy slot was released to root. No global typecheck/native/Maria claim is made here.

## Inspected screenshots

All three final viewport screenshots were opened and visually inspected. Controls and text wrap within the viewport, with readable retained input and no horizontal clipping:

- `.test-artifacts/t30/team-roster-desktop.png` — actual saved roster and native success message at 1200×900.
- `.test-artifacts/t30/team-own-mobile.png` — ordinary current access, accepted coverage and original handoff at 390×844.
- `.test-artifacts/t30/team-revoked-mobile.png` — old mounted roster and retained unsent reason at 390×844. The API's 403 message is below this viewport and is verified by the actual DOM assertion.

The initial RED screenshot is `.test-artifacts/t30/team-first-save-red.png`; it is diagnostic history, not the final visual acceptance artifact.

## Limits

This proves the scoped real component/API/native-memory journey. It does not prove a full launched application shell, exhaustive keyboard accessibility, real mailbox delivery, Maria runtime execution, or T31's broader screen inventory. Those are not silently counted as completed by this browser test. No remaining blocker was found in this journey after the owner's form-version repair.
