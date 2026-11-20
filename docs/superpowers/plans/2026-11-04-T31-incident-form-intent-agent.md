# Incident form read intent — 2026-11-04

Bounded ownership: only `app/api/forms/[formId]/route.ts` and new native-memory tests. No Incident component, mutation, schema, native provider, canonical database or launcher changes.

Headered `staff.incident-review` reads now use the existing-only staff intent resolver with `system.incidents.manage`, admitting current eligible delegated Admin or Super Admin. Before definition return, the same original actor/auth subject/role and effective permission scope are reauthorized. Current denial is an actual401/403. This includes the configuration failure path, since the final guard runs after the underlying reader's response. No-header requests keep the existing audience permission and404 concealment behavior; no other form opts in.

The three Team forms retain their current explicit Super Admin boundary and existing behavior. No grant is added or inferred by the actor header. The existing-only resolver prevents invitation acceptance or unfamiliar-user provisioning during reads.

Evidence:

- Initial `.test-artifacts/t31/incident-form-intent-native-red.tap` is a setup-only failure: the isolated Incident publication was absent. No behavior claim is based on it.
- Added an explicitly declared retained Incident form publication to the isolated all-migrations memory fixture, matching the existing Team fixture's native history setup. `.test-artifacts/t31/incident-form-intent-native-red-published.tap` then captured10 meaningful failures,34.02s: equally eligible wrong actor returned200, current role/permission loss and mid-read changes were concealed or returned configuration, unfamiliar identity returned concealed404 instead of explicit rejection.
- `.test-artifacts/t31/incident-team-form-intent-native-current.tap`: **16/16 PASS**, zero skips,exit0,62.84s. Ten Incident cases cover delegated andSA allowance; equally eligible current actor mismatch; current role/permission loss with preserved default404; mid-read actor/auth-subject/role/permission changes; admin→SA role change; failed definition read plus actor change; unfamiliar identity with user count unchanged. All six existing Team native tests remain green, including their role/actor/subject races and no provisioning.
- Scoped route/test lint:0 diagnostics.

Source hashes: `.test-artifacts/t31/incident-form-intent-source-freeze.json`. Only inspected isolated memory fixtures were run. No heavy/browser slot was used; Root owns rendered Incident callback integration and final global typing.
