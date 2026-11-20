# T31 assisted account recovery ownership

Canonical authority: approved optional seller MFA/assisted recovery design and paired C11/C12 ownership/privacy behavior. Scope is the assisted review UI and its existing real API, not a change to MFA, target eligibility, password proof, registered-email policy, delivery semantics or staff grants. Fixtures are in memory; mail is a fictional capture sink. No existing account, real email, bootstrap, canonical database or deployment is touched.

## Reproduced before change

`tests/assisted-recovery-scope-browser.test.ts` mounts the real component and intercepts requests into the actual assisted-recovery route. Its fixture creates two real credentials/sessions and enrolls both Super Admins through the native MFA service. It does not stub securityActor, approval or a private authority function.

The real old-A workspace under equally fresh-MFA B sent no actor intent and issued recovery with HTTP 200 and actual audit actor B. A target switch retained `SUP-PRIVATE-SOURCE-A` and ownership confirmations. A committed old response left the different target's form busy. All three children failed, plus parent: exit 1, 17.051 seconds, `.test-artifacts/t31/assisted-recovery-scope-browser-red.tap`.

A separate actual route control proved the existing backend already rejects an explicit A intent under B with 403 and no invitation, while current B intent succeeds with the real fresh-MFA requirements. The first fixture-policy adapter omission (missing mark method) is retained separately; it is not a native authority failure.

## Change and current evidence

The UI now receives the trusted internal actor at both actual Team and seller-detail callsites. A keyed child owns actor, target, registered email, display identity and target role; source changes remount private references, confirmations and action state. Requests send the existing reject-only actor-intent header. The shared commit-owned scope callback fences every response/error/finally update and form reset. Current 401/403 hides private fields and refreshes the current workspace. A malformed success cannot reset the form without a valid success marker and message. No native approval or security service rule changed.

- Actual mounted source/actor/late-native-response proof plus retained mobile/desktop UI: **7/7 PASS**, exit 0, 19.155 seconds. `.test-artifacts/t31/assisted-recovery-scope-browser-green.tap`.
- Actual native intent plus existing assisted service/route boundaries: **24/24 PASS**, exit 0, 4.248 seconds. `.test-artifacts/t31/assisted-recovery-current-native.tap`.
- Scoped component/new fixture/test lint: zero diagnostics. `.test-artifacts/t31/assisted-recovery-current-lint.txt`.
- Mobile denial screenshot `.test-artifacts/t31/assisted-recovery-denied-mobile.png` inspected: safe access-changed panel, no private input. Browser/context closed in finally; Node exited. Native target credentials remain unchanged by invitation issuance.

Existing `securityActor` and assisted-recovery API/service retain their original current-session/fresh-password/MFA, target-role/email, one-use completion, source/CAS and audit checks. This evidence proves local actor/source ownership and native boundaries, not real delivery or mailbox receipt. Root owns integration/global checks and master ledger updates.
