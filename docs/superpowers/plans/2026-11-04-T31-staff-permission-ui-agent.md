# T31 Staff permission UI and Team configuration read boundary

Canonical checkout: `C:/Users/abinash/Desktop/HastaBazaar`. All database fixtures were newly allocated, inspected `:memory:` SQLite. Browser traffic was intercepted at the approved localhost origin; no app server, provider mail, canonical data, migration, deployment or real grant was used.

## Actual correction

The real StaffPermissionManager originally posted a displayed actor A's permission change under an equally eligible current session B without actor intent. Meaningful native/browser RED returned201 and applied the change instead of403. The UI now keys private editors by actor and staff target, and legacy decision controls by the original proposal identity. Native headers reject current principal drift. Current native denial curtains the actual Team parent immediately, including with unavailable refresh and malformed response bodies.

Per-actor/per-target storage contains only validated original action, target/source IDs and UUID. Private reason, grants, configured answers and exact request wire remain in the owning component's RAM. One target's unknown work cannot be replaced with a new request for that target; another staff member's draft stays independent. Exact RAM retries retain identical bytes after503, later409 and malformed200. Reload offers original read-only GET, without reconstructing private fields. Original references remain reachable when the source leaves the current roster or pending list. Unowned legacy references are read-only probes, never adopted into a new actor/body or cleared by an unrelated before-write rejection.

New proposals still apply immediately through one eligible Super Admin. Existing pending approval/rejection rules are unchanged; proposalID and decision formRequestId remain distinct. Native outcomes confirm original history, not currently effective grants. Tests perform a later genuine grant change through another eligible SA before original GET recovery and verify current access is not overwritten. Current-version conflicts preserve entries and require explicit current-source review. Removed staff retain the original disabled draft and explicit discard choice. Templates, Added/Removed/Retained preview, keyboard filtering and native original history links are preserved.

## Bounded configuration overlay

The original `/api/forms/[formId]` deliberately concealed all failed audience checks as404. Initial config cases incorrectly assumed403; their failures are retained and are not claimed as behavior success. A later meaningful native5-case RED proved headered wrong-actor200, role-loss404 and role/actor/auth-subject races before definition return.

Only `staff.staff-invitation`, `staff.staff-permission-1` and `staff.staff-permission-2` opt into an explicit headered current-actor/current-SA guard. Existing-only authority is checked before reading and before returning, including exact actor/auth-subject continuity. No-header404 concealment and all other form contracts are preserved. No unfamiliar identity is provisioned.

`usePublishedFormConfig` gained optional actorId/onAccessDenied. Its default behavior is unchanged. A committed form/enabled/refresh/actor/callback lease fences all retired callbacks. Current native401/403 invokes the local Team curtain before parsing. Known non-pending stale/unavailable configuration has an explicit refresh control preserving entries; unknown original references and wires are not replaced. Browser proxies forward the actual outgoing header rather than stripping it.

## Verification evidence

- Original actor native/browser RED: `.test-artifacts/t31/staff-permission-actor-native-red.tap`, expected403/actual201,13.81s test,17.41s total, exit1.
- First actor GREEN: `staff-permission-actor-first-green.tap`,1/1,17.07s total,exit0.
- Current actual native permission journeys: `staff-config-retained-native-current.tap`,3/3 pass (actor denial, full exact-wire/later-grant/history/source-race path, real retained approval/rejection).
- Current actual configuration denial cases in that same artifact:4/4 pass, JSON+HTML across invitation/permissions, native role loss, immediate parent curtain, preserved genuine unknown reference and original GET-only recovery after authority restoration. The mixed file aggregate is7/8 because the old synthetic decision test invoked requestSubmit without an explicit submitter; it is not claimed all-green.
- Corrected retained retry interaction: `staff-retained-retry-current.tap`,1/1,11.08s,exit0, explicitly selected invitation/proposal/decision branches. Uses actual Approve button, original custom answers/version assertions, exact RAM retries and reload GET-only. Other four Finance branches were not selected or claimed.
- Native Team configuration boundary: `staff-form-intent-native-final.tap`,6/6,18.46s,exit0, zero skips. Includes wrong equally eligible actor, no-header404, role/actor/auth-subject changes during actual definition read and unfamiliar identity no provisioning. Earlier native5/5 RED and intermediate5/5 GREEN retained.
- Retained Staff editor: `staff-access-current-coherent-browser.tap`,7 children+parent pass, actual templates/keyboard focus/private draft switches/removed staff/self restrictions/history. Same artifact current autofill normal/autofill/intentional mismatch3+parent and actual invitation journey1/1 pass. That mixed aggregate16/21 retains the earlier incorrect config-status assumptions and missing ordinary history link; these were separately resolved, not erased.
- Retained SSR/governance: `staff-permission-retained-ssr.tap`,21/21,exit0.
- Owned runtime/test scoped lint: exit0, no suppressions introduced. Runtime/test hashes: `staff-permission-ui-source-freeze.json`.

All contexts, Chrome processes and Node workers were closed after each engine run. Backend permission command/outcome authority, immutable proof and notice work remain documented by the backend owner; no backend permission mutation or native business policy was changed here.
