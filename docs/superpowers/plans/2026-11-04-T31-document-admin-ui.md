# T07/T31 verified-document ADMIN recovery evidence

This bounded implementation preserves verified-document locks, separate permission/replacement/verification decisions and current staff authority. It does not change seller approval policy or existing local data.

The mounted review and permission controls bind their RAM drafts to the displayed actor, action and source. Session storage contains only an opaque attempt UUID, verified before a POST. Exact retries reuse the original RAM body. Reload recovery reads the original immutable result using GET, including after the original decision controls disappear. Recovery reports a historical result and cannot restore an approval changed by another administrator. No unavailable result is treated as permission to forget an uncertain attempt.

Native 401/403 responses hide the complete private parent workspace before attempting to parse the response body. Late callbacks cannot change a different actor/source workspace. The full seller detail page also has this boundary; its restricted Seller Ops branch retains its narrower data projection. Same-source evidence changes require explicit review of the new version before another decision.

A first, matching native before-write conflict can release its attempt while preserving the note. That same conflict cannot clear an earlier uncertain attempt: a prior 503 followed by a later 409 and GET404 retains the original reference and exact request. Source version, permission, verified-document locks and original receipt identity remain enforced by the backend.

## Actual verification

- Native/backend final: 45/45, 156.865s, `.test-artifacts/t31/document-admin-complete-memory-final.tap`. Backend details and source hashes: `2026-11-04-T31-document-admin-backend-agent.md` and `.test-artifacts/t34/document-admin-backend-freeze.json`.
- Mounted browser recovery: 5/5, 54.808s, `.test-artifacts/t31/document-admin-recovery-expanded.tap`. Actual component, native API/authentication and isolated SQLite fixture cover actor drift with JSON/HTML denial, storage failure with zero POSTs, saved response hidden by 503/409/malformed200, identical retries, original GET-only reload, another administrator's later lawful rejection, and late actor/source callbacks. A 390px viewport has no horizontal overflow.
- Additional mounted conflict branches: 2/2, 21.103s, `.test-artifacts/t31/document-admin-conflict-browser.tap`. These are separate cases, not a single seven-case run. They verify the first-conflict and earlier-unknown distinction above with native responses.
- Seller parent SSR: 3/3, 15.586s, `.test-artifacts/t31/document-parent-seller-readiness-ssr.tap`, including eligible review, honest unavailable state and restricted Seller Ops projection.
- Scoped UI/helper lint: exit0 in `document-admin-ui-candidate-lint-v2.txt`; added conflict fixture lint exit0 in `document-admin-conflict-fixture-lint.txt`, both under `.test-artifacts/t31`.
- Actual failures are retained: old actor drift accepted writes, missing original-result reads/auth-subject fencing, and old client missing actor intent. The initial browser bundle setup failure is recorded separately and is not a behavioral RED.

`documentChangeState` was moved unchanged into a pure shared display module; server repositories re-export it. This prevents a client display import from pulling server crypto/image dependencies into the browser.

Only intercepted localhost browser requests and in-memory SQLite were used. No canonical database writes, real email/payment, seller activation, deployment or live permissions occurred. This closes the bounded document ADMIN recovery correction, not T34 full regression or T35 release readiness. Canonical startup remains blocked by its separate read-only preflight.
